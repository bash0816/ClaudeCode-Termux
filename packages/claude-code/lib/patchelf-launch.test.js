'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const packageDir = path.resolve(__dirname, '..');
const pkgVersion = require('../package.json').version;
const launcher = path.join(packageDir, 'bin', 'claude');

function executable(file, source) {
  fs.writeFileSync(file, source, { mode: 0o755 });
  fs.chmodSync(file, 0o755);
}
function launchFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-launch-'));
  const bin = path.join(root, 'bin space'); fs.mkdirSync(bin);
  const node = path.join(bin, 'node mock');
  const gen = path.join(root, 'gen-fixture-123abc');
  fs.mkdirSync(gen);
  fs.writeFileSync(path.join(gen, '.inuse'), '', { mode: 0o600 });
  fs.writeFileSync(path.join(gen, 'READY'), JSON.stringify({ schema: 1, identity: '0'.repeat(64), wid: '0'.repeat(32), wrappers: { wid: '0'.repeat(32), run: `${'0'.repeat(32)}/run`, bash: `${'0'.repeat(32)}/bash` }, fingerprintPaths: [], fingerprints: {}, glibcPaths: [], glibcLinks: [], sha256: {} }));
  const native = path.join(gen, 'patched claude');
  const glibc = path.join(gen, 'glibc min');
  const shell = path.join(root, 'shell bash');
  const log = path.join(root, 'node calls');
  executable(node, `#!/bin/sh\ncase "${'${2:-}'}" in\n  hook-path) printf '%s\\n' "$HOOK_PATH" ;;\n  verify) exit 0 ;;\n  launch-prep) [ "$PREP_FAIL" = 1 ] && { echo mocked-failure >&2; exit 42; }; printf '%s\\n%s\\n%s\\n%s\\n' "$GEN_PATH" "$PATCHED_PATH" "$GLIBC_PATH" "$SHELL_PATH" ;;\n  *) printf x >> "$NODE_LOG"; exit 0 ;;\nesac\n`);
  executable(native, '#!/bin/sh\nprintf "LD_PRELOAD=%s\\nLD_LIBRARY_PATH=%s\\nDISABLE_UPDATES=%s\\nCLAUDE_CODE_SHELL=%s\\n" "${LD_PRELOAD-}" "${LD_LIBRARY_PATH-}" "${DISABLE_UPDATES-}" "${CLAUDE_CODE_SHELL-}"\nfor arg do printf "ARG=<%s>\\n" "$arg"; done\nprintf "EXECUTED\\n" >> "$NATIVE_LOG"\n');
  const env = {
    ...process.env,
    MAGI_NODE: node,
    NODE_LOG: log,
    NATIVE_LOG: path.join(root, 'native log'),
    GEN_PATH: gen,
    PATCHED_PATH: native,
    GLIBC_PATH: glibc,
    SHELL_PATH: shell,
    HOOK_PATH: path.join(root, 'hook run'),
    CLAUDE_TERMUX_LAUNCH_MODE: 'patchelf',
    TMPDIR: root,
  };
  return { root, bin, node, gen, native, glibc, shell, log, env };
}

