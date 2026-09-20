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
