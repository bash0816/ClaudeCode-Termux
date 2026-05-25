#!/usr/bin/env node
'use strict';

const EventEmitter = require('events');

const OFFICIAL_PACKAGE = '@anthropic-ai/claude-code';
const BLOCK_MESSAGE = [
  'Official native self-update is disabled on Termux.',
  'Run: claude update',
].join('\n');

function lastPathSegment(value) {
  return String(value || '').replace(/\\/g, '/').split('/').pop();
}

function isNpmCommand(command) {
  const text = String(command || '');
  const leaf = lastPathSegment(text);
  return leaf === 'npm' || leaf === 'npm-cli.js';
}

function isPnpmCommand(command) {
  return lastPathSegment(command) === 'pnpm';
}

function isYarnCommand(command) {
  const leaf = lastPathSegment(command);
  return leaf === 'yarn' || leaf === 'yarnpkg';
}

function isNpxCommand(command) {
  const leaf = lastPathSegment(command);
  return leaf === 'npx' || leaf === 'pnpx';
}

function isEnvCommand(command) {
  return lastPathSegment(command) === 'env';
}

function isCorepackCommand(command) {
  return lastPathSegment(command) === 'corepack';
}

function isShellCommand(command) {
  const leaf = lastPathSegment(command);
  return leaf === 'sh' || leaf === 'bash';
}

function isSupportedOperation(value) {
  return ['install', 'i', 'add', 'update', 'up', 'upgrade'].includes(String(value || ''));
}

function isOfficialTarget(value) {
  return String(value || '') === OFFICIAL_PACKAGE || String(value || '').startsWith(`${OFFICIAL_PACKAGE}@`);
}

function normalizeCommand(command, args) {
  let normalizedCommand = command;
  let normalizedArgs = Array.isArray(args) ? args.slice() : [];

  if (isEnvCommand(normalizedCommand)) {
    while (normalizedArgs.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(String(normalizedArgs[0]))) {
      normalizedArgs.shift();
    }
    if (normalizedArgs.length === 0) return { command: normalizedCommand, args: normalizedArgs };
    normalizedCommand = normalizedArgs.shift();
  }

  if (isCorepackCommand(normalizedCommand)) {
    if (normalizedArgs.length === 0) return { command: normalizedCommand, args: normalizedArgs };
    normalizedCommand = normalizedArgs.shift();
  }

  return { command: normalizedCommand, args: normalizedArgs };
}

function hasOfficialTarget(args) {
  return args.some(isOfficialTarget);
}

function shouldBlockNpmLike(command, args) {
  if (!(isNpmCommand(command) || isPnpmCommand(command))) return false;
  if (!args.find(isSupportedOperation)) return false;
  return hasOfficialTarget(args);
}

function shouldBlockYarn(command, args) {
  if (!isYarnCommand(command)) return false;
  return String(args[0] || '') === 'global' && String(args[1] || '') === 'add' && hasOfficialTarget(args.slice(2));
}

function shouldBlockNpx(command, args) {
  if (!isNpxCommand(command)) return false;
  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index] || '');
    if (token === '-p' || token === '--package') {
      if (isOfficialTarget(args[index + 1])) return true;
      index += 1;
      continue;
    }
    if (token.startsWith('--package=')) {
      if (isOfficialTarget(token.slice('--package='.length))) return true;
      continue;
    }
    if (!token.startsWith('-')) {
      return isOfficialTarget(token);
    }
  }
  return false;
}

function shouldBlockCommand(command, args) {
  if (!Array.isArray(args)) return false;
  const normalized = normalizeCommand(command, args);
  return (
    shouldBlockNpmLike(normalized.command, normalized.args) ||
    shouldBlockYarn(normalized.command, normalized.args) ||
    shouldBlockNpx(normalized.command, normalized.args)
  );
}

function normalizeTokensForExec(tokens) {
  if (tokens.length === 0) return tokens;
  const normalized = normalizeCommand(tokens[0], tokens.slice(1));
  return [normalized.command, ...normalized.args].filter(value => value !== undefined);
}

function unwrapShellCommand(command, args) {
  if (!isShellCommand(command) || !Array.isArray(args) || args.length < 2) return null;
  const first = String(args[0] || '');
  const second = String(args[1] || '');
  if ((first === '-c' || first === '-lc') && second) return second;
  if (first === '-l' && String(args[1] || '') === '-c' && String(args[2] || '')) return String(args[2]);
  return null;
}

