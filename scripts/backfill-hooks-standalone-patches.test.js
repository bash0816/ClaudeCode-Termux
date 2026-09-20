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

test('backfill-hooks-standalone-patches: update existing version', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files with identical versions
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file with hooks_standalone_patches
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, `Script failed: ${result.stderr}`);

    // Verify both config files have hooks_standalone_patches
    const configRoot = JSON.parse(fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8'));
    const configPackage = JSON.parse(fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8'));

    const expected = [{ file: 'chunk-1.js', expectedOccurrences: 1 }];
    assert.deepEqual(configRoot.versions['1.0.0'].hooks_standalone_patches, expected);
    assert.deepEqual(configPackage.versions['1.0.0'].hooks_standalone_patches, expected);

    // Verify output
    const output = JSON.parse(result.stdout);
    assert.equal(output.version, '1.0.0');
    assert.equal(output.cloned_as, null);
    assert.ok(Array.isArray(output.updated_files));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: idempotent on same content', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    const patchData = [{ file: 'chunk-1.js', expectedOccurrences: 1 }];

    // Create initial config files with hooks_standalone_patches already set
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
          hooks_standalone_patches: patchData,
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file with same hooks_standalone_patches
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: patchData,
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, `Script failed: ${result.stderr}`);

    // Verify output indicates no files were updated
    const output = JSON.parse(result.stdout);
    assert.equal(output.version, '1.0.0');
    assert.deepEqual(output.updated_files, []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: reject different content', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files with existing hooks_standalone_patches
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
          hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Save the original config
    const originalConfigRoot = fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8');
    const originalConfigPackage = fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8');

    // Create offset file with DIFFERENT hooks_standalone_patches
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-2.js', expectedOccurrences: 2 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when content differs');
    assert.match(result.stderr, /already has different/, 'Error should indicate content mismatch');

    // Verify config files were NOT modified
    const currentConfigRoot = fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8');
    const currentConfigPackage = fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8');
    assert.equal(currentConfigRoot, originalConfigRoot, 'Root config should not be modified');
    assert.equal(currentConfigPackage, originalConfigPackage, 'Package config should not be modified');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: clone-as with valid format', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files with source version
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file with hooks_standalone_patches
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script with --clone-as
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--clone-as', '1.0.0-1', '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, `Script failed: ${result.stderr}`);

    // Verify both config files have the new cloned version
    const configRoot = JSON.parse(fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8'));
    const configPackage = JSON.parse(fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8'));

    assert.ok(Object.prototype.hasOwnProperty.call(configRoot.versions, '1.0.0-1'), 'Cloned version should exist in root config');
    assert.ok(Object.prototype.hasOwnProperty.call(configPackage.versions, '1.0.0-1'), 'Cloned version should exist in package config');

    // Verify cloned entry has hooks_standalone_patches and status set
    const clonedRoot = configRoot.versions['1.0.0-1'];
    const clonedPackage = configPackage.versions['1.0.0-1'];
    const expected = [{ file: 'chunk-1.js', expectedOccurrences: 1 }];
    assert.deepEqual(clonedRoot.hooks_standalone_patches, expected);
    assert.deepEqual(clonedPackage.hooks_standalone_patches, expected);
    assert.equal(clonedRoot.status, 'offset_discovered');
    assert.equal(clonedPackage.status, 'offset_discovered');

    // Verify cloned entries are identical
    assert.deepEqual(clonedRoot, clonedPackage);

    // Verify source version still exists and unchanged
    assert.ok(Object.prototype.hasOwnProperty.call(configRoot.versions, '1.0.0'));
    assert.equal(
      Object.prototype.hasOwnProperty.call(configRoot.versions['1.0.0'], 'hooks_standalone_patches'),
      false,
      'Source version should not have hooks_standalone_patches'
    );

    // Verify output
    const output = JSON.parse(result.stdout);
    assert.equal(output.version, '1.0.0');
    assert.equal(output.cloned_as, '1.0.0-1');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: clone-as with invalid version format', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script with invalid --clone-as version
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--clone-as', 'invalid', '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail with invalid version format');
    assert.match(result.stderr, /must match/, 'Error should mention version format requirement');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: clone-as fails if target already exists', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files with both source and target versions already existing
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
        '1.0.0-1': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0-1',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0-1',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script with --clone-as to existing version
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--clone-as', '1.0.0-1', '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when target version exists');
    assert.match(result.stderr, /already exists/, 'Error should mention existing version');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: reject missing hooks_standalone_patches in offsets', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file WITHOUT hooks_standalone_patches
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {};
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when hooks_standalone_patches is missing');
    assert.match(result.stderr, /missing hooks_standalone_patches/, 'Error should mention missing field');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: reject invalid hooks_standalone_patches in offsets', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file with invalid hooks_standalone_patches
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 'invalid' }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when hooks_standalone_patches is invalid');
    assert.match(result.stderr, /expectedOccurrences/, 'Error should mention invalid expectedOccurrences');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: reject when version keys differ between configs (default mode)', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create config files with DIFFERENT version keys
    const rootConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    const packageConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
        '1.1.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.1.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.1.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-y',
          tarball_sha256: 'z',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };

    const rootConfigPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packageConfigPath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    // Save original content before writing
    fs.writeFileSync(rootConfigPath, JSON.stringify(rootConfig, null, 2) + '\n');
    fs.writeFileSync(packageConfigPath, JSON.stringify(packageConfig, null, 2) + '\n');

    const originalRootContent = fs.readFileSync(rootConfigPath, 'utf8');
    const originalPackageContent = fs.readFileSync(packageConfigPath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when version keys differ');
    assert.match(result.stderr, /version keys mismatch/, 'Error should mention version keys mismatch');

    // Verify both config files were NOT modified (byte-exact comparison)
    const finalRootContent = fs.readFileSync(rootConfigPath, 'utf8');
    const finalPackageContent = fs.readFileSync(packageConfigPath, 'utf8');
    assert.equal(finalRootContent, originalRootContent, 'Root config must not be modified');
    assert.equal(finalPackageContent, originalPackageContent, 'Package config must not be modified');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: reject when version keys differ between configs (clone-as mode)', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create config files with DIFFERENT version keys
    const rootConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    const packageConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
        '2.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@2.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@2.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-y',
          tarball_sha256: 'z',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };

    const rootConfigPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packageConfigPath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    fs.writeFileSync(rootConfigPath, JSON.stringify(rootConfig, null, 2) + '\n');
    fs.writeFileSync(packageConfigPath, JSON.stringify(packageConfig, null, 2) + '\n');

    const originalRootContent = fs.readFileSync(rootConfigPath, 'utf8');
    const originalPackageContent = fs.readFileSync(packageConfigPath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script with --clone-as
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--clone-as', '1.0.0-1', '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when version keys differ (clone-as mode)');

    // Verify both config files were NOT modified
    const finalRootContent = fs.readFileSync(rootConfigPath, 'utf8');
    const finalPackageContent = fs.readFileSync(packageConfigPath, 'utf8');
    assert.equal(finalRootContent, originalRootContent, 'Root config must not be modified');
    assert.equal(finalPackageContent, originalPackageContent, 'Package config must not be modified');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: reject when version is legacy-cjs', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files with legacy-cjs entry
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'legacy-cjs',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          entry_js_offset: 10,
          entry_end_offset: 20,
        },
      },
    };

    const rootConfigPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packageConfigPath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    fs.writeFileSync(rootConfigPath, JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(packageConfigPath, JSON.stringify(initialConfig, null, 2) + '\n');

    const originalRootContent = fs.readFileSync(rootConfigPath, 'utf8');
    const originalPackageContent = fs.readFileSync(packageConfigPath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when version is legacy-cjs');
    assert.match(result.stderr, /not esm-chunked/, 'Error should mention not esm-chunked');

    // Verify both config files were NOT modified
    const finalRootContent = fs.readFileSync(rootConfigPath, 'utf8');
    const finalPackageContent = fs.readFileSync(packageConfigPath, 'utf8');
    assert.equal(finalRootContent, originalRootContent, 'Root config must not be modified');
    assert.equal(finalPackageContent, originalPackageContent, 'Package config must not be modified');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: reject when version missing from one config', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create config files where version exists in root but not in package
    const rootConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    const packageConfig = {
      versions: {},
    };

    const rootConfigPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packageConfigPath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    fs.writeFileSync(rootConfigPath, JSON.stringify(rootConfig, null, 2) + '\n');
    fs.writeFileSync(packageConfigPath, JSON.stringify(packageConfig, null, 2) + '\n');

    const originalRootContent = fs.readFileSync(rootConfigPath, 'utf8');
    const originalPackageContent = fs.readFileSync(packageConfigPath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when version missing from one config');
    assert.match(result.stderr, /not found|mismatch/, 'Error should indicate version not found or mismatch');

    // Verify both config files were NOT modified
    const finalRootContent = fs.readFileSync(rootConfigPath, 'utf8');
    const finalPackageContent = fs.readFileSync(packageConfigPath, 'utf8');
    assert.equal(finalRootContent, originalRootContent, 'Root config must not be modified');
    assert.equal(finalPackageContent, originalPackageContent, 'Package config must not be modified');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: clone-as preserves source entry unchanged and creates deep equal clone', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const sourceEntry = {
      wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
      native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
      entry_format: 'esm-chunked',
      tarball_integrity: 'sha512-x',
      tarball_sha256: 'y',
      status: 'offset_discovered',
      num_modules: 100,
      byte_count: 1000,
      cycle_hoists: [],
    };

    const initialConfig = {
      versions: {
        '1.0.0': sourceEntry,
      },
    };

    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script with --clone-as
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--clone-as', '1.0.0-1', '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, `Script failed: ${result.stderr}`);

    // Verify both config files
    const configRoot = JSON.parse(fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8'));
    const configPackage = JSON.parse(fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8'));

    // Verify source entry is UNCHANGED (no hooks_standalone_patches added)
    assert.equal(
      Object.prototype.hasOwnProperty.call(configRoot.versions['1.0.0'], 'hooks_standalone_patches'),
      false,
      'Source entry in root config should not have hooks_standalone_patches'
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(configPackage.versions['1.0.0'], 'hooks_standalone_patches'),
      false,
      'Source entry in package config should not have hooks_standalone_patches'
    );

    // Verify cloned entries exist and are deep equal
    assert.ok(Object.prototype.hasOwnProperty.call(configRoot.versions, '1.0.0-1'), 'Cloned version should exist in root config');
    assert.ok(Object.prototype.hasOwnProperty.call(configPackage.versions, '1.0.0-1'), 'Cloned version should exist in package config');

    const clonedRoot = configRoot.versions['1.0.0-1'];
    const clonedPackage = configPackage.versions['1.0.0-1'];

    assert.deepEqual(clonedRoot, clonedPackage, 'Cloned entries must be deep equal between root and package configs');
    assert.deepEqual(clonedRoot.hooks_standalone_patches, offsets.hooks_standalone_patches, 'Cloned entry should have hooks_standalone_patches from offsets');
    assert.equal(clonedRoot.status, 'offset_discovered', 'Cloned entry should have status set to offset_discovered');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: rejects absolute path in offsets file', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file with absolute path
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: '/absolute/path.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Save original configs
    const originalRootConfig = fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8');
    const originalPackageConfig = fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when offsets file contains absolute path');
    assert.match(result.stderr, /must not be absolute/, 'Error should mention absolute path');

    // Verify neither config file was modified
    assert.equal(fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8'), originalRootConfig);
    assert.equal(fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8'), originalPackageConfig);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: rejects NUL character in offsets file', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file with NUL character
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk\x001.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Save original configs
    const originalRootConfig = fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8');
    const originalPackageConfig = fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when offsets file contains NUL character');
    assert.match(result.stderr, /NUL character/, 'Error should mention NUL character');

    // Verify neither config file was modified
    assert.equal(fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8'), originalRootConfig);
    assert.equal(fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8'), originalPackageConfig);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: rejects when root has patch but package does not (inconsistency)', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create config files with inconsistent hooks_standalone_patches
    const rootConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
          hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
        },
      },
    };
    const packageConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };

    const rootPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packagePath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    fs.writeFileSync(rootPath, JSON.stringify(rootConfig, null, 2) + '\n');
    fs.writeFileSync(packagePath, JSON.stringify(packageConfig, null, 2) + '\n');

    const originalRootConfig = fs.readFileSync(rootPath, 'utf8');
    const originalPackageConfig = fs.readFileSync(packagePath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when root/package inconsistent');
    assert.match(result.stderr, /root\/package inconsistent/, 'Error should mention root/package inconsistency');

    // Verify neither config file was modified (byte-exact comparison)
    assert.equal(fs.readFileSync(rootPath, 'utf8'), originalRootConfig, 'Root config must not be modified');
    assert.equal(fs.readFileSync(packagePath, 'utf8'), originalPackageConfig, 'Package config must not be modified');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: rejects when package has patch but root does not (inconsistency)', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create config files with inconsistent hooks_standalone_patches
    const rootConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    const packageConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
          hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
        },
      },
    };

    const rootPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packagePath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    fs.writeFileSync(rootPath, JSON.stringify(rootConfig, null, 2) + '\n');
    fs.writeFileSync(packagePath, JSON.stringify(packageConfig, null, 2) + '\n');

    const originalRootConfig = fs.readFileSync(rootPath, 'utf8');
    const originalPackageConfig = fs.readFileSync(packagePath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when root/package inconsistent');
    assert.match(result.stderr, /root\/package inconsistent/, 'Error should mention root/package inconsistency');

    // Verify neither config file was modified (byte-exact comparison)
    assert.equal(fs.readFileSync(rootPath, 'utf8'), originalRootConfig, 'Root config must not be modified');
    assert.equal(fs.readFileSync(packagePath, 'utf8'), originalPackageConfig, 'Package config must not be modified');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: 1st writeFileSync failure (root tmp) leaves both configs unchanged', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    const backfillModule = require(path.join(__dirname, 'backfill-hooks-standalone-patches.js'));

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    const rootPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packagePath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    fs.writeFileSync(rootPath, JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(packagePath, JSON.stringify(initialConfig, null, 2) + '\n');

    const originalRootString = fs.readFileSync(rootPath, 'utf8');
    const originalPackageString = fs.readFileSync(packagePath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Create mock fs where 1st writeFileSync throws
    let writeCallCount = 0;
    const mockFs = {
      ...fs,
      writeFileSync: function(filePath, data) {
        writeCallCount++;
        if (writeCallCount === 1) {
          throw new Error('Mock writeFileSync failure for root tmp');
        }
        return fs.writeFileSync(filePath, data);
      },
      readFileSync: fs.readFileSync,
      unlinkSync: fs.unlinkSync,
      renameSync: fs.renameSync,
    };

    // Run applyBackfill with mock fs
    let threwError = false;
    try {
      backfillModule.applyBackfill({
        version: '1.0.0',
        offsetFilePath: offsetFile,
        cloneAsVersionParam: null,
        configFilesList: [rootPath, packagePath],
        rootDirPath: tempRoot,
      }, { fs: mockFs });
    } catch (error) {
      threwError = true;
    }

    assert.ok(threwError, 'Should have thrown an error');

    // Verify both configs are unchanged
    assert.equal(fs.readFileSync(rootPath, 'utf8'), originalRootString, 'Root config must not be modified');
    assert.equal(fs.readFileSync(packagePath, 'utf8'), originalPackageString, 'Package config must not be modified');

    // Verify no temporary files remain
    const configDirContents = fs.readdirSync(configDir);
    const tmpFiles = configDirContents.filter(f => f.includes('.tmp'));
    assert.equal(tmpFiles.length, 0, `No temporary files should remain, but found: ${tmpFiles.join(', ')}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: 2nd writeFileSync failure (package tmp) deletes root tmp and leaves both unchanged', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    const backfillModule = require(path.join(__dirname, 'backfill-hooks-standalone-patches.js'));

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    const rootPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packagePath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    fs.writeFileSync(rootPath, JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(packagePath, JSON.stringify(initialConfig, null, 2) + '\n');

    const originalRootString = fs.readFileSync(rootPath, 'utf8');
    const originalPackageString = fs.readFileSync(packagePath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Create mock fs where 2nd writeFileSync throws
    let writeCallCount = 0;
    const mockFs = {
      ...fs,
      writeFileSync: function(filePath, data) {
        writeCallCount++;
        if (writeCallCount === 2) {
          throw new Error('Mock writeFileSync failure for package tmp');
        }
        return fs.writeFileSync(filePath, data);
      },
      readFileSync: fs.readFileSync,
      unlinkSync: fs.unlinkSync,
      renameSync: fs.renameSync,
    };

    // Run applyBackfill with mock fs
    let threwError = false;
    try {
      backfillModule.applyBackfill({
        version: '1.0.0',
        offsetFilePath: offsetFile,
        cloneAsVersionParam: null,
        configFilesList: [rootPath, packagePath],
        rootDirPath: tempRoot,
      }, { fs: mockFs });
    } catch (error) {
      threwError = true;
    }

    assert.ok(threwError, 'Should have thrown an error');

    // Verify both configs are unchanged
    assert.equal(fs.readFileSync(rootPath, 'utf8'), originalRootString, 'Root config must not be modified');
    assert.equal(fs.readFileSync(packagePath, 'utf8'), originalPackageString, 'Package config must not be modified');

    // Verify no temporary files remain
    const configDirContents = fs.readdirSync(configDir);
    const tmpFiles = configDirContents.filter(f => f.includes('.tmp'));
    assert.equal(tmpFiles.length, 0, `No temporary files should remain, but found: ${tmpFiles.join(', ')}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: 1st renameSync failure (root) leaves both configs unchanged and deletes package tmp', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    const backfillModule = require(path.join(__dirname, 'backfill-hooks-standalone-patches.js'));

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    const rootPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packagePath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    fs.writeFileSync(rootPath, JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(packagePath, JSON.stringify(initialConfig, null, 2) + '\n');

    const originalRootString = fs.readFileSync(rootPath, 'utf8');
    const originalPackageString = fs.readFileSync(packagePath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Create mock fs where 1st renameSync throws
    let renameCallCount = 0;
    const mockFs = {
      ...fs,
      writeFileSync: fs.writeFileSync,
      readFileSync: fs.readFileSync,
      unlinkSync: fs.unlinkSync,
      renameSync: function(oldPath, newPath) {
        renameCallCount++;
        if (renameCallCount === 1) {
          throw new Error('Mock rename failure for root');
        }
        return fs.renameSync(oldPath, newPath);
      },
    };

    // Run applyBackfill with mock fs
    let threwError = false;
    try {
      backfillModule.applyBackfill({
        version: '1.0.0',
        offsetFilePath: offsetFile,
        cloneAsVersionParam: null,
        configFilesList: [rootPath, packagePath],
        rootDirPath: tempRoot,
      }, { fs: mockFs });
    } catch (error) {
      threwError = true;
    }

    assert.ok(threwError, 'Should have thrown an error');

    // Verify both configs are unchanged
    assert.equal(fs.readFileSync(rootPath, 'utf8'), originalRootString, 'Root config must not be modified');
    assert.equal(fs.readFileSync(packagePath, 'utf8'), originalPackageString, 'Package config must not be modified');

    // Verify no temporary files remain
    const configDirContents = fs.readdirSync(configDir);
    const tmpFiles = configDirContents.filter(f => f.includes('.tmp'));
    assert.equal(tmpFiles.length, 0, `No temporary files should remain, but found: ${tmpFiles.join(', ')}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: mismatched hooks_standalone_patches content between root and package throws and leaves both unchanged', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create config files with DIFFERENT hooks_standalone_patches content
    const rootConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
          hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
        },
      },
    };
    const packageConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
          hooks_standalone_patches: [{ file: 'chunk-2.js', expectedOccurrences: 2 }],
        },
      },
    };

    const rootPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packagePath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    fs.writeFileSync(rootPath, JSON.stringify(rootConfig, null, 2) + '\n');
    fs.writeFileSync(packagePath, JSON.stringify(packageConfig, null, 2) + '\n');

    const originalRootConfig = fs.readFileSync(rootPath, 'utf8');
    const originalPackageConfig = fs.readFileSync(packagePath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when hooks_standalone_patches content differs');
    assert.match(result.stderr, /root\/package inconsistent/, 'Error should mention inconsistency');

    // Verify both config files were NOT modified
    assert.equal(fs.readFileSync(rootPath, 'utf8'), originalRootConfig, 'Root config must not be modified');
    assert.equal(fs.readFileSync(packagePath, 'utf8'), originalPackageConfig, 'Package config must not be modified');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: rejects .. in file path (offsets JSON)', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    const rootPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packagePath = path.join(packageConfigDir, 'claude-native-audited-versions.json');
    const originalRootConfig = fs.readFileSync(rootPath, 'utf8');
    const originalPackageConfig = fs.readFileSync(packagePath, 'utf8');

    // Create offset file with .. in path
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'a/../../../etc/passwd', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when file contains ..');
    assert.match(result.stderr, /must not contain|resolves outside/, 'Error should mention .. or outside directory');

    // Verify both config files were NOT modified
    assert.equal(fs.readFileSync(rootPath, 'utf8'), originalRootConfig, 'Root config must not be modified');
    assert.equal(fs.readFileSync(packagePath, 'utf8'), originalPackageConfig, 'Package config must not be modified');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: success leaves no temporary files (normal mode)', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, `Script failed: ${result.stderr}`);

    // Verify no temporary files remain
    const configDirContents = fs.readdirSync(configDir);
    const packageConfigDirContents = fs.readdirSync(packageConfigDir);
    const tmpFilesRoot = configDirContents.filter(f => f.includes('.tmp'));
    const tmpFilesPackage = packageConfigDirContents.filter(f => f.includes('.tmp'));
    assert.equal(tmpFilesRoot.length, 0, `Root config dir: no tmp files should remain, but found: ${tmpFilesRoot.join(', ')}`);
    assert.equal(tmpFilesPackage.length, 0, `Package config dir: no tmp files should remain, but found: ${tmpFilesPackage.join(', ')}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: success leaves no temporary files (clone-as mode)', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files with source version
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill script with --clone-as
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--clone-as', '1.0.0-1', '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 0, `Script failed: ${result.stderr}`);

    // Verify no temporary files remain
    const configDirContents = fs.readdirSync(configDir);
    const packageConfigDirContents = fs.readdirSync(packageConfigDir);
    const tmpFilesRoot = configDirContents.filter(f => f.includes('.tmp'));
    const tmpFilesPackage = packageConfigDirContents.filter(f => f.includes('.tmp'));
    assert.equal(tmpFilesRoot.length, 0, `Root config dir: no tmp files should remain, but found: ${tmpFilesRoot.join(', ')}`);
    assert.equal(tmpFilesPackage.length, 0, `Package config dir: no tmp files should remain, but found: ${tmpFilesPackage.join(', ')}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: 2nd rename failure restores root config and cleans up tmpfiles', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Require the backfill script module to access applyBackfill
    // Capture stdout to prevent process.stdout.write() from polluting test output
    const originalWrite = process.stdout.write;
    const stdoutLines = [];
    process.stdout.write = function(chunk, encoding, callback) {
      stdoutLines.push(chunk);
      if (typeof encoding === 'function') {
        callback = encoding;
        encoding = undefined;
      }
      if (callback) callback();
      return true;
    };

    let backfillModule;
    try {
      backfillModule = require(path.join(__dirname, 'backfill-hooks-standalone-patches.js'));
    } finally {
      process.stdout.write = originalWrite;
    }

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    const rootPath = path.join(configDir, 'claude-native-audited-versions.json');
    const packagePath = path.join(packageConfigDir, 'claude-native-audited-versions.json');

    fs.writeFileSync(rootPath, JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(packagePath, JSON.stringify(initialConfig, null, 2) + '\n');

    const originalRootString = fs.readFileSync(rootPath, 'utf8');

    // Create offset file
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      hooks_standalone_patches: [{ file: 'chunk-1.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Create mock fs with failing rename on 2nd call
    let renameCallCount = 0;
    const mockFs = {
      ...fs,
      renameSync: function(oldPath, newPath) {
        renameCallCount++;
        if (renameCallCount === 2) {
          throw new Error('Mock rename failure for testing');
        }
        return fs.renameSync(oldPath, newPath);
      },
      readFileSync: fs.readFileSync,
      writeFileSync: fs.writeFileSync,
      unlinkSync: fs.unlinkSync,
    };

    // Run applyBackfill with mock fs
    let threwError = false;
    let errorMessage = '';
    try {
      backfillModule.applyBackfill({
        version: '1.0.0',
        offsetFilePath: offsetFile,
        cloneAsVersionParam: null,
        configFilesList: [rootPath, packagePath],
        rootDirPath: tempRoot,
      }, { fs: mockFs });
    } catch (error) {
      threwError = true;
      errorMessage = error.message;
    }

    assert.ok(threwError, 'Should have thrown an error');
    assert.match(errorMessage, /rename failed|recovery/, 'Error should mention rename failure or recovery');

    // Verify root config was restored (byte-exact comparison)
    const finalRootString = fs.readFileSync(rootPath, 'utf8');
    assert.equal(finalRootString, originalRootString, 'Root config should be restored to original');

    // Verify no temporary files remain
    const configDirContents = fs.readdirSync(configDir);
    const tmpFiles = configDirContents.filter(f => f.includes('.tmp'));
    assert.equal(tmpFiles.length, 0, `No temporary files should remain, but found: ${tmpFiles.join(', ')}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: rejects .. as substring in filename (chunk..qle.js)', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files with identical versions
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file with .. as substring in filename (not as a path component)
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      entry_format: 'esm-chunked',
      tarball_integrity: 'sha512-x',
      tarball_sha256: 'y',
      num_modules: 100,
      byte_count: 1000,
      cycle_hoists: [],
      hooks_standalone_patches: [{ file: 'chunk..qle.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill-hooks-standalone-patches
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    assert.equal(result.status, 1, 'Script should fail when file contains .. substring');
    assert.ok(result.stderr.includes("contains '..'"), 'Error should mention .. substring');

    // Verify both config files were NOT modified
    const configRoot = JSON.parse(fs.readFileSync(path.join(configDir, 'claude-native-audited-versions.json'), 'utf8'));
    const configPackage = JSON.parse(fs.readFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), 'utf8'));
    assert.deepEqual(configRoot.versions, initialConfig.versions, 'Root config should not be modified');
    assert.deepEqual(configPackage.versions, initialConfig.versions, 'Package config should not be modified');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('backfill-hooks-standalone-patches: accepts valid chunk-abc.js filename', () => {
  const tempRoot = makeTempDir('backfill-test-');
  try {
    // Copy script to temp directory
    const scriptSourcePath = path.join(__dirname, 'backfill-hooks-standalone-patches.js');
    const scriptTempDir = path.join(tempRoot, 'scripts');
    fs.mkdirSync(scriptTempDir, { recursive: true });
    const scriptDestPath = path.join(scriptTempDir, 'backfill-hooks-standalone-patches.js');
    fs.copyFileSync(scriptSourcePath, scriptDestPath);

    // Create directory structure
    const configDir = path.join(tempRoot, 'config');
    const packageConfigDir = path.join(tempRoot, 'packages', 'claude-code', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(packageConfigDir, { recursive: true });

    // Create initial config files with identical versions
    const initialConfig = {
      versions: {
        '1.0.0': {
          wrapper_spec: '@anthropic-ai/claude-code@1.0.0',
          native_spec: '@anthropic-ai/claude-code-linux-arm64@1.0.0',
          entry_format: 'esm-chunked',
          tarball_integrity: 'sha512-x',
          tarball_sha256: 'y',
          status: 'offset_discovered',
          num_modules: 100,
          byte_count: 1000,
          cycle_hoists: [],
        },
      },
    };
    fs.writeFileSync(path.join(configDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');
    fs.writeFileSync(path.join(packageConfigDir, 'claude-native-audited-versions.json'), JSON.stringify(initialConfig, null, 2) + '\n');

    // Create offset file with valid filename (chunk-abc.js with no .. substring)
    const offsetFile = path.join(tempRoot, 'offsets.json');
    const offsets = {
      entry_format: 'esm-chunked',
      tarball_integrity: 'sha512-x',
      tarball_sha256: 'y',
      num_modules: 100,
      byte_count: 1000,
      cycle_hoists: [],
      hooks_standalone_patches: [{ file: 'chunk-abc.js', expectedOccurrences: 1 }],
    };
    fs.writeFileSync(offsetFile, JSON.stringify(offsets, null, 2) + '\n');

    // Run backfill-hooks-standalone-patches
    const result = cp.spawnSync('node', [scriptDestPath, '1.0.0', offsetFile, '--root', tempRoot], {
      cwd: tempRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // This should succeed (file exists check may fail, but hook validation should pass)
    // Just verify that it doesn't fail due to .. validation
    assert.ok(!result.stderr.includes("contains '..'"), 'Error should not mention .. substring for valid filename');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
