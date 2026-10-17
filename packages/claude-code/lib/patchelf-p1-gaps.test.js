'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const r = require('./patchelf-runtime');
const { writeFakeReadelf } = require('./test-support/fake-readelf');

const FLOCK = '/data/data/com.termux/files/usr/bin/flock';
const SH = '/data/data/com.termux/files/usr/bin/sh';
const SKIP = fs.existsSync(FLOCK) ? false : `flock not found: ${FLOCK}`;
const UNVERIFIED = 'could not be verified';

function sha(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function writeScript(file, body) {
  fs.writeFileSync(file, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
}

// (e) source trust: real curl fetches a real tar.gz over file://; patchelf is a no-op, readelf is fake.
function sourceFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p1gaps-src-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const glibcLib = path.join(root, 'glibc', 'lib');
  fs.mkdirSync(glibcLib, { recursive: true });
  const patchelf = path.join(bin, 'patchelf');
  writeScript(patchelf, '');
  const readelf = path.join(bin, 'readelf');
  writeFakeReadelf(readelf, { loaderPath: path.join(glibcLib, 'ld-linux-aarch64.so.1'), needed: [] });
  const tarSrc = path.join(root, 'tarsrc');
  fs.mkdirSync(tarSrc);
  fs.writeFileSync(path.join(tarSrc, 'claude'), 'good', { mode: 0o755 });
  const tarball = path.join(root, 'claude.tgz');
  execFileSync('tar', ['-czf', tarball, '-C', tarSrc, 'claude']);
  return {
    root,
    glibcLib,
    patchelf,
    readelf,
    tarballUrl: pathToFileURL(tarball).href,
    tarballSha256: sha(fs.readFileSync(tarball)),
  };
}

function populateSource(fx, { sourcePath, sourceSha256, tarballUrl = fx.tarballUrl }) {
  const notes = [];
  const tempDir = fs.mkdtempSync(path.join(fx.root, 'gen-'));
  const result = r.populateGeneration({
    tempDir,
    sourcePath,
    sourceSha256,
    tarballUrl,
    tarballSha256: fx.tarballSha256,
    patchelfPath: fx.patchelf,
    readelfPath: fx.readelf,
    glibcLib: fx.glibcLib,
    loaderPath: path.join(fx.glibcLib, 'ld-linux-aarch64.so.1'),
    shellRoot: path.join(fx.root, 'shell'),
    runTemplate: '#!/bin/sh\nexec "$@"\n',
    bashTemplate: '#!/bin/sh\nexec sh "$@"\n',
    notify: line => notes.push(line),
  });
  return { result, notes };
}

function writeSourceFile(fx, content) {
  const sourcePath = path.join(fx.root, 'native', 'claude');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, content, { mode: 0o755 });
  return sourcePath;
}

test('populateGeneration discards a tampered sourcePath and refetches from the tarball', { skip: SKIP }, t => {
  const fx = sourceFixture(t);
  const sourcePath = writeSourceFile(fx, 'tampered');
  const { result, notes } = populateSource(fx, { sourcePath, sourceSha256: sha('expected-native') });
  assert.equal(fs.readFileSync(result.source, 'utf8'), 'good');
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), 'tampered', 'original sourcePath content is untouched');
  assert.ok(notes.some(line => line.includes(UNVERIFIED)), notes.join('\n'));
});

test('populateGeneration reuses a sourcePath whose sha256 matches without downloading', { skip: SKIP }, t => {
  const fx = sourceFixture(t);
  const sourcePath = writeSourceFile(fx, 'trusted');
  const { result, notes } = populateSource(fx, {
    sourcePath,
    sourceSha256: sha('trusted'),
    tarballUrl: 'file:///nonexistent/claude.tgz',
  });
  assert.equal(fs.readFileSync(result.source, 'utf8'), 'trusted');
  assert.equal(notes.some(line => line.includes(UNVERIFIED)), false, notes.join('\n'));
});

