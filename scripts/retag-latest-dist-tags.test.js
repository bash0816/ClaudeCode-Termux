#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const packageDir = path.join(repoRoot, 'packages', 'claude-code');
const scriptPath = path.join(repoRoot, 'scripts', 'retag-latest-dist-tags.js');

function makeTempDir(prefix) {
  const baseDir = process.env.TMPDIR || (process.env.PREFIX ? path.join(process.env.PREFIX, 'tmp') : os.tmpdir());
  return fs.mkdtempSync(path.join(baseDir, prefix));
}

function writeFakeNpm(binDir, options = {}) {
  const logFile = path.join(path.dirname(binDir), 'npm-calls.log');
  const stateFile = path.join(path.dirname(binDir), 'npm-state.json');
  const scriptFile = path.join(binDir, 'npm');
  const currentTags = options.currentTags || { latest: '2.1.159-13', candidate: '2.1.161-3' };
  const failOnAddCall = options.failOnAddCall || 0;

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    scriptFile,
    `#!/usr/bin/env node
'use strict';

const fs = require('fs');

const logFile = process.env.FAKE_NPM_LOG_FILE;
const stateFile = process.env.FAKE_NPM_STATE_FILE;
const currentTags = JSON.parse(process.env.FAKE_NPM_CURRENT_TAGS);
const failOnAddCall = Number(process.env.FAKE_NPM_FAIL_ON_ADD_CALL || '0');

function log(line) {
  fs.appendFileSync(logFile, line + '\\n');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return { addCalls: 0 };
  }
}

function writeState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state));
}

const args = process.argv.slice(2);
log(['npm', ...args].join(' '));

if (args[0] === 'view' && args[1] === '@bash0816/claude-code' && args[2] === 'dist-tags' && args[3] === '--json') {
  process.stdout.write(JSON.stringify(currentTags));
  process.exit(0);
}

if (args[0] === 'dist-tag' && args[1] === 'add') {
  const state = readState();
  state.addCalls += 1;
  writeState(state);
  if (failOnAddCall > 0 && state.addCalls === failOnAddCall) {
    process.exit(1);
  }
  process.exit(0);
}

if (args[0] === 'dist-tag' && args[1] === 'rm') {
  process.exit(0);
}

if (args[0] === 'dist-tag' && args[1] === 'ls') {
  process.stdout.write('latest candidate\\n');
  process.exit(0);
}

process.stderr.write('unexpected npm invocation: ' + args.join(' ') + '\\n');
process.exit(1);
`,
  );
  fs.chmodSync(scriptFile, 0o755);

  return { logFile, stateFile, currentTags };
}

function runRetagTest(options = {}) {
  const tempDir = makeTempDir('claude-retag-test-');
  const binDir = path.join(tempDir, 'bin');
  const { logFile, stateFile, currentTags } = writeFakeNpm(binDir, options);
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    FAKE_NPM_LOG_FILE: logFile,
    FAKE_NPM_STATE_FILE: stateFile,
    FAKE_NPM_CURRENT_TAGS: JSON.stringify(currentTags),
    FAKE_NPM_FAIL_ON_ADD_CALL: String(options.failOnAddCall || 0),
    CLAUDE_TERMUX_EXPECTED_PREVIOUS_AUDITED_VERSION: options.previousAuditedVersion || '2.1.159-13',
  };

  const result = cp.spawnSync('node', [scriptPath], {
    cwd: packageDir,
    env,
    encoding: 'utf8',
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    log: fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean) : [],
  };
}

test('retag latest swaps dist-tags in the expected order', () => {
  const result = runRetagTest();

  assert.equal(result.status, 0);
  assert.deepEqual(result.log, [
    'npm view @bash0816/claude-code dist-tags --json',
    'npm dist-tag add @bash0816/claude-code@2.1.161-3 latest',
    'npm dist-tag add @bash0816/claude-code@2.1.159-13 candidate',
    'npm dist-tag ls @bash0816/claude-code',
  ]);
});

test('retag latest restores previous dist-tags when the promotion fails', () => {
  const result = runRetagTest({ failOnAddCall: 2 });

  assert.equal(result.status, 1);
  assert.deepEqual(result.log, [
    'npm view @bash0816/claude-code dist-tags --json',
    'npm dist-tag add @bash0816/claude-code@2.1.161-3 latest',
    'npm dist-tag add @bash0816/claude-code@2.1.159-13 candidate',
    'npm dist-tag add @bash0816/claude-code@2.1.159-13 latest',
    'npm dist-tag add @bash0816/claude-code@2.1.161-3 candidate',
  ]);
});

test('retag latest aborts when the registry tags drift', () => {
  const result = runRetagTest({
    currentTags: { latest: '2.1.165', candidate: '2.1.161-3' },
  });

  assert.equal(result.status, 1);
  assert.deepEqual(result.log, [
    'npm view @bash0816/claude-code dist-tags --json',
  ]);
});