test('cold real launcher prepares verified runtime and prints hook runner path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-cold-cli-'));
  try {
    const sourcePkg = packageDir; const pkgDir = path.join(root, 'package');
    fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true }); fs.mkdirSync(path.join(pkgDir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(pkgDir, 'config'), { recursive: true });
    for (const file of ['bin/claude', 'lib/patchelf-runtime-cli.js', 'lib/patchelf-runtime.js', 'lib/native-hash.js', 'lib/check-updates.js', 'lib/version-utils.js', 'package.json']) fs.copyFileSync(path.join(sourcePkg, file), path.join(pkgDir, file));
    fs.cpSync(path.join(sourcePkg, 'config'), path.join(pkgDir, 'config'), { recursive: true });
    const nativeTar = path.join(root, 'fixture tarball.tgz'); fs.writeFileSync(nativeTar, 'real verifyTarball fixture bytes');
    const bytes = fs.readFileSync(nativeTar); const configFile = path.join(pkgDir, 'config', 'claude-native-audited-versions.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8')); const version = require('../package.json').version; const audited = config.versions[version];
    audited.tarball_sha256 = require('node:crypto').createHash('sha256').update(bytes).digest('hex');
    audited.tarball_integrity = `sha512-${require('node:crypto').createHash('sha512').update(bytes).digest('base64')}`; audited.tarball_size = bytes.length;
    fs.writeFileSync(configFile, JSON.stringify(config));
    const prefix = path.join(root, 'prefix'); const envPrefix = path.join(prefix, 'glibc', 'lib'); fs.mkdirSync(envPrefix, { recursive: true });
    const loader = path.join(prefix, 'glibc', 'lib', 'ld-linux-aarch64.so.1');
    const makeElf = (file, interpreter) => { const b = Buffer.alloc(512); b.set([0x7f,0x45,0x4c,0x46,2,1,1]); b.writeBigUInt64LE(64n,32); b.writeUInt16LE(56,54); b.writeUInt16LE(1,56); b.writeUInt32LE(3,64); b.writeBigUInt64LE(256n,72); b.writeBigUInt64LE(BigInt(Buffer.byteLength(interpreter)+1),96); b.write(interpreter,256); fs.writeFileSync(file,b,{mode:0o755}); fs.chmodSync(file,0o755); };
    makeElf(loader, loader);
    for (const name of ['libc.so.6', 'libm.so.6']) { const target = path.join(envPrefix, `${name}.real`); fs.writeFileSync(target, 'fixture library'); fs.symlinkSync(target, path.join(envPrefix, name)); }
    fs.mkdirSync(path.join(prefix, 'bin'), { recursive: true }); fs.writeFileSync(path.join(prefix, 'bin', 'bash'), 'bash'); fs.writeFileSync(path.join(prefix, 'bin', 'sh'), 'sh');
    fs.mkdirSync(path.join(prefix, 'lib'), { recursive: true }); fs.writeFileSync(path.join(prefix, 'lib', 'libtermux-exec-ld-preload.so'), '');
    const flock = path.join(prefix, 'bin', 'flock'); fs.symlinkSync('/data/data/com.termux/files/usr/bin/flock', flock);
    const tools = path.join(root, 'tools'); fs.mkdirSync(tools);
    const tool = (name, body) => { const file = path.join(tools, name); executable(file, `#!/system/bin/sh\n${body}\n`); return file; };
    tool('npm', `if [ "$1" = view ]; then printf '"https://fixture.invalid/native.tgz"'; else printf '[{"filename":"unused.tgz"}]'; fi`);
    tool('curl', `while [ "$1" != "--output" ]; do shift; done; cp '${nativeTar}' "$2"`);
    const nativeElf = path.join(root, 'native claude'); makeElf(nativeElf, loader);
    tool('tar', `mkdir -p "$4/package"; cp '${nativeElf}' "$4/package/claude"; chmod 755 "$4/package/claude"`);
    tool('patchelf', `if [ "$1" = --version ]; then echo 'patchelf fixture'; fi`);
    tool('readelf', `if [ "$1" = --version ]; then echo 'readelf fixture'; fi`);
    fs.symlinkSync(path.join(tools, 'patchelf'), path.join(prefix, 'bin', 'patchelf'));
    fs.symlinkSync(path.join(tools, 'readelf'), path.join(prefix, 'bin', 'readelf'));
    fs.symlinkSync(process.execPath, path.join(tools, 'node'));
    const cache = path.join(root, 'empty cache');
    const result = spawnSync('/bin/sh', [path.join(pkgDir, 'bin', 'claude'), '--termux-hook-env-path'], { env: { ...process.env, MAGI_NODE: path.join(tools, 'node'), PATH: `${tools}:${process.env.PATH}`, PREFIX: prefix, CLAUDE_TERMUX_LAUNCH_MODE: 'patchelf', CLAUDE_TERMUX_PACKAGE_CACHE: cache, CLAUDE_TERMUX_SKIP_UPDATE_CHECK: '1', HOME: root }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const run = result.stdout.trim(); assert.equal(path.isAbsolute(run), true); assert.match(run, /\/patchelf\/shell\/[a-f0-9]{32}\/run$/);
    assert.equal(fs.statSync(run).isFile(), true);
    const shellRoot = path.dirname(path.dirname(run)); assert.equal(fs.existsSync(shellRoot), true);
    const versionDir = path.join(cache, 'patchelf', version);
    const currentLink = path.join(versionDir, 'current');
    const genName = fs.readlinkSync(currentLink);
    assert.match(genName, /^gen-[a-f0-9]{16}-/);
    const generationPath = path.join(versionDir, genName);
    assert.equal(fs.existsSync(path.join(generationPath, 'READY')), true);
    assert.equal(fs.existsSync(path.join(generationPath, '.inuse')), true);
    const ready = JSON.parse(fs.readFileSync(path.join(generationPath, 'READY'), 'utf8'));
    assert.equal(ready.schema, 1);
    assert.match(ready.identity, /^[a-f0-9]{64}$/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('patchelf launcher makes one Node call and passes env and unusual arguments to true exec', () => {
  const f = launchFixture();
  try {
    const result = spawnSync('/bin/sh', [launcher, 'a b', '', `q'uote`], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(f.log, 'utf8'), 'x');
    assert.match(result.stdout, new RegExp(`LD_PRELOAD=\\nLD_LIBRARY_PATH=${f.glibc.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\nDISABLE_UPDATES=1`));
    assert.match(result.stdout, new RegExp(`CLAUDE_CODE_SHELL=${f.shell.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}`));
    assert.match(result.stdout, /ARG=<a b>\nARG=<>\nARG=<q'uote>/);
    assert.equal(fs.existsSync(f.env.NATIVE_LOG), true);
    const custom = { ...f.env, CLAUDE_CODE_SHELL: '/caller/shell' };
    fs.writeFileSync(f.log, '');
    const customResult = spawnSync('/bin/sh', [launcher, '--version'], { env: custom, encoding: 'utf8' });
    assert.equal(customResult.status, 0, customResult.stderr);
    assert.match(customResult.stdout, /CLAUDE_CODE_SHELL=\/caller\/shell/);
    assert.equal(fs.readFileSync(f.log, 'utf8'), 'x');
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('patchelf launcher preserves prepare failure status and never execs native', () => {
  const f = launchFixture();
  try {
    const result = spawnSync('/bin/sh', [launcher, '--version'], { env: { ...f.env, PREP_FAIL: '1' }, encoding: 'utf8' });
    assert.equal(result.status, 42);
    assert.match(result.stderr, /mocked-failure/);
    assert.equal(fs.existsSync(f.env.NATIVE_LOG), false);
    assert.equal(fs.readFileSync(f.log, 'utf8'), 'x');
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('--termux-hook-env-path uses one CLI call and prints just its absolute path', () => {
  const f = launchFixture();
  try {
    const result = spawnSync('/bin/sh', [launcher, '--termux-hook-env-path'], { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${f.env.HOOK_PATH}\n`);
    assert.equal(fs.readFileSync(f.log, 'utf8'), 'x');
    const unsupported = spawnSync('/bin/sh', [launcher, '--termux-hook-env-path'], { env: { ...f.env, CLAUDE_TERMUX_LAUNCH_MODE: '' }, encoding: 'utf8' });
    assert.equal(unsupported.status, 1);
    assert.equal(unsupported.stdout, '');
    assert.match(unsupported.stderr, /supported only with CLAUDE_TERMUX_LAUNCH_MODE=patchelf/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('unset, empty and unknown launch mode do not enter patchelf branch', () => {
  const f = launchFixture();
  try {
    const legacyNode = path.join(f.bin, 'legacy-node');
    executable(legacyNode, `#!/bin/sh\ncase "${'${1:-}'}" in\n  -e) case "$*" in *"p.version"*) printf '${pkgVersion}' ;; *"config.versions"*) case "${'${5:-}'}" in entry_format) printf esm-chunked;; esac ;; esac ;;\n  *) : ;;\nesac\n`);
    const source = path.join(f.root, 'cache', 'versions', pkgVersion, 'app/node_modules/@anthropic-ai/claude-code-linux-arm64/claude');
    fs.mkdirSync(path.dirname(source), { recursive: true }); fs.writeFileSync(source, 'cached');
    executable(path.join(f.bin, 'sh'), '#!/bin/sh\nprintf shim-route\n');
    for (const mode of ['', 'unset']) {
      const env = { ...f.env, MAGI_NODE: legacyNode, PATH: `${f.bin}:${process.env.PATH}`, CLAUDE_TERMUX_PACKAGE_CACHE: path.join(f.root, 'cache') };
      delete env.CLAUDE_TERMUX_LAUNCH_MODE;
      if (mode === '') env.CLAUDE_TERMUX_LAUNCH_MODE = '';
      const result = spawnSync('/bin/sh', [launcher, '--version'], { env, encoding: 'utf8' });
      assert.equal(result.stdout, 'shim-route');
      assert.equal(result.status, 0, result.stderr);
    }
    const unknown = spawnSync('/bin/sh', [launcher, '--version'], { env: { ...f.env, MAGI_NODE: legacyNode, PATH: `${f.bin}:${process.env.PATH}`, CLAUDE_TERMUX_PACKAGE_CACHE: path.join(f.root, 'cache'), CLAUDE_TERMUX_LAUNCH_MODE: 'future-mode' }, encoding: 'utf8' });
    assert.equal(unknown.stdout, 'shim-route');
    assert.match(unknown.stderr, /unknown CLAUDE_TERMUX_LAUNCH_MODE/);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test('bin/claude rejects missing READY and never reaches native when offline rebuild fails', () => {
  const fsx = require('node:fs');
  const root = fsx.mkdtempSync(path.join(os.tmpdir(), 'patchelf-bin-corrupt-'));
  try {
    const prefix = path.join(root, 'prefix');
    const cache = path.join(root, 'cache');
    const versionDir = path.join(cache, 'patchelf', require('../package.json').version);
    fsx.mkdirSync(versionDir, { recursive: true });
    const mockBin = path.join(root, 'mock-bin'); fsx.mkdirSync(mockBin);
    executable(path.join(mockBin, 'npm'), '#!/system/bin/sh\nexit 1\n');
    const envVars = { ...process.env, PREFIX: prefix, CLAUDE_TERMUX_LAUNCH_MODE: 'patchelf', CLAUDE_TERMUX_PACKAGE_CACHE: cache, CLAUDE_TERMUX_SKIP_UPDATE_CHECK: '1', PATH: `${mockBin}:${process.env.PATH}`, TMPDIR: root };
    const result = spawnSync('/bin/sh', [launcher, '--version'], { env: envVars, encoding: 'utf8' });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /patchelf runtime failed/);
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /EXECUTED/);
  } finally { fsx.rmSync(root, { recursive: true, force: true }); }
});


test('symlink shim behavior matches HEAD for arguments, environment, version, update and notify routes', () => {
  const baseline = spawnSync('git', ['show', 'main:packages/claude-code/bin/claude'], { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8' });
  assert.equal(baseline.status, 0, baseline.stderr);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-shim-baseline-'));
  try {
    const node = path.join(root, 'node mock');
    const shim = `#!/system/bin/sh\ncase "${'${1:-}'}" in\n  -e) case "$2" in *p.version*) printf '${pkgVersion}' ;; *config.versions*) [ "$5" = entry_format ] && printf 'esm-chunked' ;; esac ;;\n  */check-updates.js) printf 'node:%s:%s:%s\\n' "$2" "$3" "$4" >> "$TRACE" ;;\n  *) printf 'node:%s\\n' "$*" >> "$TRACE" ;;\nesac\n`;
    executable(node, shim);
    const mockBin = path.join(root, 'mock-bin'); fs.mkdirSync(mockBin);
    executable(path.join(mockBin, 'sh'), `#!/system/bin/sh
printf \"launch:%s:%s:%s:%s:%s\\n\" \"\${CLAUDE_TERMUX_CLAUDE_VERSION-}\" \"\${CLAUDE_CODE_DISABLE_AGENT_VIEW-}\" \"\${CLAUDE_NATIVE_UPDATE_CHECK-}\" \"\${ENTRY_FORMAT-}\" \"$*\" >> \"\${TRACE}\"
for arg do printf 'arg:<%s>\\n' \"$arg\" >> \"\${TRACE}\"; done
`);
    const runVersion = (label, source) => {
      const pkg = path.join(root, label); const bin = path.join(pkg, 'bin'); const lib = path.join(pkg, 'lib'); fs.mkdirSync(bin, { recursive: true }); fs.mkdirSync(lib, { recursive: true });
      fs.writeFileSync(path.join(bin, 'claude'), source); fs.chmodSync(path.join(bin, 'claude'), 0o755);
      fs.writeFileSync(path.join(lib, 'check-updates.js'), ''); fs.writeFileSync(path.join(lib, 'prepare-native.js'), ''); fs.writeFileSync(path.join(lib, 'termux-run-claude-native.sh'), '');
      const cache = path.join(root, `${label}-cache`, 'versions', '2.1.284', 'app/node_modules/@anthropic-ai/claude-code-linux-arm64'); fs.mkdirSync(cache, { recursive: true }); fs.writeFileSync(path.join(cache, 'claude'), 'native');
      const link = path.join(root, `${label}-entry`); fs.symlinkSync(path.join(bin, 'claude'), link);
      const trace = path.join(root, `${label}.trace`);
      const env = { ...process.env, PATH: `${mockBin}:${process.env.PATH}`, MAGI_NODE: node, TRACE: trace, HOME: root, CLAUDE_TERMUX_PACKAGE_CACHE: path.join(root, `${label}-cache`), CLAUDE_TERMUX_CLAUDE_VERSION: '2.1.284', CLAUDE_CODE_DISABLE_AGENT_VIEW: '0' };
      const normal = spawnSync('/bin/sh', [link, 'quoted arg', '', `quote'arg`], { env, encoding: 'utf8' });
      const update = spawnSync('/bin/sh', [link, 'update', '--tag', 'stable'], { env, encoding: 'utf8' });
      assert.equal(normal.status, 0, normal.stderr); assert.equal(update.status, 0, update.stderr);
      return fs.readFileSync(trace, 'utf8').replaceAll(pkg, '<PACKAGE>');
    };
    const before = runVersion('head', baseline.stdout);
    const current = runVersion('working', fs.readFileSync(launcher, 'utf8'));
    assert.equal(current, before);
    assert.match(current, /node:notify:2\.1\.284/);
    assert.match(current, /node:update:2\.1\.284:--tag/);
    assert.match(current, /launch:2\.1\.284:0:0:esm-chunked/);
    assert.match(current, /quoted arg/);
    assert.match(current, /quote'arg/);
    assert.match(current, /arg:<>/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('patchelf update notification uses the requested Claude version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-notify-version-'));
  try {
    const localManifest = require('../config/claude-termux-release-manifest.json');
    const expectedLatest = localManifest.latest_audited_version;
    const helper = path.join(packageDir, 'lib', 'check-updates.js');
    const code = `require(${JSON.stringify(helper)}).notify('2.1.284').then(()=>{}).catch(e=>{console.error(e);process.exitCode=1})`;
    const result = spawnSync(process.execPath, ['-e', code], { env: { ...process.env, CLAUDE_TERMUX_SKIP_UPDATE_CHECK: '1', CLAUDE_TERMUX_PACKAGE_CACHE: root }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const escapedLatest = expectedLatest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^Audited update available: 2\\.1\\.284 -> ${escapedLatest}$`, 'm');
    assert.match(result.stderr, pattern);
    const cache = JSON.parse(fs.readFileSync(path.join(root, 'update-check.json'), 'utf8'));
    assert.equal(cache.last_notice.current_version, '2.1.284');
    assert.equal(cache.last_notice.latest_audited_version, expectedLatest);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
