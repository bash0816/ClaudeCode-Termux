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

// T8-exec: recoverMissing の no-reextract-when-file-exists を実行確認
test('T8-exec: recoverMissing returns true immediately for an existing file without calling reExtract, even under repeated calls', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-t8exec-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary');
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    // 存在する実ファイル (require すれば内部依存 MODULE_NOT_FOUND を投げる想定の中身)
    const realExists = path.join(tempDir, 'has-internal-dep.js');
    fs.writeFileSync(realExists, "module.exports = require('/definitely/not/here.js');");

    let reExtractCalls = 0;
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin,
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      reExtract: () => { reExtractCalls++; },
    });

    // ファイルが存在する限り、何度呼んでも即 true・再展開ゼロ
    for (let i = 0; i < 5; i++) {
      const r = loader.recoverMissing(realExists, i * 10000);
      assert.equal(r, true, `call ${i} should return true (file exists)`);
    }
    assert.equal(reExtractCalls, 0, 'reExtract must never be called while the target file exists');

    // 実際に require が内部依存で投げることも確認 (元例外が保持されるべき挙動の裏付け)
    let threw = null;
    try { require(realExists); } catch (e) { threw = e; }
    assert.ok(threw, 'require of the file should throw due to its missing internal dependency');
    assert.equal(reExtractCalls, 0, 'a require-time internal MODULE_NOT_FOUND must not trigger re-extraction');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// New tests for fs interception functionality

