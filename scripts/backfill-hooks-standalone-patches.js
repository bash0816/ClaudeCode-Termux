#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const version = process.argv[2];
const offsetFile = process.argv[3];
let cloneAsVersion = null;
let rootDir = null;

// Parse arguments
let i = 4;
while (i < process.argv.length) {
  if (process.argv[i] === '--clone-as' && i + 1 < process.argv.length) {
    cloneAsVersion = process.argv[i + 1];
    i += 2;
  } else if (process.argv[i] === '--root' && i + 1 < process.argv.length) {
    rootDir = process.argv[i + 1];
    i += 2;
  } else {
    i++;
  }
}

if (!version || !offsetFile) {
  console.error('usage: node scripts/backfill-hooks-standalone-patches.js <version> <offset-json-file> [--clone-as <newVersion>] [--root <dir>]');
  process.exit(1);
}

const repoRoot = rootDir ? path.resolve(rootDir) : path.resolve(__dirname, '..');
const configFiles = [
  path.join(repoRoot, 'config', 'claude-native-audited-versions.json'),
  path.join(repoRoot, 'packages', 'claude-code', 'config', 'claude-native-audited-versions.json'),
];

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`failed to parse JSON: ${path.relative(repoRoot, file)}: ${error.message}`);
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

function deepCopy(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(deepCopy);
  }
  const copy = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      copy[key] = deepCopy(obj[key]);
    }
  }
  return copy;
}

function validateHooksStandalonePatches(patches) {
  if (!Array.isArray(patches)) {
    throw new Error('backfill-hooks-standalone-patches: hooks_standalone_patches must be an array');
  }
  const seenFiles = new Set();
  for (const entry of patches) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('backfill-hooks-standalone-patches: each hooks_standalone_patches entry must be an object');
    }
    const { file, expectedOccurrences } = entry;
    if (typeof file !== 'string' || file === '') {
      throw new Error('backfill-hooks-standalone-patches: hooks_standalone_patches entry file must be a non-empty string');
    }
    if (!Number.isInteger(expectedOccurrences) || expectedOccurrences < 1) {
      throw new Error('backfill-hooks-standalone-patches: hooks_standalone_patches entry expectedOccurrences must be an integer >= 1');
    }
    if (seenFiles.has(file)) {
      throw new Error(`backfill-hooks-standalone-patches: duplicate file in hooks_standalone_patches: ${file}`);
    }
    seenFiles.add(file);
  }
}

