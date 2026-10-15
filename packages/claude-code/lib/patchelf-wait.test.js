'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const crypto = require('node:crypto');
const { writeFakeReadelf } = require('./test-support/fake-readelf');
const r = require('./patchelf-runtime');

const FLOCK = r.termuxPaths().flock;
const PREFIX = process.env.PREFIX || '/data/data/com.termux/files/usr';
const SH = path.join(PREFIX, 'bin', 'sh');
const SKIP = fs.existsSync(FLOCK) && fs.existsSync(SH) ? false : 'flock or sh not available';
const REAL_GLIBC_LOADER = path.join(PREFIX, 'glibc', 'lib', 'ld-linux-aarch64.so.1');
const LAUNCH_SKIP = SKIP || (fs.existsSync(REAL_GLIBC_LOADER) ? false : 'glibc loader not available');

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-wait-')); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function waitUntil(predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('timed out waiting for condition'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

function makeMiniCli(root) {
  const realPkgDir=path.resolve(__dirname,'..'),pkgDir=path.join(root,'pkg'),libDir=path.join(pkgDir,'lib'),configDir=path.join(pkgDir,'config');
  fs.mkdirSync(libDir,{recursive:true});fs.mkdirSync(configDir,{recursive:true});
  fs.copyFileSync(path.join(realPkgDir,'package.json'),path.join(pkgDir,'package.json'));
  const version=JSON.parse(fs.readFileSync(path.join(realPkgDir,'package.json'),'utf8')).version;
  const config=JSON.parse(fs.readFileSync(path.join(realPkgDir,'config/claude-native-audited-versions.json'),'utf8'));
  if(!config.versions||!config.versions[version]) throw new Error(`audited config has no entry for ${version}`);
  config.versions[version].source_sha256=hash('native');
  fs.writeFileSync(path.join(configDir,'claude-native-audited-versions.json'),JSON.stringify(config,null,2));
  fs.copyFileSync(path.resolve(__dirname,'patchelf-runtime-cli.js'),path.join(libDir,'patchelf-runtime-cli.js'));
  fs.copyFileSync(path.resolve(__dirname,'patchelf-runtime.js'),path.join(libDir,'patchelf-runtime.js'));
  return path.join(libDir,'patchelf-runtime-cli.js');
}

function makeFullCliFixture() {
  const root=tempDir(),cli=makeMiniCli(root),realSh='/data/data/com.termux/files/usr/bin/sh',realFlock='/data/data/com.termux/files/usr/bin/flock',prefix=path.join(root,'prefix'),cache=path.join(root,'cache'),glibc=path.join(root,'glibc');
  fs.mkdirSync(path.join(prefix,'bin'),{recursive:true});fs.mkdirSync(path.join(prefix,'lib'),{recursive:true});fs.mkdirSync(glibc);
  fs.symlinkSync(realFlock,path.join(prefix,'bin','flock'));fs.symlinkSync(realSh,path.join(prefix,'bin','sh'));
  fs.writeFileSync(path.join(prefix,'bin','bash'),`#!/system/bin/sh\nexit 0\n`,{mode:0o755});fs.writeFileSync(path.join(prefix,'lib','libtermux-exec-ld-preload.so'),'preload');
  for(const name of ['libc.so.6','libm.so.6']) fs.writeFileSync(path.join(glibc,name),`library:${name}`);
  fs.copyFileSync(REAL_GLIBC_LOADER,path.join(glibc,'ld-linux-aarch64.so.1'));
  const patchelf=path.join(prefix,'bin','patchelf'),readelf=path.join(prefix,'bin','readelf'),npm=path.join(prefix,'bin','npm');
  fs.writeFileSync(patchelf,`#!${realSh}\nexit 0\n`,{mode:0o755});
  writeFakeReadelf(readelf,{loaderPath:path.join(glibc,'ld-linux-aarch64.so.1')});
  fs.writeFileSync(npm,`#!${realSh}\nprintf '%s\\n' 'https://example.invalid/x.tgz'\n`,{mode:0o755});fs.writeFileSync(path.join(root,'native'),'native');
  const env={...process.env,PREFIX:prefix,HOME:path.join(root,'home'),TMPDIR:path.join(root,'tmp'),CLAUDE_TERMUX_PACKAGE_CACHE:cache,CLAUDE_TERMUX_GLIBC_LIB:glibc,CLAUDE_TERMUX_PATCHELF:patchelf,CLAUDE_TERMUX_READELF:readelf,CLAUDE_TERMUX_NPM:npm,CLAUDE_TERMUX_NATIVE_BIN:path.join(root,'native')};
  fs.mkdirSync(env.HOME);fs.mkdirSync(env.TMPDIR);
  return {root,cli,env};
}