test('resolveBunfsPath: non-target paths return null', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-resolve-path-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    const result = loader.resolveBunfsPath('/regular/path/file.js');
    assert.equal(result, null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveBunfsPath: rejects path traversal with ..', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-resolve-path-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    assert.throws(
      () => loader.resolveBunfsPath('/$bunfs/root/../../etc/passwd'),
      /rejected specifier/,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('resolveBunfsPath: resolves valid /$bunfs/root/ paths correctly', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-resolve-path-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const targetFile = path.join(tempDir, 'foo.js');
  fs.writeFileSync(targetFile, 'export const x = 1;');

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    const result = loader.resolveBunfsPath('/$bunfs/root/foo.js');
    assert.ok(result);
    assert.equal(result, targetFile);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('syncBuiltinESMExports: fs interception requires it for ESM sync', async () => {
  // installFsBunfsInterception() 自体を、G1/G4 で terra が実機確認した正しい順序
  // (ESM fixture を先に import してバインディング確定 → fs 差替え(sync前)は旧関数 →
  // sync 後は新関数) で検証する。ハンドロールした模擬ではなく実装本体を子プロセスで実行する。
  const { spawnSync } = require('node:child_process');
  const tempDir = path.join(os.tmpdir(), `bunfs-sync-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const loaderPath = path.join(__dirname, 'bunfs-esm-loader.mjs');

  try {
    const targetFile = path.join(tempDir, 'target.js');
    fs.writeFileSync(targetFile, 'export const marker = "REAL_CONTENT";');
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary content');

    // fixture.mjs: ESM named import を先に確立する側 (installFsBunfsInterception より前に
    // dynamic import することで、バインディングが patch 前の状態で確定する)
    const fixturePath = path.join(tempDir, 'fixture.mjs');
    fs.writeFileSync(fixturePath, `
import { readFileSync } from 'node:fs';
export function readIt(p) { return readFileSync(p, 'utf8'); }
`);

    const testScript = path.join(tempDir, 'test-sync.mjs');
    fs.writeFileSync(testScript, `
const tempDir = ${JSON.stringify(tempDir)};
const targetFile = ${JSON.stringify(targetFile)};

// 1. ESM fixture を先に import (バインディングを patch 前の状態で確定させる)
const { readIt } = await import(${JSON.stringify(pathToFileURL(fixturePath).href)});

// 2. installFsBunfsInterception() 未適用の状態での素の読み込み確認 (対照)
const before = readIt(targetFile);
if (before !== 'export const marker = "REAL_CONTENT";') {
  console.error('SETUP_FAILED: fixture cannot read target file before patch');
  process.exit(1);
}

// 3. fs を差し替える (installFsBunfsInterception 経由、syncBuiltinESMExports 込み)
const loader = await import(${JSON.stringify(pathToFileURL(loaderPath).href)});
loader.initialize({
  processOwnedDir: tempDir,
  sourceBin: ${JSON.stringify(sourceBin)},
  childProcessGuardPath: ${JSON.stringify(path.join(tempDir, 'guard.mjs'))},
  vmGuardPath: ${JSON.stringify(path.join(tempDir, 'vm-guard.mjs'))},
  wsStubPath: ${JSON.stringify(path.join(tempDir, 'ws-stub.mjs'))},
});
loader.installFsBunfsInterception();

// 4. 先に確立した ESM バインディング経由で /$bunfs/root/ パスを読む
//    → syncBuiltinESMExports() が正しく効いていれば、fixture の readFileSync も
//    パッチ後の関数を参照し、bunfs パス解決が機能するはず
const afterViaBinding = readIt('/$bunfs/root/target.js');
if (afterViaBinding !== 'export const marker = "REAL_CONTENT";') {
  console.error('SYNC_FAILED: pre-bound ESM readFileSync did not pick up the fs interception patch');
  process.exit(1);
}
console.log('SYNC_OK');
process.exit(0);
`);

    const result = spawnSync('node', [testScript], { encoding: 'utf8' });
    assert.equal(result.status, 0, `Script failed (status=${result.status}): stdout=${result.stdout} stderr=${result.stderr}`);
    assert.ok(result.stdout.includes('SYNC_OK'), `expected SYNC_OK marker, got: ${result.stdout}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('fs.readFile callback mode: resolves /$bunfs/root/ paths', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-fs-readfile-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const testFile = path.join(tempDir, 'test.js');
  const testContent = 'export const y = 42;';
  fs.writeFileSync(testFile, testContent);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    loader.installFsBunfsInterception();

    // After interception is installed, fs.readFile should resolve bunfs paths
    const testFsModule = require('node:fs');
    let callbackCalled = false;
    let readData = null;

    testFsModule.readFile('/$bunfs/root/test.js', 'utf8', (err, data) => {
      callbackCalled = true;
      if (!err) {
        readData = data;
      }
    });

    // Give callback time to execute
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(callbackCalled, true);
    assert.equal(readData, testContent);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('fs.readFile with options: resolves /$bunfs/root/ paths', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-fs-readfile-opts-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const testFile = path.join(tempDir, 'test.txt');
  const testContent = 'Hello World';
  fs.writeFileSync(testFile, testContent);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    loader.installFsBunfsInterception();

    const testFsModule = require('node:fs');
    let callbackCalled = false;
    let readData = null;

    testFsModule.readFile('/$bunfs/root/test.txt', { encoding: 'utf8' }, (err, data) => {
      callbackCalled = true;
      if (!err) {
        readData = data;
      }
    });

    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(callbackCalled, true);
    assert.equal(readData, testContent);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('fs.readFileSync: non-bunfs paths unchanged after interception', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-fs-normal-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const normalFile = path.join(tempDir, 'normal.txt');
  const normalContent = 'Normal File Content';
  fs.writeFileSync(normalFile, normalContent);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    loader.installFsBunfsInterception();

    const testFsModule = require('node:fs');
    const data = testFsModule.readFileSync(normalFile, 'utf8');
    assert.equal(data, normalContent);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('fs interception: symlink escape detection', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-symlink-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const externalDir = path.join(os.tmpdir(), `bunfs-external-${process.pid}-${Date.now()}`);
  fs.mkdirSync(externalDir, { recursive: true });
  const externalFile = path.join(externalDir, 'external.txt');
  fs.writeFileSync(externalFile, 'External');

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    loader.installFsBunfsInterception();

    // Try to create a symlink (may fail on some platforms)
    const symlinkPath = path.join(tempDir, 'escape.txt');
    try {
      fs.symlinkSync(externalFile, symlinkPath);
    } catch (e) {
      // Skip test if symlinks not supported
      return;
    }

    const testFsModule = require('node:fs');
    assert.throws(
      () => testFsModule.readFileSync('/$bunfs/root/escape.txt'),
      /escapes owned dir via symlink/,
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(externalDir, { recursive: true, force: true });
  }
});

test('installFsBunfsInterception: idempotent (multiple calls are safe)', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-idempotent-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const testFile = path.join(tempDir, 'test.js');
  fs.writeFileSync(testFile, 'export const z = 1;');

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
    });

    // Call installFsBunfsInterception multiple times
    loader.installFsBunfsInterception();
    loader.installFsBunfsInterception();
    loader.installFsBunfsInterception();

    // Verify fs still works
    const testFsModule = require('node:fs');
    const data = testFsModule.readFileSync(testFile, 'utf8');
    assert.ok(data.includes('z = 1'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('fs interception: rollback on partial failure leaves FS_PATCHED false (retry succeeds)', async () => {
  // G1で確定した設計: syncBuiltinESMExports() が失敗した場合、3関数を元に戻し
  // FS_PATCHED は立てない。次回呼出しで再試行できることを外部挙動で証明する
  // (private 変数を直接読まず、「1回目は throw して起こす失敗後、2回目の呼出しが
  // 実際にパッチを完了する」ことで FS_PATCHED===false だったことを証明する)。
  const { spawnSync } = require('node:child_process');
  const tempDir = path.join(os.tmpdir(), `bunfs-rollback-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const loaderPath = path.join(__dirname, 'bunfs-esm-loader.mjs');

  try {
    const targetFile = path.join(tempDir, 'target.js');
    fs.writeFileSync(targetFile, 'export const marker = "REAL_CONTENT";');
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');
    const sourceBin = path.join(tempDir, 'bin');
    fs.writeFileSync(sourceBin, 'binary content');
    const normalFile = path.join(tempDir, 'normal.txt');
    fs.writeFileSync(normalFile, 'NORMAL_CONTENT');

    const testScript = path.join(tempDir, 'test-rollback.mjs');
    fs.writeFileSync(testScript, `
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const tempDir = ${JSON.stringify(tempDir)};
const normalFile = ${JSON.stringify(normalFile)};
// ESM namespace ('node:module' の import 経由の名前空間) は読み取り専用のため、
// installFsBunfsInterception 自体と同じく CJS 側 (require) を可変対象として差し替える。
const nodeModuleCjs = require('node:module');
const origFsMod = require('node:fs');
const origReadFileSync = origFsMod.readFileSync;
const origReadFile = origFsMod.readFile;
const origPromisesReadFile = origFsMod.promises.readFile;
const realSync = nodeModuleCjs.syncBuiltinESMExports;

// 1回目のみ throw するモックへ差し替え。差し替え自体を ESM 側にも伝播させるため
// 一度だけ本物の syncBuiltinESMExports を呼んでおく (この呼出し自体は失敗しない)。
let syncCallCount = 0;
nodeModuleCjs.syncBuiltinESMExports = () => {
  syncCallCount++;
  if (syncCallCount === 1) {
    throw new Error('forced syncBuiltinESMExports failure (test)');
  }
  return realSync();
};
realSync();

const loader = await import(${JSON.stringify(pathToFileURL(loaderPath).href)});
loader.initialize({
  processOwnedDir: tempDir,
  sourceBin: ${JSON.stringify(sourceBin)},
  childProcessGuardPath: ${JSON.stringify(path.join(tempDir, 'guard.mjs'))},
  vmGuardPath: ${JSON.stringify(path.join(tempDir, 'vm-guard.mjs'))},
  wsStubPath: ${JSON.stringify(path.join(tempDir, 'ws-stub.mjs'))},
});

// 1回目: syncBuiltinESMExports が throw するため installFsBunfsInterception も throw するはず
let firstThrew = false;
try {
  loader.installFsBunfsInterception();
} catch (e) {
  firstThrew = true;
}
if (!firstThrew) {
  console.error('EXPECTED_THROW_MISSING: first installFsBunfsInterception() call did not throw');
  process.exit(1);
}

// ロールバック確認: 3関数が元の参照に戻っているか (通常ファイル読み込みが正常動作することで確認)
const fsMod = require('node:fs');
if (fsMod.readFileSync !== origReadFileSync || fsMod.readFile !== origReadFile || fsMod.promises.readFile !== origPromisesReadFile) {
  console.error('ROLLBACK_FAILED: fs functions were not restored to originals after failure');
  process.exit(1);
}
const normalContent = fsMod.readFileSync(normalFile, 'utf8');
if (normalContent !== 'NORMAL_CONTENT') {
  console.error('ROLLBACK_BROKEN_READ: normal file read broken after rollback');
  process.exit(1);
}

// 2回目: モックは以後成功するため、FS_PATCHED が false のままなら今度は成功するはず
let secondThrew = false;
try {
  loader.installFsBunfsInterception();
} catch (e) {
  secondThrew = true;
  console.error('SECOND_CALL_THREW: ' + e.message);
}
if (secondThrew) {
  console.error('FS_PATCHED_STUCK_TRUE_OR_RETRY_BLOCKED: second call should have succeeded');
  process.exit(1);
}

console.log('ROLLBACK_AND_RETRY_OK');
process.exit(0);
`);

    const result = spawnSync('node', [testScript], { encoding: 'utf8' });
    assert.equal(result.status, 0, `Script failed (status=${result.status}): stdout=${result.stdout} stderr=${result.stderr}`);
    assert.ok(result.stdout.includes('ROLLBACK_AND_RETRY_OK'), `expected ROLLBACK_AND_RETRY_OK marker, got: stdout=${result.stdout} stderr=${result.stderr}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('recoverMissing integration: fs interception collaborates with recovery', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-recovery-integration-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const targetFile = path.join(tempDir, 'recovered.js');
  fs.writeFileSync(targetFile, 'export const recovered = true;');
  const sourceBin = path.join(tempDir, 'bin');
  fs.writeFileSync(sourceBin, 'binary content');

  try {
    let reExtractCalls = 0;
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: sourceBin,
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
      wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      reExtract: (sb, od) => {
        reExtractCalls++;
        fs.writeFileSync(targetFile, 'export const recovered = true;');
      },
    });

    loader.installFsBunfsInterception();

    // Delete the file
    fs.unlinkSync(targetFile);

    // Try to read via fs - should trigger recovery
    const testFsModule = require('node:fs');
    const data = testFsModule.readFileSync('/$bunfs/root/recovered.js', 'utf8');
    assert.ok(data.includes('recovered'));
    assert.equal(reExtractCalls, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// New tests for hooks-standalone-pattern integration
test('hooks: ok + 1 record valid: qle replacement applied', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  fs.writeFileSync(chunkFile, source);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: 'chunk.js', expectedOccurrences: 1 }],
      },
    });

    let loadCalls = 0;
    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    const result = await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    const expected = 'var qle=(e,o,r)=>(!0)?ar(o,r(),e):{module:o,folder:e};';
    assert.equal(result.source, expected);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: other files unmodified even if they contain qle pattern', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test2-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const recordedFile = path.join(tempDir, 'recorded.js');
  const otherFile = path.join(tempDir, 'other.js');
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  fs.writeFileSync(recordedFile, source);
  fs.writeFileSync(otherFile, source);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: 'recorded.js', expectedOccurrences: 1 }],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    const resultOther = await loader.load(pathToFileURL(otherFile).href, {}, nextLoad);
    // other file should be unchanged
    assert.equal(resultOther.source, source);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: ok + count mismatch triggers fallback with warning', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test3-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = 'import.meta.dir\nvar qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  fs.writeFileSync(chunkFile, source);

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: 'chunk.js', expectedOccurrences: 2 }], // expect 2 but has 1
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    const result = await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    // layer2 should apply: add import.meta.dir prelude
    assert.ok(result.source.includes('import.meta.dir ??= import.meta.dirname;'));
    // should have warning
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('occurrence count mismatch'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: ok + invalid record triggers fallback', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test4-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = 'import.meta.dir\ncode';
  fs.writeFileSync(chunkFile, source);

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: '../invalid.js', expectedOccurrences: 1 }], // file with ..
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    const result = await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    // layer2 should apply
    assert.ok(result.source.includes('import.meta.dir ??= import.meta.dirname;'));
    assert.equal(warnings.length, 1);
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: ok + empty patches triggers layer2 without warning', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test5-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = 'import.meta.dir\ncode';
  fs.writeFileSync(chunkFile, source);

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    const result = await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    // layer2 should apply
    assert.ok(result.source.includes('import.meta.dir ??= import.meta.dirname;'));
    // no warning for empty patches
    assert.equal(warnings.length, 0);
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: layer2 adds prelude only for import.meta.dir', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test6-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = 'const x = import.meta.dirname; // OK, should not match \\bimport\\.meta\\.dir\\b';
  fs.writeFileSync(chunkFile, source);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: { status: 'ok', patches: [] },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    const result = await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    // should not add prelude since only dirname exists
    assert.ok(!result.source.includes('import.meta.dir ??= import.meta.dirname;'));
    assert.equal(result.source, source);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: field-absent warning on first layer2 prelude', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test7-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const chunkFile2 = path.join(tempDir, 'chunk2.js');
  const source = 'import.meta.dir\ncode';
  fs.writeFileSync(chunkFile, source);
  fs.writeFileSync(chunkFile2, source);

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: { status: 'field-absent', patches: [] },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    // first load: should warn when layer2 prelude is applied
    const result1 = await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('no hooks_standalone_patches record'));

    // second load: warning already issued, should not repeat
    const result2 = await loader.load(pathToFileURL(chunkFile2).href, {}, nextLoad);
    assert.equal(warnings.length, 1); // still 1
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: state transition - layer1 valid makes layer2 inactive', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test8-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const recordedFile = path.join(tempDir, 'recorded.js');
  const otherFile = path.join(tempDir, 'other.js');
  const recordedSource = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  const otherSource = 'import.meta.dir\ncode'; // has import.meta.dir
  fs.writeFileSync(recordedFile, recordedSource);
  fs.writeFileSync(otherFile, otherSource);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: 'recorded.js', expectedOccurrences: 1 }],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    // Load other file first (has import.meta.dir): layer1 is valid, so layer2 should be inactive
    const resultOther = await loader.load(pathToFileURL(otherFile).href, {}, nextLoad);
    // should NOT add prelude because layer1 is valid
    assert.ok(!resultOther.source.includes('import.meta.dir ??='));
    assert.equal(resultOther.source, otherSource);

    // Confirm layer1 still works
    const resultRecorded = await loader.load(pathToFileURL(recordedFile).href, {}, nextLoad);
    assert.equal(resultRecorded.source, 'var qle=(e,o,r)=>(!0)?ar(o,r(),e):{module:o,folder:e};');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: initialize resets state and warnings', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test9-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = 'import.meta.dir\ncode';
  fs.writeFileSync(chunkFile, source);

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    // First initialize with field-absent
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: { status: 'field-absent', patches: [] },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);

    // Re-initialize: should reset warning flag
    warnings = [];
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: { status: 'read-failed', patches: [] },
    });

    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1); // new warning from read-failed
    assert.ok(warnings[0].includes('could not be read'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: hooksMetadata state warnings - entry-missing and read-failed', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test10-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  fs.writeFileSync(chunkFile, 'code');

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    // Test entry-missing
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: { status: 'entry-missing', patches: [] },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    warnings = [];
    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('metadata entry missing'));

    // Test read-failed
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: { status: 'read-failed', patches: [] },
    });

    warnings = [];
    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('could not be read'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

// #3/#4: 記録不正の種類ごと個別テスト
test('hooks: ok + file contains .. triggers fallback with specific reason', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-file-dd-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  fs.writeFileSync(chunkFile, 'import.meta.dir\ncode');

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: '../escape.js', expectedOccurrences: 1 }],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('file contains ..'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: ok + absolute path triggers fallback with specific reason', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-abs-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  fs.writeFileSync(chunkFile, 'import.meta.dir\ncode');

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: '/absolute/path.js', expectedOccurrences: 1 }],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('file is absolute path'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: ok + file not found triggers fallback with specific reason', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-notfound-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  fs.writeFileSync(chunkFile, 'import.meta.dir\ncode');

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: 'nonexistent.js', expectedOccurrences: 1 }],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('file not found or recovery failed'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: ok + expectedOccurrences=0 triggers fallback with specific reason', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-zero-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  fs.writeFileSync(chunkFile, source);

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: 'chunk.js', expectedOccurrences: 0 }],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('invalid expectedOccurrences'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: ok + file duplicate triggers fallback with specific reason', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-dup-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  fs.writeFileSync(chunkFile, source);

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [
          { file: 'chunk.js', expectedOccurrences: 1 },
          { file: 'chunk.js', expectedOccurrences: 1 },
        ],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('duplicate file'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: ok + second record invalid: reason reflects second record failure', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-2nd-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const file1 = path.join(tempDir, 'chunk1.js');
  const file2 = path.join(tempDir, 'chunk2.js');
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  fs.writeFileSync(file1, source);
  fs.writeFileSync(file2, source);

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [
          { file: 'chunk1.js', expectedOccurrences: 1 },
          { file: 'chunk2.js', expectedOccurrences: 0 }, // 2番目だけ不正
        ],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    await loader.load(pathToFileURL(file1).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    // 警告に「2番目の記録由来」の内容が反映されること
    assert.ok(warnings[0].includes('invalid expectedOccurrences'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: #6(b) import.meta.dir in comment/string literal also gets prelude', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-comment-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = `// import.meta.dir is used here\nconst str = "import.meta.dir shim";\ncode`;
  fs.writeFileSync(chunkFile, source);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: { status: 'ok', patches: [] },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    const result = await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    // Even if import.meta.dir is only in comment/string, it matches \\bimport\\.meta\\.dir\\b
    assert.ok(result.source.includes('import.meta.dir ??= import.meta.dirname;'));
    // Original content preserved (prelude prepended, not replaced)
    assert.ok(result.source.includes(source));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: #7 state transition - plugin chunk loaded before qle chunk, layer1 valid', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-order-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const qleFile = path.join(tempDir, 'qle.js');
  const pluginFile = path.join(tempDir, 'plugin.js');
  const qleSource = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  const pluginSource = 'import.meta.dir'; // plugin has import.meta.dir
  fs.writeFileSync(qleFile, qleSource);
  fs.writeFileSync(pluginFile, pluginSource);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: 'qle.js', expectedOccurrences: 1 }],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    // Load plugin first (has import.meta.dir)
    const resultPlugin = await loader.load(pathToFileURL(pluginFile).href, {}, nextLoad);
    // Layer1 is valid, so layer2 should NOT be applied
    assert.ok(!resultPlugin.source.includes('import.meta.dir ??='));
    assert.equal(resultPlugin.source, pluginSource);

    // Load qle second
    const resultQle = await loader.load(pathToFileURL(qleFile).href, {}, nextLoad);
    assert.equal(resultQle.source, 'var qle=(e,o,r)=>(!0)?ar(o,r(),e):{module:o,folder:e};');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: #8 idempotency - same file loaded twice produces identical output', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-idempotent-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = 'import.meta.dir\ncode';
  fs.writeFileSync(chunkFile, source);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: { status: 'ok', patches: [] },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    const result1 = await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    const result2 = await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    // Second load should produce identical output (no double prelude)
    assert.equal(result1.source, result2.source);
    assert.ok(!result1.source.includes('import.meta.dir ??= import.meta.dirname;\nimport.meta.dir ??='));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: #9 import.meta.require prelude + hooks transformation coexist correctly', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-coexist-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  // Source with both qle and import.meta.require
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};\nimport.meta.require("/$bunfs/root/x.js");';
  fs.writeFileSync(chunkFile, source);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: 'chunk.js', expectedOccurrences: 1 }],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: 'nextLoad result', shortCircuit: true });
    const result = await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    // QLE replacement should happen
    assert.ok(result.source.includes('(!0)?ar'));
    // import.meta.require replacement should happen
    assert.ok(result.source.includes('__bunfsMetaRequire'));
    // import.meta.require prelude should be present
    assert.ok(result.source.includes('const __bunfsMetaRequire'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: ok + expectedOccurrences=1.5 (non-integer) triggers fallback', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-float-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  const source = 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};';
  fs.writeFileSync(chunkFile, source);

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: 'chunk.js', expectedOccurrences: 1.5 }],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('invalid expectedOccurrences'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('hooks: ok + expectedOccurrences="1" (string) triggers fallback', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-hooks-test-str-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  const chunkFile = path.join(tempDir, 'chunk.js');
  fs.writeFileSync(chunkFile, 'import.meta.dir\ncode');

  let warnings = [];
  const origError = console.error;
  console.error = (msg) => warnings.push(msg);

  try {
    loader.initialize({
      processOwnedDir: tempDir,
      sourceBin: '/dummy/bin',
      childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
      vmGuardPath: path.join(tempDir, 'vm.mjs'),
      wsStubPath: path.join(tempDir, 'ws.mjs'),
      hooksMetadata: {
        status: 'ok',
        patches: [{ file: 'chunk.js', expectedOccurrences: '1' }],
      },
    });

    const nextLoad = async () => ({ format: 'module', source: '', shortCircuit: true });
    await loader.load(pathToFileURL(chunkFile).href, {}, nextLoad);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes('invalid expectedOccurrences'));
  } finally {
    console.error = origError;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});



