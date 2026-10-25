#!/usr/bin/env node
'use strict';

// Principle: every manifest is updated by writing a temp file and renaming it over the original (same directory, so rename is atomic per file).
// Limit: POSIX has no atomic update across two files, so the two renames are separate steps.
// A single failure rolls back with renames of backup files, so the manifests stay consistent.
// A double failure (a restore rename fails too) is detected: the error names the leftover backup file,
// and node scripts/stable-drift-check.js reports it as meta_drift.

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

// Backup file for one manifest. It holds the original text, so that a failed rollback can be undone by hand.
function backupPathFor(file) {
  return path.join(path.dirname(file), `${path.basename(file)}.bak-${process.pid}`);
}

// Phase 1: write the new content to a temp file and the original text to a backup file, for every manifest.
// Both sit next to their manifest so that rename stays on one filesystem.
// The manifests themselves are not touched in this phase.
function prepareTemps(changed, fsApi) {
  const created = [];
  const leftovers = [];
  for (const plan of changed) {
    plan.tmp = tempPathFor(plan.file);
    plan.bak = backupPathFor(plan.file);
    const writes = [
      [plan.tmp, plan.content],
      [plan.bak, plan.original],
    ];
    for (const [target, data] of writes) {
      try {
        fsApi.writeFileSync(target, data, { flag: 'wx' });
      } catch (error) {
        // An EEXIST file was not created by this run, so it is left alone.
        if (error.code !== 'EEXIST') {
          created.push(target); // may be partially written
        }
        for (const file of created) {
          removeTemp(fsApi, file, leftovers);
        }
        throw new Error(withLeftovers(
          `sync-stable-pinned: 一時ファイルまたは退避ファイルの作成に失敗したため、manifest は変更していません: ${error.message}`,
          leftovers,
        ));
      }
      created.push(target);
    }
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

// Called after every rename succeeded. Removes the leftover temp and backup files.
function discardBackups(changed, fsApi) {
  const leftovers = [];
  for (const plan of changed) {
    removeTemp(fsApi, plan.tmp, leftovers);
    removeTemp(fsApi, plan.bak, leftovers);
  }
  if (leftovers.length > 0) {
    throw new Error(withLeftovers(
      'sync-stable-pinned: manifest は更新済みです（manifests were already updated）。退避ファイルを削除できませんでした',
      leftovers,
    ));
  }
}

// Called when renaming changed[failedIndex] failed.
// Restores the manifests renamed before it by renaming their backup files back over them (a rename, not a write).
// Removes the temp and backup files of the rest. If a restore rename fails too (double fault),
// that backup is kept, and the error says where the original text is.
function rollbackAfterFailure(changed, failedIndex, fsApi, cause) {
  const leftovers = [];
  const states = new Array(changed.length);
  const restoreFailed = [];

  for (let j = failedIndex - 1; j >= 0; j--) {
    const plan = changed[j];
    try {
      fsApi.renameSync(plan.bak, plan.file);
      states[j] = '更新前の内容に戻しました';
    } catch (restoreError) {
      restoreFailed.push(plan);
      states[j] = '更新後の内容のまま（戻しに失敗）';
    }
  }

  for (let k = failedIndex; k < changed.length; k++) {
    removeTemp(fsApi, changed[k].tmp, leftovers);
    removeTemp(fsApi, changed[k].bak, leftovers);
    states[k] = '更新前の内容のまま（未変更）';
  }

  const summary = changed.map((plan, index) => `${plan.file}: ${states[index]}`).join('; ');
  if (restoreFailed.length === 0) {
    const head = failedIndex === 0
      ? 'sync-stable-pinned: manifest の反映に失敗したため、manifest は更新していません'
      : 'sync-stable-pinned: manifest の反映に失敗したため、元に戻しました';
    return new Error(withLeftovers(`${head}。状態: ${summary}。原因: ${cause.message}`, leftovers));
  }
  const manualSteps = restoreFailed
    .map(plan => `退避ファイル ${plan.bak} に元の内容があります（手動で戻す場合: mv "${plan.bak}" "${plan.file}"）`)
    .join('; ');
  return new Error(withLeftovers(
    'sync-stable-pinned: manifest の反映に失敗し、戻しに失敗しました（戻しに失敗）。' +
    `最終状態: ${summary}。不一致が残っています（戻せなかった manifest は更新後、それ以外は更新前の内容）。` +
    `${manualSteps}。node scripts/stable-drift-check.js が meta_drift として検知します。原因: ${cause.message}`,
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
    discardBackups(changed, fsApi);
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
