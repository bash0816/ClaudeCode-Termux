'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCHEMA = 1;
const FINGERPRINT_FIELDS = Object.freeze(['realpath', 'dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']);

function fingerprint(filePath) {
  const realpath = fs.realpathSync(filePath);
  const stat = fs.statSync(filePath, { bigint: true });
  return {
    realpath,
    dev: stat.dev.toString(10),
    ino: stat.ino.toString(10),
    size: stat.size.toString(10),
    mtimeNs: stat.mtimeNs.toString(10),
    ctimeNs: stat.ctimeNs.toString(10),
  };
}

function fingerprintsEqual(left, right) {
  return FINGERPRINT_FIELDS.every(field => left?.[field] === right?.[field]);
}

function createIdentity(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    const normalized = value.map(canonicalize).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    return normalized.filter((item, index) => index === 0 || JSON.stringify(item) !== JSON.stringify(normalized[index - 1]));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function generationName(identity, nonce) {
  if (!/^[a-f0-9]{64}$/.test(identity)) throw new Error('identity must be a lowercase SHA-256 hex digest');
  if (typeof nonce !== 'string' || nonce.length === 0 || nonce.includes('/')) throw new Error('nonce must be a non-empty path component');
  return `gen-${identity.slice(0, 16)}-${nonce}`;
}

function wrapperIdentity(run, bash) {
  const digest = crypto.createHash('sha256').update(run).update('\0').update(bash).digest('hex');
  return digest.slice(0, 32);
}

function ensureShellWrappers(shellRoot, run, bash) {
  if (typeof run !== 'string' || typeof bash !== 'string') throw new TypeError('wrapper contents must be strings');
  const wid = wrapperIdentity(run, bash);
  const dir = path.join(shellRoot, wid);
  const runPath = path.join(dir, 'run');
  const bashPath = path.join(dir, 'bash');
  const expected = { run: sha256Text(run), bash: sha256Text(bash) };
  fs.mkdirSync(shellRoot, { recursive: true });

  if (fs.existsSync(dir)) {
    assertWrapperContent(runPath, expected.run);
    assertWrapperContent(bashPath, expected.bash);
    return { wid, dir, run: runPath, bash: bashPath };
  }

  const temporary = path.join(shellRoot, `.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`);
  fs.mkdirSync(temporary);
  try {
    writeExclusive(path.join(temporary, 'run'), run);
    writeExclusive(path.join(temporary, 'bash'), bash);
    try {
      fs.renameSync(temporary, dir);
    } catch (error) {
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
      fs.rmSync(temporary, { recursive: true, force: true });
      assertWrapperContent(runPath, expected.run);
      assertWrapperContent(bashPath, expected.bash);
    }
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return { wid, dir, run: runPath, bash: bashPath };
}


function ensureShellWrappersLocked(shellRoot, run, bash, flockPath = termuxPaths().flock, now = Date.now()) {
  return withFlock(path.join(path.dirname(shellRoot), 'shell.lock'), flockPath, () => {
    fs.mkdirSync(shellRoot, { recursive: true });
    for (const entry of fs.readdirSync(shellRoot, { withFileTypes: true })) {
      if (!entry.name.startsWith('.tmp-')) continue;
      const target = path.join(shellRoot, entry.name);
      try { if (now - fs.statSync(target).mtimeMs > 86400000) fs.rmSync(target, { recursive: true, force: true }); } catch {}
    }
    return ensureShellWrappers(shellRoot, run, bash);
  });
}

function assertWrapperContent(file, expectedSha256) {
  let actual;
  try { actual = sha256File(file); } catch (cause) {
    throw new Error(`existing wrapper is missing or unreadable: ${file}; repair manually by removing its wid directory only after confirming no saved hook or session uses it`, { cause });
  }
  if (actual !== expectedSha256) throw new Error(`existing wrapper content mismatch: ${file}; repair manually by removing its wid directory only after confirming no saved hook or session uses it`);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function statFingerprint(file, link = false) {
  const stat = (link ? fs.lstatSync(file, { bigint: true }) : fs.statSync(file, { bigint: true }));
  return { realpath: fs.realpathSync(file), dev: stat.dev.toString(), ino: stat.ino.toString(), size: stat.size.toString(), mtimeNs: stat.mtimeNs.toString(), ctimeNs: stat.ctimeNs.toString() };
}

function verifyGeneration(options) {
  const { generationPath, ready: suppliedReady, files = {}, wrappers = [] } = options || {};
  if (typeof generationPath !== 'string' || !path.isAbsolute(generationPath)) throw new TypeError('generationPath must be an absolute path');
  const entries = [...Object.entries(files), ...wrappers.map(item => [item.key, item.path])];
  const ready = suppliedReady || parseReady(fs.readFileSync(path.join(generationPath, 'READY'), 'utf8'), { generationPath, requiredSha256: entries.map(([key]) => key) });
  const checked = [];
  for (const [key, file] of entries) {
    const expected = ready.sha256?.[key];
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`READY is missing sha256 for ${key}`);
    if (sha256File(file) !== expected) throw new Error(`sha256 mismatch for ${key}: ${file}`);
    checked.push(key);
  }
  const run = wrappers.find(item => item.key === 'wrapperRun');
  const bash = wrappers.find(item => item.key === 'wrapperBash');
  if (run && bash && wrapperIdentity(fs.readFileSync(run.path, 'utf8'), fs.readFileSync(bash.path, 'utf8')) !== ready.wid) throw new Error('wrapper identity mismatch');
  return { ok: true, checked };
}

function readCurrentName(versionDir) {
  try {
    const name = fs.readlinkSync(path.join(versionDir, 'current'));
    return !path.isAbsolute(name) && !name.includes('/') && name.startsWith('gen-') ? name : null;
  } catch { return null; }
}

function tryInuseExclusive(file, flockPath) {
  let fd;
  try {
    fd = fs.openSync(file, 'a');
    const result = spawnSync(flockPath, ['-E', '73', '-x', '-n', '3'], { stdio: ['ignore', 'ignore', 'pipe', fd], encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status === 73) { fs.closeSync(fd); return null; }
    if (result.status !== 0) throw new Error(`flock lock acquisition failed (status ${result.status}): ${(result.stderr || '').trim()}`);
    return fd;
  } catch (error) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    throw error;
  }
}

function collectLocked(versionDir, flockPath, now = Date.now()) {
  const current = readCurrentName(versionDir);
  const removed = [];
  for (const entry of fs.readdirSync(versionDir, { withFileTypes: true })) {
    const target = path.join(versionDir, entry.name);
    if (entry.name.startsWith('.trash-')) { fs.rmSync(target, { recursive: true, force: true }); removed.push(entry.name); continue; }
    if (entry.name.startsWith('.tmp-') || entry.name.startsWith('.current-tmp-')) {
      let age;
      try { age = now - fs.statSync(target).mtimeMs; } catch { continue; }
      if (age > 86400000) { fs.rmSync(target, { recursive: true, force: true }); removed.push(entry.name); }
      continue;
    }
    if (!entry.isDirectory() || !entry.name.startsWith('gen-') || entry.name === current) continue;
    const inuse = path.join(target, '.inuse');
    if (!fs.existsSync(inuse) || fs.lstatSync(inuse).isSymbolicLink() || !fs.lstatSync(inuse).isFile()) {
      const trash = path.join(versionDir, `.trash-${entry.name}-${crypto.randomBytes(6).toString('hex')}`);
      fs.renameSync(target, trash); fs.rmSync(trash, { recursive: true, force: true }); removed.push(entry.name); continue;
    }
    const fd = tryInuseExclusive(inuse, flockPath);
    if (fd === null) continue;
    try {
      const trash = path.join(versionDir, `.trash-${entry.name}-${crypto.randomBytes(6).toString('hex')}`);
      fs.renameSync(target, trash);
      fs.rmSync(trash, { recursive: true, force: true });
      removed.push(entry.name);
    } finally { fs.closeSync(fd); }
  }
  return { current, removed };
}

function recordGcStamp(versionDir, now) {
  const stamp = path.join(versionDir, '.gc-stamp');
  const temp = `${stamp}.tmp-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temp, `${now}\n`, { flag: 'wx' });
  fs.renameSync(temp, stamp);
}

function gcGenerations(options) {
  const { versionDir, flockPath = termuxPaths().flock, now = Date.now() } = options || {};
  if (typeof versionDir !== 'string' || !path.isAbsolute(versionDir)) throw new TypeError('versionDir must be an absolute path');
  fs.mkdirSync(versionDir, { recursive: true });
  return withFlock(path.join(versionDir, 'prepare.lock'), flockPath, () => {
    const result = collectLocked(versionDir, flockPath, now);
    recordGcStamp(versionDir, now);
    return result;
  });
}

function maybeDailyGc(options) {
  const { versionDir, flockPath = termuxPaths().flock, now = Date.now() } = options || {};
  const stamp = path.join(versionDir, '.gc-stamp');
  let age = Infinity;
  try { age = now - fs.statSync(stamp).mtimeMs; } catch {}
  if (age <= 86400000) return { ran: false, reason: 'fresh-stamp' };
  fs.mkdirSync(versionDir, { recursive: true });
  let fd;
  try {
    fd = fs.openSync(path.join(versionDir, 'prepare.lock'), 'a');
    const acquired = spawnSync(flockPath, ['-E', '73', '-x', '-n', '3'], { stdio: ['ignore', 'ignore', 'pipe', fd], encoding: 'utf8' });
    if (acquired.error) throw acquired.error;
    if (acquired.status === 73) return { ran: false, reason: 'lock-busy' };
    if (acquired.status !== 0) throw new Error(`flock lock acquisition failed (status ${acquired.status}): ${(acquired.stderr || '').trim()}`);
    const result = collectLocked(versionDir, flockPath, now);
    const temp = `${stamp}.tmp-${crypto.randomBytes(6).toString('hex')}`;
    fs.writeFileSync(temp, `${now}\n`, { flag: 'wx' });
    fs.renameSync(temp, stamp);
    return { ran: true, ...result };
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function fingerprintTarget(generationPath, relative) { return path.isAbsolute(relative) ? relative : path.join(generationPath, relative); }
function fingerprintFor(key, file) { return statFingerprint(file, key.startsWith('glibcLink')); }

function warmGeneration(options) {
  const { generationPath, ready: suppliedReady, fingerprintPaths = [], wrapperFiles = {}, versionDir, flockPath } = options || {};
  const ready = suppliedReady || parseReady(fs.readFileSync(path.join(generationPath, 'READY'), 'utf8'));
  validateReady(ready, { generationPath, fingerprintPaths, requiredSha256: ['patched', 'patchelf', 'readelf', ...ready.glibcPaths.map((_, i) => `glibc${i}`), 'wrapperRun', 'wrapperBash'] });
  if (versionDir) { try { maybeDailyGc({ versionDir, ...(flockPath ? { flockPath } : {}) }); } catch (error) { process.stderr.write(`warning: patchelf daily GC failed: ${error.message}\n`); } }
  for (const [key, relative] of fingerprintPaths) {
    if (!fingerprintsEqual(ready.fingerprints?.[key], fingerprintFor(key, fingerprintTarget(generationPath, relative)))) return { reusable: false, reason: `fingerprint:${key}` };
  }
  for (const [key, file] of Object.entries(wrapperFiles)) {
    if (ready.sha256?.[key] !== sha256File(file)) return { reusable: false, reason: `sha256:${key}` };
  }
  return { reusable: true, ready };
}

function launchPrep(options) {
  const { generationPath, patchedPath, glibcMinPath, shellWrap } = options || {};
  if (![generationPath, patchedPath, glibcMinPath, shellWrap].every(value => typeof value === 'string' && path.isAbsolute(value))) throw new TypeError('generationPath, patchedPath, glibcMinPath and shellWrap must be absolute paths');
  const gen = path.resolve(generationPath);
  for (const file of [patchedPath, glibcMinPath]) {
    const rel = path.relative(gen, path.resolve(file));
    if (!rel || rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) throw new Error('GEN, PATCHED and GLIBC_MIN must belong to the same generation');
  }
  return { GEN: gen, PATCHED: path.resolve(patchedPath), GLIBC_MIN: path.resolve(glibcMinPath), SHELL_WRAP: path.resolve(shellWrap) };
}

// Build the payload only; prepareGeneration owns publication and READY.
function populateGeneration(options) {
  const { tempDir, sourcePath, tarballUrl, tarballSha256, tarballIntegrity, patchelfPath, readelfPath, glibcLib, loaderPath, shellRoot, runTemplate, bashTemplate } = options || {};
  if (typeof tempDir !== 'string' || !path.isAbsolute(tempDir)) throw new TypeError('tempDir must be absolute');
  const source = path.join(tempDir, 'source', 'claude'); fs.mkdirSync(path.dirname(source), { recursive: true });
  if (sourcePath && fs.existsSync(sourcePath)) fs.copyFileSync(sourcePath, source);
  else {
    if (!tarballUrl) throw new Error('native source binary and tarball URL are unavailable');
    const archive = path.join(tempDir, 'native.tgz');
    runChecked(options.curlPath || 'curl', ['--fail', '--location', '--retry', process.env.CLAUDE_TERMUX_FETCH_RETRIES || '4', '--connect-timeout', process.env.CLAUDE_TERMUX_FETCH_CONNECT_TIMEOUT || '20', '--max-time', process.env.CLAUDE_TERMUX_FETCH_MAX_TIME || '300', '--output', archive, '--', tarballUrl]);
    if (tarballSha256 && sha256File(archive) !== tarballSha256) throw new Error('native tarball sha256 mismatch');
    if (tarballIntegrity && `sha512-${crypto.createHash('sha512').update(fs.readFileSync(archive)).digest('base64')}` !== tarballIntegrity) throw new Error('native tarball integrity mismatch');
    const extract = path.join(tempDir, '.extract'); fs.mkdirSync(extract);
    runChecked(options.tarPath || 'tar', ['-xzf', archive, '-C', extract]);
    const found = findNamed(extract, 'claude').find(file => { try { return fs.statSync(file).isFile(); } catch { return false; } });
    if (!found) throw new Error('native tarball does not contain claude');
    fs.copyFileSync(found, source);
  }
  fs.chmodSync(source, 0o755);
  const patched = path.join(tempDir, 'patched', 'claude'); fs.mkdirSync(path.dirname(patched), { recursive: true }); fs.copyFileSync(source, patched); fs.chmodSync(patched, 0o755);
  runChecked(patchelfPath, ['--set-interpreter', loaderPath, patched]);
  const needed = [...runChecked(readelfPath, ['-d', patched]).matchAll(/Shared library: \[([^\]]+)\]/g)].map(match => match[1]);
  const allGlibcSonames = fs.readdirSync(glibcLib).filter(name => /^[A-Za-z0-9_.+-]+\.so(?:\.[A-Za-z0-9_.+-]+)*$/.test(name));
  const sonames = [...new Set([...needed, ...allGlibcSonames, 'libc.so.6', 'libm.so.6', 'libpthread.so.0', 'libdl.so.2', 'librt.so.1', 'ld-linux-aarch64.so.1', 'libresolv.so.2', 'libutil.so.1', 'libnss_dns.so.2', 'libnss_files.so.2', 'libgcc_s.so.1', 'libstdc++.so.6'])];
  const glibcMin = path.join(tempDir, 'glibc-min'); fs.mkdirSync(glibcMin); const glibcPaths = [];
  for (const soname of sonames) {
    if (!/^[A-Za-z0-9_.+-]+\.so(?:\.[A-Za-z0-9_.+-]+)*$/.test(soname)) continue;
    try { const real = fs.realpathSync(path.join(glibcLib, soname)); if (!fs.statSync(real).isFile()) throw new Error(); fs.symlinkSync(real, path.join(glibcMin, soname)); glibcPaths.push(real); }
    catch (error) { if (needed.includes(soname)) throw new Error(`required glibc library is missing: ${soname}`, { cause: error }); }
  }
  const wrappers = ensureShellWrappers(shellRoot, runTemplate, bashTemplate);
  const wrapperHashes = { wrapperRun: sha256File(wrappers.run), wrapperBash: sha256File(wrappers.bash) };
  const glibcHashes = Object.fromEntries(glibcPaths.map((file, index) => [`glibc${index}`, sha256File(file)]));
  return { source, patched, glibcMin, wrappers, wid: wrappers.wid, needed, glibcPaths, readyFields: { needed, glibcPaths, sha256: { ...wrapperHashes, ...glibcHashes } } };
}
function findNamed(root, name) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) { const file = path.join(root, entry.name); if (entry.isDirectory()) out.push(...findNamed(file, name)); else if (entry.name === name) out.push(file); }
  return out;
}
function runChecked(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message || result.stderr || result.status}`);
  return result.stdout || '';
}

function hookPath(wrappers) {
  if (!wrappers || typeof wrappers.run !== 'string' || !path.isAbsolute(wrappers.run)) throw new TypeError('wrappers.run must be an absolute path');
  return wrappers.run;
}

function writeExclusive(file, contents) {
  const fd = fs.openSync(file, 'wx', 0o755);
  try { fs.writeFileSync(fd, contents, 'utf8'); } finally { fs.closeSync(fd); }
}

function createReady(identity, fields = {}) {
  if (typeof identity !== 'string' || !/^[a-f0-9]{64}$/.test(identity)) throw new Error('identity must be a lowercase SHA-256 hex digest');
  const wid = fields.wid || '00000000000000000000000000000000';
  const ready = { fingerprintPaths: [], fingerprints: {}, glibcPaths: [], glibcLinks: [], wid, wrappers: { wid, run: `${wid}/run`, bash: `${wid}/bash` }, sha256: {}, ...fields, schema: SCHEMA, identity };
  ready.wid ||= wid; ready.fingerprintPaths ||= []; ready.fingerprints ||= {}; ready.glibcPaths ||= []; ready.glibcLinks ||= []; ready.sha256 ||= {}; ready.wrappers ||= { wid: ready.wid, run: `${ready.wid}/run`, bash: `${ready.wid}/bash` }; ready.wrappers.wid ||= ready.wid; ready.wrappers.run ||= `${ready.wid}/run`; ready.wrappers.bash ||= `${ready.wid}/bash`;
  return ready;
}

function serializeReady(ready) {
  validateReady(ready);
  return `${JSON.stringify(ready, null, 2)}\n`;
}

function parseReady(contents, options) {
  const ready = JSON.parse(contents);
  validateReady(ready, options);
  return ready;
}

function validateReady(ready, options = {}) {
  if (!ready || typeof ready !== 'object' || Array.isArray(ready) || ready.schema !== SCHEMA || typeof ready.identity !== 'string' || !/^[a-f0-9]{64}$/.test(ready.identity)) throw new Error('invalid READY schema or identity');
  if (!Array.isArray(ready.fingerprintPaths) || !ready.fingerprints || typeof ready.fingerprints !== 'object' || !Array.isArray(ready.glibcPaths) || !Array.isArray(ready.glibcLinks) || typeof ready.wid !== 'string' || !/^[a-f0-9]{32}$/.test(ready.wid) || !ready.wrappers || ready.wrappers.wid !== ready.wid) throw new Error('READY is missing required runtime fields');
  if (!ready.sha256 || typeof ready.sha256 !== 'object' || !Array.isArray(ready.fingerprintPaths)) throw new Error('READY is missing sha256 or fingerprint path fields');
  for (const [key] of ready.fingerprintPaths) if (!ready.fingerprints[key] || !FINGERPRINT_FIELDS.every(field => typeof ready.fingerprints[key][field] === 'string')) throw new Error(`READY is missing fingerprint ${key}`);
  for (const key of options.requiredSha256 || []) if (typeof ready.sha256[key] !== 'string' || !/^[a-f0-9]{64}$/.test(ready.sha256[key])) throw new Error(`READY is missing sha256 for ${key}`);
  for (const [key, target] of options.fingerprintPaths || []) if (!ready.fingerprintPaths.some(([k, t]) => k === key && t === target)) throw new Error(`READY is missing fingerprint target ${key}`);
  if (options.generationPath) {
    const base = path.basename(options.generationPath);
    if (!/^gen-[a-f0-9]{16}-[A-Za-z0-9-]+$/.test(base) || !base.startsWith(`gen-${ready.identity.slice(0, 16)}-`)) throw new Error('invalid generation directory name or identity');
    const inuse = path.join(options.generationPath, '.inuse');
    const inuseStat = fs.lstatSync(inuse); if (!inuseStat.isFile() || inuseStat.isSymbolicLink()) throw new Error('generation .inuse must be a regular file');
    for (const value of [ready.wrappers.run, ready.wrappers.bash]) {
      if (typeof value !== 'string' || value !== `${ready.wid}/${value.endsWith('/run') ? 'run' : 'bash'}`) throw new Error('READY wrapper path is outside its wid directory');
    }
  }
}


function withFlock(lockPath, flockPath, operation) {
  if (typeof operation !== 'function') throw new TypeError('operation must be a function');
  let fd;
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fd = fs.openSync(lockPath, 'a');
    const result = spawnSync(flockPath, ['-E', '73', '-x', '3'], { stdio: ['ignore', 'ignore', 'pipe', fd], encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`flock lock acquisition failed (status ${result.status}): ${(result.stderr || '').trim()}`);
    return operation();
  } catch (cause) {
    if (cause.code === 'ENOENT' || cause.code === 'EACCES' || cause.code === 'ENOLCK' || /ENOLCK|No locks available/i.test(cause.message || '')) {
      throw new Error('Kernel flock is unavailable; install it with: pkg install util-linux', { cause });
    }
    throw cause;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function prepareGeneration(options) {
  const { versionDir, identity, flockPath = termuxPaths().flock, populate, fingerprintPaths = [], sha256Paths = {}, wrapperFiles = {}, readyFields = {}, nonce = makeNonce, isReusable: isReusablePred } = options || {};
  if (typeof versionDir !== 'string' || !path.isAbsolute(versionDir)) throw new TypeError('versionDir must be an absolute path');
  if (typeof flockPath !== 'string' || !path.isAbsolute(flockPath)) throw new TypeError('flockPath must be an absolute path');
  if (typeof populate !== 'function') throw new TypeError('populate(tempDir) must be a function');
  if (typeof identity !== 'string' || !/^[a-f0-9]{64}$/.test(identity)) throw new Error('identity must be a lowercase SHA-256 hex digest');
  fs.mkdirSync(versionDir, { recursive: true });
  return withFlock(path.join(versionDir, 'prepare.lock'), flockPath, () => {
    const externalBefore = Object.fromEntries(Object.entries(sha256Paths).filter(([, value]) => path.isAbsolute(value)).map(([key, file]) => [key, sha256File(file)]));
    const requiredSha256 = [...new Set([...Object.keys(sha256Paths), ...Object.keys(wrapperFiles)])];
    const reusable = inspectCurrent(path.join(versionDir, 'current'), identity, fingerprintPaths, wrapperFiles, requiredSha256, isReusablePred);
    if (reusable) {
      try { collectLocked(versionDir, flockPath); recordGcStamp(versionDir, Date.now()); } catch (error) { process.stderr.write(`warning: patchelf GC failed: ${error.message}\n`); }
      return { ...reusable, reused: true };
    }
    let collision;
    for (let attempt = 0; attempt < 3; attempt++) {
      const temp = path.join(versionDir, `.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`);
      fs.mkdirSync(temp);
      let finalPath;
      let renamed = false;
      try {
        fs.writeFileSync(path.join(temp, '.inuse'), '', { flag: 'wx', mode: 0o600 });
        const payload = populate(temp) || {};
        const name = generationName(identity, nonce());
        finalPath = path.join(versionDir, name);
        fs.renameSync(temp, finalPath);
        renamed = true;
        const fingerprints = Object.fromEntries(fingerprintPaths.map(([key, relative]) => [key, fingerprintFor(key, fingerprintTarget(finalPath, relative))]));
        const hashes = Object.fromEntries(Object.entries(sha256Paths).map(([key, relative]) => [key, sha256File(path.isAbsolute(relative) ? relative : path.join(finalPath, relative))]));
        for (const [key, before] of Object.entries(externalBefore)) if (hashes[key] !== before) throw new Error(`external input changed during generation: ${key}`);
        const ready = createReady(identity, { ...readyFields, ...(payload.readyFields || {}), fingerprints, fingerprintPaths, wid: readyFields.wid || payload.wid, wrappers: readyFields.wrappers || payload.readyFields?.wrappers, glibcPaths: readyFields.glibcPaths || payload.readyFields?.glibcPaths, glibcLinks: readyFields.glibcLinks || payload.readyFields?.glibcLinks, sha256: { ...(payload.sha256 || {}), ...(payload.readyFields?.sha256 || {}), ...(readyFields.sha256 || {}), ...hashes } });
        validateReady(ready, { generationPath: finalPath, fingerprintPaths, requiredSha256 });
        const readyTemp = path.join(finalPath, '.READY-tmp');
        writeExclusive(readyTemp, serializeReady(ready));
        fs.renameSync(readyTemp, path.join(finalPath, 'READY'));
        const currentTemp = path.join(versionDir, `.current-tmp-${crypto.randomBytes(8).toString('hex')}`);
        fs.symlinkSync(name, currentTemp);
        fs.renameSync(currentTemp, path.join(versionDir, 'current'));
        try { collectLocked(versionDir, flockPath); recordGcStamp(versionDir, Date.now()); } catch (error) { process.stderr.write(`warning: patchelf GC failed: ${error.message}\n`); }
        return { generation: name, generationPath: finalPath, ready, reused: false };
      } catch (error) {
        if (!renamed) fs.rmSync(temp, { recursive: true, force: true });
        if (error.code === 'EEXIST' || error.code === 'ENOTEMPTY') { collision = error; continue; }
        throw error;
      }
    }
    throw new Error('generation name collided three times; refusing to replace an existing generation', { cause: collision });
  });
}

function inspectCurrent(current, identity, fingerprintPaths, wrapperFiles = {}, requiredSha256 = [], isReusable) {
  try {
    const name = fs.readlinkSync(current);
    if (path.isAbsolute(name) || name.includes('/') || !name.startsWith('gen-')) return null;
    const generationPath = path.join(path.dirname(current), name);
    const ready = parseReady(fs.readFileSync(path.join(generationPath, 'READY'), 'utf8'));
    validateReady(ready, { generationPath, fingerprintPaths, requiredSha256: [...requiredSha256, ...ready.glibcPaths.map((_, i) => `glibc${i}`)] });
    if (ready.identity !== identity) return null;
    for (const [key, relative] of fingerprintPaths) {
      if (!fingerprintsEqual(ready.fingerprints?.[key], fingerprintFor(key, fingerprintTarget(generationPath, relative)))) return null;
    }
    for (const [key, file] of Object.entries(wrapperFiles)) {
      if (ready.sha256?.[key] !== sha256File(file)) return null;
    }
    if (isReusable && !isReusable(generationPath, ready)) return null;
    return { generation: name, generationPath, ready };
  } catch { return null; }
}

function termuxPaths(prefix = process.env.PREFIX) {
  if (typeof prefix !== 'string' || !path.isAbsolute(prefix)) throw new Error('PREFIX must be an absolute path');
  return { prefix, flock: path.join(prefix, 'bin', 'flock'), patchelf: path.join(prefix, 'bin', 'patchelf'), readelf: path.join(prefix, 'bin', 'readelf'), glibc: path.join(prefix, 'glibc'), bash: path.join(prefix, 'bin', 'bash'), sh: path.join(prefix, 'bin', 'sh'), preload: path.join(prefix, 'lib', 'libtermux-exec-ld-preload.so') };
}

function makeNonce() { return `${Date.now()}-${process.pid}-${crypto.randomBytes(6).toString('hex')}`; }

module.exports = {
  gcGenerations,
  hookPath,
  launchPrep,
  maybeDailyGc,
  FINGERPRINT_FIELDS,
  SCHEMA,
  createIdentity,
  createReady,
  ensureShellWrappers,
  ensureShellWrappersLocked,
  fingerprint,
  fingerprintsEqual,
  generationName,
  parseReady,
  prepareGeneration,
  populateGeneration,
  serializeReady,
  termuxPaths,
  validateReady,
  verifyGeneration,
  warmGeneration,
  wrapperIdentity,
  withFlock,
};