test('hooks: #11 real ESM integration - qle export and plugin import coexist', async (t) => {
  const { spawnSync } = require('node:child_process');
  const { registerHooks } = await import('node:module');
  if (typeof registerHooks !== 'function') return t.skip('registerHooks unavailable');
  const loaderPath = path.resolve(__dirname, 'bunfs-esm-loader.mjs');
  const run = (metadata, order = false, useLoader = true) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bunfs-hooks-esm-'));
    const guard = path.join(tmp, 'guard.mjs');
    const vm = path.join(tmp, 'vm.mjs');
    const ws = path.join(tmp, 'ws.mjs');
    fs.writeFileSync(guard, 'export {};\n');
    fs.writeFileSync(vm, 'export {};\n');
    fs.writeFileSync(ws, 'export {};\n');
    fs.writeFileSync(path.join(tmp, 'chunk-qle.mjs'), 'function uu(){return false}\nvar ar=(e,o,r)=>({module:e,scan:o.scan,files:o.files,dir:r});\nvar qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};\nexport { qle };\n');
    fs.writeFileSync(path.join(tmp, 'plugin-mermaid.mjs'), "import { qle } from './chunk-qle.mjs';\nexport const result={name:'mermaid',hooksModule:qle(import.meta.dir,{id:'mod-mermaid'},()=>({scan:{hooks:[],calls:[],events:['ui.render']},files:{}}))};\n");
    fs.writeFileSync(path.join(tmp, 'plugin-agents.mjs'), "import { qle } from './chunk-qle.mjs';\nexport const result={name:'agents-md',hooksModule:qle(import.meta.dir,{id:'mod-agents'},()=>({scan:{hooks:[],calls:[],events:['session.start','prompt.context']},files:{}}))};\n");
    const init = useLoader ? 'loader.initialize({processOwnedDir:' + JSON.stringify(tmp) + ",sourceBin:'/dummy/bin',childProcessGuardPath:" + JSON.stringify(guard) + ',vmGuardPath:' + JSON.stringify(vm) + ',wsStubPath:' + JSON.stringify(ws) + ',hooksMetadata:' + JSON.stringify(metadata) + '}); registerHooks({resolve:loader.resolve,load:loader.load});' : '';
    const imports = order ? 'const b=await import(pathToFileURL(' + JSON.stringify(path.join(tmp, 'plugin-agents.mjs')) + ').href); const a=await import(pathToFileURL(' + JSON.stringify(path.join(tmp, 'plugin-mermaid.mjs')) + ').href);' : 'const a=await import(pathToFileURL(' + JSON.stringify(path.join(tmp, 'plugin-mermaid.mjs')) + ').href); const b=await import(pathToFileURL(' + JSON.stringify(path.join(tmp, 'plugin-agents.mjs')) + ').href);';
    const script = 'import {registerHooks} from \'node:module\'; import {pathToFileURL} from \'node:url\'; const loader=await import(' + JSON.stringify(pathToFileURL(loaderPath).href) + '); ' + init + ' ' + imports + ' console.log(JSON.stringify({a:a.result,b:b.result}));';
    try {
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
      assert.equal(child.status, 0, 'child failed status=' + child.status + ': ' + child.stderr);
      return { data: JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1)), stderr: child.stderr, tmp };
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  };
  const ok = run({ status: 'ok', patches: [{ file: 'chunk-qle.mjs', expectedOccurrences: 1 }] });
  assert.equal(ok.data.a.hooksModule.module.id, 'mod-mermaid');
  assert.deepEqual(ok.data.a.hooksModule.scan.events, ['ui.render']);
  assert.equal(Object.hasOwn(ok.data.a.hooksModule, 'folder'), false);
  assert.deepEqual(ok.data.b.hooksModule.scan.events, ['session.start', 'prompt.context']);
  assert.equal(ok.stderr, '');
  const mismatch = run({ status: 'ok', patches: [{ file: 'chunk-qle.mjs', expectedOccurrences: 2 }] });
  assert.deepEqual(mismatch.data.a.hooksModule, { module: { id: 'mod-mermaid' }, folder: mismatch.tmp });
  assert.deepEqual(mismatch.data.b.hooksModule, { module: { id: 'mod-agents' }, folder: mismatch.tmp });
  assert.equal((mismatch.stderr.match(/hooks standalone patch not applied/g) || []).length, 1);
  const absent = run({ status: 'field-absent' });
  assert.equal(absent.data.a.hooksModule.folder, absent.tmp);
  assert.equal(absent.data.b.hooksModule.folder, absent.tmp);
  assert.equal((absent.stderr.match(/no hooks_standalone_patches record/g) || []).length, 1);
  const direct = run({ status: 'field-absent' }, false, false);
  assert.equal(Object.hasOwn(direct.data.a.hooksModule, 'folder'), false);
  const reversed = run({ status: 'ok', patches: [{ file: 'chunk-qle.mjs', expectedOccurrences: 1 }] }, true);
  assert.equal(reversed.data.a.hooksModule.module.id, 'mod-mermaid');
  assert.deepEqual(reversed.data.b.hooksModule.scan.events, ['session.start', 'prompt.context']);
  assert.equal(Object.hasOwn(reversed.data.a.hooksModule, 'folder'), false);
  assert.equal(reversed.stderr, '');
});

