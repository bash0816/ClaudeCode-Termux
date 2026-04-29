#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repoRoot, 'config', 'claude-termux-release-manifest.json');
const packageName = '@bash0816/claude-code';
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

function run(command, args) {
  const result = cp.spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function loadMainManifest() {
  try {
    const raw = run('git', ['show', 'origin/main:config/claude-termux-release-manifest.json']);
    return JSON.parse(raw);
  } catch {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }
}

function loadPublishedVersion() {
  try {
    return run('npm', ['view', packageName, 'version']);
  } catch {
    return '';
  }
}

function main() {
  const manifest = loadMainManifest();
  const publishedVersion = loadPublishedVersion();
  const latestAudited = manifest.latest_audited_version || '';
  const latestCandidate = manifest.latest_candidate_version || '';

  const result = {
    package_name: packageName,
    latest_audited_version: latestAudited,
    latest_candidate_version: latestCandidate,
    published_version: publishedVersion,
    needs_verification: compareVersions(latestCandidate, latestAudited) > 0,
    needs_publish: publishedVersion ? compareVersions(latestAudited, publishedVersion) > 0 : false,
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