function tokenizeShellString(command) {
  const text = String(command || '').trim();
  if (!text) return [];
  return text.match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/g) || [];
}

function unquote(token) {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

function shouldBlockExecString(command) {
  const tokens = normalizeTokensForExec(tokenizeShellString(command).map(unquote));
  if (tokens.length === 0) return false;
  const shellInner = unwrapShellCommand(tokens[0], tokens.slice(1));
  if (shellInner) return shouldBlockExecString(shellInner);
  return shouldBlockCommand(tokens[0], tokens.slice(1));
}

function createBlockedError(blockedStderr) {
  const error = new Error(BLOCK_MESSAGE);
  error.code = 'CLAUDE_TERMUX_OFFICIAL_UPDATE_BLOCKED';
  error.status = 1;
  error.stdout = Buffer.from('');
  error.stderr = Buffer.from(blockedStderr);
  return error;
}

function createBlockedSpawn(blockedStderr, stderrWriter, options) {
  const child = new EventEmitter();
  child.stdout = null;
  child.stderr = null;
  child.stdin = null;
  child.pid = 0;
  child.killed = false;
  child.kill = () => false;
  process.nextTick(() => {
    if (!(options && options.stdio === 'ignore')) {
      stderrWriter(blockedStderr);
    }
    child.emit('close', 1, null);
    child.emit('exit', 1, null);
  });
  return child;
}

function createBlockedSpawnSync(blockedStderr, stderrWriter) {
  stderrWriter(blockedStderr);
  return {
    pid: 0,
    output: [null, Buffer.from(''), Buffer.from(blockedStderr)],
    stdout: Buffer.from(''),
    stderr: Buffer.from(blockedStderr),
    status: 1,
    signal: null,
    error: createBlockedError(blockedStderr),
  };
}

function createBlockedExecResult(blockedStderr, stderrWriter, callback) {
  const child = createBlockedSpawn(blockedStderr, stderrWriter);
  const error = createBlockedError(blockedStderr);
  process.nextTick(() => {
    if (typeof callback === 'function') {
      callback(error, '', blockedStderr);
    }
  });
  return child;
}

function shouldBlockSpawnArgs(args) {
  if (!Array.isArray(args) || args.length === 0) return false;
  const command = args[0];
  const commandArgs = Array.isArray(args[1]) ? args[1] : [];
  const shellInner = unwrapShellCommand(command, commandArgs);
  if (shellInner) return shouldBlockExecString(shellInner);
  return shouldBlockCommand(command, commandArgs);
}

function createGuardedChildProcess(realChild, stderrWriter = value => process.stderr.write(value)) {
  const blockedStderr = `${BLOCK_MESSAGE}\n`;
  return {
    spawn: (...args) => {
      if (shouldBlockSpawnArgs(args)) return createBlockedSpawn(blockedStderr, stderrWriter, args[2]);
      return realChild.spawn(...args);
    },
    execFile: (...args) => {
      if (shouldBlockSpawnArgs(args)) return createBlockedExecResult(blockedStderr, stderrWriter, args[args.length - 1]);
      return realChild.execFile(...args);
    },
    exec: (...args) => {
      if (shouldBlockExecString(args[0])) return createBlockedExecResult(blockedStderr, stderrWriter, args[args.length - 1]);
      return realChild.exec(...args);
    },
    spawnSync: (...args) => {
      if (shouldBlockSpawnArgs(args)) return createBlockedSpawnSync(blockedStderr, stderrWriter);
      return realChild.spawnSync(...args);
    },
    execFileSync: (...args) => {
      if (shouldBlockSpawnArgs(args)) throw createBlockedError(blockedStderr);
      return realChild.execFileSync(...args);
    },
    execSync: (...args) => {
      if (shouldBlockExecString(args[0])) throw createBlockedError(blockedStderr);
      return realChild.execSync(...args);
    },
  };
}

module.exports = {
  BLOCK_MESSAGE,
  OFFICIAL_PACKAGE,
  createGuardedChildProcess,
  shouldBlockCommand,
  shouldBlockExecString,
};
