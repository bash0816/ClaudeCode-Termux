#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('events');

const {
  BLOCK_MESSAGE,
  createGuardedChildProcess,
  shouldBlockCommand,
  shouldBlockExecString,
} = require('./native-update-guard.js');

test('blocks npm install of official package', () => {
  assert.equal(
    shouldBlockCommand('npm', ['install', '-g', '@anthropic-ai/claude-code@latest']),
    true,
  );
});

test('blocks npm update of official package via absolute npm path', () => {
  assert.equal(
    shouldBlockCommand('/usr/bin/npm', ['update', '-g', '@anthropic-ai/claude-code']),
    true,
  );
});

test('does not block canonical package install', () => {
  assert.equal(
    shouldBlockCommand('npm', ['install', '-g', '@bash0816/claude-code@2.1.137']),
    false,
  );
});

test('blocks exec string that installs official package', () => {
  assert.equal(
    shouldBlockExecString('npm install -g @anthropic-ai/claude-code@latest'),
    true,
  );
});

test('does not block unrelated exec string', () => {
  assert.equal(
    shouldBlockExecString('npm install -g @bash0816/claude-code@2.1.137'),
    false,
  );
});

test('blocks env npm install of official package', () => {
  assert.equal(
    shouldBlockCommand('env', ['FOO=bar', 'npm', 'install', '-g', '@anthropic-ai/claude-code@latest']),
    true,
  );
});

test('blocks npx official package invocation', () => {
  assert.equal(shouldBlockCommand('npx', ['@anthropic-ai/claude-code']), true);
});

test('blocks npx package option official package invocation', () => {
  assert.equal(shouldBlockCommand('npx', ['-p', '@anthropic-ai/claude-code', 'claude']), true);
  assert.equal(shouldBlockCommand('npx', ['--package=@anthropic-ai/claude-code', 'claude']), true);
});

test('blocks pnpm add of official package', () => {
  assert.equal(
    shouldBlockCommand('pnpm', ['add', '-g', '@anthropic-ai/claude-code']),
    true,
  );
});

test('blocks yarn global add of official package', () => {
  assert.equal(
    shouldBlockCommand('yarn', ['global', 'add', '@anthropic-ai/claude-code']),
    true,
  );
});

test('blocks corepack pnpm add of official package', () => {
  assert.equal(
    shouldBlockCommand('corepack', ['pnpm', 'add', '-g', '@anthropic-ai/claude-code']),
    true,
  );
});

test('blocks corepack yarn global add of official package', () => {
  assert.equal(
    shouldBlockCommand('corepack', ['yarn', 'global', 'add', '@anthropic-ai/claude-code']),
    true,
  );
});

test('does not block corepack pnpm add of canonical package', () => {
  assert.equal(
    shouldBlockCommand('corepack', ['pnpm', 'add', '-g', '@bash0816/claude-code@2.1.137']),
    false,
  );
});

test('blocks exec string through env npm', () => {
  assert.equal(
    shouldBlockExecString('env FOO=bar npm install -g @anthropic-ai/claude-code@latest'),
    true,
  );
});

test('blocks exec string through corepack yarn', () => {
  assert.equal(
    shouldBlockExecString('corepack yarn global add @anthropic-ai/claude-code'),
    true,
  );
});

test('blocks exec string through sh -c npm install', () => {
  assert.equal(
    shouldBlockExecString('sh -c "npm install -g @anthropic-ai/claude-code"'),
    true,
  );
});

test('blocks exec string through bash -lc pnpm add', () => {
  assert.equal(
    shouldBlockExecString('bash -lc "pnpm add -g @anthropic-ai/claude-code"'),
    true,
  );
});

test('does not block canonical exec string through bash -lc', () => {
  assert.equal(
    shouldBlockExecString('bash -lc "npm install -g @bash0816/claude-code@2.1.137"'),
    false,
  );
});

test('does not block unrelated shell exec string', () => {
  assert.equal(shouldBlockExecString('sh -c "echo ok"'), false);
});

function createRealChildStub() {
  const calls = [];
  return {
    calls,
    spawn(...args) {
      calls.push(['spawn', args]);
      return { kind: 'spawn', args };
    },
    execFile(...args) {
      calls.push(['execFile', args]);
      return { kind: 'execFile', args };
    },
    exec(...args) {
      calls.push(['exec', args]);
      return { kind: 'exec', args };
    },
    spawnSync(...args) {
      calls.push(['spawnSync', args]);
      return { kind: 'spawnSync', args, status: 0 };
    },
    execFileSync(...args) {
      calls.push(['execFileSync', args]);
      return Buffer.from('ok');
    },
    execSync(...args) {
      calls.push(['execSync', args]);
      return Buffer.from('ok');
    },
  };
}

