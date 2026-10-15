'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const r = require('./patchelf-runtime');

const FLOCK = r.termuxPaths().flock;
const PREFIX = process.env.PREFIX || '/data/data/com.termux/files/usr';
const SH = path.join(PREFIX, 'bin', 'sh');
const SKIP = fs.existsSync(FLOCK) && fs.existsSync(SH) ? false : 'flock or sh not available';
const GEN_READY = 'gen-0123456789abcdef-test';
const GEN_INUSE = 'gen-fedcba9876543210-test';
const GEN_BARE = 'gen-aaaaaaaaaaaaaaaa-test';
const RUN = '#!/bin/sh\nexec true\n';
const BASH = '#!/bin/sh\nexec bash "$@"\n';

function makeVersion(versionDir, gens, current = null) {
  fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(path.join(versionDir, 'prepare.lock'), '');
  for (const { name, ready = false, inuse = false } of gens) {
    const dir = path.join(versionDir, name);
    fs.mkdirSync(dir);
    if (ready) fs.writeFileSync(path.join(dir, 'READY'), 'ready\n');
    if (inuse) fs.writeFileSync(path.join(dir, '.inuse'), '');
  }
  if (current) fs.symlinkSync(current, path.join(versionDir, 'current'));
}

function layout(root) {
  return {
    versionDir: path.join(root, 'patchelf', '9.9.9'),
    shellRoot: path.join(root, 'patchelf', 'shell'),
  };
}

function repair(root) {
  const { versionDir, shellRoot } = layout(root);
  return r.repairRuntime({ versionDir, shellRoot, runTemplate: RUN, bashTemplate: BASH, flockPath: FLOCK });
}

function widDirOf(root) {
  return path.join(layout(root).shellRoot, r.wrapperIdentity(RUN, BASH));
}

function waitForLine(child, expected, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${expected}"`)), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.includes(expected)) { clearTimeout(timer); resolve(); }
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`child exited early with ${code}`)); });
  });
}

