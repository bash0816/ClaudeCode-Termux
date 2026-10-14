'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const r = require('./patchelf-runtime');

const FLOCK = r.termuxPaths().flock;
const SKIP = fs.existsSync(FLOCK) ? false : `flock not found: ${FLOCK}`;
const VERSION = '1.2.3';
const IDENTITY = crypto.createHash('sha256').update('patchelf-progress-test').digest('hex');
const PREFIX = `[claude-termux] Preparing Claude Code ${VERSION} `;
const MIB = 1048576;

function writeScript(file, body) {
  fs.writeFileSync(file, `#!${process.execPath}\n${body}\n`, { mode: 0o755 });
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-progress-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const callsFile = path.join(root, 'calls.jsonl');
  // Each fake tool appends {tool, args} to the shared calls file.
  const record = tool => `fs.appendFileSync(${JSON.stringify(callsFile)}, JSON.stringify({ tool: ${JSON.stringify(tool)}, args: process.argv.slice(2) }) + "\\n");`;
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const fx = {
    root,
    callsFile,
    glibcLib: path.join(root, 'glibc', 'lib'),
    curl: path.join(bin, 'curl'),
    tar: path.join(bin, 'tar'),
    patchelf: path.join(bin, 'patchelf'),
    readelf: path.join(bin, 'readelf'),
  };
  fs.mkdirSync(fx.glibcLib, { recursive: true });
  writeScript(fx.curl, `const fs = require('fs');\n${record('curl')}\nconst args = process.argv.slice(2);\nfs.writeFileSync(args[args.indexOf('--output') + 1], 'fake-archive');`);
  writeScript(fx.tar, `const fs = require('fs');\nconst path = require('path');\n${record('tar')}\nconst args = process.argv.slice(2);\nfs.writeFileSync(path.join(args[3], 'claude'), 'fake-claude');`);
  writeScript(fx.patchelf, `const fs = require('fs');\n${record('patchelf')}`);
  writeScript(fx.readelf, `const fs = require('fs');\n${record('readelf')}`);
  return fx;
}

function readCalls(fx) {
  if (!fs.existsSync(fx.callsFile)) return [];
  return fs.readFileSync(fx.callsFile, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function prepareOptions(fx, notify) {
  return {
    versionDir: path.join(fx.root, 'versions', VERSION),
    identity: IDENTITY,
    flockPath: FLOCK,
    version: VERSION,
    notify,
    populate: (tempDir, opts) => r.populateGeneration({
      tempDir,
      notify: opts.notify,
      curlPath: fx.curl,
      tarPath: fx.tar,
      tarballUrl: 'https://example.invalid/claude.tgz',
      patchelfPath: fx.patchelf,
      readelfPath: fx.readelf,
      glibcLib: fx.glibcLib,
      loaderPath: path.join(fx.glibcLib, 'ld-linux-aarch64.so.1'),
      shellRoot: path.join(fx.root, 'shell'),
      runTemplate: '#!/bin/sh\nexec "$@"\n',
      bashTemplate: '#!/bin/sh\nexec sh "$@"\n',
    }),
  };
}

test('cold prepare announces each stage exactly once, in order', { skip: SKIP }, t => {
  const fx = fixture(t);
  const messages = [];
  r.prepareGeneration(prepareOptions(fx, message => messages.push(message)));
  assert.equal(messages.length, 7);
  assert.ok(messages[0].startsWith(PREFIX), messages[0]);
  assert.deepEqual(messages.slice(1), [
    '[claude-termux] Downloading...',
    '[claude-termux] Verifying download...',
    '[claude-termux] Extracting...',
    '[claude-termux] Patching...',
    '[claude-termux] Verifying...',
    '[claude-termux] Done.',
  ]);
});

test('warm prepare with the same inputs announces nothing and reuses the generation', { skip: SKIP }, t => {
  const fx = fixture(t);
  const first = r.prepareGeneration(prepareOptions(fx, () => {}));
  assert.equal(first.reused, false);
  const messages = [];
  const second = r.prepareGeneration(prepareOptions(fx, message => messages.push(message)));
  assert.equal(second.reused, true);
  assert.deepEqual(messages, []);
  assert.equal(readCalls(fx).filter(call => call.tool === 'curl').length, 1);
});

test('prepare writes nothing to process.stdout', { skip: SKIP }, t => {
  const fx = fixture(t);
  const writes = [];
  const original = process.stdout.write;
  process.stdout.write = chunk => {
    writes.push(String(chunk));
    return true;
  };
  try {
    r.prepareGeneration(prepareOptions(fx, () => {}));
  } finally {
    process.stdout.write = original;
  }
  assert.deepEqual(writes, []);
});

test('curl gets --progress-bar while patchelf and readelf do not', { skip: SKIP }, t => {
  const fx = fixture(t);
  r.prepareGeneration(prepareOptions(fx, () => {}));
  const calls = readCalls(fx);
  const curl = calls.filter(call => call.tool === 'curl');
  const tools = calls.filter(call => call.tool === 'patchelf' || call.tool === 'readelf');
  assert.equal(curl.length, 1);
  assert.ok(curl[0].args.includes('--progress-bar'), curl[0].args.join(' '));
  assert.ok(tools.some(call => call.tool === 'patchelf'));
  assert.ok(tools.some(call => call.tool === 'readelf'));
  for (const call of tools) assert.ok(!call.args.includes('--progress-bar'), `${call.tool}: ${call.args.join(' ')}`);
});

test('announcement states the computed free-space requirement in MiB', { skip: SKIP }, t => {
  const fx = fixture(t);
  const messages = [];
  r.prepareGeneration(prepareOptions(fx, message => messages.push(message)));
  const mib = Math.ceil(r.PREPARE_REQUIRED_FREE_BYTES / MIB);
  assert.ok(messages[0].includes(`needs about ${mib} MiB free`), messages[0]);
});
