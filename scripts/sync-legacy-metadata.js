#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const canonicalRepoRoot = path.resolve(__dirname, '..');
const legacyRepoRoot = process.env.CLAUDE_TERMUX_LEGACY_REPO_ROOT || path.join(os.homedir(), 'CluadeCode-Termux-public');

const canonicalConfigFile = path.join(canonicalRepoRoot, 'config', 'claude-native-audited-versions.json');
const legacyRootConfigFile = path.join(legacyRepoRoot, 'config', 'claude-native-audited-versions.json');
const legacyPackageConfigFile = path.join(legacyRepoRoot, 'packages', 'cluade-code', 'config', 'claude-native-audited-versions.json');

function compareVersions(a, b) {
  const aParts = String(a).split('.').map(Number);
  const bParts = String(b).split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < len; index += 1) {
    const diff = (aParts[index] || 0) - (bParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function pickVerifiedVersions(canonicalConfig) {
  const versions = Object.keys(canonicalConfig.versions || {})
    .filter((version) => canonicalConfig.versions[version].status === 'termux_verified')
    .sort(compareVersions);

  const selected = {};
  for (const version of versions) {
    selected[version] = canonicalConfig.versions[version];
  }
  return selected;
}

function main() {
  if (!fs.existsSync(legacyRepoRoot)) {
    throw new Error(`legacy repo root not found: ${legacyRepoRoot}`);
  }

  const canonicalConfig = loadJson(canonicalConfigFile);
  const legacyRootConfig = loadJson(legacyRootConfigFile);
  const legacyPackageConfig = loadJson(legacyPackageConfigFile);
  const verifiedVersions = pickVerifiedVersions(canonicalConfig);

  legacyRootConfig.versions = verifiedVersions;
  legacyPackageConfig.versions = verifiedVersions;

  saveJson(legacyRootConfigFile, legacyRootConfig);
  saveJson(legacyPackageConfigFile, legacyPackageConfig);
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
