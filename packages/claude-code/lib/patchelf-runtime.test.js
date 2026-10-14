'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { performance } = require('node:perf_hooks');
const { spawn, spawnSync } = require('node:child_process');
const runtime = require('./patchelf-runtime');

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'patchelf-runtime-')); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

test('fingerprint detects inode replacement, symlink changes and same-size writes with restored mtime', async () => {
  const root = tempDir();
  try {
    const first = path.join(root, 'first');
    const second = path.join(root, 'second');
    const link = path.join(root, 'link');
    fs.writeFileSync(first, 'alpha');
    fs.writeFileSync(second, 'bravo');
    fs.symlinkSync(first, link);

    const unchanged = runtime.fingerprint(link);
    assert.deepEqual(runtime.fingerprint(link), unchanged);
    fs.renameSync(second, path.join(root, 'replacement'));
    fs.renameSync(path.join(root, 'replacement'), first);
    assert.equal(runtime.fingerprintsEqual(unchanged, runtime.fingerprint(link)), false, 'replacement inode is detected');

    const replaced = runtime.fingerprint(link);
    fs.unlinkSync(link);
    fs.symlinkSync(path.join(root, 'replacement-target'), link);
    fs.writeFileSync(path.join(root, 'replacement-target'), 'charlie');
    assert.equal(runtime.fingerprintsEqual(replaced, runtime.fingerprint(link)), false, 'symlink target change is detected');

    const target = path.join(root, 'replacement-target');
    const beforeWrite = runtime.fingerprint(target);
    const stat = fs.statSync(target);
    await new Promise(resolve => setTimeout(resolve, 25));
    fs.writeFileSync(target, 'delta!!');
    fs.utimesSync(target, stat.atime, stat.mtime);
    const afterWrite = runtime.fingerprint(target);
    assert.equal(beforeWrite.size, afterWrite.size);
    assert.ok(Math.abs(fs.statSync(target).mtimeMs - stat.mtimeMs) < 1);
    assert.notEqual(beforeWrite.ctimeNs, afterWrite.ctimeNs);
    assert.equal(runtime.fingerprintsEqual(beforeWrite, afterWrite), false);
    assert.deepEqual(Object.keys(afterWrite), runtime.FINGERPRINT_FIELDS);
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) assert.equal(typeof afterWrite[key], 'string');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('fingerprint remains stable when file is unchanged', () => {
  const root = tempDir();
  try {
    const file = path.join(root, 'file'); fs.writeFileSync(file, 'fixed');
    assert.deepEqual(runtime.fingerprint(file), runtime.fingerprint(file));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('shell wid follows contents across PREFIX values and wrappers are immutable', () => {
  const root = tempDir();
  try {
    const prefixA = path.join(root, 'prefix-a');
    const prefixB = path.join(root, 'prefix-b');
    const template = prefix => ({ run: `#!${prefix}/bin/sh\nrun\n`, bash: `#!${prefix}/bin/sh\nbash\n` });
    const a = template(prefixA), b = template(prefixB);
    const pathA = runtime.ensureShellWrappers(path.join(root, 'cache', 'patchelf', 'shell'), a.run, a.bash);
    const pathB = runtime.ensureShellWrappers(path.join(root, 'cache', 'patchelf', 'shell'), b.run, b.bash);
    assert.equal(pathA.wid, hash(`${a.run}\0${a.bash}`).slice(0, 32));
    assert.notEqual(pathA.wid, pathB.wid);
    assert.equal(fs.readFileSync(pathA.run, 'utf8'), a.run);

    fs.writeFileSync(pathA.run, 'tampered');
    assert.throws(() => runtime.ensureShellWrappers(path.join(root, 'cache', 'patchelf', 'shell'), a.run, a.bash), /content mismatch/);
    assert.equal(fs.readFileSync(pathA.run, 'utf8'), 'tampered', 'existing address is not overwritten');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('identity digest is stable for equivalent object key order and physical generation names include unique nonce', () => {
  const left = { schema: 1, runtime: { patchelf: '/p/tool', readelf: '/p/readelf' }, files: ['a', 'b', 'a'] };
  const right = { files: ['b', 'a'], runtime: { readelf: '/p/readelf', patchelf: '/p/tool' }, schema: 1 };
  const identity = runtime.createIdentity(left);
  assert.equal(identity, runtime.createIdentity(right));
  assert.equal(runtime.generationName(identity, '1728000000000-7-ab12'), `gen-${identity.slice(0, 16)}-1728000000000-7-ab12`);
});

test('READY schema serializes and parses identity and fingerprint strings unchanged', () => {
  const identity = 'a'.repeat(64);
  const ready = runtime.createReady(identity, { fingerprint: { realpath: '/runtime/file', dev: '4294967297', ino: '9007199254740993', size: '42', mtimeNs: '1700000000123456789', ctimeNs: '1700000000987654321' } });
  const parsed = runtime.parseReady(runtime.serializeReady(ready));
  assert.deepEqual(parsed, ready);
  assert.equal(parsed.fingerprint.ino, '9007199254740993');
  assert.throws(() => runtime.parseReady('{"schema":99,"identity":"' + identity + '"}'), /invalid READY/);
});


test('kernel flock survives holder SIGKILL, serializes processes, and leaves its lock inode behind', async () => {
  const root = tempDir();
  const flock = '/data/data/com.termux/files/usr/bin/flock';
  if (!fs.existsSync(flock)) return;
  const lock = path.join(root, 'runtime.lock');
  const runtimePath = path.resolve(__dirname, 'patchelf-runtime.js');
  const holder = spawn(process.execPath, ['-e', `const r=require(${JSON.stringify(runtimePath)});r.withFlock(${JSON.stringify(lock)},${JSON.stringify(flock)},()=>{process.stdout.write('locked\\n');while(true)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1000)});`], { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const acquireTimeout=monotonicTimeout(3000, 'holder did not acquire lock');try { await Promise.race([new Promise((resolve,reject) => { let output=''; holder.stdout.on('data', chunk => { output += chunk; if (output.includes('locked')) resolve(); }); holder.once('error', reject); }), acquireTimeout]); } finally { acquireTimeout.cancel(); }
    const waiter = spawnSync(flock, ['-E', '73', '-x', '-n', lock, '-c', 'true'], { encoding: 'utf8' });
    assert.equal(waiter.status, 73, `lock contention uses fixed exit code 73; stderr=${waiter.stderr}`);
    holder.kill('SIGKILL');
    await waitForExit(holder, 'kernel lock holder exit', 5000);
    const acquired = spawnSync(flock, ['-x', '-n', lock, '-c', 'true']);
    assert.equal(acquired.status, 0, 'kernel releases the lock after holder death');
    assert.ok(fs.existsSync(lock), 'lock file is never unlinked');
  } finally { holder.kill('SIGKILL'); fs.rmSync(root, { recursive: true, force: true }); }
});

test('withFlock serializes concurrent callbacks, does not leak its descriptor, and reports missing flock', async () => {
  const root = tempDir();
  const flock = '/data/data/com.termux/files/usr/bin/flock';
  if (!fs.existsSync(flock)) return;
  const lock = path.join(root, 'prepare.lock');
  const runtimePath = path.resolve(__dirname, 'patchelf-runtime.js');
  const code = `const r=require(${JSON.stringify(runtimePath)});const fs=require('fs'),{spawnSync}=require('child_process');r.withFlock(${JSON.stringify(lock)},${JSON.stringify(flock)},()=>{const probe=spawnSync(process.execPath,['-e',"const fs=require('fs');process.exit(fs.readdirSync('/proc/self/fd').some(fd=>{try{return fs.readlinkSync('/proc/self/fd/'+fd).endsWith('prepare.lock')}catch{return false}})?1:0)"],{encoding:'utf8'});if(probe.status!==0)throw Error('lock fd leaked to descendant');const f=fs.openSync(${JSON.stringify(path.join(root, 'intervals'))},'a');fs.writeSync(f,'enter '+process.pid+'\\n');fs.closeSync(f);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);const g=fs.openSync(${JSON.stringify(path.join(root, 'intervals'))},'a');fs.writeSync(g,'exit '+process.pid+'\\n');fs.closeSync(g)});`;
  const children = Array.from({ length: 4 }, () => spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'pipe'] }));
  await Promise.all(children.map(async child => {
    let err=''; child.stderr.on('data', chunk => { err += chunk; });
    const { code, signal } = await waitForExit(child, 'withFlock serialization child exit', 10000);
    if (code !== 0) throw new Error(`child exited ${code ?? signal}: ${err}`);
  }));
  const lines = fs.readFileSync(path.join(root, 'intervals'), 'utf8').trim().split('\n');
  for (let i = 0; i < lines.length; i += 2) assert.match(lines[i], /^enter /);
  for (let i = 1; i < lines.length; i += 2) assert.match(lines[i], /^exit /);
  assert.ok(fs.existsSync(lock));
  assert.throws(() => runtime.withFlock(path.join(root, 'missing.lock'), path.join(root, 'no-flock'), () => {}), /pkg install util-linux/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('prepareGeneration publishes READY after final-path fingerprints and atomically reuses unchanged generation', () => {
  const root = tempDir();
  const flock = '/data/data/com.termux/files/usr/bin/flock';
  if (!fs.existsSync(flock)) return;
  try {
    const versionDir = path.join(root, 'cache', '1.2');
    const identity = 'b'.repeat(64);
    const options = { versionDir, identity, flockPath: flock, fingerprintPaths: [['patched', 'patched/claude']], nonce: () => 'n1', populate(dir) { fs.mkdirSync(path.join(dir, 'patched')); fs.writeFileSync(path.join(dir, 'patched/claude'), 'binary'); } };
    const first = runtime.prepareGeneration(options);
    assert.equal(first.reused, false);
    assert.ok(fs.existsSync(path.join(first.generationPath, '.inuse')));
    assert.ok(fs.existsSync(path.join(first.generationPath, 'READY')));
    assert.equal(first.ready.fingerprints.patched.realpath, fs.realpathSync(path.join(first.generationPath, 'patched/claude')));
    assert.equal(fs.readlinkSync(path.join(versionDir, 'current')), first.generation);
    const second = runtime.prepareGeneration({ ...options, nonce: () => 'unused', populate() { throw new Error('must not rebuild'); } });
    assert.equal(second.reused, true);
    assert.equal(second.generation, first.generation);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('prepareGeneration abandons corrupt READY generations and preserves current when creation fails', () => {
  const root = tempDir();
  const flock = '/data/data/com.termux/files/usr/bin/flock';
  if (!fs.existsSync(flock)) return;
  try {
    const versionDir = path.join(root, 'v'); const identity = 'c'.repeat(64);
    const base = { versionDir, identity, flockPath: flock, fingerprintPaths: [], nonce: () => 'fresh', populate() {} };
    const first = runtime.prepareGeneration(base);
    fs.unlinkSync(path.join(first.generationPath, 'READY'));
    const second = runtime.prepareGeneration({ ...base, nonce: () => 'replacement' });
    assert.notEqual(first.generation, second.generation);
    assert.equal(fs.readlinkSync(path.join(versionDir, 'current')), second.generation);
    assert.throws(() => runtime.prepareGeneration({ ...base, identity: 'd'.repeat(64), nonce: () => 'broken', populate() { throw new Error('populate failed'); } }), /populate failed/);
    assert.equal(fs.readlinkSync(path.join(versionDir, 'current')), second.generation, 'failure before switch keeps old current');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('prepareGeneration never replaces a colliding generation name and retries with a new nonce', () => {
  const root = tempDir(); const flock = '/data/data/com.termux/files/usr/bin/flock';
  if (!fs.existsSync(flock)) return;
  try {
    const versionDir = path.join(root, 'v'); const identity = 'e'.repeat(64); let calls = 0;
    const collisionName = runtime.generationName(identity, 'taken');
    fs.mkdirSync(path.join(versionDir, collisionName), { recursive: true }); fs.writeFileSync(path.join(versionDir, collisionName, 'sentinel'), 'preserve');
    const result = runtime.prepareGeneration({ versionDir, identity, flockPath: flock, fingerprintPaths: [], nonce: () => calls++ === 0 ? 'taken' : 'new', populate() {} });
    assert.notEqual(result.generation, collisionName);
    assert.equal(fs.existsSync(path.join(versionDir, collisionName)), false, 'unreferenced collision is reclaimed by GC after the new current is published');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('GC keeps current and shared-locked generations, removes unlocked generations under trash rename, and preserves shell wid', async () => {
  const root = tempDir();
  const flock = '/data/data/com.termux/files/usr/bin/flock';
  if (!fs.existsSync(flock)) return;
  const versionDir = path.join(root, 'v');
  let holder;
  try {
    fs.mkdirSync(versionDir, { recursive: true });
    const current = 'gen-current-1'; const busy = 'gen-busy-2'; const stale = 'gen-stale-3';
    for (const name of [current, busy, stale]) { fs.mkdirSync(path.join(versionDir, name)); fs.writeFileSync(path.join(versionDir, name, '.inuse'), ''); }
    fs.symlinkSync(current, path.join(versionDir, 'current'));
    const shell = path.join(root, 'shell', 'wid123'); fs.mkdirSync(shell, { recursive: true }); fs.writeFileSync(path.join(shell, 'run'), 'saved');
    holder = spawn(flock, ['-s', path.join(versionDir, busy, '.inuse'), '-c', 'sleep 10'], { stdio: 'ignore' });
    await waitFor(() => { const probe=spawnSync(flock,['-E','73','-x','-n',path.join(versionDir,busy,'.inuse'),'-c','true']); return probe.status===73; }, 'shared lock acquisition');
    let sawTrashDuringRemoval = false; let lockHeldDuringRemoval = false;
    const originalRm = fs.rmSync;
    fs.rmSync = function (target, ...args) {
      if (String(target).includes('.trash-gen-stale-3-')) {
        sawTrashDuringRemoval = fs.readdirSync(versionDir).some(name => name.startsWith('.trash-gen-stale-3-'));
        const probe = spawnSync(flock, ['-E', '73', '-x', '-n', path.join(target, '.inuse'), '-c', 'true']);
        lockHeldDuringRemoval = probe.status === 73;
      }
      return originalRm.call(this, target, ...args);
    };
    try { runtime.gcGenerations({ versionDir, flockPath: flock }); } finally { fs.rmSync = originalRm; }
    assert.ok(fs.existsSync(path.join(versionDir, current)));
    assert.ok(fs.existsSync(path.join(versionDir, busy)));
    assert.equal(fs.existsSync(path.join(versionDir, stale)), false);
    assert.ok(sawTrashDuringRemoval, 'generation is renamed to trash before recursive removal');
    assert.ok(lockHeldDuringRemoval, 'exclusive .inuse lock remains held throughout recursive removal');
    assert.equal(fs.readFileSync(path.join(shell, 'run'), 'utf8'), 'saved');
  } finally { const cleanupTimeout=monotonicTimeout(100, 'holder cleanup wait');try { await Promise.race([new Promise(resolve => { try { holder.kill(); } catch {} holder.once('exit', resolve); }),cleanupTimeout.catch(()=>{})]); } finally { cleanupTimeout.cancel(); } fs.rmSync(root, { recursive: true, force: true }); }
});

test('GC collects old tmp and trash, and daily stamp runs only after 24 hours', () => {
  const root = tempDir(); const flock = '/data/data/com.termux/files/usr/bin/flock';
  if (!fs.existsSync(flock)) return;
  try {
    const versionDir = path.join(root, 'v'); fs.mkdirSync(versionDir);
    const old = Date.now() - 25 * 60 * 60 * 1000;
    for (const name of ['.tmp-old', '.trash-interrupted']) { fs.mkdirSync(path.join(versionDir, name)); fs.utimesSync(path.join(versionDir, name), old / 1000, old / 1000); }
    const first = runtime.maybeDailyGc({ versionDir, flockPath: flock, now: Date.now() });
    assert.equal(first.ran, true);
    assert.equal(fs.existsSync(path.join(versionDir, '.tmp-old')), false);
    assert.equal(fs.existsSync(path.join(versionDir, '.trash-interrupted')), false);
    assert.ok(fs.existsSync(path.join(versionDir, '.gc-stamp')));
    assert.equal(runtime.maybeDailyGc({ versionDir, flockPath: flock, now: Date.now() }).reason, 'fresh-stamp');
    const future = Date.now() + 25 * 60 * 60 * 1000;
    assert.equal(runtime.maybeDailyGc({ versionDir, flockPath: flock, now: future }).ran, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('verify hashes patched, glibc, tool and wrapper files despite same-size restored-mtime edits', async () => {
  const root = tempDir();
  try {
    const identity = 'a'.repeat(64); const generationPath = path.join(root, `gen-${identity.slice(0,16)}-test`); fs.mkdirSync(generationPath); fs.writeFileSync(path.join(generationPath,'.inuse'),'');
    const contents = { patched: 'alpha', glibc0: 'libc', glibc1: 'libm', patchelf: 'tool-a', readelf: 'tool-b', wrapperRun: '#!/bin/sh\necho run\n', wrapperBash: '#!/bin/sh\necho bash\n' };
    const paths = Object.fromEntries(Object.entries(contents).map(([key, value]) => { const file=path.join(root,key); fs.writeFileSync(file,value); return [key,file]; }));
    const before = fs.statSync(paths.patched);
    const ready = runtime.createReady(identity, { wid: runtime.wrapperIdentity(contents.wrapperRun,contents.wrapperBash), fingerprintPaths:[['patched',paths.patched]], fingerprints:{patched:runtime.fingerprint(paths.patched)}, sha256: Object.fromEntries(Object.entries(contents).map(([key,value])=>[key,hash(value)])) });
    const verifyOptions={generationPath,ready,files:{patched:paths.patched,glibc0:paths.glibc0,glibc1:paths.glibc1,patchelf:paths.patchelf,readelf:paths.readelf},wrappers:[{key:'wrapperRun',path:paths.wrapperRun},{key:'wrapperBash',path:paths.wrapperBash}]};
    assert.equal(runtime.verifyGeneration(verifyOptions).checked.length, 7);
    const warmBefore = runtime.warmGeneration({ generationPath, ready, fingerprintPaths: [['patched', paths.patched]], wrapperFiles: { wrapperRun: paths.wrapperRun } });
    assert.equal(warmBefore.reusable, true);
    await new Promise(resolve=>setTimeout(resolve,20)); fs.writeFileSync(paths.patched, 'bravo'); fs.utimesSync(paths.patched, before.atime, before.mtime);
    assert.throws(() => runtime.verifyGeneration(verifyOptions), /sha256 mismatch for patched/); fs.writeFileSync(paths.patched,contents.patched);
    for (const key of ['glibc0','glibc1','patchelf','readelf','wrapperRun','wrapperBash']) {
      const original=contents[key], st=fs.statSync(paths[key]); fs.writeFileSync(paths[key], original.slice(0,-1)+(original.endsWith('x')?'y':'x')); fs.utimesSync(paths[key],st.atime,st.mtime);
      assert.throws(()=>runtime.verifyGeneration(verifyOptions),new RegExp(`sha256 mismatch for ${key}`)); fs.writeFileSync(paths[key],original);
    }
    // Warm intentionally relies on stat identity; verify owns content hashing for large patched binaries.
    assert.equal(runtime.warmGeneration({ generationPath, ready, fingerprintPaths: [['patched', paths.patched]] }).reusable, false);
    const unchanged = runtime.fingerprint(paths.wrapperRun);
    assert.equal(runtime.warmGeneration({ generationPath, ready, fingerprintPaths: [], wrapperFiles: { wrapperRun: paths.wrapperRun } }).reusable, true);
    assert.deepEqual(runtime.fingerprint(paths.wrapperRun), unchanged, 'warm path does not alter or rebuild wrappers');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('launchPrep returns absolute launch values and rejects GEN mismatch; hookPath returns stable run path', () => {
  const root = tempDir();
  try {
    const gen = path.join(root, 'gen-1'); fs.mkdirSync(gen); const patched = path.join(gen, 'patched', 'claude'); const glibc = path.join(gen, 'glibc-min');
    fs.mkdirSync(path.dirname(patched)); fs.mkdirSync(glibc); fs.writeFileSync(patched, 'x');
    assert.deepEqual(runtime.launchPrep({ generationPath: gen, patchedPath: patched, glibcMinPath: glibc, shellWrap: path.join(root, 'shell', 'wid', 'bash') }), { GEN: gen, PATCHED: patched, GLIBC_MIN: glibc, SHELL_WRAP: path.join(root, 'shell', 'wid', 'bash') });
    assert.throws(() => runtime.launchPrep({ generationPath: gen, patchedPath: path.join(root, 'other', 'patched'), glibcMinPath: glibc, shellWrap: path.join(root, 'shell', 'bash') }), /same generation/);
    assert.equal(runtime.hookPath({ run: path.join(root, 'shell', 'wid', 'run') }), path.join(root, 'shell', 'wid', 'run'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('real bin/claude dash path runs --termux-gc and reports --termux-verify errors', () => {
  const root=tempDir(),version='2.1.285',cache=path.join(root,'cache'),versionDir=path.join(cache,'patchelf',version),gen=path.join(versionDir,'gen-old');
  try {
    fs.mkdirSync(gen,{recursive:true}); fs.writeFileSync(path.join(gen,'.inuse'),''); fs.writeFileSync(path.join(gen,'READY'),'{}');
    const env={...process.env,CLAUDE_TERMUX_LAUNCH_MODE:'patchelf',CLAUDE_TERMUX_PACKAGE_CACHE:cache,CLAUDE_TERMUX_CLAUDE_VERSION:version,PREFIX:'/data/data/com.termux/files/usr',HOME:root,TMPDIR:root};
    const shell='/data/data/com.termux/files/usr/bin/sh',bin=path.resolve(__dirname,'../bin/claude');
    const gc=spawnSync(shell,[bin,'--termux-gc'],{encoding:'utf8',env});
    assert.equal(gc.status,0,`stdout=${gc.stdout} stderr=${gc.stderr}`); assert.equal(fs.existsSync(gen),false); assert.match(gc.stderr,/"removed"/);
    const verify=spawnSync(shell,[bin,'--termux-verify'],{encoding:'utf8',env});
    assert.notEqual(verify.status,0); assert.match(verify.stderr,/no current generation/);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('real bin launcher reads four launch values and retains fd 8', () => {
  const root = tempDir();
  try {
    const gen = path.join(root, 'gen-x'); fs.mkdirSync(gen); fs.writeFileSync(path.join(gen, '.inuse'), ''); fs.writeFileSync(path.join(gen, 'READY'), '{}');
    const patched = path.join(gen, 'patched'); fs.writeFileSync(patched, '#!/system/bin/sh\n[ -e /proc/self/fd/8 ] || exit 61\nreadlink /proc/self/fd/8\n', { mode: 0o755 }); fs.chmodSync(patched, 0o755);
    fs.mkdirSync(path.join(gen, 'glibc-min'));
    const node = path.join(root, 'node'); fs.writeFileSync(node, `#!/system/bin/sh\n[ \"${'${1:-}'}\" = -e ] && exit 0\nprintf '%s\\n' '${gen}' '${patched}' '${path.join(gen,'glibc-min')}' '${path.join(root,'shell')}'\n`, { mode: 0o755 }); fs.chmodSync(node, 0o755);
    const result = spawnSync('/data/data/com.termux/files/usr/bin/sh', [path.resolve(__dirname, '../bin/claude'), '--version'], { encoding: 'utf8', timeout: 30000, env: { ...process.env, MAGI_NODE: node, CLAUDE_TERMUX_LAUNCH_MODE: 'patchelf', PREFIX: '/data/data/com.termux/files/usr', HOME: root, TMPDIR: root } });
    assert.equal(result.status, 0, `stdout=${result.stdout} stderr=${result.stderr}`); assert.match(result.stdout.trim(), /\.inuse$/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

async function waitFor(predicate, label, timeoutMs = 10000) {
  const startedMono = performance.now();
  const startedWall = Date.now();
  while (!predicate()) {
    const monoElapsed = performance.now() - startedMono;
    if (monoElapsed >= timeoutMs) throw new Error(`timed out waiting for ${label}; wall elapsed=${Date.now() - startedWall}ms; monotonic elapsed=${monoElapsed.toFixed(1)}ms`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

function monotonicTimeout(timeoutMs, message) {
  const started = performance.now();
  let cancelled = false;
  let timer;
  const promise = (async () => {
    while (!cancelled && performance.now() - started < timeoutMs) {
      await new Promise(resolve => { timer = setTimeout(resolve, Math.min(10, timeoutMs)); });
    }
    if (!cancelled) throw new Error(`${message}; monotonic elapsed=${(performance.now() - started).toFixed(1)}ms`);
  })();
  promise.cancel = () => { cancelled = true; clearTimeout(timer); };
  return promise;
}

async function waitForLockWaiter(lockPath, label, timeoutMs = 30000) {
  await waitFor(() => {
    let entries;
    try { entries = fs.readdirSync('/proc'); } catch { return false; }
    return entries.some(entry => {
      if (!/^\d+$/.test(entry)) return false;
      const proc = path.join('/proc', entry);
      try {
        if (fs.readlinkSync(path.join(proc, 'fd/3')) !== lockPath) return false;
        return fs.readFileSync(path.join(proc, 'cmdline'), 'utf8').split('\0').includes('-E');
      } catch { return false; }
    });
  }, label, timeoutMs);
}

function waitForClose(child, label, timeoutMs = 30000) {
  if (child.closed) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = monotonicTimeout(timeoutMs, `timed out waiting for ${label}`);
    timeout.catch(error => { if (!settled) { settled = true; reject(error); } });
    child.once('error', error => { timeout.cancel(); if (!settled) { settled = true; reject(error); } });
    child.once('close', (...args) => { timeout.cancel(); if (!settled) { settled = true; resolve(args[0]); } });
  });
}

function waitForExit(child, label, timeoutMs = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = monotonicTimeout(timeoutMs, `timed out waiting for ${label}`);
    timeout.catch(error => { if (!settled) { settled = true; reject(error); } });
    child.once('error', error => { timeout.cancel(); if (!settled) { settled = true; reject(error); } });
    child.once('exit', (code, signal) => { timeout.cancel(); if (!settled) { settled = true; resolve({ code, signal }); } });
  });
}

async function stopProcessGroup(child, releasePath, label, timeoutMs = 5000) {
  if (releasePath) { try { fs.writeFileSync(releasePath, ''); } catch {} }
  if (!child) return;
  for (const stream of [child.stdin, child.stdout, child.stderr]) stream?.destroy();
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  await waitForExit(child, `${label} exit`, timeoutMs);
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    try { process.kill(-child.pid, 0); } catch (error) { if (error.code === 'ESRCH') return; throw error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${label} process group to disappear; monotonic elapsed=${timeoutMs}ms`);
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

async function waitForPidsGone(pids, label, timeoutMs = 5000) {
  await waitFor(() => pids.every(pid => !processExists(pid)), label, timeoutMs);
}

function makeCliFixture() {
  const root=tempDir(),cli=path.resolve(__dirname,'patchelf-runtime-cli.js'),realSh='/data/data/com.termux/files/usr/bin/sh',realFlock='/data/data/com.termux/files/usr/bin/flock',prefix=path.join(root,'prefix'),cache=path.join(root,'cache'),glibc=path.join(root,'glibc');
  fs.mkdirSync(path.join(prefix,'bin'),{recursive:true});fs.mkdirSync(path.join(prefix,'lib'),{recursive:true});fs.mkdirSync(glibc);
  fs.symlinkSync(realFlock,path.join(prefix,'bin','flock'));fs.symlinkSync(realSh,path.join(prefix,'bin','sh'));
  fs.writeFileSync(path.join(prefix,'bin','bash'),`#!/system/bin/sh\nexit 0\n`,{mode:0o755});fs.writeFileSync(path.join(prefix,'lib','libtermux-exec-ld-preload.so'),'preload');
  for(const name of ['libc.so.6','libm.so.6','ld-linux-aarch64.so.1']) fs.writeFileSync(path.join(glibc,name),`library:${name}`);
  const patchelf=path.join(prefix,'bin','patchelf'),readelf=path.join(prefix,'bin','readelf'),npm=path.join(prefix,'bin','npm');
  for(const f of [patchelf,readelf]) fs.writeFileSync(f,`#!${realSh}\nexit 0\n`,{mode:0o755});
  fs.writeFileSync(npm,`#!${realSh}\nprintf '%s\\n' 'https://example.invalid/x.tgz'\n`,{mode:0o755});fs.writeFileSync(path.join(root,'native'),'native');
  const env={...process.env,PREFIX:prefix,HOME:path.join(root,'home'),TMPDIR:path.join(root,'tmp'),CLAUDE_TERMUX_PACKAGE_CACHE:cache,CLAUDE_TERMUX_GLIBC_LIB:glibc,CLAUDE_TERMUX_PATCHELF:patchelf,CLAUDE_TERMUX_READELF:readelf,CLAUDE_TERMUX_NPM:npm,CLAUDE_TERMUX_NATIVE_BIN:path.join(root,'native')};
  fs.mkdirSync(env.HOME);fs.mkdirSync(env.TMPDIR);
  return {root,cli,env};
}

function launcherFixture(root, records, options = {}) {
  const genRoot = path.join(root, 'generations'); fs.mkdirSync(genRoot, { recursive: true });
  const callFile = path.join(root, 'prep-calls');
  const sequenceFile = path.join(root, 'sequence.json'); fs.writeFileSync(sequenceFile, JSON.stringify(records));
  const nativeMarker = path.join(root, 'native-ran');
  const node = path.join(root, 'node');
  fs.writeFileSync(node, `#!/system/bin/sh\n[ "\${1:-}" = -e ] && exit 0\nexec "\${REAL_NODE}" -e 'const fs=require("fs");const calls=process.env.CALL_FILE;let n=0;try{n=Number(fs.readFileSync(calls,"utf8"))}catch{};n++;fs.writeFileSync(calls,String(n));const rows=JSON.parse(fs.readFileSync(process.env.SEQUENCE_FILE,"utf8"));const row=rows[Math.min(n-1,rows.length-1)];const text=row.join("\\n")+"\\n";process.stdout.write(process.env.NO_FINAL_NEWLINE?text+"fifth":text)'\n`, { mode: 0o755 });
  fs.chmodSync(node, 0o755);
  const makeGeneration = name => {
    const gen = path.join(genRoot, name); fs.mkdirSync(path.join(gen, 'glibc-min'), { recursive: true });
    fs.writeFileSync(path.join(gen, '.inuse'), ''); fs.writeFileSync(path.join(gen, 'READY'), '{}');
    const patched = path.join(gen, 'patched');
    fs.writeFileSync(patched, `#!/system/bin/sh\nprintf '%s\\n' ran > '${nativeMarker}'\n[ -e /proc/self/fd/8 ] || exit 61\nprintf '%s\\n' "$(readlink /proc/self/fd/8)"\n`, { mode: 0o755 }); fs.chmodSync(patched, 0o755);
    return { gen, patched, glibc: path.join(gen, 'glibc-min'), shell: path.join(root, 'shell') };
  };
  const made = new Map();
  for (const row of records) {
    const gen = row[0];
    if (gen && !made.has(gen)) made.set(gen, makeGeneration(path.basename(gen)));
  }
  const run = (shell = '/data/data/com.termux/files/usr/bin/sh', envExtra = {}) => spawnSync(shell, [path.resolve(__dirname, '../bin/claude'), '--version'], { encoding: 'utf8', timeout: 30000, env: { ...process.env, MAGI_NODE: node, REAL_NODE: process.execPath, CALL_FILE: callFile, SEQUENCE_FILE: sequenceFile, CLAUDE_TERMUX_LAUNCH_MODE: 'patchelf', PREFIX: '/data/data/com.termux/files/usr', HOME: root, TMPDIR: root, ...envExtra } });
  return { callFile, made, nativeMarker, run, genRoot };
}

function rowFor(fixture, name) { const x = fixture.made.get(name); return [x.gen, x.patched, x.glibc, x.shell]; }
function waitFile(file, label) { return waitFor(() => fs.existsSync(file), `${label} (path=${file}, exists=${fs.existsSync(file)})`); }

test('real dash launcher retries a GC exclusive-lock conflict and launches after release', async () => {
  const root = tempDir(); const flock = '/data/data/com.termux/files/usr/bin/flock';
  if (!fs.existsSync(flock)) return;
  let holder,proc;const release=path.join(root,'holder-release');
  try {
    const initial=launcherFixture(root,[]),gen=path.join(initial.genRoot,'gen-gc');fs.mkdirSync(path.join(gen,'glibc-min'),{recursive:true});fs.writeFileSync(path.join(gen,'.inuse'),'');fs.writeFileSync(path.join(gen,'READY'),'{}');const patched=path.join(gen,'patched');fs.writeFileSync(patched,`#!/system/bin/sh\ntouch '${initial.nativeMarker}'\n[ -e /proc/self/fd/8 ] || exit 61\n`,{mode:0o755});
    const row=[gen,patched,path.join(gen,'glibc-min'),path.join(root,'shell')];fs.writeFileSync(path.join(root,'sequence.json'),JSON.stringify([row]));
    const entered=path.join(root,'holder-entered'),events=path.join(root,'flock-events'),prefix=path.join(root,'prefix');fs.mkdirSync(path.join(prefix,'bin'),{recursive:true});fs.symlinkSync('/data/data/com.termux/files/usr/bin/sh',path.join(prefix,'bin','sh'));
    fs.writeFileSync(path.join(prefix,'bin','flock'),`#!/system/bin/sh\n'${flock}' "$@"\nstatus=$?\nprintf '%s\\n' "$status" >> '${events}'\nexit "$status"\n`,{mode:0o755});
    holder=spawn(flock,['-x',path.join(gen,'.inuse'),'-c',`touch '${entered}'; while [ ! -e '${release}' ]; do :; done`],{stdio:'ignore',detached:true});await waitFile(entered,'GC lock acquisition');
    proc=spawn('/data/data/com.termux/files/usr/bin/sh',[path.resolve(__dirname,'../bin/claude'),'--version'],{stdio:['ignore','pipe','pipe'],detached:true,env:{...process.env,MAGI_NODE:path.join(root,'node'),REAL_NODE:process.execPath,CALL_FILE:initial.callFile,SEQUENCE_FILE:path.join(root,'sequence.json'),CLAUDE_TERMUX_LAUNCH_MODE:'patchelf',PREFIX:prefix,HOME:root,TMPDIR:root}});
    await waitFor(()=>fs.existsSync(events)&&fs.readFileSync(events,'utf8').includes('73'),'flock contention result');assert.equal(fs.existsSync(initial.nativeMarker),false,'native waits while GC owns .inuse');
    fs.writeFileSync(release,'');
    const result=await new Promise((resolve,reject)=>{let err='';proc.stderr.on('data',x=>err+=x);proc.once('error',reject);proc.once('close',status=>resolve({status,err}));});
    assert.equal(result.status,0,result.err);assert.ok(fs.existsSync(initial.nativeMarker));assert.match(fs.readFileSync(events,'utf8'),/73\n0\n$/);assert.equal(fs.readFileSync(initial.callFile,'utf8'),'2','lock contention reruns launch-prep');
  } finally {fs.writeFileSync(release,'');if(proc)await stopProcessGroup(proc,null,'launcher after GC lock shutdown');if(holder)await stopProcessGroup(holder,release,'flock holder');fs.rmSync(root,{recursive:true,force:true});}
});


function staleDiagnostic(error, proc, stdout, stderr, openMarker, proceed, startedWall, startedMono, code = proc?.exitCode) {
  return new Error(`${error.message}
launcher diagnostics: stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)} exitCode=${code ?? 'not-exited'} openMarker=${openMarker} exists=${fs.existsSync(openMarker)} proceed=${proceed} exists=${fs.existsSync(proceed)} wall elapsed=${Date.now()-startedWall}ms monotonic elapsed=${(performance.now()-startedMono).toFixed(1)}ms`);
}

test('real dash launcher detects an opened stale inode after rename and rm, then retries', async () => {
  const root=tempDir(), flock='/data/data/com.termux/files/usr/bin/flock'; if(!fs.existsSync(flock)) return;
  let proc,proceed;
  let stdout='',stderr='';
  const startedWall=Date.now(),startedMono=performance.now();
  try {
    const seed=launcherFixture(root,[]), one=path.join(seed.genRoot,'gen-old'),two=path.join(seed.genRoot,'gen-new');
    for(const p of [one,two]){fs.mkdirSync(path.join(p,'glibc-min'),{recursive:true});fs.writeFileSync(path.join(p,'.inuse'),'');fs.writeFileSync(path.join(p,'READY'),'{}');fs.writeFileSync(path.join(p,'patched'),`#!/system/bin/sh\ntouch '${seed.nativeMarker}'\n[ -e /proc/self/fd/8 ] || exit 61\n`,{mode:0o755});}
    const rows=[[one,path.join(one,'patched'),path.join(one,'glibc-min'),path.join(root,'shell')],[two,path.join(two,'patched'),path.join(two,'glibc-min'),path.join(root,'shell')]];
    fs.writeFileSync(path.join(root,'sequence.json'),JSON.stringify(rows));
    const prefix=path.join(root,'prefix'), openMarker=path.join(root,'opened');proceed=path.join(root,'proceed');
    fs.mkdirSync(path.join(prefix,'bin'),{recursive:true});fs.symlinkSync('/data/data/com.termux/files/usr/bin/sh',path.join(prefix,'bin','sh'));
    fs.writeFileSync(path.join(prefix,'bin','flock'),`#!/system/bin/sh\nif [ ! -e '${openMarker}' ]; then touch '${openMarker}'; while [ ! -e '${proceed}' ]; do :; done; fi\nexec '${flock}' "$@"\n`,{mode:0o755});
    proc=spawn('/data/data/com.termux/files/usr/bin/sh',[path.resolve(__dirname,'../bin/claude'),'--version'],{stdio:['ignore','pipe','pipe'],detached:true,env:{...process.env,MAGI_NODE:path.join(root,'node'),REAL_NODE:process.execPath,CALL_FILE:seed.callFile,SEQUENCE_FILE:path.join(root,'sequence.json'),CLAUDE_TERMUX_LAUNCH_MODE:'patchelf',PREFIX:prefix,HOME:root,TMPDIR:root}});
    proc.stdout.on('data',chunk=>stdout+=chunk);proc.stderr.on('data',chunk=>stderr+=chunk);
    try { await waitFile(openMarker,`launcher opened old .inuse fd (path=${openMarker}, exists=${fs.existsSync(openMarker)})`); }
    catch(error) { throw staleDiagnostic(error,proc,stdout,stderr,openMarker,proceed,startedWall,startedMono); }
    const trash=path.join(seed.genRoot,'renamed-old');fs.renameSync(one,trash);fs.rmSync(trash,{recursive:true,force:true});fs.writeFileSync(proceed,'');
    const timeout=monotonicTimeout(30000, 'timed out waiting for launcher after generation rename');let status;try { status=await Promise.race([new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('close',(code)=>resolve({code}));}),timeout]); } catch(error) { throw staleDiagnostic(error,proc,stdout,stderr,openMarker,proceed,startedWall,startedMono); } finally { timeout.cancel(); }
    try { assert.equal(status.code,0,status.err);assert.ok(fs.existsSync(seed.nativeMarker));assert.equal(fs.readFileSync(seed.callFile,'utf8'),'2','stale inode caused exactly one relaunch-prep'); } catch(error) { throw staleDiagnostic(error,proc,stdout,stderr,openMarker,proceed,startedWall,startedMono,status.code); }
  } finally {if(proc)await stopProcessGroup(proc,proceed,'launcher after rename shutdown');fs.rmSync(root,{recursive:true,force:true});}
});

test('real dash launcher stops after three flock conflicts without executing native', async () => {
  const root=tempDir(),flock='/data/data/com.termux/files/usr/bin/flock';let holder,proc;const release=path.join(root,'release');
  try {
    const seed=launcherFixture(root,[]),gen=path.join(seed.genRoot,'gen-contended');fs.mkdirSync(path.join(gen,'glibc-min'),{recursive:true});fs.writeFileSync(path.join(gen,'.inuse'),'');fs.writeFileSync(path.join(gen,'READY'),'{}');const patched=path.join(gen,'patched');fs.writeFileSync(patched,`#!/system/bin/sh\ntouch '${seed.nativeMarker}'\n`,{mode:0o755});fs.writeFileSync(path.join(root,'sequence.json'),JSON.stringify([[gen,patched,path.join(gen,'glibc-min'),path.join(root,'shell')]]));
    const entered=path.join(root,'holder-entered'),events=path.join(root,'flock-events'),prefix=path.join(root,'prefix');fs.mkdirSync(path.join(prefix,'bin'),{recursive:true});fs.symlinkSync('/data/data/com.termux/files/usr/bin/sh',path.join(prefix,'bin','sh'));fs.writeFileSync(path.join(prefix,'bin','flock'),`#!/system/bin/sh\n'${flock}' "$@"\nstatus=$?\nprintf '%s\\n' "$status" >> '${events}'\nexit "$status"\n`,{mode:0o755});
    holder=spawn(flock,['-x',path.join(gen,'.inuse'),'-c',`touch '${entered}'; while [ ! -e '${release}' ]; do :; done`],{stdio:'ignore',detached:true});await waitFile(entered,'GC lock acquisition');
    proc=spawn('/data/data/com.termux/files/usr/bin/sh',[path.resolve(__dirname,'../bin/claude'),'--version'],{stdio:['ignore','pipe','pipe'],detached:true,env:{...process.env,MAGI_NODE:path.join(root,'node'),REAL_NODE:process.execPath,CALL_FILE:seed.callFile,SEQUENCE_FILE:path.join(root,'sequence.json'),CLAUDE_TERMUX_LAUNCH_MODE:'patchelf',PREFIX:prefix,HOME:root,TMPDIR:root}});
    const resultPromise=new Promise((resolve,reject)=>{let err='';proc.stderr.on('data',x=>err+=x);proc.once('error',reject);proc.once('close',status=>resolve({status,err}));});
    const timeout=monotonicTimeout(30000, 'timed out waiting for launcher after flock conflicts');let result;try { result=await Promise.race([resultPromise,timeout]); } finally { timeout.cancel(); }
    assert.notEqual(result.status,0);assert.match(result.err,/after 3 generation retries/);assert.equal(fs.readFileSync(events,'utf8'),'73\n73\n73\n');assert.equal(fs.existsSync(seed.nativeMarker),false);
  } finally {fs.writeFileSync(release,'');if(proc)await stopProcessGroup(proc,null,'launcher after conflicts shutdown');if(holder)await stopProcessGroup(holder,release,'flock holder');fs.rmSync(root,{recursive:true,force:true});}
});

test('process group cleanup releases descendants after a forced synchronization timeout', async () => {
  const root=tempDir(),lock=path.join(root,'prepare.lock'),ready=path.join(root,'holder.ready'),sleepPidFile=path.join(root,'sleep.pid'),release=path.join(root,'release');let holder;
  try {
    holder=spawn('/data/data/com.termux/files/usr/bin/flock',['-x',lock,'-c',`echo $$ > '${ready}'; until [ -f '${release}' ]; do sleep 30 & echo $! > '${sleepPidFile}'; wait $!; done`],{stdio:['ignore','pipe','pipe'],detached:true});
    await waitFile(ready,'flock holder ready');
    const childShellPid=Number(fs.readFileSync(ready,'utf8').trim());
    assert.ok(Number.isInteger(childShellPid)&&childShellPid>0,'holder child shell PID is recorded');
    await waitFor(()=>processExists(childShellPid),'flock holder child shell exists');
    await waitFile(sleepPidFile,'flock holder descendant sleep PID');
    const sleepPid=Number(fs.readFileSync(sleepPidFile,'utf8').trim());
    assert.ok(Number.isInteger(sleepPid)&&sleepPid>0,'descendant sleep PID is recorded');
    await waitFor(()=>processExists(sleepPid),'flock holder descendant sleep exists');
    await waitFor(()=>{try{return fs.readlinkSync(`/proc/${childShellPid}/fd/3`)===lock;}catch{return false;}},'child shell retains prepare.lock fd 3');
    try { await waitFor(()=>false,'deliberately unavailable synchronization marker',100); assert.fail('expected synchronization timeout'); }
    catch(error) { assert.match(error.message,/timed out waiting/); }
    const knownPids=[holder.pid,childShellPid,sleepPid];
    await stopProcessGroup(holder,release,'forced-timeout holder');
    await waitForPidsGone(knownPids,'holder and child shell exit');
    await waitFor(()=>{try{process.kill(-holder.pid,0);return false;}catch(error){if(error.code==='ESRCH')return true;throw error;}},'holder process group is empty');
    const reacquire=spawnSync('/data/data/com.termux/files/usr/bin/flock',['-x','-n',lock,'-c','true'],{encoding:'utf8',timeout:5000});
    assert.equal(reacquire.status,0,`lock is immediately reacquirable (${reacquire.stderr})`);
    assert.ok(holder.stdout.destroyed&&holder.stderr.destroyed,'holder pipes are destroyed');
  } finally { if(holder&&!holder.closed) await stopProcessGroup(holder,release,'forced-timeout holder cleanup'); fs.rmSync(root,{recursive:true,force:true}); }
  assert.equal(holder.signalCode, 'SIGKILL');
});

test('real launcher rejects missing or mismatched generation paths before native execution', () => {
  const root=tempDir();try {
    const seed=launcherFixture(root,[]),gen=path.join(root,'gen-a'),other=path.join(root,'gen-b');fs.mkdirSync(path.join(gen,'glibc-min'),{recursive:true});fs.writeFileSync(path.join(gen,'.inuse'),'');fs.writeFileSync(path.join(gen,'READY'),'{}');const native=path.join(gen,'patched');fs.writeFileSync(native,`#!/system/bin/sh\ntouch '${seed.nativeMarker}'\n`,{mode:0o755});
    const cases=[[['',native,path.join(gen,'glibc-min'),path.join(root,'shell')],/Invalid patchelf launch path/],[[gen,native,path.join(other,'glibc-min'),path.join(root,'shell')],/GEN, PATCHED and GLIBC_MIN are inconsistent/]];
    for(const [record,expected] of cases){fs.writeFileSync(path.join(root,'sequence.json'),JSON.stringify([record]));const result=seed.run();assert.notEqual(result.status,0);assert.match(result.stderr,expected);assert.equal(fs.existsSync(seed.nativeMarker),false);}
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('mksh launcher reports unsupported fd inheritance without retrying', () => {
  const root=tempDir();try {
    const gen=path.join(root,'gen');fs.mkdirSync(path.join(gen,'glibc-min'),{recursive:true});fs.writeFileSync(path.join(gen,'.inuse'),'');fs.writeFileSync(path.join(gen,'READY'),'{}');const native=path.join(gen,'patched'),marker=path.join(root,'native-ran');fs.writeFileSync(native,`#!/system/bin/sh\ntouch '${marker}'\n`,{mode:0o755});
    const node=path.join(root,'node');fs.writeFileSync(node,`#!/system/bin/sh\n[ "$1" = -e ] && exit 0\nprintf '%s\n' '${gen}' '${native}' '${path.join(gen,'glibc-min')}' '${path.join(root,'shell')}'\n`,{mode:0o755});
    const result=spawnSync('/system/bin/sh',[path.resolve(__dirname,'../bin/claude'),'--version'],{encoding:'utf8',env:{...process.env,MAGI_NODE:node,CLAUDE_TERMUX_LAUNCH_MODE:'patchelf',PREFIX:'/data/data/com.termux/files/usr',HOME:root,TMPDIR:root}});
    assert.notEqual(result.status,0);assert.match(result.stderr,/requires Termux sh\/dash/);assert.equal(fs.existsSync(marker),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('READY-less generation is abandoned and a fresh READY generation becomes current', () => {
  const root=tempDir(),flock='/data/data/com.termux/files/usr/bin/flock';if(!fs.existsSync(flock))return;
  try {const versionDir=path.join(root,'version'),identity='f'.repeat(64),first=runtime.prepareGeneration({versionDir,identity,flockPath:flock,nonce:()=> 'broken',populate(){}});fs.unlinkSync(path.join(first.generationPath,'READY'));const second=runtime.prepareGeneration({versionDir,identity,flockPath:flock,nonce:()=> 'ready',populate(){}});assert.notEqual(first.generation,second.generation);assert.equal(fs.readlinkSync(path.join(versionDir,'current')),second.generation);assert.ok(fs.existsSync(path.join(second.generationPath,'READY')));assert.equal(first.generation===second.generation,false);}
  finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('real CLI cold launch-prep, corrupt READY recovery, lock-free warm/verify and glibc replacement', async () => {
  const root=tempDir(),prefix=path.join(root,'prefix'),cache=path.join(root,'cache'),glibc=path.join(root,'glibc'),source=path.join(root,'native');
  const cli=path.resolve(__dirname,'patchelf-runtime-cli.js'),realSh='/data/data/com.termux/files/usr/bin/sh',realFlock='/data/data/com.termux/files/usr/bin/flock';
  try {
    fs.mkdirSync(path.join(prefix,'bin'),{recursive:true});fs.mkdirSync(path.join(prefix,'lib'),{recursive:true});fs.mkdirSync(glibc,{recursive:true});
    fs.symlinkSync(realFlock,path.join(prefix,'bin','flock'));fs.symlinkSync(realSh,path.join(prefix,'bin','sh'));
    fs.writeFileSync(path.join(prefix,'bin','bash'),'#!/data/data/com.termux/files/usr/bin/sh\nexit 0\n',{mode:0o755});fs.writeFileSync(path.join(prefix,'lib','libtermux-exec-ld-preload.so'),'preload');
    const names=['libc.so.6','libm.so.6','libpthread.so.0','libdl.so.2','librt.so.1','ld-linux-aarch64.so.1','libresolv.so.2','libutil.so.1','libnss_dns.so.2','libnss_files.so.2','libgcc_s.so.1','libstdc++.so.6'];
    for(const name of names) fs.writeFileSync(path.join(glibc,name),`library:${name}`);
    fs.writeFileSync(path.join(glibc,'libc-alt.so'),'replacement libc');fs.unlinkSync(path.join(glibc,'libc.so.6'));fs.symlinkSync(path.join(glibc,'libc-alt.so'),path.join(glibc,'libc.so.6'));
    const patchelf=path.join(prefix,'bin','patchelf'),readelf=path.join(prefix,'bin','readelf'),npm=path.join(prefix,'bin','npm');
    for(const file of [patchelf,readelf,npm]) fs.writeFileSync(file,`#!${realSh}\nexit 0\n`,{mode:0o755});
    fs.writeFileSync(npm,`#!${realSh}\nprintf '%s\\n' 'https://example.invalid/native.tgz'\n`,{mode:0o755});fs.writeFileSync(source,'native fixture');
    const env={...process.env,PREFIX:prefix,HOME:path.join(root,'home'),TMPDIR:path.join(root,'tmp'),CLAUDE_TERMUX_PACKAGE_CACHE:cache,CLAUDE_TERMUX_GLIBC_LIB:glibc,CLAUDE_TERMUX_PATCHELF:patchelf,CLAUDE_TERMUX_READELF:readelf,CLAUDE_TERMUX_NPM:npm,CLAUDE_TERMUX_NATIVE_BIN:source};fs.mkdirSync(env.HOME);fs.mkdirSync(env.TMPDIR);
    const invoke=command=>spawnSync(process.execPath,[cli,command],{encoding:'utf8',env});
    const first=invoke('launch-prep');assert.equal(first.status,0,first.stderr);const firstRows=first.stdout.trim().split('\n');assert.equal(firstRows.length,4);const ready1=JSON.parse(fs.readFileSync(path.join(firstRows[0],'READY'),'utf8'));
    assert.equal(ready1.sha256.glibc0,hash(fs.readFileSync(ready1.glibcPaths[0])));assert.equal(ready1.fingerprintPaths.length,2+2+ready1.glibcPaths.length*3);
    const warm=invoke('launch-prep');assert.equal(warm.status,0,warm.stderr);assert.equal(warm.stdout,first.stdout,'warm reuses the prepared generation');
    const verified=invoke('verify');assert.equal(verified.status,0,verified.stderr);assert.match(verified.stderr,/verification passed/);
    const recover=mutate=>{const current=path.join(env.CLAUDE_TERMUX_PACKAGE_CACHE,'patchelf',require('../package.json').version,'current');const gen=path.join(path.dirname(current),fs.readlinkSync(current)),readyPath=path.join(gen,'READY'),record=JSON.parse(fs.readFileSync(readyPath,'utf8'));mutate(gen,record);fs.writeFileSync(readyPath,JSON.stringify(record));const result=invoke('launch-prep');assert.equal(result.status,0,result.stderr);assert.notEqual(result.stdout.trim().split('\n')[0],gen,'corrupt current is replaced with a fresh generation');assert.equal(invoke('verify').status,0,'recovered generation verifies');};
    recover(gen=>{fs.unlinkSync(path.join(gen,'.inuse'));});
    recover(gen=>{fs.unlinkSync(path.join(gen,'.inuse'));fs.symlinkSync(path.join(root,'outside'),path.join(gen,'.inuse'));fs.writeFileSync(path.join(root,'outside'),'');});
    recover((gen,record)=>{record.wrappers.run='../escape';});
    recover((gen,record)=>{record.sha256={};});
    const versionDir=path.join(env.CLAUDE_TERMUX_PACKAGE_CACHE,'patchelf',require('../package.json').version),shellLock=path.join(cache,'patchelf','shell.lock'),holder=spawn(realFlock,['-x',shellLock,'-c','sleep 10'],{stdio:'ignore',detached:true});
    try {
      await waitFor(()=>spawnSync(realFlock,['-E','73','-x','-n',shellLock,'-c','true']).status===73,'shell.lock holder');
      for(const command of ['launch-prep','verify']) {
        const proc=spawn(process.execPath,[cli,command],{encoding:'utf8',env});let output='',error='';proc.stdout.on('data',x=>output+=x);proc.stderr.on('data',x=>error+=x);
        const observationTimeout=monotonicTimeout(1500, 'launcher shell.lock observation timeout');let outcome;try { outcome=await Promise.race([new Promise(resolve=>proc.once('close',status=>resolve({status,output,error}))),observationTimeout.then(()=>null,()=>null)]); } finally { observationTimeout.cancel(); }
        assert.ok(outcome,`${command} must proceed while shell.lock is held`);assert.equal(outcome.status,0,outcome.error);
      }
    } finally {await stopProcessGroup(holder,null,'shell.lock holder');}
    const currentLink=path.join(versionDir,'current'),oldCurrent=fs.readlinkSync(currentLink),libc=fs.realpathSync(path.join(glibc,'libc.so.6'));
    fs.writeFileSync(patchelf,`#!${realSh}\nprintf '%s' 'changed while patchelf runs' > '${libc}'\n`,{mode:0o755});
    const raced=invoke('launch-prep');assert.notEqual(raced.status,0);assert.match(raced.stderr,/external input changed during generation/);assert.equal(fs.readlinkSync(currentLink),oldCurrent,'failed build preserves old current');
    fs.writeFileSync(patchelf,`#!${realSh}\nexit 0\n`,{mode:0o755});fs.writeFileSync(libc,'library:libc.so.6');
    const stable=invoke('launch-prep');assert.equal(stable.status,0,stable.stderr);
    fs.unlinkSync(path.join(glibc,'libc.so.6'));
    fs.writeFileSync(path.join(glibc,'libc-next.so'),'next libc');fs.symlinkSync(path.join(glibc,'libc-next.so'),path.join(glibc,'libc.so.6'));
    const updated=invoke('launch-prep');assert.equal(updated.status,0,updated.stderr);const secondRows=updated.stdout.trim().split('\n');assert.notEqual(secondRows[0],firstRows[0]);
    assert.equal(invoke('verify').status,0,'new real READY also verifies');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('real CLI rejects shell metacharacters and whitespace in PREFIX before wrapper creation', () => {
  const root=tempDir(),cli=path.resolve(__dirname,'patchelf-runtime-cli.js');
  try {
    const base={...process.env,HOME:path.join(root,'home'),TMPDIR:path.join(root,'tmp'),CLAUDE_TERMUX_GLIBC_LIB:'/data/data/com.termux/files/usr/glibc/lib'};fs.mkdirSync(base.HOME);fs.mkdirSync(base.TMPDIR);
    for(const prefix of [`${root}/prefix$(touch${root}/injected)`,`${root}/prefix with-space`]) {
      const result=spawnSync(process.execPath,[cli,'launch-prep'],{encoding:'utf8',env:{...base,PREFIX:prefix}});
      assert.notEqual(result.status,0);assert.match(result.stderr,/unsupported shell characters/);
    }
    assert.equal(fs.existsSync(path.join(root,'injected')),false,'PREFIX command substitution did not execute');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('READY rejects omitted required fingerprint, wid, wrapper and inuse metadata', () => {
  const id='1'.repeat(64), wid='2'.repeat(32), base=runtime.createReady(id,{fingerprintPaths:[['patched','patched/claude']],fingerprints:{patched:Object.fromEntries(runtime.FINGERPRINT_FIELDS.map(field=>[field,field==='realpath'?'/x':'1']))},wid,wrappers:{wid,run:`${wid}/run`,bash:`${wid}/bash`},glibcPaths:['/libc'],glibcLinks:[{soname:'libc.so.6',realpath:'/libc'}],sha256:{patched:'a'.repeat(64)}});
  assert.doesNotThrow(()=>runtime.parseReady(JSON.stringify(base)));
  for(const key of ['fingerprintPaths','fingerprints','glibcPaths','glibcLinks','wid','wrappers','sha256']) { const broken={...base};delete broken[key];assert.throws(()=>runtime.parseReady(JSON.stringify(broken)),/READY is missing required runtime fields|READY is missing sha256/); }
  const root=tempDir(),generation=path.join(root,`gen-${id.slice(0,16)}-nonce`);try{fs.mkdirSync(generation);fs.symlinkSync('/tmp/not-a-file',path.join(generation,'.inuse'));assert.throws(()=>runtime.parseReady(JSON.stringify(base),{generationPath:generation}),/regular file/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('real launcher rejects each relative field, missing lines and extra fifth line without native execution', () => {
  const root=tempDir();try {
    const fixture=launcherFixture(root,[]),gen=path.join(root,'gen-a');fs.mkdirSync(path.join(gen,'glibc-min'),{recursive:true});fs.writeFileSync(path.join(gen,'.inuse'),'');fs.writeFileSync(path.join(gen,'READY'),'{}');const patched=path.join(gen,'patched');fs.writeFileSync(patched,`#!/system/bin/sh\ntouch '${fixture.nativeMarker}'\n`,{mode:0o755});
    const valid=[gen,patched,path.join(gen,'glibc-min'),path.join(root,'shell')],bad=[];
    for(let i=0;i<4;i++){const row=valid.slice();row[i]='relative/path';bad.push(row);}
    bad.push(valid.slice(0,3),[...valid,'extra']);
    for(const row of bad){fs.writeFileSync(path.join(root,'sequence.json'),JSON.stringify([row]));const result=fixture.run();assert.notEqual(result.status,0);assert.equal(fs.existsSync(fixture.nativeMarker),false);}
    fs.writeFileSync(path.join(root,'sequence.json'),JSON.stringify([valid]));const unterminated=fixture.run('/data/data/com.termux/files/usr/bin/sh',{NO_FINAL_NEWLINE:'1'});assert.notEqual(unterminated.status,0);assert.match(unterminated.stderr,/exactly four newline-terminated lines/);assert.equal(fs.existsSync(fixture.nativeMarker),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('launch-prep records post-lock glibc hashes when libc changes during prepare.lock wait', async () => {
  const {root,cli,env}=makeCliFixture();
  let holder,prep;const rel=path.join(root,'release-lock');
  try{
    const versionDir=path.join(env.CLAUDE_TERMUX_PACKAGE_CACHE,'patchelf',require('../package.json').version),lock=path.join(versionDir,'prepare.lock');
    fs.mkdirSync(path.dirname(lock),{recursive:true});
    holder=spawn(env.PREFIX+'/bin/flock',['-x',lock,'-c',`touch '${rel}.ready' && until [ -f '${rel}' ]; do sleep 0.05; done`],{stdio:'pipe',detached:true});
    await waitFor(()=>fs.existsSync(rel+'.ready'),'prepare.lock holder acquisition',30000);
    prep=spawn(process.execPath,[cli,'launch-prep'],{stdio:['ignore','pipe','pipe'],detached:true,env});let out='',err='';prep.stdout.on('data',x=>out+=x);prep.stderr.on('data',x=>err+=x);
    await waitForLockWaiter(lock,'CLI prepare.lock wait',30000);
    fs.writeFileSync(path.join(env.CLAUDE_TERMUX_GLIBC_LIB,'libc.so.6'),'library:libc.so.6 CHANGED');
    fs.writeFileSync(rel,'');
    const status=await waitForClose(prep,'launch-prep close',30000);
    assert.equal(status,0,`launch-prep succeeded after lock release (stderr: ${err})`);
    const verify=spawnSync(process.execPath,[cli,'verify'],{encoding:'utf8',env,timeout:30000});
    assert.equal(verify.status,0,`verify succeeded after detected change (stderr: ${verify.stderr})`);
    const gen1=out.trim().split('\n')[0];
    fs.writeFileSync(path.join(env.CLAUDE_TERMUX_GLIBC_LIB,'libc.so.6'),'library:libc.so.6');
    const warm=spawnSync(process.execPath,[cli,'launch-prep'],{encoding:'utf8',env,timeout:30000});
    assert.equal(warm.status,0,`warm launch-prep succeeded after change reverted (stderr: ${warm.stderr})`);
  }finally{if(prep)await stopProcessGroup(prep,null,'launch-prep shutdown');if(holder)await stopProcessGroup(holder,rel,'flock holder shutdown');fs.rmSync(root,{recursive:true,force:true});}
});

test('real CLI detects READY mutations (wrapper path, fingerprint, glibcLinks order) and rebuilds generation', () => {
  const executed=[];
  for(const mut of ['swapRun','extraFp','glibcLinksEdit']){
    const {root,cli,env}=makeCliFixture();
    try{
      const ok=spawnSync(process.execPath,[cli,'launch-prep'],{encoding:'utf8',env,timeout:30000});
      assert.equal(ok.status,0,ok.stderr);
      const generationPath=ok.stdout.trim().split('\n')[0];
      const readyPath=path.join(generationPath,'READY');
      assert.ok(fs.existsSync(generationPath),`${mut}: generation path exists`);
      assert.ok(fs.existsSync(readyPath),`${mut}: READY file exists`);
      const ready=JSON.parse(fs.readFileSync(readyPath,'utf8'));
      const record=JSON.parse(JSON.stringify(ready));
      const before=JSON.stringify(record);
      if(mut==='swapRun') record.wrappers.run=`${record.wid}/bash`;
      if(mut==='extraFp'){record.fingerprintPaths.push(['extra','patched/claude']);record.fingerprints.extra=record.fingerprints.patched;}
      if(mut==='glibcLinksEdit') record.glibcLinks=record.glibcLinks.slice().reverse();
      assert.notEqual(JSON.stringify(record),before,`${mut}: mutation must change READY`);
      fs.writeFileSync(readyPath,JSON.stringify(record));
      const corruptedVerify=spawnSync(process.execPath,[cli,'verify'],{encoding:'utf8',env,timeout:30000});
      assert.notEqual(corruptedVerify.status,0,`${mut}: verify rejects the mutated READY directly`);
      const result=spawnSync(process.execPath,[cli,'launch-prep'],{encoding:'utf8',env,timeout:30000});
      assert.equal(result.status,0,`${mut}: launch-prep succeeded (stderr: ${result.stderr})`);
      const gen2=result.stdout.trim().split('\n')[0];
      assert.notEqual(generationPath,gen2,`${mut}: new generation created for mutation`);
      const verify=spawnSync(process.execPath,[cli,'verify'],{encoding:'utf8',env,timeout:30000});
      assert.equal(verify.status,0,`${mut}: verify passed on new generation`);
      executed.push(mut);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  }
  assert.deepEqual(executed,['swapRun','extraFp','glibcLinksEdit'],'all three mutations executed');
});
