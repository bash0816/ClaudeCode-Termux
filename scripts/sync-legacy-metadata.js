#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const canonicalRepoRoot = path.resolve(__dirname, '..');
const legacyRepoRoot = process.env.CLAUDE_TERMUX_LEGACY_REPO_ROOT || path.join(os.homedir(), 'CluadeCode-Termux-public');
const canonicalSourceRef = process.env.CLAUDE_TERMUX_CANONICAL_SOURCE_REF || 'origin/main';
const legacyRootConfigFile = path.join(legacyRepoRoot, 'config', 'claude-native-audited-versions.json');
const legacyPackageConfigFile = path.join(legacyRepoRoot, 'packages', 'cluade-code', 'config', 'claude-native-audited-versions.json');
const { compareVersions } = require('../packages/claude-code/lib/version-utils');

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function run(command, args, cwd) {
  const result = cp.spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function loadCanonicalConfigFromRef(ref) {
  const raw = run('git', ['show', `${ref}:config/claude-native-audited-versions.json`], canonicalRepoRoot);
  return JSON.parse(raw);
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

  const canonicalConfig = loadCanonicalConfigFromRef(canonicalSourceRef);
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
