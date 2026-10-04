'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const cwd = path.resolve(__dirname, '..');

test('npm pack excludes upstream test fixtures and includes runtime files', () => {
  assert.ok(fs.existsSync(path.join(cwd, 'lib/test-fixtures/upstream-2.1.287/chunk-8h7qs60z.mjs')));
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd, encoding: 'utf8' });
  const files = JSON.parse(output)[0].files.map(file => file.path);
  assert.equal(files.some(file => file.startsWith('lib/test-fixtures/')), false);
  assert.ok(files.includes('bin/claude'));
  assert.ok(files.includes('lib/termux-run-claude-native.sh'));
});
