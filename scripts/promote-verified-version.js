#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) {
  console.error('usage: node scripts/promote-verified-version.js <version>');
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, '..');
const configFiles = [
  path.join(repoRoot, 'config', 'claude-native-audited-versions.json'),
  path.join(repoRoot, 'packages', 'claude-code', 'config', 'claude-native-audited-versions.json'),
];
const packageFile = path.join(repoRoot, 'packages', 'claude-code', 'package.json');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

for (const file of configFiles) {
  const config = loadJson(file);
  if (!config.versions[version]) {
    throw new Error(`unknown version in ${path.relative(repoRoot, file)}: ${version}`);
  }
  config.versions[version].status = 'termux_verified';
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
}

const pkg = loadJson(packageFile);
pkg.version = version;
fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');
