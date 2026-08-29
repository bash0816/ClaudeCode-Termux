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

    const nextResolve = async (spec, ctx) => ({ url: `unresolved:${spec}` });

    // child_process should resolve to childProcessGuardPath
    const result1 = await loader.resolve('child_process', {}, nextResolve);
    assert.ok(result1.url.includes(guardPath));
    assert.equal(result1.shortCircuit, true);

    // node:child_process should also resolve to childProcessGuardPath
    const result2 = await loader.resolve('node:child_process', {}, nextResolve);
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

    const nextResolve = async (spec, ctx) => ({ url: `unresolved:${spec}` });

    // vm should resolve to vmGuardPath
    const result1 = await loader.resolve('vm', {}, nextResolve);
    assert.ok(result1.url.includes(vmGuardPath));
    assert.equal(result1.shortCircuit, true);

    // node:vm should also resolve to vmGuardPath
    const result2 = await loader.resolve('node:vm', {}, nextResolve);
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

    const nextResolve = async (spec, ctx) => ({ url: `unresolved:${spec}` });

    const result = await loader.resolve('ws', {}, nextResolve);
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

    const nextResolve = async (spec, ctx) => ({ url: `unresolved:${spec}` });

    await assert.rejects(
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

    const nextResolve = async (spec, ctx) => ({ url: `unresolved:${spec}` });

    await assert.rejects(
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

    const nextResolve = async (spec, ctx) => ({ url: `unresolved:${spec}` });

    await assert.rejects(
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

test('import.meta.require resolves /$bunfs/root/ specifiers via loader integration', async () => {
  const { register } = await import('node:module');
  const loader = await import('./bunfs-esm-loader.mjs');
  const tempDir = path.join(os.tmpdir(), `bunfs-esm-loader-integration-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Create guard files
    fs.writeFileSync(path.join(tempDir, 'guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'vm-guard.mjs'), 'export default {};');
    fs.writeFileSync(path.join(tempDir, 'ws-stub.mjs'), 'export default {};');

    // Create CommonJS fixture that will be required (normal case)
    fs.writeFileSync(path.join(tempDir, 'foo.js'), 'module.exports = { value: 42 };');

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

    register(pathToFileURL(path.join(__dirname, 'bunfs-esm-loader.mjs')).href, {
      parentURL: pathToFileURL(__filename).href,
      data: {
        processOwnedDir: tempDir,
        sourceBin: sourceBin,
        childProcessGuardPath: path.join(tempDir, 'guard.mjs'),
        vmGuardPath: path.join(tempDir, 'vm-guard.mjs'),
        wsStubPath: path.join(tempDir, 'ws-stub.mjs'),
      },
    });

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
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