test('populateGeneration fetches from the tarball when sourceSha256 is not provided', { skip: SKIP }, t => {
  const fx = sourceFixture(t);
  const sourcePath = writeSourceFile(fx, 'trusted');
  const { result, notes } = populateSource(fx, { sourcePath, sourceSha256: undefined });
  assert.equal(fs.readFileSync(result.source, 'utf8'), 'good');
  assert.ok(notes.some(line => line.includes(UNVERIFIED)), notes.join('\n'));
  assert.equal(fs.readFileSync(sourcePath, 'utf8'), 'trusted', 'original sourcePath content is untouched');
});

// (f) real dash launcher; the generation's .inuse is missing, so every launch-prep attempt fails.
test('launcher retries a generation without .inuse three times then stops without executing native', { skip: SKIP }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p1gaps-launch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gen = path.join(root, 'generations', 'gen-0123456789abcdef-test');
  fs.mkdirSync(gen, { recursive: true });
  fs.writeFileSync(path.join(gen, 'READY'), '{}');
  const patched = path.join(gen, 'patched');
  const nativeMarker = path.join(root, 'native-ran');
  fs.writeFileSync(patched, `#!${SH}\nprintf '%s\\n' ran > '${nativeMarker}'\n`, { mode: 0o755 });
  const shell = path.join(root, 'shell');
  const callFile = path.join(root, 'prep-calls');
  const sequenceFile = path.join(root, 'sequence.json');
  fs.writeFileSync(sequenceFile, JSON.stringify([[gen, patched, shell]]));
  const impl = path.join(root, 'fake-node-impl.js');
  fs.writeFileSync(impl, [
    "const fs = require('node:fs');",
    'let n = 0;',
    'try { n = Number(fs.readFileSync(process.env.CALL_FILE, "utf8")); } catch {}',
    'n++;',
    'fs.writeFileSync(process.env.CALL_FILE, String(n));',
    'const rows = JSON.parse(fs.readFileSync(process.env.SEQUENCE_FILE, "utf8"));',
    'const row = rows[Math.min(n - 1, rows.length - 1)];',
    'process.stdout.write(row.join("\\n") + "\\n");',
  ].join('\n'));
  const node = path.join(root, 'node');
  fs.writeFileSync(node, `#!${SH}\n[ "$1" = -e ] && exit 0\nexec "$REAL_NODE" "$FAKE_IMPL" "$@"\n`, { mode: 0o755 });
  fs.rmSync(path.join(gen, '.inuse'), { force: true });

  const result = spawnSync(SH, [path.resolve(__dirname, '../bin/claude'), '--version'], {
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      MAGI_NODE: node,
      REAL_NODE: process.execPath,
      FAKE_IMPL: impl,
      CALL_FILE: callFile,
      SEQUENCE_FILE: sequenceFile,
      CLAUDE_TERMUX_LAUNCH_MODE: 'patchelf',
      PREFIX: '/data/data/com.termux/files/usr',
      HOME: root,
      TMPDIR: root,
    },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /patchelf launch failed after 3 generation retries; native was not executed/);
  assert.equal(fs.readFileSync(callFile, 'utf8'), '3', 'launch-prep is called exactly three times');
  assert.equal(fs.existsSync(nativeMarker), false, 'native was not executed');
});

// (j) a schema 1 READY on current must not be reused.
test('prepareGeneration rebuilds when current READY has legacy schema 1', { skip: SKIP }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p1gaps-schema-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const versionDir = path.join(root, 'v');
  const identity = sha('legacy-schema-test');
  const base = { versionDir, identity, flockPath: FLOCK, fingerprintPaths: [], notify: () => {}, populate() {} };
  const first = r.prepareGeneration({ ...base, nonce: () => 'first' });
  const readyPath = path.join(first.generationPath, 'READY');
  const ready = JSON.parse(fs.readFileSync(readyPath, 'utf8'));
  ready.schema = 1;
  fs.writeFileSync(readyPath, JSON.stringify(ready));

  let populated = false;
  const second = r.prepareGeneration({
    ...base,
    nonce: () => 'second',
    populate() {
      populated = true;
    },
  });
  assert.equal(populated, true, 'a new generation is built');
  assert.equal(second.reused, false);
  assert.notEqual(second.generation, first.generation);
  assert.equal(fs.readlinkSync(path.join(versionDir, 'current')), second.generation);
  assert.equal(JSON.parse(fs.readFileSync(path.join(second.generationPath, 'READY'), 'utf8')).schema, 2);
});
