'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const SH = '/data/data/com.termux/files/usr/bin/sh';
const LAUNCHER = path.resolve(__dirname, '../bin/claude');
const PREFIX = '/data/data/com.termux/files/usr';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-last-used-'));
}

// Layout: <root>/version/gen-x is $GEN, so the version directory is <root>/version.
function makeFixture(root) {
  const version = path.join(root, 'version');
  const gen = path.join(version, 'gen-x');
  fs.mkdirSync(gen, { recursive: true });
  fs.writeFileSync(path.join(gen, '.inuse'), '');
  fs.writeFileSync(path.join(gen, 'READY'), '{}');
  const patched = path.join(gen, 'patched');
  fs.writeFileSync(patched, '#!/system/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.chmodSync(patched, 0o755);
  const node = path.join(root, 'node');
  fs.writeFileSync(node, `#!/system/bin/sh\n[ "\${1:-}" = -e ] && exit 0\nprintf '%s\\n' '${gen}' '${patched}' '${path.join(root, 'shell')}'\n`, { mode: 0o755 });
  fs.chmodSync(node, 0o755);
  return { version, gen, node, lastUsed: path.join(version, '.last-used') };
}

function runLauncher(fx, root) {
  return spawnSync(SH, [LAUNCHER, '--version'], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, MAGI_NODE: fx.node, CLAUDE_TERMUX_LAUNCH_MODE: 'patchelf', PREFIX, HOME: root, TMPDIR: root },
  });
}

test('real bin launcher creates <version>/.last-used when it is missing', () => {
  const root = tempDir();
  try {
    const fx = makeFixture(root);
    assert.equal(fs.existsSync(fx.lastUsed), false);
    const result = runLauncher(fx, root);
    assert.equal(result.status, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.equal(fs.existsSync(fx.lastUsed), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('real bin launcher does not rewrite a recent .last-used (throttle)', () => {
  const root = tempDir();
  try {
    const fx = makeFixture(root);
    fs.writeFileSync(fx.lastUsed, '');
    const now = new Date();
    fs.utimesSync(fx.lastUsed, now, now);
    const before = fs.statSync(fx.lastUsed).mtimeMs;
    const result = runLauncher(fx, root);
    assert.equal(result.status, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    assert.equal(fs.statSync(fx.lastUsed).mtimeMs, before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('real bin launcher refreshes .last-used when its mtime is older than one hour', () => {
  const root = tempDir();
  try {
    const fx = makeFixture(root);
    fs.writeFileSync(fx.lastUsed, '');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(fx.lastUsed, twoHoursAgo, twoHoursAgo);
    const result = runLauncher(fx, root);
    assert.equal(result.status, 0, `stdout=${result.stdout} stderr=${result.stderr}`);
    const after = fs.statSync(fx.lastUsed).mtimeMs;
    assert.ok(after > twoHoursAgo.getTime() + 60 * 60 * 1000, `mtime was not refreshed: ${after}`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
