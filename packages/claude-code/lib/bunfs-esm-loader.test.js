'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// ESM test ファイルから CommonJS で import できないため、
// ここでは基本的な構造をテストする
test('bunfs-esm-loader module exports initialize, resolve, load functions', async () => {
  // ESM モジュールを動的 import でテストする
  const loader = await import('./bunfs-esm-loader.mjs');
  assert.equal(typeof loader.initialize, 'function');
  assert.equal(typeof loader.resolve, 'function');
  assert.equal(typeof loader.load, 'function');
});

test('resolve() handles child_process and node:child_process specifiers', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const guardPath = path.join(tempDir, 'guard.mjs');
  fs.writeFileSync(guardPath, 'export default {};');

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: guardPath,
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    const nextResolve = (spec, ctx) => ({ url: `unresolved:${spec}` });

    // child_process should resolve to childProcessGuardPath
    const result1 = loader.resolve('child_process', { parentURL: pathToFileURL(path.join(tempDir, 'dummy-chunk.js')).href }, nextResolve);
    assert.ok(result1.url.includes(guardPath));
    assert.equal(result1.shortCircuit, true);

    // node:child_process should also resolve to childProcessGuardPath
    const result2 = loader.resolve('node:child_process', { parentURL: pathToFileURL(path.join(tempDir, 'dummy-chunk.js')).href }, nextResolve);
    assert.ok(result2.url.includes(guardPath));
    assert.equal(result2.shortCircuit, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolve() handles vm and node:vm specifiers', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const vmGuardPath = path.join(tempDir, 'vm-guard.mjs');
  fs.writeFileSync(vmGuardPath, 'export default {};');

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: vmGuardPath,
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    const nextResolve = (spec, ctx) => ({ url: `unresolved:${spec}` });

    // vm should resolve to vmGuardPath
    const result1 = loader.resolve('vm', { parentURL: pathToFileURL(path.join(tempDir, 'dummy-chunk.js')).href }, nextResolve);
    assert.ok(result1.url.includes(vmGuardPath));
    assert.equal(result1.shortCircuit, true);

    // node:vm should also resolve to vmGuardPath
    const result2 = loader.resolve('node:vm', { parentURL: pathToFileURL(path.join(tempDir, 'dummy-chunk.js')).href }, nextResolve);
    assert.ok(result2.url.includes(vmGuardPath));
    assert.equal(result2.shortCircuit, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolve() handles ws specifier', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const wsStubPath = path.join(tempDir, 'ws-stub.mjs');
  fs.writeFileSync(wsStubPath, 'export default {};');

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: wsStubPath,
    });

    const nextResolve = (spec, ctx) => ({ url: `unresolved:${spec}` });

    const result = loader.resolve('ws', { parentURL: pathToFileURL(path.join(tempDir, 'dummy-chunk.js')).href }, nextResolve);
    assert.ok(result.url.includes(wsStubPath));
    assert.equal(result.shortCircuit, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolve() resolves /$bunfs/root/ specifiers to real files in processOwnedDir', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Create a dummy file in processOwnedDir
  const dummyFile = path.join(tempDir, 'foo.js');
  fs.writeFileSync(dummyFile, 'export const foo = 1;');

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    const nextResolve = async (spec, ctx) => ({ url: `unresolved:${spec}` });

    const result = await loader.resolve('/$bunfs/root/foo.js', {}, nextResolve);
    assert.ok(result.url.includes('foo.js'));
    assert.equal(result.shortCircuit, true);
    assert.equal(result.format, 'module');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolve() rejects path traversal with ..', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    const nextResolve = (spec, ctx) => ({ url: `unresolved:${spec}` });

    assert.throws(
      () => loader.resolve('/$bunfs/root/../../etc/passwd', {}, nextResolve),
      /rejected specifier|escapes/,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolve() rejects absolute paths', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    const nextResolve = (spec, ctx) => ({ url: `unresolved:${spec}` });

    assert.throws(
      () => loader.resolve('/$bunfs/root//etc/passwd', {}, nextResolve),
      /rejected specifier|escapes/,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolve() throws error for missing extracted module', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    const nextResolve = (spec, ctx) => ({ url: `unresolved:${spec}` });

    assert.throws(
      () => loader.resolve('/$bunfs/root/nonexistent.js', {}, nextResolve),
      /missing extracted module/,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolve() calls nextResolve for unknown specifiers', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    let nextResolveCalled = false;
    const nextResolve = async (spec, ctx) => {
      nextResolveCalled = true;
      return { url: `unresolved:${spec}` };
    };

    await loader.resolve('some-unknown-package', {}, nextResolve);
    assert.equal(nextResolveCalled, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('load() returns source as-is when import.meta.require is not present', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const testFile = path.join(tempDir, 'test.js');
  const sourceCode = 'export const x = 1;';
  fs.writeFileSync(testFile, sourceCode);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    const fileUrl = pathToFileURL(testFile).href;
    const result = await loader.load(fileUrl, {}, async () => ({ source: 'fallback' }));

    assert.equal(result.format, 'module');
    assert.equal(result.source, sourceCode);
    assert.equal(result.shortCircuit, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('load() injects polyfill prelude when import.meta.require is present', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const testFile = path.join(tempDir, 'test.js');
  const sourceCode = 'const cp = import.meta.require("child_process");';
  fs.writeFileSync(testFile, sourceCode);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    const fileUrl = pathToFileURL(testFile).href;
    const result = await loader.load(fileUrl, {}, async () => ({ source: 'fallback' }));

    assert.equal(result.format, 'module');
    assert.ok(result.source.includes('__bunfsMetaRequire'));
    assert.ok(result.source.includes('import __bunfsGuardedChildProcess'));
    assert.ok(result.source.includes('import __bunfsGuardedVm'));
    // Check that import.meta.require was replaced with __bunfsMetaRequire
    assert.ok(result.source.includes('__bunfsMetaRequire("child_process")'));
    assert.ok(!result.source.includes('import.meta.require("child_process")'));
    assert.equal(result.shortCircuit, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('load() calls nextLoad for URLs outside processOwnedDir', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    let nextLoadCalled = false;
    const nextLoad = async (url, ctx) => {
      nextLoadCalled = true;
      return { source: 'fallback', format: 'module' };
    };

    await loader.load('file:///some/other/path/module.js', {}, nextLoad);
    assert.equal(nextLoadCalled, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('load() hoists the cycle-breaking import.meta.require call in chunk-vmw9kxhv.js', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-hoist-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  fs.writeFileSync(path.join(tempDir, 'chunk-y0jj307t.js'), 'export const daemonColdStartGbDefault = () => "fixture";\n');
  const targetFile = path.join(tempDir, 'chunk-vmw9kxhv.js');
  const sourceCode = 'var O9=import.meta.require("/$bunfs/root/chunk-y0jj307t.js");\nexport const value = O9.daemonColdStartGbDefault();\n';
  fs.writeFileSync(targetFile, sourceCode);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      cycleHoists: [{ file: 'chunk-vmw9kxhv.js', targetModule: 'chunk-y0jj307t.js', expectedOccurrences: 1, assertProperties: [] }],
    });

    const fileUrl = pathToFileURL(targetFile).href;
    const result = await loader.load(fileUrl, {}, async () => ({ source: 'fallback' }));

    assert.equal(result.format, 'module');
    assert.ok(result.source.includes('import * as __bunfsHoisted_0 from'));
    assert.ok(!result.source.includes('var O9=import.meta.require('));
    assert.ok(result.source.includes('var O9=__bunfsHoisted_0'));
    assert.equal(result.shortCircuit, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('import.meta.require resolves /$bunfs/root/ specifiers via loader integration', async () => {
  const { registerHooks } = await import('node:module');
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-integration-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Create guard files
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    // Create ESM fixture that will be required via import.meta.require (normal case).
    // PROCESS_OWNED_DIR only ever contains genuine ESM chunk files extracted from the
    // Bun esm-chunked bundle (verified against a real 2.1.248 extraction: 0 of 1768
    // chunk files are CommonJS), so load() always returns format: 'module' for this dir.
    fs.writeFileSync(path.join(tempDir, 'foo.js'), 'export const value = 42;');

    // Create ESM files for each test scenario
    const okCallerPath = path.join(tempDir, 'ok-caller.mjs');
    fs.writeFileSync(okCallerPath, 'export const result = import.meta.require("/$bunfs/root/foo.js").value;\n');

    const traversalCallerPath = path.join(tempDir, 'traversal-caller.mjs');
    fs.writeFileSync(traversalCallerPath, 'import.meta.require("/$bunfs/root/../../etc/passwd");\n');

    const missingCallerPath = path.join(tempDir, 'missing-caller.mjs');
    fs.writeFileSync(missingCallerPath, 'import.meta.require("/$bunfs/root/nonexistent.js");\n');

    // Register loader (only once) with data
    const sourceBin = path.join(tempDir, 'dummy-bin');
    fs.writeFileSync(sourceBin, '#!/bin/false');

    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: sourceBin,
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      cycleHoists: [
        { file: 'chunk-vmw9kxhv.js', targetModule: 'chunk-y0jj307t.js', expectedOccurrences: 1, assertProperties: [] },
      ],
    });
    registerHooks({ resolve: loader.resolve, load: loader.load });

    // Test 1: Normal case - should load and resolve correctly
    const okModule = await import(pathToFileURL(okCallerPath).href);
    assert.equal(okModule.result, 42);

    // Test 2: Path traversal rejection - should throw error
    await assert.rejects(
      () => import(pathToFileURL(traversalCallerPath).href),
      /rejected specifier|escapes/,
    );

    // Test 3: Missing module rejection - should throw error
    await assert.rejects(
      () => import(pathToFileURL(missingCallerPath).href),
      /missing extracted module/,
    );

    // Cycle regression proof: a generic sync-require-into-in-flight-static-import cycle
    // must throw ERR_REQUIRE_CYCLE_MODULE when NOT hoisted (proves our understanding of
    // the bug mechanism is correct, independent of the real chunk-y0jj307t.js file).
    fs.writeFileSync(
      path.join(tempDir, 'chunk-cycle-demo-target.js'),
      'import "/$bunfs/root/chunk-vmw9kxhv-a.js";\nexport const daemonColdStartGbDefault = () => "fixture";\n',
    );
    fs.writeFileSync(
      path.join(tempDir, 'chunk-vmw9kxhv-a.js'),
      'var O9X=import.meta.require("/$bunfs/root/chunk-cycle-demo-target.js");\nexport const value = O9X;\n',
    );
    await assert.rejects(
      () => import(pathToFileURL(path.join(tempDir, 'chunk-vmw9kxhv-a.js')).href),
      (err) => {
        assert.equal(err.code, 'ERR_REQUIRE_CYCLE_MODULE');
        return true;
      },
    );

    // Cycle fix proof: the real chunk-vmw9kxhv.js / chunk-y0jj307t.js pair (exact filenames
    // and declaration text that tryHoistCycleBreakingImport() targets) must resolve cleanly
    // once hoisting is applied, and the hoisted namespace's property access must work.
    fs.writeFileSync(
      path.join(tempDir, 'chunk-y0jj307t.js'),
      'import "/$bunfs/root/chunk-vmw9kxhv.js";\nexport const daemonColdStartGbDefault = () => "fixture";\n',
    );
    fs.writeFileSync(
      path.join(tempDir, 'chunk-vmw9kxhv.js'),
      'var O9=import.meta.require("/$bunfs/root/chunk-y0jj307t.js");\nexport const value = O9.daemonColdStartGbDefault();\n',
    );
    const hoistedModule = await import(pathToFileURL(path.join(tempDir, 'chunk-vmw9kxhv.js')).href);
    assert.equal(hoistedModule.value, 'fixture');

    fs.writeFileSync(path.join(tempDir, 'doc.md'), '# Hello\nSome markdown text.\n');
    fs.writeFileSync(
      path.join(tempDir, 'md-caller.mjs'),
      'export const result = import.meta.require("/$bunfs/root/doc.md");\n',
    );
    const mdModule = await import(pathToFileURL(path.join(tempDir, 'md-caller.mjs')).href);
    assert.equal(typeof mdModule.result, 'string');
    assert.equal(mdModule.result, '# Hello\nSome markdown text.\n');

    fs.writeFileSync(path.join(tempDir, 'note.txt'), 'plain text content');
    fs.writeFileSync(
      path.join(tempDir, 'txt-caller.mjs'),
      'export const result = import.meta.require("/$bunfs/root/note.txt");\n',
    );
    const txtModule = await import(pathToFileURL(path.join(tempDir, 'txt-caller.mjs')).href);
    assert.equal(typeof txtModule.result, 'string');
    assert.equal(txtModule.result, 'plain text content');

    fs.writeFileSync(
      path.join(tempDir, 'chunk-alias.js'),
      'export const ee = import.meta.require;\n',
    );
    fs.writeFileSync(
      path.join(tempDir, 'alias-caller.mjs'),
      'import { ee } from "/$bunfs/root/chunk-alias.js";\nexport const result = ee("/$bunfs/root/doc.md");\n',
    );
    const aliasModule = await import(pathToFileURL(path.join(tempDir, 'alias-caller.mjs')).href);
    assert.equal(aliasModule.result, '# Hello\nSome markdown text.\n');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// Recovery tests for missing module scenario

// T1: resolve() がチャンク欠落を回復する
test('T1: resolve() recovers chunk deletion by calling reExtract', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-recovery-t1-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary content');
    const guardPath = path.join(tempDir, 'guard.mjs');
    fs.writeFileSync(guardPath, 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    const targetFile = path.join(tempDir, 'target.js');
    fs.writeFileSync(targetFile, 'export const x = 1;');

    let reExtractCalls = 0;
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: sourceBin,
      childProcessGuardPath: guardPath,
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      reExtract: (sb, od) => {
        reExtractCalls++;
        fs.writeFileSync(targetFile, 'export const x = 1;');
      },
    });

    // Delete file
    fs.unlinkSync(targetFile);

    // resolve() should trigger recovery
    const result = loader.resolve('/$bunfs/root/target.js', {}, () => ({}));
    assert.ok(result.url);
    assert.equal(reExtractCalls, 1);
    assert.ok(fs.existsSync(targetFile));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// T2: load() が readFileSync ENOENT を回復する
test('T2: load() recovers readFileSync ENOENT by calling reExtract', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-recovery-t2-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary content');
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    const targetFile = path.join(tempDir, 'target.js');
    const originalSource = 'export const y = 2;';
    fs.writeFileSync(targetFile, originalSource);

    let reExtractCalls = 0;
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: sourceBin,
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      reExtract: () => {
        reExtractCalls++;
        fs.writeFileSync(targetFile, originalSource);
      },
    });

    // Delete file
    fs.unlinkSync(targetFile);

    // load() should trigger recovery
    const result = await loader.load(pathToFileURL(targetFile).href, {}, async () => ({}));
    assert.ok(result.source);
    assert.equal(reExtractCalls, 1);
    assert.ok(result.source.includes('y = 2'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// T3: tryHoistCycleBreakingImports の hoist 対象欠落を回復する
test('T3: tryHoistCycleBreakingImports recovers missing hoist target', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-recovery-t3-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary content');
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    const srcFile = path.join(tempDir, 'src.js');
    fs.writeFileSync(srcFile, 'import.meta.require("/$bunfs/root/tgt.js");\n');

    const tgtFile = path.join(tempDir, 'tgt.js');
    fs.writeFileSync(tgtFile, 'export const target = 1;');

    let reExtractCalls = 0;
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: sourceBin,
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      cycleHoists: [{ file: 'src.js', targetModule: 'tgt.js', expectedOccurrences: 1, assertProperties: [] }],
      reExtract: () => {
        reExtractCalls++;
        fs.writeFileSync(tgtFile, 'export const target = 1;');
      },
    });

    // Delete target
    fs.unlinkSync(tgtFile);

    // load() should trigger hoisting and recovery
    const result = await loader.load(pathToFileURL(srcFile).href, {}, async () => ({}));
    assert.ok(result.source);
    assert.equal(reExtractCalls, 1);
    assert.ok(result.source.includes('__bunfsHoisted_'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// T4: recoverMissing 直接 — 失敗上限 MAX_CONSEC_FAILURES=3
test('T4: recoverMissing respects MAX_CONSEC_FAILURES limit of 3', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-recovery-t4-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary content');
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    const missingPath = path.join(tempDir, 'missing.js');

    let reExtractCalls = 0;
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: sourceBin,
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      reExtract: () => {
        reExtractCalls++;
        // Do not recreate file - simulate failure
      },
    });

    // Call recoverMissing 4 times with advancing time
    const result1 = loader.recoverMissing(missingPath, 0);
    const result2 = loader.recoverMissing(missingPath, 10000);
    const result3 = loader.recoverMissing(missingPath, 20000);
    const result4 = loader.recoverMissing(missingPath, 30000);

    assert.equal(result1, false);
    assert.equal(result2, false);
    assert.equal(result3, false);
    assert.equal(result4, false);
    assert.equal(reExtractCalls, 3, 'reExtract should be called exactly 3 times (MAX_CONSEC_FAILURES)');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// T5: recoverMissing 直接 — 連続失敗カウンタは成功でリセット
test('T5: recoverMissing resets consecutive failures counter on success', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-recovery-t5-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary content');
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    const testPath = path.join(tempDir, 'test.js');

    let shouldRestore = false;
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: sourceBin,
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      reExtract: () => {
        if (shouldRestore) {
          fs.writeFileSync(testPath, 'export const z = 3;');
        }
      },
    });

    // Attempt 1: recovery fails (no file created)
    shouldRestore = false;
    const r1 = loader.recoverMissing(testPath, 0);
    assert.equal(r1, false);

    // Attempt 2: recovery succeeds (file created)
    shouldRestore = true;
    const r2 = loader.recoverMissing(testPath, 5000);
    assert.equal(r2, true);

    // Delete the file again
    fs.unlinkSync(testPath);

    // Attempt 3: failure again, but counter was reset
    shouldRestore = false;
    const r3 = loader.recoverMissing(testPath, 10000);
    assert.equal(r3, false);

    // Attempt 4: success again (not yet hit limit)
    shouldRestore = true;
    const r4 = loader.recoverMissing(testPath, 15000);
    assert.equal(r4, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// T6: recoverMissing 直接 — 3s スロットル
test('T6: recoverMissing throttles re-extraction for 3 seconds', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-recovery-t6-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary content');
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    const missingPath = path.join(tempDir, 'missing.js');

    let reExtractCalls = 0;
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: sourceBin,
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      reExtract: () => {
        reExtractCalls++;
      },
    });

    // Call at time 10000 (base time)
    loader.recoverMissing(missingPath, 10000);
    assert.equal(reExtractCalls, 1);

    // Call at time 11000 (only 1s later, < 3s throttle)
    loader.recoverMissing(missingPath, 11000);
    assert.equal(reExtractCalls, 1, 'throttled - should not call reExtract');

    // Call at time 14000 (4s later, > 3s throttle)
    loader.recoverMissing(missingPath, 14000);
    assert.equal(reExtractCalls, 2);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// T7: TOCTOU — 2回連続で回復できることを確認
test('T7: recoverMissing handles repeated deletion and recovery', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-recovery-t7-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary content');
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    const targetFile = path.join(tempDir, 'target.js');
    fs.writeFileSync(targetFile, 'export const x = 1;');

    let reExtractCalls = 0;
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: sourceBin,
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      reExtract: (sb, od) => {
        reExtractCalls++;
        fs.writeFileSync(targetFile, 'export const x = 1;');
      },
    });

    // First recovery at time 10000
    fs.unlinkSync(targetFile);
    // Use recoverMissing with explicit time to bypass throttle
    loader.recoverMissing(targetFile, 10000);
    assert.ok(fs.existsSync(targetFile));
    assert.equal(reExtractCalls, 1);

    // Second recovery at time 14000 (past throttle window)
    fs.unlinkSync(targetFile);
    loader.recoverMissing(targetFile, 14000);
    assert.ok(fs.existsSync(targetFile));
    assert.equal(reExtractCalls, 2);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// T8 (最重要): real が存在するのに require 失敗 → 再展開しない
test('T8: recoverMissing does not re-extract when real file exists', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-recovery-t8-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary content');
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    const realExistsFile = path.join(tempDir, 'real-exists.js');
    // Create a file that exists but would throw MODULE_NOT_FOUND on require
    fs.writeFileSync(realExistsFile, 'throw new Error("internal dependency error");');

    let reExtractCalls = 0;
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: sourceBin,
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      reExtract: () => {
        reExtractCalls++;
      },
    });

    // Call recoverMissing with existing file
    const result = loader.recoverMissing(realExistsFile, Date.now());
    assert.equal(result, true, 'should return true for existing file');
    assert.equal(reExtractCalls, 0, 'reExtract should not be called for existing file');

    // Verify the prelude guards against error-code-based recovery for real files
    const srcFile = path.join(tempDir, 'src.js');
    fs.writeFileSync(srcFile, 'import.meta.require("/$bunfs/root/real-exists.js");');
    const result2 = await loader.load(pathToFileURL(srcFile).href, {}, async () => ({}));
    assert.ok(result2.source);
    // The source should have __bunfsMetaRequireExistsSync guard (not error-code-based)
    assert.ok(result2.source.includes('__bunfsMetaRequireExistsSync'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
