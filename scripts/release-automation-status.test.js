#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  compareVersions,
  extractVersionFromBranch,
  selectCandidateVersion,
} = require('./release-automation-status.js');

test('compareVersions orders numeric patch versions', () => {
  assert.equal(compareVersions('2.1.136', '2.1.137') < 0, true);
  assert.equal(compareVersions('2.1.137', '2.1.136') > 0, true);
  assert.equal(compareVersions('2.1.137', '2.1.137'), 0);
});

test('extractVersionFromBranch reads automation candidate refs only', () => {
  assert.equal(
    extractVersionFromBranch('origin/automation/native-claude-2.1.136', 'automation/native-claude-'),
    '2.1.136',
  );
  assert.equal(
    extractVersionFromBranch('origin/main', 'automation/native-claude-'),
    '',
  );
});

test('selectCandidateVersion chooses the oldest pending candidate above audited version', () => {
  const branches = [
    'origin/main',
    'origin/automation/native-claude-2.1.128',
    'origin/automation/native-claude-2.1.136',
    'origin/automation/native-claude-2.1.137',
    'origin/automation/native-claude-2.1.137',
  ];
  assert.equal(selectCandidateVersion(branches, '2.1.128'), '2.1.136');
});
