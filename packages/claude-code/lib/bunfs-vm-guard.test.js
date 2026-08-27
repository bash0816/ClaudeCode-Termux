'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('bunfs-vm-guard exports all vm module methods', async () => {
  const vmGuard = await import('./bunfs-vm-guard.mjs');

  assert.equal(typeof vmGuard.createContext, 'function');
  assert.equal(typeof vmGuard.isContext, 'function');
  assert.equal(typeof vmGuard.runInContext, 'function');
  assert.equal(typeof vmGuard.runInNewContext, 'function');
  assert.equal(typeof vmGuard.runInThisContext, 'function');
  assert.equal(typeof vmGuard.createScript, 'function');
  assert.equal(typeof vmGuard.compileFunction, 'function');
  assert.equal(typeof vmGuard.measureMemory, 'function');
  assert.equal(typeof vmGuard.Script, 'function');
  // SourceTextModule and SyntheticModule only exist with --experimental-vm-modules flag
  assert.ok('SourceTextModule' in vmGuard);
  assert.ok('SyntheticModule' in vmGuard);
  assert.ok(vmGuard.constants);
});

test('bunfs-vm-guard provides default export with vm module API', async () => {
  const vmGuard = await import('./bunfs-vm-guard.mjs');
  const defaultExport = vmGuard.default;

  assert.ok(defaultExport);
  assert.equal(typeof defaultExport, 'object');
  assert.equal(typeof defaultExport.createContext, 'function');
  assert.equal(typeof defaultExport.isContext, 'function');
  assert.equal(typeof defaultExport.runInContext, 'function');
  assert.equal(typeof defaultExport.runInNewContext, 'function');
  assert.equal(typeof defaultExport.runInThisContext, 'function');
  assert.equal(typeof defaultExport.createScript, 'function');
  assert.equal(typeof defaultExport.compileFunction, 'function');
  assert.equal(typeof defaultExport.measureMemory, 'function');
  assert.equal(typeof defaultExport.Script, 'function');
  // SourceTextModule and SyntheticModule may not exist in default export without --experimental-vm-modules
  // They are exported as named exports if they exist
  assert.ok(defaultExport.constants);
});

test('bunfs-vm-guard injects Bun into context in createContext', async () => {
  globalThis.Bun = { __dummy: true };
  try {
    const vmGuard = await import('./bunfs-vm-guard.mjs');

    const context = vmGuard.createContext({});
    // Check that Bun property exists in context
    assert.ok(Object.prototype.hasOwnProperty.call(context, 'Bun'));

    // Verify Bun is defined when we run code in context
    const result = vmGuard.runInContext('typeof Bun', context);
    assert.equal(result, 'object');
  } finally {
    delete globalThis.Bun;
  }
});

test('bunfs-vm-guard injects Bun into context in runInNewContext', async () => {
  globalThis.Bun = { __dummy: true };
  try {
    const vmGuard = await import('./bunfs-vm-guard.mjs');

    const code = 'typeof Bun';
    const result = vmGuard.runInNewContext(code, {});
    assert.equal(result, 'object');
  } finally {
    delete globalThis.Bun;
  }
});

test('bunfs-vm-guard injects __claudeYaml into context', async () => {
  const vmGuard = await import('./bunfs-vm-guard.mjs');

  const context = vmGuard.createContext({});
  // Check that __claudeYaml property exists
  assert.ok(Object.prototype.hasOwnProperty.call(context, '__claudeYaml'));
});

test('bunfs-vm-guard injects __claudeBun and __claudeBunShim into context', async () => {
  const vmGuard = await import('./bunfs-vm-guard.mjs');

  const context = vmGuard.createContext({});
  // Check that shim properties exist
  assert.ok(Object.prototype.hasOwnProperty.call(context, '__claudeBun'));
  assert.ok(Object.prototype.hasOwnProperty.call(context, '__claudeBunShim'));
});

test('bunfs-vm-guard Script class works with context injection', async () => {
  globalThis.Bun = { __dummy: true };
  try {
    const vmGuard = await import('./bunfs-vm-guard.mjs');

    const code = 'typeof Bun';
    const script = new vmGuard.Script(code);
    const context = vmGuard.createContext({});
    const result = script.runInContext(context);
    assert.equal(result, 'object');
  } finally {
    delete globalThis.Bun;
  }
});

test('bunfs-vm-guard handles context with existing Bun property', async () => {
  globalThis.Bun = { __dummy: true };
  try {
    const vmGuard = await import('./bunfs-vm-guard.mjs');

    // Create context with pre-existing Bun property
    const context = vmGuard.createContext({ Bun: { custom: true } });
    // The guard should have replaced/overwritten it with globalThis.Bun
    const result = vmGuard.runInContext('typeof Bun', context);
    assert.equal(result, 'object');
  } finally {
    delete globalThis.Bun;
  }
});

test('bunfs-vm-guard does not break normal vm functionality', async () => {
  const vmGuard = await import('./bunfs-vm-guard.mjs');

  // Test that normal code execution still works
  const code = '2 + 2';
  const result = vmGuard.runInNewContext(code);
  assert.equal(result, 4);
});

test('bunfs-vm-guard Script.runInNewContext works with injections', async () => {
  globalThis.Bun = { __dummy: true };
  try {
    const vmGuard = await import('./bunfs-vm-guard.mjs');

    const code = 'typeof Bun';
    const script = new vmGuard.Script(code);
    const result = script.runInNewContext({});
    assert.equal(result, 'object');
  } finally {
    delete globalThis.Bun;
  }
});