test('withFlock does not announce a wait when the lock is free', { skip: SKIP }, () => {
  const dir = tempDir();
  try {
    const lock = path.join(dir, 'free.lock');
    const waits = [];
    const result = r.withFlock(lock, FLOCK, () => 'ok', { onWait: () => waits.push(1) });
    assert.equal(result, 'ok');
    assert.equal(waits.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('withFlock announces the wait once while another process holds the lock, then proceeds after release', { skip: SKIP, timeout: 30000 }, async () => {
  const dir = tempDir();
  const lock = path.join(dir, 'held.lock');
  fs.writeFileSync(lock, '');
  const runtimePath = path.resolve(__dirname, 'patchelf-runtime.js');
  // Holder keeps the flock until the test writes a line to its stdin, so the release point is explicit.
  const holder = spawn(FLOCK, ['-x', lock, SH, '-c', 'echo ready; read x'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let holderOut = '';
  holder.stdout.setEncoding('utf8');
  holder.stdout.on('data', (d) => { holderOut += d; });
  const holderExited = once(holder, 'exit');
  const child = spawn(process.execPath, [
    '-e',
    "const fs=require('fs');const r=require(process.argv[1]);" +
    "const result=r.withFlock(process.argv[2],process.argv[3],()=>'ran',{onWait:()=>fs.writeSync(1,'WAIT\\n')});" +
    "fs.writeSync(1,'DONE '+JSON.stringify(result)+'\\n');",
    runtimePath, lock, FLOCK,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  let childOut = '';
  let childErr = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (d) => { childOut += d; });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (d) => { childErr += d; });
  const childExited = once(child, 'exit');
  try {
    await waitUntil(() => holderOut.includes('ready'));
    await waitUntil(() => childOut.includes('WAIT') || childErr.length > 0 || child.exitCode !== null);
    assert.equal(child.exitCode, null, childErr);
    assert.equal(childOut.split('WAIT').length - 1, 1, childOut);
    assert.doesNotMatch(childOut, /DONE/, 'child must still be blocked before the holder releases');
    holder.stdin.end('\n');
    await holderExited;
    const [code] = await childExited;
    assert.equal(code, 0, childErr);
    assert.equal(childOut.split('WAIT').length - 1, 1, childOut);
    assert.match(childOut, /DONE "ran"/);
  } finally {
    if (holder.exitCode === null && holder.signalCode === null) holder.kill('SIGKILL');
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cold launch-prep announces the download lookup before the preparation notice; warm launch-prep does not', { skip: LAUNCH_SKIP, timeout: 60000 }, () => {
  const { root, cli, env } = makeFullCliFixture();
  try {
    const first = spawnSync(process.execPath, [cli, 'launch-prep'], { env, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const lookup = first.stderr.indexOf('Looking up the download location');
    const prep = first.stderr.indexOf('Preparing Claude Code');
    assert.ok(lookup >= 0, first.stderr);
    assert.ok(prep >= 0, first.stderr);
    assert.ok(lookup < prep, first.stderr);

    const warm = spawnSync(process.execPath, [cli, 'launch-prep'], { env, encoding: 'utf8' });
    assert.equal(warm.status, 0, warm.stderr);
    assert.doesNotMatch(warm.stderr, /Looking up the download location/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a stalled npm lookup stops cold launch-prep with a timeout message instead of hanging', { skip: LAUNCH_SKIP, timeout: 60000 }, () => {
  const { root, cli, env } = makeFullCliFixture();
  try {
    // exec replaces the shell so the timeout's SIGTERM reaches sleep directly.
    const slowNpm = path.join(root, 'slow-npm');
    fs.writeFileSync(slowNpm, `#!${SH}\nexec sleep 5\n`, { mode: 0o755 });
    const slowEnv = { ...env, CLAUDE_TERMUX_NPM: slowNpm, CLAUDE_TERMUX_NPM_TIMEOUT_MS: '300' };
    const res = spawnSync(process.execPath, [cli, 'launch-prep'], { env: slowEnv, encoding: 'utf8' });
    assert.notEqual(res.status, 0, res.stdout);
    assert.match(res.stderr, /timed out/);
    assert.match(res.stderr, /network/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
