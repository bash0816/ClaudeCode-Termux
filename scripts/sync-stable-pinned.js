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
// `original` keeps the exact text that was read, so it can be restored later.
function planUpdate(file, version, fsApi) {
  const original = fsApi.readFileSync(file, 'utf8');
  const current = JSON.parse(original);
  if (!Object.prototype.hasOwnProperty.call(current, MANIFEST_KEY)) {
    throw new Error(`sync-stable-pinned: ${MANIFEST_KEY} is missing in ${file}`);
  }
  if (current[MANIFEST_KEY] === version) {
    return { file, changed: false };
  }
  const next = { ...current, [MANIFEST_KEY]: version };
  assertOnlyPinnedKeyChanged(current, next, file);
  return { file, changed: true, original, content: serialize(next) };
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

// Temp file for one manifest. It sits in the same directory so that rename stays on one filesystem.
function tempPathFor(file) {
  return path.join(path.dirname(file), `${path.basename(file)}.tmp-${process.pid}`);
}

// Removes a temp file this run created. A file that is already gone is fine.
// Any other failure is collected so that the caller can report it.
function removeTemp(fsApi, tmp, leftovers) {
  try {
    fsApi.unlinkSync(tmp);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      leftovers.push(`${tmp} (${error.message})`);
    }
  }
}

function withLeftovers(message, leftovers) {
  if (leftovers.length === 0) {
    return message;
  }
  return `${message}\n一時ファイルを削除できませんでした: ${leftovers.join(', ')}`;
}

// Phase 1: write every new content to a temp file next to its manifest.
// The manifests themselves are not touched in this phase.
function prepareTemps(changed, fsApi) {
  const created = [];
  const leftovers = [];
  for (const plan of changed) {
    plan.tmp = tempPathFor(plan.file);
    try {
      fsApi.writeFileSync(plan.tmp, plan.content, { flag: 'wx' });
    } catch (error) {
      // An EEXIST file was not created by this run, so it is left alone.
      if (error.code !== 'EEXIST') {
        created.push(plan.tmp); // may be partially written
      }
      for (const tmp of created) {
        removeTemp(fsApi, tmp, leftovers);
      }
      throw new Error(withLeftovers(
        `sync-stable-pinned: 一時ファイルの作成に失敗したため、manifest は変更していません: ${error.message}`,
        leftovers,
      ));
    }
    created.push(plan.tmp);
  }
}

// Phase 2: rename each temp file over its manifest, in order.
function commitTemps(changed, fsApi) {
  for (let i = 0; i < changed.length; i++) {
    try {
      fsApi.renameSync(changed[i].tmp, changed[i].file);
    } catch (error) {
      throw rollbackAfterFailure(changed, i, fsApi, error);
    }
  }
}

// Called when renaming changed[failedIndex] failed. Restores the manifests renamed before it,
// removes the remaining temp files, and returns the error to throw.
function rollbackAfterFailure(changed, failedIndex, fsApi, cause) {
  const leftovers = [];
  const states = new Array(changed.length);
  const restoreFailed = [];

  for (let j = failedIndex - 1; j >= 0; j--) {
    const plan = changed[j];
    try {
      // The temp name was consumed by the earlier rename, so it is free to reuse.
      fsApi.writeFileSync(plan.tmp, plan.original, { flag: 'wx' });
      fsApi.renameSync(plan.tmp, plan.file);
      states[j] = '元の内容に戻しました';
    } catch (restoreError) {
      if (restoreError.code !== 'EEXIST') {
        removeTemp(fsApi, plan.tmp, leftovers);
      }
      restoreFailed.push(plan.file);
      states[j] = '新しい内容のまま（戻しに失敗）';
    }
  }

  for (let k = failedIndex; k < changed.length; k++) {
    removeTemp(fsApi, changed[k].tmp, leftovers);
    states[k] = '変更していません';
  }

  const summary = changed.map((plan, index) => `${plan.file}: ${states[index]}`).join('; ');
  if (restoreFailed.length === 0) {
    return new Error(withLeftovers(
      `sync-stable-pinned: manifest の反映に失敗しました。状態: ${summary}。原因: ${cause.message}`,
      leftovers,
    ));
  }
  return new Error(withLeftovers(
    `sync-stable-pinned: manifest の反映に失敗し、元に戻しにも失敗しました（戻しに失敗）。最終状態: ${summary}。戻しに失敗したファイル: ${restoreFailed.join(', ')}。原因: ${cause.message}`,
    leftovers,
  ));
}

function syncStablePinned(argv, { fs: fsApi = fs } = {}) {
  const { version, skipReadme } = parseArgs(argv);
  const root = process.env.STABLE_SYNC_ROOT ? path.resolve(process.env.STABLE_SYNC_ROOT) : repoRoot;

  // Plan every file first so that a failure on one file writes nothing.
  const plans = manifestFiles(root).map(file => planUpdate(file, version, fsApi));
  const changed = plans.filter(plan => plan.changed);

  if (changed.length > 0) {
    prepareTemps(changed, fsApi);
    commitTemps(changed, fsApi);
  }

  let readme = 'not_needed';
  if (changed.length > 0) {
    if (skipReadme) {
      readme = 'skipped';
    } else {
      try {
        runReadmeScript(root);
      } catch (error) {
        throw new Error(`sync-stable-pinned: manifest は更新済みです（manifests were already updated）。README の更新に失敗しました: ${error.message}`);
      }
      readme = 'updated';
    }
  }

  return {
    version,
    changed_files: changed.map(plan => path.relative(root, plan.file)),
    readme,
  };
}

if (require.main === module) {
  try {
    const result = syncStablePinned(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
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

module.exports = { syncStablePinned };
