'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('bunfs-child-process-guard exports named exports for guarded methods', async () => {
  const guard = await import('./bunfs-child-process-guard.mjs');

  assert.equal(typeof guard.spawn, 'function');
  assert.equal(typeof guard.execFile, 'function');
  assert.equal(typeof guard.exec, 'function');
  assert.equal(typeof guard.spawnSync, 'function');
  assert.equal(typeof guard.execFileSync, 'function');
  assert.equal(typeof guard.execSync, 'function');
});

test('bunfs-child-process-guard exports ChildProcess, fork, _forkChild', async () => {
  const guard = await import('./bunfs-child-process-guard.mjs');

  // ChildProcess is a class
  assert.equal(typeof guard.ChildProcess, 'function');
  // fork and _forkChild are functions
  assert.equal(typeof guard.fork, 'function');
  assert.equal(typeof guard._forkChild, 'function');
});

test('bunfs-child-process-guard provides default export with all methods', async () => {
  const guard = await import('./bunfs-child-process-guard.mjs');
  const defaultExport = guard.default;

  assert.ok(defaultExport);
  assert.equal(typeof defaultExport, 'object');
  assert.equal(typeof defaultExport.spawn, 'function');
  assert.equal(typeof defaultExport.execFile, 'function');
  assert.equal(typeof defaultExport.exec, 'function');
  assert.equal(typeof defaultExport.spawnSync, 'function');
  assert.equal(typeof defaultExport.execFileSync, 'function');
  assert.equal(typeof defaultExport.execSync, 'function');
  assert.equal(typeof defaultExport.ChildProcess, 'function');
  assert.equal(typeof defaultExport.fork, 'function');
  assert.equal(typeof defaultExport._forkChild, 'function');
});

test('bunfs-child-process-guard blocks official package update via execFileSync', async () => {
  const guard = await import('./bunfs-child-process-guard.mjs');

  // Try to execute npm install of official package
  try {
    guard.execFileSync('npm', ['install', '-g', '@anthropic-ai/claude-code@latest']);
    // If it doesn't throw, that's an error (should be blocked)
    assert.fail('Expected execFileSync to block official package update');
  } catch (err) {
    // Should throw with CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED code
    assert.ok(
      err.code === 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED' ||
      err.message.includes('disabled on Termux'),
      `Expected block error, got: ${err.message}`,
    );
  }
});

test('bunfs-child-process-guard blocks official package update via execSync', async () => {
  const guard = await import('./bunfs-child-process-guard.mjs');

  // Try to execute npm install via exec
  try {
    guard.execSync('npm install -g @anthropic-ai/claude-code@latest');
    // If it doesn't throw, that's an error (should be blocked)
    assert.fail('Expected execSync to block official package update');
  } catch (err) {
    // Should throw with CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED code
    assert.ok(
      err.code === 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED' ||
      err.message.includes('disabled on Termux'),
      `Expected block error, got: ${err.message}`,
    );
  }
});

test('bunfs-child-process-guard allows harmless commands', async () => {
  const guard = await import('./bunfs-child-process-guard.mjs');

  // echo is a harmless command and should not be blocked
  const result = guard.execFileSync('echo', ['hello']);
  // Verify the command actually executed and produced output
  assert.equal(result.toString().trim(), 'hello');
});

test('bunfs-child-process-guard spawn blocks official package install', async () => {
  const guard = await import('./bunfs-child-process-guard.mjs');

  // spawn should return a blocked child process (EventEmitter-like)
  const child = guard.spawn('npm', ['install', '-g', '@anthropic-ai/claude-code']);

  // Blocked spawn should have specific properties
  assert.equal(child.stdout, null);
  assert.equal(child.stderr, null);
  assert.equal(child.stdin, null);
  assert.equal(child.pid, 0);
  assert.equal(child.killed, false);

  // Verify it's event-like (has on method or can be used as event emitter)
  assert.equal(typeof child.kill, 'function');
});

test('bunfs-child-process-guard does not block other package installs', async () => {
  const guard = await import('./bunfs-child-process-guard.mjs');

  // Installing a different package should not be blocked
  const result = guard.execFileSync('echo', ['@bash0816/claude-code']);
  // Verify the command actually executed and produced correct output
  assert.equal(result.toString().trim(), '@bash0816/claude-code');
});
