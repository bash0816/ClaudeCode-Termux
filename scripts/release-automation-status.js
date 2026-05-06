#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'config', 'claude-termux-release-manifest.json');
const packageName = '@bash0816/claude-code';
const legacyRepoRoot = process.env.CLAUDE_TERMUX_LEGACY_REPO_ROOT || path.join(os.homedir(), 'CluadeCode-Termux-public');
const stateFile = process.env.CLAUDE_TERMUX_STATE_FILE || path.join(os.homedir(), '.codex-release-cicd', 'state', 'canonical-release-state.json');
const jsonOnly = process.argv.includes('--json');

function compareVersions(a, b) {
  const aParts = String(a || '').split('.').map(Number);
  const bParts = String(b || '').split('.').map(Number);
  const len = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < len; index += 1) {
    const diff = (aParts[index] || 0) - (bParts[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function run(command, args, cwd = repoRoot, allowFailure = false) {
  const result = cp.spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return {
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function loadJsonFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readState() {
  try {
    return loadJsonFile(stateFile);
  } catch {
    return { candidates: {} };
  }
}

function loadManifestFromGit(cwd, ref) {
  try {
    const raw = run('git', ['show', `${ref}:config/claude-termux-release-manifest.json`], cwd).stdout;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function listRemoteBranches(prefix) {
  const result = run('git', ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin']);
  return result.stdout ? result.stdout.split('\n').map(line => line.trim()).filter(Boolean) : [];
}

function extractVersionFromBranch(branch, prefix) {
  const marker = `origin/${prefix}`;
  if (!branch.startsWith(marker)) return '';
  const tail = branch.slice(marker.length);
  if (!/^\d+(?:\.\d+){1,2}(?:[-+][0-9A-Za-z.-]+)?$/.test(tail)) return '';
  return tail;
}

function maxVersion(versions) {
  return versions.slice().sort(compareVersions).pop() || '';
}

function loadPublishedVersion() {
  const result = run('npm', ['view', packageName, 'version'], repoRoot, true);
  return result.status === 0 ? result.stdout : '';
}

function loadLegacyMainManifest() {
  if (!fs.existsSync(legacyRepoRoot)) {
    return null;
  }
  run('git', ['fetch', '--prune', 'origin'], legacyRepoRoot, true);
  return loadManifestFromGit(legacyRepoRoot, 'origin/main');
}

function loadCandidateVersion(mainAuditedVersion) {
  const branches = listRemoteBranches('automation/native-claude-');
  const versions = branches
    .map(branch => extractVersionFromBranch(branch, 'automation/native-claude-'))
    .filter(version => compareVersions(version, mainAuditedVersion) > 0);
  return maxVersion(versions);
}

function isLocalVerificationLocked(state, version) {
  if (!version) return false;
  const item = state.candidates && state.candidates[version];
  if (!item) return false;
  return item.status === 'verification_in_progress' || item.status === 'promotion_dispatched';
}

function main() {
  const localManifest = loadJsonFile(manifestPath);
  const mainManifest = loadManifestFromGit(repoRoot, 'origin/main') || localManifest;
  const devManifest = loadManifestFromGit(repoRoot, 'origin/dev') || mainManifest;
  const publishedVersion = loadPublishedVersion();
  const legacyManifest = loadLegacyMainManifest();
  const state = readState();

  const latestAudited = mainManifest.latest_audited_version || '';
  const latestCandidate = loadCandidateVersion(latestAudited) || devManifest.latest_candidate_version || latestAudited;
  const latestLegacySyncedVersion = legacyManifest ? (legacyManifest.latest_audited_version || '') : '';
  const localVerificationLocked = isLocalVerificationLocked(state, latestCandidate);

  const result = {
    package_name: packageName,
    latest_audited_version: latestAudited,
    latest_candidate_version: latestCandidate,
    published_version: publishedVersion,
    latest_legacy_synced_version: latestLegacySyncedVersion,
    local_verification_locked: localVerificationLocked,
    local_state_file: stateFile,
    needs_verification: Boolean(latestCandidate) && compareVersions(latestCandidate, latestAudited) > 0 && !localVerificationLocked,
    needs_publish: publishedVersion ? compareVersions(latestAudited, publishedVersion) > 0 : false,
    needs_legacy_sync: latestLegacySyncedVersion ? compareVersions(latestAudited, latestLegacySyncedVersion) > 0 : false,
  };

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  for (const [key, value] of Object.entries(result)) {
    process.stdout.write(`${key}=${value}\n`);
  }
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
}
