#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const path = require('path');

if (process.env.CLAUDE_TERMUX_SKIP_POSTINSTALL === '1') {
  process.exit(0);
}

const packageDir = path.resolve(__dirname, '..');
const pkg = require(path.join(packageDir, 'package.json'));
const script = path.join(__dirname, 'prepare-native.js');
const version = process.env.CLAUDE_TERMUX_CLAUDE_VERSION || pkg.version;

const result = cp.spawnSync(process.execPath, [script, version], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
