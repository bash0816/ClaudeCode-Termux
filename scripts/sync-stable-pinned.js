#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?$/;
const MANIFEST_KEY = 'stable_pinned_version';
const repoRoot = path.resolve(__dirname, '..');

function usageError(message) {
  const error = new Error(message);
  error.exitCode = 2;
  return error;
}

function parseArgs(argv) {
  let version;
  let skipReadme = false;
  for (const arg of argv) {
    if (arg === '--skip-readme') {
      skipReadme = true;
    } else if (arg.startsWith('--')) {
      throw usageError(`unknown argument: ${arg}`);
    } else if (version === undefined) {
      version = arg;
    } else {
      throw usageError(`unexpected extra argument: ${arg}`);
    }
  }
  if (version === undefined) {
    throw usageError('usage: node scripts/sync-stable-pinned.js <version> [--skip-readme]');
  }
  if (!VERSION_RE.test(version)) {
    throw usageError(`invalid version: ${JSON.stringify(version)}`);
  }
  return { version, skipReadme };
}

function manifestFiles(root) {
  return [
    path.join(root, 'config', 'claude-termux-release-manifest.json'),
    path.join(root, 'packages', 'claude-code', 'config', 'claude-termux-release-manifest.json'),
  ];
}

function serialize(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

function assertOnlyPinnedKeyChanged(before, after, file) {
  const beforeKeys = Object.keys(before);
  const afterKeys = Object.keys(after);
  if (JSON.stringify(beforeKeys) !== JSON.stringify(afterKeys)) {
    throw new Error(`sync-stable-pinned: key set changed unexpectedly in ${file}`);
  }
  for (const key of beforeKeys) {
    if (key === MANIFEST_KEY) {
      continue;
    }
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      throw new Error(`sync-stable-pinned: key ${key} changed unexpectedly in ${file}`);
    }
  }
}

// Computes the new content without writing anything.
function planUpdate(file, version) {
  const current = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Object.prototype.hasOwnProperty.call(current, MANIFEST_KEY)) {
    throw new Error(`sync-stable-pinned: ${MANIFEST_KEY} is missing in ${file}`);
  }
  if (current[MANIFEST_KEY] === version) {
    return { file, changed: false };
  }
  const next = { ...current, [MANIFEST_KEY]: version };
  assertOnlyPinnedKeyChanged(current, next, file);
  return { file, changed: true, content: serialize(next) };
}

function runReadmeScript(root) {
  const readmeScript = path.join(root, 'scripts', 'update-readme-version-guidance.js');
  const result = cp.spawnSync('node', [readmeScript], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw new Error(`sync-stable-pinned: failed to run update-readme-version-guidance.js: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`sync-stable-pinned: update-readme-version-guidance.js exited with ${result.status}\n${result.stderr || result.stdout}`);
  }
}

function main(argv) {
  const { version, skipReadme } = parseArgs(argv);
  const root = process.env.STABLE_SYNC_ROOT ? path.resolve(process.env.STABLE_SYNC_ROOT) : repoRoot;

  // Plan every file first so that a failure on one file writes nothing.
  const plans = manifestFiles(root).map(file => planUpdate(file, version));
  const changed = plans.filter(plan => plan.changed);

  for (const plan of changed) {
    fs.writeFileSync(plan.file, plan.content);
  }

  let readme = 'not_needed';
  if (changed.length > 0) {
    if (skipReadme) {
      readme = 'skipped';
    } else {
      runReadmeScript(root);
      readme = 'updated';
    }
  }

  process.stdout.write(JSON.stringify({
    version,
    changed_files: changed.map(plan => path.relative(root, plan.file)),
    readme,
  }, null, 2) + '\n');
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error && error.exitCode) {
      console.error(error.message);
      process.exitCode = error.exitCode;
    } else {
      console.error(error && error.stack ? error.stack : String(error));
      process.exitCode = 1;
    }
  }
}
