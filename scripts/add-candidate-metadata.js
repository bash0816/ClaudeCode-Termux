#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const version = process.argv[2];
const offsetFile = process.argv[3];

if (!version || !offsetFile) {
  console.error('usage: node scripts/add-candidate-metadata.js <version> <offset-json-file>');
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, '..');
const configFiles = [
  path.join(repoRoot, 'config', 'claude-native-audited-versions.json'),
  path.join(repoRoot, 'packages', 'claude-code', 'config', 'claude-native-audited-versions.json'),
];
const packageFile = path.join(repoRoot, 'packages', 'claude-code', 'package.json');

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`failed to parse JSON: ${path.relative(repoRoot, file)}: ${error.message}`);
  }
}

function validateHooksStandalonePatches(patches) {
  if (!Array.isArray(patches)) {
    throw new Error('add-candidate-metadata: hooks_standalone_patches must be an array');
  }
  const seenFiles = new Set();
  for (const entry of patches) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('add-candidate-metadata: each hooks_standalone_patches entry must be an object');
    }
    const { file, expectedOccurrences } = entry;
    if (typeof file !== 'string' || file === '') {
      throw new Error('add-candidate-metadata: hooks_standalone_patches entry file must be a non-empty string');
    }
    // Check for NUL character before using path module functions
    if (file.includes('\0')) {
      throw new Error(`add-candidate-metadata: hooks_standalone_patches entry file contains NUL character: ${JSON.stringify(file)}`);
    }
    // Check for absolute path
    if (path.isAbsolute(file)) {
      throw new Error(`add-candidate-metadata: hooks_standalone_patches entry file must not be absolute: ${file}`);
    }
    // Check for '..' in path components
    const components = file.split(/[\\/]/);
    if (components.includes('..')) {
      throw new Error(`add-candidate-metadata: hooks_standalone_patches entry file must not contain '..': ${file}`);
    }
    // Check that resolved path stays within base directory
    const resolved = path.resolve('/x', file);
    const relative = path.relative('/x', resolved);
    if (relative.startsWith('..')) {
      throw new Error(`add-candidate-metadata: hooks_standalone_patches entry file resolves outside base directory: ${file}`);
    }
    if (!Number.isInteger(expectedOccurrences) || expectedOccurrences < 1) {
      throw new Error('add-candidate-metadata: hooks_standalone_patches entry expectedOccurrences must be an integer >= 1');
    }
    if (seenFiles.has(file)) {
      throw new Error(`add-candidate-metadata: duplicate file in hooks_standalone_patches: ${file}`);
    }
    seenFiles.add(file);
  }
}

function assertSameVersionKeys() {
  const rootConfig = loadJson(configFiles[0]);
  const packageConfig = loadJson(configFiles[1]);
  const rootKeys = Object.keys(rootConfig.versions).sort();
  const packageKeys = Object.keys(packageConfig.versions).sort();
  if (JSON.stringify(rootKeys) !== JSON.stringify(packageKeys)) {
    throw new Error('root/package version metadata mismatch after update');
  }
}

function main() {
  const offsets = loadJson(path.resolve(offsetFile));
  const entryFormat = offsets.entry_format === 'esm-chunked' ? 'esm-chunked' : 'legacy-cjs';

  const versionEntry = {
    wrapper_spec: `@anthropic-ai/claude-code@${version}`,
    native_spec: `@anthropic-ai/claude-code-linux-arm64@${version}`,
    entry_format: entryFormat,
    tarball_integrity: offsets.tarball_integrity,
    tarball_sha256: offsets.tarball_sha256,
    status: 'offset_discovered',
  };

  if (entryFormat === 'esm-chunked') {
    if (!(offsets.num_modules > 0)) {
      throw new Error('esm-chunked offsets missing num_modules');
    }
    if (!(offsets.byte_count > 0)) {
      throw new Error('esm-chunked offsets missing byte_count');
    }
    versionEntry.num_modules = offsets.num_modules;
    versionEntry.byte_count = offsets.byte_count;
    if (!Object.prototype.hasOwnProperty.call(offsets, 'cycle_hoists')) {
      throw new Error('add-candidate-metadata: esm-chunked candidate is missing cycle_hoists field (audit incomplete)');
    }
    versionEntry.cycle_hoists = offsets.cycle_hoists;
    if (Object.prototype.hasOwnProperty.call(offsets, 'cycle_hoists_skipped_assets')) {
      versionEntry.cycle_hoists_skipped_assets = offsets.cycle_hoists_skipped_assets;
    }
    if (!Object.prototype.hasOwnProperty.call(offsets, 'hooks_standalone_patches')) {
      throw new Error('add-candidate-metadata: esm-chunked candidate is missing hooks_standalone_patches field (audit incomplete)');
    }
    validateHooksStandalonePatches(offsets.hooks_standalone_patches);
    versionEntry.hooks_standalone_patches = offsets.hooks_standalone_patches;
  } else {
    if (!(offsets.entry_js_offset > 0) || !(offsets.entry_end_offset > offsets.entry_js_offset)) {
      throw new Error('legacy-cjs offsets missing entry_js_offset/entry_end_offset');
    }
    versionEntry.entry_js_offset = offsets.entry_js_offset;
    versionEntry.entry_end_offset = offsets.entry_end_offset;
  }

  const updatedFiles = [];

  for (const file of configFiles) {
    const config = loadJson(file);
    config.versions[version] = versionEntry;
    fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
    updatedFiles.push(path.relative(repoRoot, file));
  }

  const pkg = loadJson(packageFile);
  pkg.version = version;
  fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n');
  updatedFiles.push(path.relative(repoRoot, packageFile));

  assertSameVersionKeys();

  process.stdout.write(JSON.stringify({
    version,
    updated_files: updatedFiles,
  }, null, 2) + '\n');
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