function main() {
  const offsets = loadJson(path.resolve(offsetFile));

  // Validate offsets.hooks_standalone_patches
  if (!Object.prototype.hasOwnProperty.call(offsets, 'hooks_standalone_patches')) {
    throw new Error('backfill-hooks-standalone-patches: offsets JSON missing hooks_standalone_patches field');
  }
  validateHooksStandalonePatches(offsets.hooks_standalone_patches);

  // Validate --clone-as version format if provided
  if (cloneAsVersion) {
    const cloneRegex = new RegExp(`^${version}-[0-9]+$`);
    if (!cloneRegex.test(cloneAsVersion)) {
      throw new Error(`backfill-hooks-standalone-patches: --clone-as version "${cloneAsVersion}" must match "^${version}-[0-9]+$"`);
    }
  }

  const configs = configFiles.map(loadJson);
  const rootConfig = configs[0];
  const packageConfig = configs[1];

  // Verify version keys are identical across configs
  const rootKeys = Object.keys(rootConfig.versions).sort();
  const packageKeys = Object.keys(packageConfig.versions).sort();
  if (JSON.stringify(rootKeys) !== JSON.stringify(packageKeys)) {
    throw new Error('backfill-hooks-standalone-patches: version keys mismatch between root and package configs');
  }

  // In clone mode, verify that cloneAsVersion doesn't already exist
  if (cloneAsVersion) {
    if (Object.prototype.hasOwnProperty.call(rootConfig.versions, cloneAsVersion)) {
      throw new Error(`backfill-hooks-standalone-patches: version "${cloneAsVersion}" already exists in root config`);
    }
    if (Object.prototype.hasOwnProperty.call(packageConfig.versions, cloneAsVersion)) {
      throw new Error(`backfill-hooks-standalone-patches: version "${cloneAsVersion}" already exists in package config`);
    }
  }

  // Verify source version exists and is esm-chunked
  if (!Object.prototype.hasOwnProperty.call(rootConfig.versions, version)) {
    throw new Error(`backfill-hooks-standalone-patches: version "${version}" not found in root config`);
  }
  if (!Object.prototype.hasOwnProperty.call(packageConfig.versions, version)) {
    throw new Error(`backfill-hooks-standalone-patches: version "${version}" not found in package config`);
  }

  const sourceEntryRoot = rootConfig.versions[version];
  const sourceEntryPackage = packageConfig.versions[version];

  if (sourceEntryRoot.entry_format !== 'esm-chunked') {
    throw new Error(`backfill-hooks-standalone-patches: version "${version}" is not esm-chunked in root config`);
  }
  if (sourceEntryPackage.entry_format !== 'esm-chunked') {
    throw new Error(`backfill-hooks-standalone-patches: version "${version}" is not esm-chunked in package config`);
  }

  let targetVersion = version;
  let updatedFiles = [];

  if (cloneAsVersion) {
    // Clone mode: copy the source entry and set hooks_standalone_patches and status
    const newEntryRoot = deepCopy(sourceEntryRoot);
    const newEntryPackage = deepCopy(sourceEntryPackage);

    newEntryRoot.hooks_standalone_patches = offsets.hooks_standalone_patches;
    newEntryRoot.status = 'offset_discovered';

    newEntryPackage.hooks_standalone_patches = offsets.hooks_standalone_patches;
    newEntryPackage.status = 'offset_discovered';

    // Verify entries are identical
    if (!deepEqual(newEntryRoot, newEntryPackage)) {
      throw new Error(`backfill-hooks-standalone-patches: cloned entries would differ between root and package configs`);
    }

    // Apply changes (only in memory for now, will write all at once)
    rootConfig.versions[cloneAsVersion] = newEntryRoot;
    packageConfig.versions[cloneAsVersion] = newEntryPackage;

    targetVersion = cloneAsVersion;
  } else {
    // Normal mode: update existing entries with hooks_standalone_patches
    const existingRoot = rootConfig.versions[version];
    const existingPackage = packageConfig.versions[version];

    if (Object.prototype.hasOwnProperty.call(existingRoot, 'hooks_standalone_patches')) {
      // Already has hooks_standalone_patches - check if it's the same
      if (!deepEqual(existingRoot.hooks_standalone_patches, offsets.hooks_standalone_patches)) {
        throw new Error(`backfill-hooks-standalone-patches: version "${version}" already has different hooks_standalone_patches in root config`);
      }
      // Same content, nothing to do (idempotent)
      process.stdout.write(JSON.stringify({
        version,
        cloned_as: null,
        updated_files: [],
      }, null, 2) + '\n');
      return;
    }

    if (Object.prototype.hasOwnProperty.call(existingPackage, 'hooks_standalone_patches')) {
      // Already has hooks_standalone_patches in package config
      if (!deepEqual(existingPackage.hooks_standalone_patches, offsets.hooks_standalone_patches)) {
        throw new Error(`backfill-hooks-standalone-patches: version "${version}" already has different hooks_standalone_patches in package config`);
      }
      // Same content, nothing to do (idempotent)
      process.stdout.write(JSON.stringify({
        version,
        cloned_as: null,
        updated_files: [],
      }, null, 2) + '\n');
      return;
    }

    // Set hooks_standalone_patches
    existingRoot.hooks_standalone_patches = offsets.hooks_standalone_patches;
    existingPackage.hooks_standalone_patches = offsets.hooks_standalone_patches;
  }

  // Verify configs still have same keys after modifications
  const updatedRootKeys = Object.keys(rootConfig.versions).sort();
  const updatedPackageKeys = Object.keys(packageConfig.versions).sort();
  if (JSON.stringify(updatedRootKeys) !== JSON.stringify(updatedPackageKeys)) {
    throw new Error('backfill-hooks-standalone-patches: version keys mismatch after update');
  }

  // Verify entries are identical between configs
  for (const v of updatedRootKeys) {
    if (!deepEqual(rootConfig.versions[v], packageConfig.versions[v])) {
      throw new Error(`backfill-hooks-standalone-patches: version "${v}" entries differ between root and package configs after update`);
    }
  }

  // Write config files
  for (let idx = 0; idx < configFiles.length; idx++) {
    const configObj = idx === 0 ? rootConfig : packageConfig;
    fs.writeFileSync(configFiles[idx], JSON.stringify(configObj, null, 2) + '\n');
    updatedFiles.push(path.relative(repoRoot, configFiles[idx]));
  }

  process.stdout.write(JSON.stringify({
    version,
    cloned_as: cloneAsVersion || null,
    updated_files: updatedFiles,
  }, null, 2) + '\n');
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