test('guarded spawn blocks official npm update without delegating', async () => {
  const writes = [];
  const realChild = createRealChildStub();
  const guarded = createGuardedChildProcess(realChild, value => writes.push(value));

  const child = guarded.spawn('npm', ['install', '-g', '@anthropic-ai/claude-code@latest']);
  assert.equal(child instanceof EventEmitter, true);

  const result = await new Promise(resolve => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  assert.deepEqual(result, { code: 1, signal: null });
  assert.deepEqual(realChild.calls, []);
  assert.equal(writes[0], `${BLOCK_MESSAGE}\n`);
});

test('guarded spawn delegates canonical install', () => {
  const realChild = createRealChildStub();
  const guarded = createGuardedChildProcess(realChild, () => {});
  const result = guarded.spawn('npm', ['install', '-g', '@bash0816/claude-code@2.1.137']);

  assert.equal(result.kind, 'spawn');
  assert.equal(realChild.calls.length, 1);
});

test('guarded execFile blocks official npm update callback path', async () => {
  const writes = [];
  const realChild = createRealChildStub();
  const guarded = createGuardedChildProcess(realChild, value => writes.push(value));

  const callbackResult = await new Promise(resolve => {
    guarded.execFile(
      'npm',
      ['update', '-g', '@anthropic-ai/claude-code'],
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    );
  });

  assert.equal(callbackResult.error.code, 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED');
  assert.equal(callbackResult.stdout, '');
  assert.equal(callbackResult.stderr, `${BLOCK_MESSAGE}\n`);
  assert.deepEqual(realChild.calls, []);
  assert.equal(writes[0], `${BLOCK_MESSAGE}\n`);
});

test('guarded exec blocks official npm update shell string', async () => {
  const realChild = createRealChildStub();
  const guarded = createGuardedChildProcess(realChild, () => {});

  const callbackResult = await new Promise(resolve => {
    guarded.exec(
      'npm install -g @anthropic-ai/claude-code@latest',
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    );
  });

  assert.equal(callbackResult.error.code, 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED');
  assert.equal(callbackResult.stdout, '');
  assert.equal(callbackResult.stderr, `${BLOCK_MESSAGE}\n`);
  assert.deepEqual(realChild.calls, []);
});

test('guarded spawnSync blocks official npm update with status 1', () => {
  const writes = [];
  const realChild = createRealChildStub();
  const guarded = createGuardedChildProcess(realChild, value => writes.push(value));
  const result = guarded.spawnSync('npm', ['update', '-g', '@anthropic-ai/claude-code']);

  assert.equal(result.status, 1);
  assert.equal(Buffer.isBuffer(result.stderr), true);
  assert.equal(String(result.stderr), `${BLOCK_MESSAGE}\n`);
  assert.equal(result.error.code, 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED');
  assert.deepEqual(realChild.calls, []);
  assert.equal(writes[0], `${BLOCK_MESSAGE}\n`);
});

test('guarded execFileSync throws on official npm update', () => {
  const realChild = createRealChildStub();
  const guarded = createGuardedChildProcess(realChild, () => {});

  assert.throws(
    () => guarded.execFileSync('npm', ['install', '-g', '@anthropic-ai/claude-code@latest']),
    error => error && error.code === 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED',
  );
  assert.deepEqual(realChild.calls, []);
});

test('guarded execSync throws on official npm update shell string', () => {
  const realChild = createRealChildStub();
  const guarded = createGuardedChildProcess(realChild, () => {});

  assert.throws(
    () => guarded.execSync('npm update -g @anthropic-ai/claude-code'),
    error => error && error.code === 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED',
  );
  assert.deepEqual(realChild.calls, []);
});

test('guarded spawn blocks official npm update through sh -c', async () => {
  const writes = [];
  const realChild = createRealChildStub();
  const guarded = createGuardedChildProcess(realChild, value => writes.push(value));

  const child = guarded.spawn('/bin/sh', ['-c', 'npm install -g @anthropic-ai/claude-code']);
  const result = await new Promise(resolve => {
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  assert.deepEqual(result, { code: 1, signal: null });
  assert.deepEqual(realChild.calls, []);
  assert.equal(writes[0], `${BLOCK_MESSAGE}\n`);
});

test('guarded execFile blocks official update through bash -lc', async () => {
  const realChild = createRealChildStub();
  const guarded = createGuardedChildProcess(realChild, () => {});

  const callbackResult = await new Promise(resolve => {
    guarded.execFile(
      '/usr/bin/bash',
      ['-lc', 'pnpm add -g @anthropic-ai/claude-code'],
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    );
  });

  assert.equal(callbackResult.error.code, 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED');
  assert.equal(callbackResult.stdout, '');
  assert.equal(callbackResult.stderr, `${BLOCK_MESSAGE}\n`);
  assert.deepEqual(realChild.calls, []);
});

test('guarded spawn delegates canonical shell install', () => {
  const realChild = createRealChildStub();
  const guarded = createGuardedChildProcess(realChild, () => {});
  const result = guarded.spawn('/bin/sh', ['-c', 'npm install -g @bash0816/claude-code@2.1.137']);

  assert.equal(result.kind, 'spawn');
  assert.equal(realChild.calls.length, 1);
});
