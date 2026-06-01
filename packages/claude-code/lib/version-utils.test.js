'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseVersion, compareVersions } = require('./version-utils');

test('parseVersion splits suffix versions', () => {
  assert.deepEqual(parseVersion('2.1.159-2'), {
    parts: [2, 1, 159],
    suffix: 2,
  });
});

test('compareVersions orders suffix versions after the base release', () => {
  assert.equal(compareVersions('2.1.159', '2.1.159-1') < 0, true);
  assert.equal(compareVersions('2.1.159-1', '2.1.159-2') < 0, true);
  assert.equal(compareVersions('2.1.159-2', '2.1.159') > 0, true);
});

test('compareVersions preserves numeric ordering across patch versions', () => {
  assert.equal(compareVersions('2.1.136', '2.1.137') < 0, true);
  assert.equal(compareVersions('2.1.137', '2.1.136') > 0, true);
  assert.equal(compareVersions('2.1.137', '2.1.137'), 0);
});
