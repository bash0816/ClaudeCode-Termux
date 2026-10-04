'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const fixtureDir = path.join(__dirname, 'test-fixtures/upstream-2.1.287');
const shim = fs.readFileSync(path.join(__dirname, 'termux-run-claude-native.sh'), 'utf8');
const shaExpected = '59ad1d5afd8bc3db3a68e12c6611c318f894a85dc55b465e90aebb583a2b94f6';

function payloadOf(source) {
  const marker = '// ---- payload ----\n';
  const at = source.indexOf(marker);
  assert.notEqual(at, -1, 'fixture payload marker exists');
  return source.slice(at + marker.length);
}
function headerless(file) { return payloadOf(fs.readFileSync(file, 'utf8')); }
function sourceFromFixture() {
  const file = path.join(fixtureDir, 'chunk-8h7qs60z.mjs');
  const fixture = headerless(file);
  const upstreamImport = 'import{uze}from"/$bunfs/root/chunk-ncm29pd2.js";import{k}from"/$bunfs/root/chunk-gwr1he3z.js";import{Rt,B,Od}from"/$bunfs/root/chunk-jx85q2yb.js";import{hd}from"/$bunfs/root/chunk-wpk2k2yt.js";import{Pg}from"/$bunfs/root/chunk-rs5m5t99.js";';
  const localImport = 'import{uze,k,Rt,B,Od,hd,Pg}from"./stubs.mjs";';
  assert.equal((fixture.match(new RegExp(localImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1);
  return fixture.replace(localImport, upstreamImport);
}
function balanced(source, at) {
  const start = source.indexOf('{', at); let depth = 0, quote = '', escape = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unbalanced object');
}
function implementations() {
  const blocks = [...shim.matchAll(/cat <<'NODE' > "\$_(?:helper|bootstrap)"([\s\S]*?)\nNODE/g)].map(m => m[1]);
  assert.equal(blocks.length, 2, 'both shim NODE heredocs found');
  const sha = blocks.flatMap(block => [...block.matchAll(/SHA256:\s*\{/g)].map(m => balanced(block, m.index + m[0].indexOf('{'))));
  assert.equal(sha.length, 4, 'four SHA256 implementations extracted');
  const crc = blocks.flatMap(block => [...block.matchAll(/stableHash\.crc32\s*=\s*function\s+bunHashCrc32/g)].map(m => {
    const start = block.lastIndexOf('function stableHash(value, seed) {', m.index);
    const end = block.indexOf('\n};', start) + 3;
    const close = block.indexOf('};', m.index) + 2;
    assert.ok(start >= 0 && end > 2 && close > 1);
    return `${block.slice(start, end)}\n${block.slice(m.index, close)}\nmodule.exports=stableHash.crc32;`;
  }));
  assert.equal(crc.length, 2, 'two crc32 implementations extracted');
  const shaFns = sha.map(code => {
    const m = { exports: {} };
    vm.runInNewContext(`module.exports=${code}`, { module: m, require, Buffer, Uint8Array, ArrayBuffer });
    return m.exports.hash;
  });
  const crcFns = crc.map(code => { const m = { exports: {} }; vm.runInNewContext(code, { module: m, require, Buffer, Uint8Array, ArrayBuffer }); return m.exports; });
  return { shaFns, crcFns };
}
const { shaFns, crcFns } = implementations();
function bunFor(sha, crc) { return { SHA256: { hash: sha }, hash: { crc32: crc } }; }
function bodyOf(length, messageBlockLength = 131072) {
  const messages = '"messages":[', system = '],"system":';
  const prefix = 'x'.repeat(131071);
  const messageSegment = messages + 'm'.repeat(messageBlockLength - messages.length);
  const tailLength = length - prefix.length - messageSegment.length - system.length;
  assert.ok(tailLength >= 0);
  return prefix + messageSegment + system + 's'.repeat(tailLength);
}
function gunzipMatches(gzip, body) {
  assert.equal(gzip[0], 0x1f); assert.equal(gzip[1], 0x8b);
  assert.ok(Buffer.from(gzip).toString('hex').match(/0000ffff/g)?.length >= 2, 'sync flush markers');
  assert.deepEqual(zlib.gunzipSync(gzip), Buffer.from(body));
}

// The fixture source is checked byte-for-byte after reversing the sole import replacement.
test('upstream fixtures preserve and verify their source bytes', async () => {
  for (const name of fs.readdirSync(fixtureDir).filter(name => name.endsWith('.mjs'))) {
    const file = path.join(fixtureDir, name), source = fs.readFileSync(file, 'utf8');
    const declared = source.match(/^\/\/ (?:(?:Local )?[Ff]ixture payload sha256|Extracted payload sha256|Extracted payload SHA256)(?: \([^)]*\))?: ([a-f0-9]{64})$/m)?.[1];
    assert.ok(declared, `${name} declares payload SHA256`);
    assert.equal(crypto.createHash('sha256').update(payloadOf(source)).digest('hex'), declared, `${name} payload SHA256`);
    const payload = payloadOf(source);
    const mutations = name === 'xm-excerpt.mjs' ? [['Y8=524288', 'Y8=524289']]
      : name === 'km-excerpt.mjs' ? [['function KM(', 'function KN(']]
      : name === 'chunk-8h7qs60z.mjs' ? [['function A2r(', 'function A2s(']]
      : name === 'stubs.mjs' ? [['210000', '210001']] : [];
    assert.ok(mutations.length, `${name} has a payload mutation`);
    for (const [before, after] of mutations) {
      assert.ok(payload.includes(before), `${name} mutation target exists`);
      const mutated = payload.replace(before, after);
      assert.notEqual(crypto.createHash('sha256').update(mutated).digest('hex'), declared, `${name} changed payload fails its declared SHA256`);
    }
  }
  const originalChunk = sourceFromFixture();
  assert.equal(crypto.createHash('sha256').update(originalChunk).digest('hex'), shaExpected);
  const kmPath = path.join(root, 'lib/test-fixtures/upstream-2.1.287/km-excerpt.mjs');
  const kmSrc = fs.readFileSync(kmPath, 'utf8');
  const excerpt = payloadOf(kmSrc);
  assert.equal(crypto.createHash('sha256').update(excerpt).digest('hex'), '363763f3c9f2a7e76aba7f4fc4759337f11f35e2340e8f234e291cf5e911f0cf');
  assert.ok(excerpt.includes('function KM(') && excerpt.includes('function YM()'));
});

test('upstream fixture recheck against extracted files', { skip: process.env.UPSTREAM_EXTRACT_DIR ? false : 'UPSTREAM_EXTRACT_DIR is unset; repository fixture hashes were checked above' }, () => {
  const original = fs.readFileSync(path.join(process.env.UPSTREAM_EXTRACT_DIR, 'chunk-8h7qs60z.js'), 'utf8');
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'), shaExpected);
});

test('shim SHA256 and CRC32 implementations work in every combination', () => {
  for (const [si, sha] of shaFns.entries()) for (const [ci, crc] of crcFns.entries()) {
    globalThis.Bun = bunFor(sha, crc);
    assert.equal(Bun.SHA256.hash('abc', 'base64'), 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=');
    assert.equal(Bun.hash.crc32('123456789'), 0xcbf43926, `sha ${si}, crc ${ci}`);
  }
});

test('mode 2 upstream A2r and Fzo gzip blocks round-trip at boundaries and with a dictionary', async () => {
  const { A2r, Fzo } = await import('./test-fixtures/upstream-2.1.287/chunk-8h7qs60z.mjs');
  globalThis.Bun = bunFor(shaFns[0], crcFns[0]);
  const clock = { monotonicNow: () => performance.now(), setTimeout: (fn, ms, opts) => { const t = setTimeout(fn, ms); if (opts?.unref) t.unref(); return () => clearTimeout(t); } };
  for (const [length, boundary] of [[524288, 131072], [524288, 131071], [524288, 131073], [524289, 131072], [655359, 131072], [655360, 131072], [655361, 131072]]) {
    const body = bodyOf(length, boundary), store = { blocks: new Map(), storedBytes: 0, maxStoredBytes: 210000, generation: 0, pooledCompression: Promise.resolve(), cancelIdleDrop: undefined };
    const prepared = A2r({ body: Buffer.from(body), level: 6, store, clock });
    const sizes = prepared.blocks.map(block => block.end - block.start);
    assert.ok(boundary <= 131072 ? sizes.includes(boundary) : sizes.includes(131072) && sizes.includes(1), `128 KiB boundary ${boundary}`);
    assert.ok(prepared.blocks.some(block => block.dictionaryStart < block.start), 'later block uses a preset dictionary');
    const compressed = await Fzo(prepared, store, clock);
    gunzipMatches(compressed, body);
    const changed = body.slice(0, -16) + 'changed-tail-123';
    const next = A2r({ body: Buffer.from(changed), level: 6, store, clock });
    const compressed2 = await Fzo(next, store, clock);
    assert.ok(next.reusedBlockCount > 0, `changed tail reuses blocks at ${length}`);
    gunzipMatches(compressed2, changed);
  }
});

test('mode 1 XM selects runtime first, then sends cached block gzip; mode 2 compresses immediately', async () => {
  const { A2r, Fzo, Ls: blockLs, P2r } = await import('./test-fixtures/upstream-2.1.287/chunk-8h7qs60z.mjs');
  const { XM, YM } = await import('./test-fixtures/upstream-2.1.287/xm-excerpt.mjs');
  const body = bodyOf(600000), store = { blocks: new Map(), storedBytes: 0, maxStoredBytes: 900000, generation: 0, pooledCompression: Promise.resolve(), cancelIdleDrop: undefined };
  const state = { fired: new Set(), once(key) { if (this.fired.has(key)) return false; this.fired.add(key); return true; }, gzipRequestBody: { blockStore: store, blocksSwitchedOff: false, blocksBuildGeneration: undefined, blockGzippedResponses: new WeakSet() } };
  const errors = [], logs = [];
  const clock = { monotonicNow: () => performance.now(), setTimeout: (fn, ms, opts) => { const timer = setTimeout(fn, ms); if (opts?.unref) timer.unref(); return () => clearTimeout(timer); } };
  globalThis.Bun = bunFor(shaFns[1], crcFns[1]); globalThis.a = { CLAUDE_CODE_GZIP_REQUEST_BODY_BLOCKS: 1 }; globalThis.C = () => 0; globalThis.q8 = 'tengu_buzzing_pike';
  globalThis.P2r=P2r; globalThis.A2r=A2r; globalThis.Fzo=Fzo; globalThis.Ls=()=>state; globalThis.LBt=()=>{}; globalThis.Z8=()=>()=>{}; globalThis.QM=(err)=>{state.qmError=String(err)+' '+err?.stack}; globalThis.OXe=class extends Error{}; globalThis.PXe=()=>{}; globalThis.t=(...args)=>logs.push(args); globalThis.p=()=>{}; globalThis.y=()=>{}; globalThis.d=(...args)=>errors.push(args);
  assert.equal(YM(),1);
  const init = { method:'POST', headers:{'content-type':'application/json'}, compress:'gzip', body, url:'https://api.anthropic.com/v1/messages' };
  const first = await XM(init, clock); assert.equal(first.init,init); assert.equal(first.init.headers['Content-Encoding'],undefined);
  assert.equal(state.gzipRequestBody.blocksSwitchedOff,false); assert.equal(typeof first.afterResponse,'function');
  first.afterResponse({ok:true});
  const keepAlive=setInterval(()=>{},50), deadline=performance.now()+10000;
  while(store.blocks.size===0 && performance.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10)); clearInterval(keepAlive);
  assert.ok(store.blocks.size>0,'real timer populated cache');
  const second=await XM(init,clock); assert.equal(typeof second.init.headers.get, 'function', `XM did not select gzip: cached ${store.blocks.size} blocks, switchedOff=${state.gzipRequestBody.blocksSwitchedOff}, error=${state.qmError}`); assert.equal(second.init.headers.get('Content-Encoding'),'gzip');
  assert.deepEqual(zlib.gunzipSync(second.init.body),Buffer.from(body)); assert.equal(state.gzipRequestBody.blocksSwitchedOff,false);
  globalThis.a.CLAUDE_CODE_GZIP_REQUEST_BODY_BLOCKS=2;
  const mode2=await XM(init,clock); assert.equal(mode2.init.headers.get('Content-Encoding'),'gzip'); assert.deepEqual(zlib.gunzipSync(mode2.init.body),Buffer.from(body));
  assert.deepEqual(errors, [], 'normal XM paths did not report unexpected errors');
  assert.deepEqual(logs, [], 'normal XM paths did not log unexpected warnings');
  for (const bun of [{hash:{crc32:crcFns[0]}},{SHA256:{hash:shaFns[0]}}]) {
    globalThis.Bun=bun; state.gzipRequestBody.blocksSwitchedOff=false; state.gzipRequestBody.blockStore={...store,blocks:new Map(),storedBytes:0,generation:0};
    const errorsBefore=errors.length, logsBefore=logs.length;
    const fallback=await XM(init,clock); assert.equal(fallback.init,init); assert.equal(fallback.init.headers['Content-Encoding'],undefined); assert.equal(state.gzipRequestBody.blocksSwitchedOff,'until_next_conversation');
    assert.equal(errors.length, errorsBefore+1, 'mutant failure was reported to the error handler');
    assert.equal(logs.length, logsBefore+1, 'mutant failure was logged by the upstream fallback');
  }
  for(const key of ['a','C','q8','P2r','A2r','Fzo','Ls','LBt','Z8','QM','OXe','PXe','t','p','y','d']) delete globalThis[key];
});

test('mutants without SHA256 or CRC32 fail or take the upstream failure path', async () => {
  const { A2r, Fzo } = await import('./test-fixtures/upstream-2.1.287/chunk-8h7qs60z.mjs');
  const body = Buffer.from(bodyOf(524288));
  globalThis.Bun = { hash: { crc32: crcFns[0] } };
  const store = { blocks: new Map(), storedBytes: 0, maxStoredBytes: 210000, generation: 0, pooledCompression: Promise.resolve(), cancelIdleDrop: undefined };
  assert.throws(() => A2r({ body, level: 6, store, clock: { monotonicNow: () => performance.now(), setTimeout } }), /hash/);
  globalThis.Bun = { SHA256: { hash: shaFns[0] } };
  globalThis.Bun = bunFor(shaFns[0], crcFns[0]);
  const clock = { monotonicNow: () => performance.now(), setTimeout: (fn, ms, options) => { const t = setTimeout(fn, ms); if (options?.unref) t.unref(); return () => clearTimeout(t); } };
  const state = A2r({ body, level: 6, store, clock });
  globalThis.Bun = { SHA256: { hash: shaFns[0] } };
  await assert.rejects(Fzo(state, store, clock), /crc32/);
});