test('repairRuntime removes READY-less generations and keeps READY generations and current', { skip: SKIP }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-repair-'));
  try {
    const { versionDir } = layout(root);
    makeVersion(versionDir, [
      { name: GEN_READY, ready: true, inuse: true },
      { name: GEN_INUSE, inuse: true },
      { name: GEN_BARE },
    ], GEN_READY);
    const result = repair(root);
    assert.deepEqual(result.removedGenerations.slice().sort(), [GEN_BARE, GEN_INUSE].sort());
    assert.deepEqual(result.skippedGenerations, []);
    assert.equal(result.wrappers, 'recreated');
    assert.ok(fs.existsSync(path.join(versionDir, GEN_READY, 'READY')));
    assert.equal(fs.readlinkSync(path.join(versionDir, 'current')), GEN_READY);
    assert.equal(fs.existsSync(path.join(versionDir, GEN_INUSE)), false);
    assert.equal(fs.existsSync(path.join(versionDir, GEN_BARE)), false);
    assert.deepEqual(fs.readdirSync(versionDir).filter((name) => name.startsWith('.trash-')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repairRuntime skips a READY-less generation whose .inuse is held shared by another process', { skip: SKIP }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-repair-'));
  let child = null;
  try {
    const { versionDir } = layout(root);
    makeVersion(versionDir, [{ name: GEN_INUSE, inuse: true }]);
    const inuse = path.join(versionDir, GEN_INUSE, '.inuse');
    child = spawn(FLOCK, ['-s', inuse, SH, '-c', 'echo ready; read _'], { stdio: ['pipe', 'pipe', 'inherit'] });
    await waitForLine(child, 'ready', 5000);
    const result = repair(root);
    assert.deepEqual(result.removedGenerations, []);
    assert.deepEqual(result.skippedGenerations, [{ name: GEN_INUSE, reason: 'locked' }]);
    assert.ok(fs.existsSync(path.join(versionDir, GEN_INUSE)));
  } finally {
    if (child) {
      child.stdin.end();
      if (child.exitCode === null && child.signalCode === null) await once(child, 'exit');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repairRuntime removes current when it pointed at a collected READY-less generation', { skip: SKIP }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-repair-'));
  try {
    const { versionDir } = layout(root);
    makeVersion(versionDir, [{ name: GEN_READY, ready: true }, { name: GEN_BARE }], GEN_BARE);
    const result = repair(root);
    assert.deepEqual(result.removedGenerations, [GEN_BARE]);
    assert.throws(() => fs.lstatSync(path.join(versionDir, 'current')), { code: 'ENOENT' });
    assert.ok(fs.existsSync(path.join(versionDir, GEN_READY, 'READY')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repairRuntime replaces a corrupted run wrapper atomically and leaves bash untouched', { skip: SKIP }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-repair-'));
  try {
    const { shellRoot } = layout(root);
    r.ensureShellWrappers(shellRoot, RUN, BASH);
    const dir = widDirOf(root);
    const runPath = path.join(dir, 'run');
    const bashPath = path.join(dir, 'bash');
    fs.writeFileSync(runPath, 'corrupted\n');
    const runIno = fs.statSync(runPath).ino;
    const bashIno = fs.statSync(bashPath).ino;

    const originalRename = fs.renameSync;
    let observed = false;
    fs.renameSync = (src, dest) => {
      if (dest === runPath) {
        assert.ok(fs.existsSync(runPath), 'the old run wrapper must exist until the rename');
        assert.equal(fs.readFileSync(src, 'utf8'), RUN);
        observed = true;
      }
      return originalRename(src, dest);
    };
    let result;
    try {
      result = repair(root);
    } finally {
      fs.renameSync = originalRename;
    }

    assert.ok(observed, 'the run wrapper rename was not observed');
    assert.equal(result.wrappers, 'replaced');
    assert.equal(fs.readFileSync(runPath, 'utf8'), RUN);
    assert.notEqual(fs.statSync(runPath).ino, runIno);
    assert.equal(fs.statSync(runPath).mode & 0o777, 0o755);
    assert.equal(fs.statSync(bashPath).ino, bashIno);
    assert.equal(fs.readFileSync(bashPath, 'utf8'), BASH);
    assert.deepEqual(fs.readdirSync(dir).filter((name) => name.startsWith('.tmp-')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repairRuntime recreates a missing run wrapper inside an existing wid directory', { skip: SKIP }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-repair-'));
  try {
    const { shellRoot } = layout(root);
    r.ensureShellWrappers(shellRoot, RUN, BASH);
    const dir = widDirOf(root);
    const runPath = path.join(dir, 'run');
    const bashPath = path.join(dir, 'bash');
    fs.rmSync(runPath);
    const bashIno = fs.statSync(bashPath).ino;

    const result = repair(root);

    assert.equal(result.wrappers, 'replaced');
    assert.equal(fs.readFileSync(runPath, 'utf8'), RUN);
    assert.equal(fs.statSync(runPath).mode & 0o777, 0o755);
    assert.equal(fs.statSync(bashPath).ino, bashIno);
    assert.deepEqual(fs.readdirSync(dir).filter((name) => name.startsWith('.tmp-')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repairRuntime leaves intact wrappers and generations unchanged', { skip: SKIP }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-repair-'));
  try {
    const { versionDir, shellRoot } = layout(root);
    makeVersion(versionDir, [{ name: GEN_READY, ready: true, inuse: true }], GEN_READY);
    r.ensureShellWrappers(shellRoot, RUN, BASH);
    const dir = widDirOf(root);
    const runBefore = fs.statSync(path.join(dir, 'run'));
    const bashBefore = fs.statSync(path.join(dir, 'bash'));

    const result = repair(root);

    assert.equal(result.wrappers, 'ok');
    assert.deepEqual(result.removedGenerations, []);
    assert.deepEqual(result.skippedGenerations, []);
    const runAfter = fs.statSync(path.join(dir, 'run'));
    const bashAfter = fs.statSync(path.join(dir, 'bash'));
    assert.equal(runAfter.ino, runBefore.ino);
    assert.equal(runAfter.mtimeMs, runBefore.mtimeMs);
    assert.equal(bashAfter.ino, bashBefore.ino);
    assert.equal(bashAfter.mtimeMs, bashBefore.mtimeMs);
    assert.ok(fs.existsSync(path.join(versionDir, GEN_READY, 'READY')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the repair CLI exits 0 and reports a replaced wrapper', { skip: SKIP }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-repair-'));
  try {
    const config = require('../config/claude-native-audited-versions.json');
    const version = Object.keys(config.versions).find((name) => {
      const item = config.versions[name];
      return item?.native_spec && item.tarball_sha256 && item.tarball_integrity;
    });
    assert.ok(version, 'no audited version is available');
    const glibcLib = path.join(root, 'glibc-lib');
    fs.mkdirSync(glibcLib);
    const cli = path.join(__dirname, 'patchelf-runtime-cli.js');
    const env = {
      ...process.env,
      PREFIX,
      CLAUDE_TERMUX_PACKAGE_CACHE: root,
      CLAUDE_TERMUX_CLAUDE_VERSION: version,
      CLAUDE_TERMUX_GLIBC_LIB: glibcLib,
    };

    const first = spawnSync(process.execPath, [cli, 'repair'], { env, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stderr).wrappers, 'recreated');

    const shellRoot = path.join(root, 'patchelf', 'shell');
    const [wid] = fs.readdirSync(shellRoot);
    fs.writeFileSync(path.join(shellRoot, wid, 'run'), 'corrupted\n');

    const second = spawnSync(process.execPath, [cli, 'repair'], { env, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stderr).wrappers, 'replaced');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
