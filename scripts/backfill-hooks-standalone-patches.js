#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const version = process.argv[2];
const offsetFile = process.argv[3];
let cloneAsVersion = null;
let rootDir = null;

// Parse arguments and initialize variables only when run as CLI
let repoRoot;
let configFiles;

function initializeCLI() {
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

  repoRoot = rootDir ? path.resolve(rootDir) : path.resolve(__dirname, '..');
}

// Initialize on CLI run only
if (require.main === module) {
  initializeCLI();
} else {
  // Set defaults for module use
  repoRoot = path.resolve(__dirname, '..');
}
function getConfigFiles() {
  return [
    path.join(repoRoot, 'config', 'claude-native-audited-versions.json'),
    path.join(repoRoot, 'packages', 'claude-code', 'config', 'claude-native-audited-versions.json'),
  ];
}

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
    // Check for NUL character before using path module functions
    if (file.includes('\0')) {
      throw new Error(`backfill-hooks-standalone-patches: hooks_standalone_patches entry file contains NUL character: ${JSON.stringify(file)}`);
    }
    // Check for absolute path
    if (path.isAbsolute(file)) {
      throw new Error(`backfill-hooks-standalone-patches: hooks_standalone_patches entry file must not be absolute: ${file}`);
    }
    // Check for '..' in path components
    const components = file.split(/[\\/]/);
    if (components.includes('..')) {
      throw new Error(`backfill-hooks-standalone-patches: hooks_standalone_patches entry file must not contain '..': ${file}`);
    }
    // Check for '..' anywhere in the file path (matching loader's includes('..')  check)
    if (file.includes('..')) {
      throw new Error(`backfill-hooks-standalone-patches: hooks_standalone_patches entry file contains '..' substring: ${file}`);
    }
    // Check that resolved path stays within base directory
    const resolved = path.resolve('/x', file);
    const relative = path.relative('/x', resolved);
    if (relative.startsWith('..')) {
      throw new Error(`backfill-hooks-standalone-patches: hooks_standalone_patches entry file resolves outside base directory: ${file}`);
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

function applyBackfill(params, deps = {}) {
  const fsDep = deps.fs || fs;
  const { version: versionParam, offsetFilePath, cloneAsVersionParam, configFilesList, rootDirPath } = params;

  // Local loadJson function to avoid repoRoot issues
  function localLoadJson(file) {
    try {
      return JSON.parse(fsDep.readFileSync(file, 'utf8'));
    } catch (error) {
      throw new Error(`failed to parse JSON: ${path.relative(rootDirPath, file)}: ${error.message}`);
    }
  }

  const offsets = localLoadJson(path.resolve(offsetFilePath));

  // Validate offsets.hooks_standalone_patches
  if (!Object.prototype.hasOwnProperty.call(offsets, 'hooks_standalone_patches')) {
    throw new Error('backfill-hooks-standalone-patches: offsets JSON missing hooks_standalone_patches field');
  }
  validateHooksStandalonePatches(offsets.hooks_standalone_patches);

  // Validate --clone-as version format if provided
  if (cloneAsVersionParam) {
    const cloneRegex = new RegExp(`^${versionParam}-[0-9]+$`);
    if (!cloneRegex.test(cloneAsVersionParam)) {
      throw new Error(`backfill-hooks-standalone-patches: --clone-as version "${cloneAsVersionParam}" must match "^${versionParam}-[0-9]+$"`);
    }
  }

  const configs = configFilesList.map(localLoadJson);
  const rootConfig = configs[0];
  const packageConfig = configs[1];

  // Capture original strings for atomicity
  const originalRootString = fsDep.readFileSync(configFilesList[0], 'utf8');
  const originalPackageString = fsDep.readFileSync(configFilesList[1], 'utf8');

  // Verify version keys are identical across configs
  const rootKeys = Object.keys(rootConfig.versions).sort();
  const packageKeys = Object.keys(packageConfig.versions).sort();
  if (JSON.stringify(rootKeys) !== JSON.stringify(packageKeys)) {
    throw new Error('backfill-hooks-standalone-patches: version keys mismatch between root and package configs');
  }

  // In clone mode, verify that cloneAsVersionParam doesn't already exist
  if (cloneAsVersionParam) {
    if (Object.prototype.hasOwnProperty.call(rootConfig.versions, cloneAsVersionParam)) {
      throw new Error(`backfill-hooks-standalone-patches: version "${cloneAsVersionParam}" already exists in root config`);
    }
    if (Object.prototype.hasOwnProperty.call(packageConfig.versions, cloneAsVersionParam)) {
      throw new Error(`backfill-hooks-standalone-patches: version "${cloneAsVersionParam}" already exists in package config`);
    }
  }

  // Verify source version exists and is esm-chunked
  if (!Object.prototype.hasOwnProperty.call(rootConfig.versions, versionParam)) {
    throw new Error(`backfill-hooks-standalone-patches: version "${versionParam}" not found in root config`);
  }
  if (!Object.prototype.hasOwnProperty.call(packageConfig.versions, versionParam)) {
    throw new Error(`backfill-hooks-standalone-patches: version "${versionParam}" not found in package config`);
  }

  const sourceEntryRoot = rootConfig.versions[versionParam];
  const sourceEntryPackage = packageConfig.versions[versionParam];

  if (sourceEntryRoot.entry_format !== 'esm-chunked') {
    throw new Error(`backfill-hooks-standalone-patches: version "${versionParam}" is not esm-chunked in root config`);
  }
  if (sourceEntryPackage.entry_format !== 'esm-chunked') {
    throw new Error(`backfill-hooks-standalone-patches: version "${versionParam}" is not esm-chunked in package config`);
  }

  // Consistency pre-check: verify that hooks_standalone_patches is consistent between root and package
  // For source version (and in clone mode, verify consistency now before any modification)
  const rootSourceHooks = sourceEntryRoot.hooks_standalone_patches;
  const packageSourceHooks = sourceEntryPackage.hooks_standalone_patches;
  if ((rootSourceHooks === undefined && packageSourceHooks !== undefined) ||
      (rootSourceHooks !== undefined && packageSourceHooks === undefined) ||
      (rootSourceHooks !== undefined && packageSourceHooks !== undefined && !deepEqual(rootSourceHooks, packageSourceHooks))) {
    throw new Error(`backfill-hooks-standalone-patches: root/package inconsistent for version "${versionParam}"`);
  }

  let targetVersion = versionParam;
  let updatedFiles = [];

  if (cloneAsVersionParam) {
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
    rootConfig.versions[cloneAsVersionParam] = newEntryRoot;
    packageConfig.versions[cloneAsVersionParam] = newEntryPackage;

    targetVersion = cloneAsVersionParam;
  } else {
    // Normal mode: update existing entries with hooks_standalone_patches
    const existingRoot = rootConfig.versions[versionParam];
    const existingPackage = packageConfig.versions[versionParam];

    const rootHasHooks = Object.prototype.hasOwnProperty.call(existingRoot, 'hooks_standalone_patches');
    const packageHasHooks = Object.prototype.hasOwnProperty.call(existingPackage, 'hooks_standalone_patches');

    // Check if already has same content in both
    if (rootHasHooks && packageHasHooks) {
      if (deepEqual(existingRoot.hooks_standalone_patches, offsets.hooks_standalone_patches) &&
          deepEqual(existingPackage.hooks_standalone_patches, offsets.hooks_standalone_patches)) {
        // Same content, nothing to do (idempotent)
        process.stdout.write(JSON.stringify({
          version: versionParam,
          cloned_as: null,
          updated_files: [],
        }, null, 2) + '\n');
        return;
      }
    }

    // Check for conflicts
    if (rootHasHooks && !deepEqual(existingRoot.hooks_standalone_patches, offsets.hooks_standalone_patches)) {
      throw new Error(`backfill-hooks-standalone-patches: version "${versionParam}" already has different hooks_standalone_patches in root config`);
    }
    if (packageHasHooks && !deepEqual(existingPackage.hooks_standalone_patches, offsets.hooks_standalone_patches)) {
      throw new Error(`backfill-hooks-standalone-patches: version "${versionParam}" already has different hooks_standalone_patches in package config`);
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

  // Atomic write with temporary files and potential recovery
  const pid = process.pid;
  const tmpFiles = [];

  try {
    // Create both temporary files first
    const newRootString = JSON.stringify(rootConfig, null, 2) + '\n';
    const newPackageString = JSON.stringify(packageConfig, null, 2) + '\n';

    const rootConfigPath = configFilesList[0];
    const packageConfigPath = configFilesList[1];

    const tmpRootPath = `${rootConfigPath}.tmp-${pid}`;
    const tmpPackagePath = `${packageConfigPath}.tmp-${pid}`;

    // Write temporary files
    try {
      fsDep.writeFileSync(tmpRootPath, newRootString);
      tmpFiles.push(tmpRootPath);
    } catch (error) {
      // If root tmp write fails, no files are written yet
      throw error;
    }

    try {
      fsDep.writeFileSync(tmpPackagePath, newPackageString);
      tmpFiles.push(tmpPackagePath);
    } catch (error) {
      // If package tmp write fails, clean up root tmp and throw
      try {
        fsDep.unlinkSync(tmpRootPath);
      } catch (unlinkError) {
        // Ignore unlink errors and let the original error propagate
      }
      tmpFiles.pop(); // Remove tmpRootPath from tracking
      throw error;
    }

    // Rename root file
    try {
      fsDep.renameSync(tmpRootPath, rootConfigPath);
    } catch (error) {
      // If root rename fails, clean up both tmp files and throw
      try {
        fsDep.unlinkSync(tmpRootPath);
      } catch (unlinkError) {
        // Ignore unlink errors
      }
      try {
        fsDep.unlinkSync(tmpPackagePath);
      } catch (unlinkError) {
        // Ignore unlink errors
      }
      tmpFiles.length = 0; // Both are now untracked
      throw error;
    }
    tmpFiles.shift(); // Remove tmpRootPath from tracking (it's been renamed)

    // Rename package file
    try {
      fsDep.renameSync(tmpPackagePath, packageConfigPath);
    } catch (error) {
      // If package rename fails, restore root file and throw
      const restoreErrorMessages = [];
      try {
        fsDep.writeFileSync(`${rootConfigPath}.tmp-restore-${pid}`, originalRootString);
        fsDep.renameSync(`${rootConfigPath}.tmp-restore-${pid}`, rootConfigPath);
        restoreErrorMessages.push('root config restored');
      } catch (restoreError) {
        restoreErrorMessages.push(`root config restore failed: ${restoreError.message}`);
      }
      // Clean up remaining tmp file
      try {
        fsDep.unlinkSync(tmpPackagePath);
      } catch (unlinkError) {
        // Ignore
      }
      tmpFiles.length = 0;
      throw new Error(`backfill-hooks-standalone-patches: package config rename failed, attempted recovery: ${restoreErrorMessages.join('; ')}: ${error.message}`);
    }
    tmpFiles.length = 0; // Both files successfully renamed

    // Update file list
    updatedFiles = configFilesList.map(file => path.relative(rootDirPath, file));
  } finally {
    // Clean up any remaining temporary files
    for (const tmpFile of tmpFiles) {
      try {
        fsDep.unlinkSync(tmpFile);
      } catch (unlinkError) {
        // Ignore cleanup errors
      }
    }
  }

  process.stdout.write(JSON.stringify({
    version: versionParam,
    cloned_as: cloneAsVersionParam || null,
    updated_files: updatedFiles,
  }, null, 2) + '\n');
}

function main() {
  applyBackfill({
    version,
    offsetFilePath: path.resolve(offsetFile),
    cloneAsVersionParam: cloneAsVersion,
    configFilesList: getConfigFiles(),
    rootDirPath: repoRoot,
  });
}

module.exports = { applyBackfill };

if (require.main === module) {
  try {
    initializeCLI();
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
}
