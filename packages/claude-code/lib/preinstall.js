#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.env.CLAUDE_TERMUX_SKIP_PREINSTALL === '1') {
  process.exit(0);
}

const markers = [
  'CLAUDE_NATIVE_118_CANDIDATE_MARKER',
  'CLAUDE_NATIVE_AUDITED_CANDIDATE_MARKER',
];

const prefix = process.env.PREFIX || detectNpmPrefix();
if (!prefix) {
  process.exit(0);
}

const target = path.join(prefix, 'bin', 'claude');
if (!fs.existsSync(target)) {
  process.exit(0);
}

try {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    process.exit(0);
  }

  const head = fs.readFileSync(target, 'utf8').slice(0, 8192);
  if (!markers.some(marker => head.includes(marker))) {
    console.error(`Refusing to replace unmanaged existing claude binary: ${target}`);
    process.exit(1);
  }

  const backupDir = path.join(os.homedir(), '.claude-termux-native-package', 'preinstall-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `claude.${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z')}`);
  fs.renameSync(target, backup);
  console.error(`Moved existing audited Claude launcher to ${backup}`);
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}

function detectNpmPrefix() {
  const result = cp.spawnSync('npm', ['prefix', '-g'], { encoding: 'utf8' });
  if (result.status !== 0) {
    return '';
  }
  return result.stdout.trim();
}
