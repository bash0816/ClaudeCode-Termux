#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

function makeTempDir(prefix) {
  const baseDir = process.env.TMPDIR || (process.env.PREFIX ? path.join(process.env.PREFIX, 'tmp') : os.tmpdir());
  return fs.mkdtempSync(path.join(baseDir, prefix));
}

test('add-candidate-metadata: esm-chunked with cycle_hoists_skipped_assets', () => {
  const tempRoot = makeTempDir('add-candidate-metadata-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'add-candidate-metadata.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'add-candidate-metadata.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files (both must have identical version keys)
    const initialConfig = { versions: {} };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create package.json
    fs.mkdirSync(path.join(tempRoot, 'packages', 'claude-code'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'packages', 'claude-code', 'package.json'), JSON.stringify({ version: '0.0.0', name: '@anthropic-ai/claude-code' }, null, 2) + '\n');

    // Create offset file with cycle_hoists_skipped_assets
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      entry_format: 'esm-chunked',
      tarball_integrity: 'sha512-x',
      tarball_sha256: 'y',
      num_modules: 100,
      byte_count: 1000,
      cycle_hoists: [],
      cycle_hoists_skipped_assets: ['vendor1.js', 'vendor2.js'],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run add-candidate-metadata
    const result = cp.spawnSync('node', [scriptDestPath, '9.9.9', offsetFile], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, `Script failed: ${result.stderr}`);

    // Verify both config files have cycle_hoists_skipped_assets
    const configRoot = JSON.parse(fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8'));
    const configPackage = JSON.parse(fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8'));

    assert.deepEqual(configRoot.versions['9.9.9'].cycle_hoists_skipped_assets, ['vendor1.js', 'vendor2.js']);
    assert.deepEqual(configPackage.versions['9.9.9'].cycle_hoists_skipped_assets, ['vendor1.js', 'vendor2.js']);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('add-candidate-metadata: esm-chunked without cycle_hoists_skipped_assets', () => {
  const tempRoot = makeTempDir('add-candidate-metadata-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'add-candidate-metadata.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'add-candidate-metadata.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files (both must have identical version keys)
    const initialConfig = { versions: {} };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create package.json
    fs.mkdirSync(path.join(tempRoot, 'packages', 'claude-code'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'packages', 'claude-code', 'package.json'), JSON.stringify({ version: '0.0.0', name: '@anthropic-ai/claude-code' }, null, 2) + '\n');

    // Create offset file WITHOUT cycle_hoists_skipped_assets
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      entry_format: 'esm-chunked',
      tarball_integrity: 'sha512-x',
      tarball_sha256: 'y',
      num_modules: 100,
      byte_count: 1000,
      cycle_hoists: [],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run add-candidate-metadata
    const result = cp.spawnSync('node', [scriptDestPath, '9.9.9', offsetFile], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, `Script failed: ${result.stderr}`);

    // Verify both config files do NOT have cycle_hoists_skipped_assets key
    const configRoot = JSON.parse(fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8'));
    const configPackage = JSON.parse(fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8'));

    assert.equal(
      Object.prototype.hasOwnProperty.call(configRoot.versions['9.9.9'], 'cycle_hoists_skipped_assets'),
      false,
      'cycle_hoists_skipped_assets should not exist in root config'
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(configPackage.versions['9.9.9'], 'cycle_hoists_skipped_assets'),
      false,
      'cycle_hoists_skipped_assets should not exist in package config'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('add-candidate-metadata: legacy-cjs ignores cycle_hoists_skipped_assets', () => {
  const tempRoot = makeTempDir('add-candidate-metadata-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'add-candidate-metadata.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'add-candidate-metadata.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files (both must have identical version keys)
    const initialConfig = { versions: {} };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create package.json
    fs.mkdirSync(path.join(tempRoot, 'packages', 'claude-code'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'packages', 'claude-code', 'package.json'), JSON.stringify({ version: '0.0.0', name: '@anthropic-ai/claude-code' }, null, 2) + '\n');

    // Create offset file for legacy-cjs WITH cycle_hoists_skipped_assets (should be ignored)
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      entry_format: 'legacy-cjs',
      tarball_integrity: 'sha512-x',
      tarball_sha256: 'y',
      entry_js_offset: 10,
      entry_end_offset: 20,
      cycle_hoists_skipped_assets: ['vendor1.js'],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run add-candidate-metadata
    const result = cp.spawnSync('node', [scriptDestPath, '9.9.9', offsetFile], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, `Script failed: ${result.stderr}`);

    // Verify both config files do NOT have cycle_hoists_skipped_assets key (legacy-cjs should ignore it)
    const configRoot = JSON.parse(fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8'));
    const configPackage = JSON.parse(fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8'));

    assert.equal(
      Object.prototype.hasOwnProperty.call(configRoot.versions['9.9.9'], 'cycle_hoists_skipped_assets'),
      false,
      'legacy-cjs should not have cycle_hoists_skipped_assets'
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(configPackage.versions['9.9.9'], 'cycle_hoists_skipped_assets'),
      false,
      'legacy-cjs should not have cycle_hoists_skipped_assets'
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
