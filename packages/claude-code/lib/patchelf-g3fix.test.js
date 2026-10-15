'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const runtime = require('./patchelf-runtime');
const { writeFakeReadelf } = require('./test-support/fake-readelf');

const REAL_GLIBC_LOADER = path.join(process.env.PREFIX || '/data/data/com.termux/files/usr', 'glibc/lib/ld-linux-aarch64.so.1');
const REAL_SH = '/data/data/com.termux/files/usr/bin/sh';
const REAL_FLOCK = '/data/data/com.termux/files/usr/bin/flock';
const CAN_RUN_CLI = fs.existsSync(REAL_FLOCK) && fs.existsSync(REAL_SH) && fs.existsSync(REAL_GLIBC_LOADER);

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-g3fix-')); }
function sha256Buffer(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

// B4: a source that is verified before copying must also be verified after copying.
test('copyTrustedSource returns true and writes dest when the copy matches the audited sha256', () => {
  const root = tempDir();
  const source = path.join(root, 'native');
  const dest = path.join(root, 'out', 'claude');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(source, 'native-binary');
  const sha = sha256Buffer(Buffer.from('native-binary'));

  assert.equal(runtime.copyTrustedSource(source, dest, sha), true);
  assert.equal(fs.readFileSync(dest, 'utf8'), 'native-binary');
  assert.equal(fs.readFileSync(source, 'utf8'), 'native-binary', 'sourcePath is left unchanged');
});

test('copyTrustedSource removes dest and returns false when the copied bytes do not match', () => {
  const root = tempDir();
  const source = path.join(root, 'native');
  const dest = path.join(root, 'out', 'claude');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(source, 'native-binary');
  const sha = sha256Buffer(Buffer.from('native-binary'));

  // Simulate a copy that writes different bytes than the verified source.
  const tamperingCopy = (src, target) => fs.writeFileSync(target, 'tampered-after-verification');
  assert.equal(runtime.copyTrustedSource(source, dest, sha, { copy: tamperingCopy }), false);
  assert.equal(fs.existsSync(dest), false, 'mismatched dest is removed');
  assert.equal(fs.readFileSync(source, 'utf8'), 'native-binary', 'sourcePath is left unchanged');
});

test('copyTrustedSource returns false without copying when the source does not match the audited sha256', () => {
  const root = tempDir();
  const source = path.join(root, 'native');
  const dest = path.join(root, 'claude');
  fs.writeFileSync(source, 'native-binary');
  let copied = false;

  assert.equal(runtime.copyTrustedSource(source, dest, hash('other'), { copy: () => { copied = true; } }), false);
  assert.equal(copied, false);
  assert.equal(fs.existsSync(dest), false);
});

test('parseRequiredFreeBytes accepts positive decimal integers and falls back otherwise', () => {
  const fallback = 12345;
  assert.equal(runtime.parseRequiredFreeBytes('abc', fallback), fallback);
  assert.equal(runtime.parseRequiredFreeBytes('0', fallback), fallback);
  assert.equal(runtime.parseRequiredFreeBytes('-5', fallback), fallback);
  assert.equal(runtime.parseRequiredFreeBytes('1.5', fallback), fallback);
  assert.equal(runtime.parseRequiredFreeBytes('', fallback), fallback);
  assert.equal(runtime.parseRequiredFreeBytes(undefined, fallback), fallback);
  assert.equal(runtime.parseRequiredFreeBytes('1048576', fallback), 1048576);
  // Larger than Number.MAX_SAFE_INTEGER is still an accepted explicit override.
  assert.equal(runtime.parseRequiredFreeBytes('999999999999999999', fallback), 999999999999999999);
});

// B5: an explicit override must reach the free-space check on a cold preparation.
function makeCliFixture() {
  const root = tempDir();
  const pkgDir = path.join(root, 'pkg');
  const libDir = path.join(pkgDir, 'lib');
  const configDir = path.join(pkgDir, 'config');
  const realPkgDir = path.resolve(__dirname, '..');
  fs.mkdirSync(libDir, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.copyFileSync(path.join(realPkgDir, 'package.json'), path.join(pkgDir, 'package.json'));
  const version = JSON.parse(fs.readFileSync(path.join(realPkgDir, 'package.json'), 'utf8')).version;
  const config = JSON.parse(fs.readFileSync(path.join(realPkgDir, 'config/claude-native-audited-versions.json'), 'utf8'));
  if (!config.versions || !config.versions[version]) throw new Error(`audited config has no entry for ${version}`);
  config.versions[version].source_sha256 = hash('native');
  fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(config, null, 2));
  fs.copyFileSync(path.resolve(__dirname, 'patchelf-runtime-cli.js'), path.join(libDir, 'patchelf-runtime-cli.js'));
  fs.copyFileSync(path.resolve(__dirname, 'patchelf-runtime.js'), path.join(libDir, 'patchelf-runtime.js'));
  const cli = path.join(libDir, 'patchelf-runtime-cli.js');

  const prefix = path.join(root, 'prefix');
  const cache = path.join(root, 'cache');
  const glibc = path.join(root, 'glibc');
  fs.mkdirSync(path.join(prefix, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(prefix, 'lib'), { recursive: true });
  fs.mkdirSync(glibc);
  fs.symlinkSync(REAL_FLOCK, path.join(prefix, 'bin', 'flock'));
  fs.symlinkSync(REAL_SH, path.join(prefix, 'bin', 'sh'));
  fs.writeFileSync(path.join(prefix, 'bin', 'bash'), '#!/system/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(path.join(prefix, 'lib', 'libtermux-exec-ld-preload.so'), 'preload');
  for (const name of ['libc.so.6', 'libm.so.6']) fs.writeFileSync(path.join(glibc, name), `library:${name}`);
  fs.copyFileSync(REAL_GLIBC_LOADER, path.join(glibc, 'ld-linux-aarch64.so.1'));

  const patchelf = path.join(prefix, 'bin', 'patchelf');
  const readelf = path.join(prefix, 'bin', 'readelf');
  const npm = path.join(prefix, 'bin', 'npm');
  const npmMarker = path.join(root, 'npm-called');
  fs.writeFileSync(patchelf, `#!${REAL_SH}\nexit 0\n`, { mode: 0o755 });
  writeFakeReadelf(readelf, { loaderPath: path.join(glibc, 'ld-linux-aarch64.so.1') });
  // The marker records whether preparation reached npm; a free-space refusal must leave it absent.
  fs.writeFileSync(npm, `#!${REAL_SH}\n: > '${npmMarker}'\nprintf '%s\\n' 'https://example.invalid/x.tgz'\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'native'), 'native');

  const env = {
    ...process.env,
    PREFIX: prefix,
    HOME: path.join(root, 'home'),
    TMPDIR: path.join(root, 'tmp'),
    CLAUDE_TERMUX_PACKAGE_CACHE: cache,
    CLAUDE_TERMUX_GLIBC_LIB: glibc,
    CLAUDE_TERMUX_PATCHELF: patchelf,
    CLAUDE_TERMUX_READELF: readelf,
    CLAUDE_TERMUX_NPM: npm,
    CLAUDE_TERMUX_NATIVE_BIN: path.join(root, 'native'),
    CLAUDE_TERMUX_PREPARE_REQUIRED_FREE_BYTES: '999999999999999999',
  };
  fs.mkdirSync(env.HOME);
  fs.mkdirSync(env.TMPDIR);
  return { root, cli, env, npmMarker, version };
}

function lexists(p) {
  try { fs.lstatSync(p); return true; } catch { return false; }
}

// A refused preparation must not publish a generation. Empty directories such as patchelf/ or
// patchelf/<version>/ may exist, so only generation entries and the current pointer are checked.
// Only direct children are inspected, not a recursive walk.
function assertNoPublishedGeneration(cache, version) {
  const patchRoot = path.join(cache, 'patchelf');
  const versionDir = path.join(patchRoot, version);
  if (fs.existsSync(patchRoot)) {
    const rootGens = fs.readdirSync(patchRoot).filter((name) => name.startsWith('gen-'));
    assert.deepEqual(rootGens, [], 'no generation directory is published under patchelf/');
  }
  if (fs.existsSync(versionDir)) {
    const genNames = fs.readdirSync(versionDir).filter((name) => name.startsWith('gen-'));
    assert.deepEqual(genNames, [], 'no generation directory is published under patchelf/<version>/');
    assert.equal(lexists(path.join(versionDir, 'current')), false, 'no current pointer is published');
  }
}

for (const command of ['launch-prep', 'hook-path']) {
  test(`cold ${command} refuses before preparing when the explicit free-space override is larger than the disk`, { skip: !CAN_RUN_CLI }, () => {
    const { root, cli, env, npmMarker, version } = makeCliFixture();
    const result = spawnSync(process.execPath, [cli, command], { encoding: 'utf8', env, timeout: 30000 });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /Not enough free disk space/, result.stderr);
    assert.equal(fs.existsSync(npmMarker), false, 'npm must not run when the free-space check refuses');
    assertNoPublishedGeneration(env.CLAUDE_TERMUX_PACKAGE_CACHE, version);
    assert.ok(root);
  });
}
