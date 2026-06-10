#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { execFileSync } = require('child_process');

const packageName = '@bash0816/claude-code';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runNpm(args, options = {}) {
  return execFileSync('npm', args, {
    encoding: 'utf8',
    stdio: options.stdio,
  });
}

function loadCurrentTags() {
  const raw = runNpm(['view', packageName, 'dist-tags', '--json']);
  return JSON.parse(raw);
}

function loadManifest() {
  return readJson('config/claude-termux-release-manifest.json');
}

function addDistTag(version, tag) {
  runNpm(['dist-tag', 'add', `${packageName}@${version}`, tag], { stdio: 'inherit' });
}

function removeDistTag(tag) {
  runNpm(['dist-tag', 'rm', packageName, tag], { stdio: 'inherit' });
}

function listDistTags() {
  runNpm(['dist-tag', 'ls', packageName], { stdio: 'inherit' });
}

function restoreTags(previousLatest, previousCandidate) {
  if (previousLatest) {
    try {
      addDistTag(previousLatest, 'latest');
    } catch (error) {
      console.error(error && error.stack ? error.stack : String(error));
    }
  }
  if (previousCandidate) {
    try {
      addDistTag(previousCandidate, 'candidate');
    } catch (error) {
      console.error(error && error.stack ? error.stack : String(error));
    }
  } else {
    try {
      removeDistTag('candidate');
    } catch {}
  }
}

function main() {
  const pkg = readJson('package.json');
  const manifest = loadManifest();
  const currentTags = loadCurrentTags();
  const previousLatest = currentTags.latest || '';
  const previousCandidate = currentTags.candidate || '';
  const expectedLatest = process.env.CLAUDE_TERMUX_EXPECTED_PREVIOUS_AUDITED_VERSION || '';
  const expectedCandidate = pkg.version;

  if (!expectedLatest) {
    throw new Error('missing CLAUDE_TERMUX_EXPECTED_PREVIOUS_AUDITED_VERSION');
  }
  if (previousLatest !== expectedLatest) {
    throw new Error(`registry latest ${previousLatest} does not match expected previous audited ${expectedLatest}`);
  }
  if (previousCandidate !== expectedCandidate) {
    throw new Error(`registry candidate ${previousCandidate} does not match expected package ${expectedCandidate}`);
  }
  if (manifest.latest_candidate_version !== expectedCandidate) {
    throw new Error(`manifest candidate ${manifest.latest_candidate_version} does not match package ${expectedCandidate}`);
  }

  try {
    addDistTag(pkg.version, 'latest');
    if (previousLatest && previousLatest !== pkg.version) {
      addDistTag(previousLatest, 'candidate');
    }
    listDistTags();
  } catch (error) {
    try {
      restoreTags(previousLatest, previousCandidate);
    } catch (restoreError) {
      const restoreMessage = restoreError && restoreError.stack ? restoreError.stack : String(restoreError);
      console.error(restoreMessage);
    }
    throw error;
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  }
}

module.exports = {
  addDistTag,
  loadCurrentTags,
  listDistTags,
  main,
  restoreTags,
  removeDistTag,
  runNpm,
};
