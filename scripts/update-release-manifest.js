#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const rootConfigFile = path.join(repoRoot, 'config', 'claude-native-audited-versions.json');
const packageConfigFile = path.join(repoRoot, 'packages', 'claude-code', 'config', 'claude-native-audited-versions.json');
const packageFile = path.join(repoRoot, 'packages', 'claude-code', 'package.json');
const { compareVersions } = require('../packages/claude-code/lib/version-utils');
const manifestFiles = [
  path.join(repoRoot, 'config', 'claude-termux-release-manifest.json'),
  path.join(repoRoot, 'packages', 'claude-code', 'config', 'claude-termux-release-manifest.json'),
];
const manifestUrl = 'https://raw.githubusercontent.com/bash0816/ClaudeCode-Termux/main/config/claude-termux-release-manifest.json';

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function maxVersion(versions) {
  return versions.slice().sort(compareVersions).pop() || '';
}

function secondMaxVersion(versions) {
  const sorted = versions.slice().sort(compareVersions);
  return sorted.length >= 2 ? sorted[sorted.length - 2] : '';
}

function assertSameVersions(rootConfig, packageConfig) {
  const rootVersions = Object.keys(rootConfig.versions).sort(compareVersions);
  const packageVersions = Object.keys(packageConfig.versions).sort(compareVersions);
  if (JSON.stringify(rootVersions) !== JSON.stringify(packageVersions)) {
    throw new Error('root/package version metadata mismatch');
  }
}

function main() {
  const rootConfig = loadJson(rootConfigFile);
  const packageConfig = loadJson(packageConfigFile);
  const pkg = loadJson(packageFile);

  assertSameVersions(rootConfig, packageConfig);

  const versions = Object.keys(rootConfig.versions);
  const stableVersions = versions.filter(version => rootConfig.versions[version].status === 'termux_verified');
  const candidateVersions = versions.filter(version => ['termux_verified', 'offset_discovered'].includes(rootConfig.versions[version].status));

  const manifest = {
    manifest_version: 1,
    package_name: pkg.name,
    latest_audited_version: maxVersion(stableVersions),
    latest_candidate_version: candidateVersions.includes(pkg.version) ? pkg.version : maxVersion(candidateVersions),
    previous_stable_version: secondMaxVersion(stableVersions),
    manifest_url: manifestUrl,
  };

  for (const file of manifestFiles) {
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