test('hooks: cycle-hoist coexists with layer1 qle and import.meta.require transforms', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bunfs-hooks-cycle1-'));
  const target = path.join(tmp, 'target.mjs');
  const file = path.join(tmp, 'source.mjs');
  fs.writeFileSync(path.join(tmp, 'guard.mjs'), 'export {};'); fs.writeFileSync(path.join(tmp, 'vm.mjs'), 'export {};'); fs.writeFileSync(path.join(tmp, 'ws.mjs'), 'export {};');
  fs.writeFileSync(target, 'export const target=1;');
  fs.writeFileSync(file, 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};\nvar target=import.meta.require("/$bunfs/root/target.mjs");\nvar cp=import.meta.require("child_process");\nexport {qle,target,cp};');
  try {
    loader.initialize({ processOwnedDir: tmp, sourceBin: '/dummy/bin', childProcessGuardPath: path.join(tmp, 'guard.mjs'), vmGuardPath: path.join(tmp, 'vm.mjs'), wsStubPath: path.join(tmp, 'ws.mjs'), cycleHoists: [{ file: 'source.mjs', targetModule: 'target.mjs', expectedOccurrences: 1, assertProperties: [] }], hooksMetadata: { status: 'ok', patches: [{ file: 'source.mjs', expectedOccurrences: 1 }] } });
    const result = await loader.load(pathToFileURL(file).href, {}, async () => ({}));
    const hoist = 'import * as __bunfsHoisted_0 from ' + JSON.stringify(pathToFileURL(target).href) + ';';
    assert.ok(result.source.includes('(!0)?')); assert.ok(result.source.includes(hoist)); assert.ok(result.source.includes('__bunfsMetaRequire("child_process")')); assert.ok(!result.source.includes('import.meta.require("/$bunfs/root/target.mjs")')); assert.ok(result.source.indexOf(hoist) < result.source.indexOf('var qle='));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('hooks: cycle-hoist coexists with layer2 shim in implementation order', async () => {
  const loader = await import('./bunfs-esm-loader.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bunfs-hooks-cycle2-'));
  const target = path.join(tmp, 'target.mjs'); const file = path.join(tmp, 'source.mjs');
  fs.writeFileSync(path.join(tmp, 'guard.mjs'), 'export {};'); fs.writeFileSync(path.join(tmp, 'vm.mjs'), 'export {};'); fs.writeFileSync(path.join(tmp, 'ws.mjs'), 'export {};'); fs.writeFileSync(target, 'export const target=1;');
  fs.writeFileSync(file, 'var qle=(e,o,r)=>uu()?ar(o,r(),e):{module:o,folder:e};\nvar target=import.meta.require("/$bunfs/root/target.mjs");\nvar cp=import.meta.require("child_process");\nconst dir=import.meta.dir;\nexport {qle,target,cp,dir};');
  try {
    loader.initialize({ processOwnedDir: tmp, sourceBin: '/dummy/bin', childProcessGuardPath: path.join(tmp, 'guard.mjs'), vmGuardPath: path.join(tmp, 'vm.mjs'), wsStubPath: path.join(tmp, 'ws.mjs'), cycleHoists: [{ file: 'source.mjs', targetModule: 'target.mjs', expectedOccurrences: 1, assertProperties: [] }], hooksMetadata: { status: 'ok', patches: [{ file: 'source.mjs', expectedOccurrences: 2 }] } });
    const result = await loader.load(pathToFileURL(file).href, {}, async () => ({}));
    const hoist = 'import * as __bunfsHoisted_0 from ' + JSON.stringify(pathToFileURL(target).href) + ';'; const shim = 'import.meta.dir ??= import.meta.dirname;\n';
    assert.ok(result.source.startsWith(hoist)); assert.ok(result.source.includes(shim)); assert.ok(result.source.includes('__bunfsMetaRequire("child_process")')); assert.ok(result.source.indexOf(hoist) < result.source.indexOf(shim)); assert.ok(result.source.indexOf(shim) < result.source.indexOf('var qle='));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('load() delegates outside processOwnedDir unchanged without evaluating hooks state', async () => {
  const loader = await import('./bunfs-esm-loader.mjs'); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bunfs-hooks-owned-')); const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bunfs-hooks-outside-')); const file = path.join(outside, 'outside.mjs');
  fs.writeFileSync(file, 'import.meta.dir\nexport const value=1;'); const warnings = []; const origError = console.error; console.error = (message) => warnings.push(message);
  try {
    loader.initialize({ processOwnedDir: tmp, sourceBin: '/dummy/bin', childProcessGuardPath: path.join(tmp, 'guard.mjs'), vmGuardPath: path.join(tmp, 'vm.mjs'), wsStubPath: path.join(tmp, 'ws.mjs'), hooksMetadata: { status: 'ok', patches: [{ file: '../invalid.js', expectedOccurrences: 1 }] } });
    const delegated = { format: 'module', source: 'delegated source', shortCircuit: true }; let calls = 0;
    const result = await loader.load(pathToFileURL(file).href, {}, async () => { calls++; return delegated; });
    assert.equal(calls, 1); assert.strictEqual(result, delegated); assert.equal(result.source, 'delegated source'); assert.deepEqual(warnings, []);
  } finally { console.error = origError; fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(outside, { recursive: true, force: true }); }
});
