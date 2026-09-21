#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { analyzeCycleHoists, discoverHooksStandalonePatches, discoverOffsets, NotEsmChunkedError, main } = require('./termux-prepare-claude-native-version.js');
const { TRAILER } = require('../packages/claude-code/lib/bunfs-extract.js');

function makeTempDir(prefix) {
  const baseDir = process.env.TMPDIR || (process.env.PREFIX ? path.join(process.env.PREFIX, 'tmp') : os.tmpdir());
  return fs.mkdtempSync(path.join(baseDir, prefix));
}

test('analyzeCycleHoists: structural cycle + eager call', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    // File A imports B statically
    fs.writeFileSync(
      path.join(tempDir, 'A.js'),
      'import "/$bunfs/root/B.js";\nexport const someExport = "A";\n'
    );

    // File B requires A eagerly (at top level)
    fs.writeFileSync(
      path.join(tempDir, 'B.js'),
      'var x = import.meta.require("/$bunfs/root/A.js").someExport;\nexport const y = "B";\n'
    );

    const { cycleHoists, skippedAssets } = analyzeCycleHoists(tempDir);
    assert.equal(cycleHoists.length, 1);
    assert.deepEqual(cycleHoists[0], {
      file: 'B.js',
      targetModule: 'A.js',
      expectedOccurrences: 1,
      assertProperties: ['someExport'],
    });
    assert.deepEqual(skippedAssets, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: structural cycle + all-delayed calls', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    // File A imports B statically
    fs.writeFileSync(
      path.join(tempDir, 'A.js'),
      'import "/$bunfs/root/B.js";\nexport const someExport = "A";\n'
    );

    // File B requires A only inside a function (delayed)
    fs.writeFileSync(
      path.join(tempDir, 'B.js'),
      'function f() { var x = import.meta.require("/$bunfs/root/A.js").someExport; }\nexport const y = "B";\n'
    );

    const { cycleHoists, skippedAssets } = analyzeCycleHoists(tempDir);
    assert.equal(cycleHoists.length, 0);
    assert.deepEqual(skippedAssets, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: no cycle', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    // File A requires B
    fs.writeFileSync(
      path.join(tempDir, 'A.js'),
      'var x = import.meta.require("/$bunfs/root/B.js");\nexport const y = "A";\n'
    );

    // File B does not reference A at all
    fs.writeFileSync(
      path.join(tempDir, 'B.js'),
      'export const z = "B";\n'
    );

    const { cycleHoists, skippedAssets } = analyzeCycleHoists(tempDir);
    assert.equal(cycleHoists.length, 0);
    assert.deepEqual(skippedAssets, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: parse failure throws', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    // Valid file
    fs.writeFileSync(
      path.join(tempDir, 'A.js'),
      'export const a = 1;\n'
    );

    // Intentionally invalid JS
    fs.writeFileSync(
      path.join(tempDir, 'B.js'),
      'this is {{{ invalid syntax'
    );

    assert.throws(() => {
      analyzeCycleHoists(tempDir);
    }, /analyzeCycleHoists: .* file\(s\) failed to parse/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: chunk file parse failure still throws', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    fs.writeFileSync(path.join(tempDir, 'A.js'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(tempDir, 'chunk-bad.js'), 'this is {{{ invalid syntax');
    assert.throws(() => analyzeCycleHoists(tempDir), /failed to parse/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: non-chunk zstd assets are skipped and sorted', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    fs.writeFileSync(path.join(tempDir, 'A.js'), 'export const a = 1;\n');
    const zstd = Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), Buffer.from('xxxxxx')]);
    fs.writeFileSync(path.join(tempDir, 'z.js'), zstd);
    fs.writeFileSync(path.join(tempDir, 'a.js'), zstd);
    const { skippedAssets } = analyzeCycleHoists(tempDir);
    assert.deepEqual(skippedAssets, ['a.js', 'z.js']);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: non-chunk non-zstd parse failure still throws', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    fs.writeFileSync(path.join(tempDir, 'A.js'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(tempDir, 'g.js'), Buffer.concat([Buffer.from([0x1f, 0x8b, 0x08, 0x00]), Buffer.from('data')]));
    assert.throws(() => analyzeCycleHoists(tempDir), /failed to parse/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: chunk file with zstd magic still throws', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    fs.writeFileSync(path.join(tempDir, 'A.js'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(tempDir, 'chunk-z.js'), Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), Buffer.from('xxxxxx')]));
    assert.throws(() => analyzeCycleHoists(tempDir), /failed to parse/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: acorn version mismatch throws', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    // Create a minimal valid file
    fs.writeFileSync(
      path.join(tempDir, 'A.js'),
      'export const a = 1;\n'
    );

    assert.throws(() => {
      analyzeCycleHoists(tempDir, { acornVersionOverride: '9.9.9' });
    }, /analyzeCycleHoists: acorn version mismatch/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});


function withHooksFixture(files, fn) {
  const tempDir = makeTempDir('hooks-standalone-test-');
  try { for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(tempDir, name), content); return fn(tempDir); }
  finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
}
const qleSource = 'const qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';

test('discoverHooksStandalonePatches: local qle and hooksModule-independent audit', () => withHooksFixture({ 'chunk-x.js': qleSource + '({hooksModule:qle(import.meta.dir,x,y),[j|G]:1});' }, (dir) => assert.deepEqual(discoverHooksStandalonePatches(dir), [{ file: 'chunk-x.js', expectedOccurrences: 1 }])));
test('discoverHooksStandalonePatches: named import/export alias', () => withHooksFixture({ 'chunk-def.js': qleSource + 'export {qle as X};', 'chunk-use.js': 'import {X as qle} from "/$bunfs/root/chunk-def.js"; qle(import.meta.dir,x,y);' }, (dir) => assert.deepEqual(discoverHooksStandalonePatches(dir), [{ file: 'chunk-def.js', expectedOccurrences: 1 }])));
test('discoverHooksStandalonePatches: multiple covered occurrences produce one record', () => withHooksFixture({ 'chunk-x.js': qleSource + 'qle(import.meta.dir,x,y); qle(import.meta.dir,x,y);' }, (dir) => assert.deepEqual(discoverHooksStandalonePatches(dir), [{ file: 'chunk-x.js', expectedOccurrences: 1 }])));
test('discoverHooksStandalonePatches: zero dir and unrelated qle are empty', () => withHooksFixture({ 'chunk-x.js': qleSource + 'qle(Psr(x),x,y); import.meta.dirname;' }, (dir) => assert.deepEqual(discoverHooksStandalonePatches(dir), [])));
test('discoverHooksStandalonePatches: zstd assets skipped and results sorted', () => withHooksFixture({ 'chunk-real.js': qleSource + 'qle(import.meta.dir,x,y);', 'asset.js': Buffer.from([0x28,0xb5,0x2f,0xfd,0]) }, (dir) => assert.deepEqual(discoverHooksStandalonePatches(dir), [{ file: 'chunk-real.js', expectedOccurrences: 1 }])));
test('discoverHooksStandalonePatches: path/file and malformed positions reject', () => {
  const cases = ['foo(import.meta.path);', 'const d=import.meta.dir;', 'qle(x,import.meta.dir,y);', '({x:import.meta.dir});', 'x=import.meta.dir;', 'ns.qle(import.meta.dir,x,y);', 'qle?.(import.meta.dir,x,y);', '(await import("x")).qle(import.meta.dir,x,y);'];
  for (const source of cases) withHooksFixture({ 'chunk-bad.js': qleSource + source }, (dir) => assert.throws(() => discoverHooksStandalonePatches(dir), /chunk-bad\.js.*(G1|first argument|callee|optional|import\.meta\.path)/));
});
test('discoverHooksStandalonePatches: non-qle/default/namespace/missing/shadowed reject', () => {
  const cases = [
    { 'chunk-bad.js': 'const qle=(e,o,r)=>bad()?x(o,r()):{module:o,scan:e}; qle(import.meta.dir,x,y);' },
    { 'chunk-bad.js': 'import qle from "/$bunfs/root/chunk-def.js"; qle(import.meta.dir,x,y);', 'chunk-def.js': qleSource },
    { 'chunk-bad.js': 'import * as qle from "/$bunfs/root/chunk-def.js"; qle(import.meta.dir,x,y);', 'chunk-def.js': qleSource },
    { 'chunk-bad.js': 'qle(import.meta.dir,x,y);' },
    { 'chunk-bad.js': qleSource + 'function f(qle){ qle(import.meta.dir,x,y); }' },
    { 'chunk-bad.js': qleSource + 'const qle=1; qle(import.meta.dir,x,y);' },
  ];
  for (const files of cases) withHooksFixture(files, (dir) => assert.throws(() => discoverHooksStandalonePatches(dir), /G1|not qle-shaped|named import|failed to parse/));
});
test('discoverHooksStandalonePatches: export star/re-export and count mismatch reject', () => {
  for (const exportLine of ['export * from "/$bunfs/root/other.js";', 'export {qle} from "/$bunfs/root/other.js";']) withHooksFixture({ 'chunk-def.js': qleSource + exportLine, 'chunk-use.js': 'import {qle} from "/$bunfs/root/chunk-def.js"; qle(import.meta.dir,x,y);', 'other.js': qleSource }, (dir) => assert.throws(() => discoverHooksStandalonePatches(dir), /export|re-export|G1/));
  withHooksFixture({ 'chunk-x.js': qleSource + 'const text="' + qleSource + '"; qle(import.meta.dir,x,y);' }, (dir) => assert.throws(() => discoverHooksStandalonePatches(dir), /AST\/regex count mismatch/));
});
test('discoverHooksStandalonePatches: parse and acorn version failures', () => {
  withHooksFixture({ 'chunk-bad.js': 'this is {{{ invalid' }, (dir) => assert.throws(() => discoverHooksStandalonePatches(dir), /failed to parse/));
  withHooksFixture({ 'chunk-ok.js': 'export const x=1;' }, (dir) => assert.throws(() => discoverHooksStandalonePatches(dir, { acornVersionOverride: '9.9.9' }), /acorn version mismatch/));
});
test('discoverOffsets: non-ESM falls through, audit errors do not', () => withHooksFixture({ bin: 'x' }, (dir) => {
  const bin=path.join(dir,'bin'); const legacy=discoverOffsets(bin,dir,{discoverEsmChunkedOffsets:()=>{throw new NotEsmChunkedError('not esm');},discoverLegacyCjsOffsets:()=>({entry_format:'legacy-cjs'})}); assert.equal(legacy.entry_format,'legacy-cjs');
  let called=false; assert.throws(()=>discoverOffsets(bin,dir,{discoverEsmChunkedOffsets:()=>{throw new Error('audit failed');},discoverLegacyCjsOffsets:()=>{called=true;return null;}}),/audit failed/); assert.equal(called,false);
}));
test('discoverOffsets: malformed graph with trailer rejects without legacy detection', () => withHooksFixture({ bin: Buffer.concat([Buffer.from('malformed graph'), TRAILER]) }, (dir) => {
  const bin = path.join(dir, 'bin');
  let called = 0;
  assert.throws(() => discoverOffsets(bin, dir, { discoverLegacyCjsOffsets: () => { called += 1; return { entry_format: 'legacy-cjs' }; } }), /invalid trailer position/);
  assert.equal(called, 0);
}));
test('discoverOffsets: binary without trailer falls through to legacy detection', () => withHooksFixture({ bin: Buffer.from('no standalone module graph trailer') }, (dir) => {
  const bin = path.join(dir, 'bin');
  let called = 0;
  const result = discoverOffsets(bin, dir, { discoverLegacyCjsOffsets: () => { called += 1; return { entry_format: 'legacy-cjs' }; } });
  assert.equal(result.entry_format, 'legacy-cjs');
  assert.equal(called, 1);
}));
test('discoverOffsets: cycle analysis failure does not call legacy detector', () => withHooksFixture({ bin: 'x' }, (dir) => { let called=false; assert.throws(() => discoverOffsets(path.join(dir,'bin'),dir,{discoverEsmChunkedOffsets:()=>{throw new Error('cycle failed');},discoverLegacyCjsOffsets:()=>{called=true;return null;}}),/cycle failed/); assert.equal(called,false); }));
test('discoverOffsets: non-ESM/non-legacy preserves error wording', () => withHooksFixture({ bin: 'x' }, (dir) => assert.throws(() => discoverOffsets(path.join(dir,'bin'),dir,{discoverEsmChunkedOffsets:()=>{throw new NotEsmChunkedError('not esm');},discoverLegacyCjsOffsets:()=>null}), /failed to find embedded JS start marker.*legacy-cjs marker also not found/)));
test('main: discovery/fetch failure never logs offsets', () => { const logs=[]; assert.throws(()=>main({resolveVersion:()=> 'test',fetchNativeTarball:()=>{throw new Error('fetch stop');},log:(v)=>logs.push(v)}),/fetch stop/); assert.deepEqual(logs,[]); });
test('main: discoverOffsets failure never logs offsets', () => { const logs=[]; assert.throws(()=>main({resolveVersion:()=> 'test',fetchNativeTarball:(spec,packDir)=>{const tgz=path.join(packDir,'x.tgz');fs.writeFileSync(tgz,'tgz');return {tgzPath:tgz,tarballIntegrity:'x'};},run:(cmd,args)=>{fs.mkdirSync(path.join(args[3],'package','app','node_modules','@anthropic-ai','claude-code-linux-arm64'),{recursive:true});fs.writeFileSync(path.join(args[3],'package','app','node_modules','@anthropic-ai','claude-code-linux-arm64','claude'),'x');},discoverOffsets:()=>{throw new Error('discover failed');},log:(v)=>logs.push(v)}),/discover failed/); assert.deepEqual(logs,[]); });
test('main: successful result retains hooks_standalone_patches', () => {
  const work=makeTempDir('main-success-'); const logs=[]; try { const result=main({ resolveVersion:()=> 'test', fetchNativeTarball:(spec,packDir)=>{ const tgz=path.join(packDir,'x.tgz'); fs.writeFileSync(tgz,'tgz'); return {tgzPath:tgz,tarballIntegrity:'sha512-x'}; }, run:(cmd,args)=>{ fs.mkdirSync(path.join(args[3],'package','app','node_modules','@anthropic-ai','claude-code-linux-arm64'),{recursive:true}); fs.writeFileSync(path.join(args[3],'package','app','node_modules','@anthropic-ai','claude-code-linux-arm64','claude'),'x'); }, discoverOffsets:()=>({entry_format:'esm-chunked',hooks_standalone_patches:[{file:'chunk-q.js',expectedOccurrences:1}]}), log:(value)=>logs.push(value) }); assert.deepEqual(result.hooks_standalone_patches,[{file:'chunk-q.js',expectedOccurrences:1}]); assert.ok(logs.length>0); } finally { fs.rmSync(work,{recursive:true,force:true}); }
});
test('discoverHooksStandalonePatches: real 278 evidence fixture, when present', { skip: !process.env.CLAUDE_HOOKS_EVIDENCE_DIR ? 'CLAUDE_HOOKS_EVIDENCE_DIR が未設定' : false }, () => {
  const evidenceDir = process.env.CLAUDE_HOOKS_EVIDENCE_DIR;
  const chunkNames = ['7nckpqfv','exqqq1gf','rwsfe8md','6dtj2122','0sbxmwr4'];
  for (const n of chunkNames) {
    const file = path.join(evidenceDir, '278_chunk-' + n + '.js');
    if (!fs.existsSync(file)) throw new Error(`Evidence file not found: ${file}`);
  }
  const dir=makeTempDir('hooks-evidence-'); try { for (const n of chunkNames) fs.copyFileSync(path.join(evidenceDir,'278_chunk-'+n+'.js'),path.join(dir,'chunk-'+n+'.js')); assert.deepEqual(discoverHooksStandalonePatches(dir),[{file:'chunk-7nckpqfv.js',expectedOccurrences:1}]); } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
