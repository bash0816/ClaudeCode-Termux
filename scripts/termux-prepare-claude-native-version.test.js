#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { analyzeCycleHoists } = require('./termux-prepare-claude-native-version.js');

function makeTempDir(prefix) {
  const baseDir = process.env.TMPDIR || (process.env.PREFIX ? path.join(process.env.PREFIX, 'tmp') : os.tmpdir());
  return fs.mkdtempSync(path.join(baseDir, prefix));
}

test('analyzeCycleHoists: structural cycle + eager call', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    // File A imports B statically
    fs.writeFileSync(
      path.join(tempDir, 'A.js'),
      'import "/$bunfs/root/B.js";\nexport const someExport = "A";\n'
    );

    // File B requires A eagerly (at top level)
    fs.writeFileSync(
      path.join(tempDir, 'B.js'),
      'var x = import.meta.require("/$bunfs/root/A.js").someExport;\nexport const y = "B";\n'
    );

    const { cycleHoists, skippedAssets } = analyzeCycleHoists(tempDir);
    assert.equal(cycleHoists.length, 1);
    assert.deepEqual(cycleHoists[0], {
      file: 'B.js',
      targetModule: 'A.js',
      expectedOccurrences: 1,
      assertProperties: ['someExport'],
    });
    assert.deepEqual(skippedAssets, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: structural cycle + all-delayed calls', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    // File A imports B statically
    fs.writeFileSync(
      path.join(tempDir, 'A.js'),
      'import "/$bunfs/root/B.js";\nexport const someExport = "A";\n'
    );

    // File B requires A only inside a function (delayed)
    fs.writeFileSync(
      path.join(tempDir, 'B.js'),
      'function f() { var x = import.meta.require("/$bunfs/root/A.js").someExport; }\nexport const y = "B";\n'
    );

    const { cycleHoists, skippedAssets } = analyzeCycleHoists(tempDir);
    assert.equal(cycleHoists.length, 0);
    assert.deepEqual(skippedAssets, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: no cycle', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    // File A requires B
    fs.writeFileSync(
      path.join(tempDir, 'A.js'),
      'var x = import.meta.require("/$bunfs/root/B.js");\nexport const y = "A";\n'
    );

    // File B does not reference A at all
    fs.writeFileSync(
      path.join(tempDir, 'B.js'),
      'export const z = "B";\n'
    );

    const { cycleHoists, skippedAssets } = analyzeCycleHoists(tempDir);
    assert.equal(cycleHoists.length, 0);
    assert.deepEqual(skippedAssets, []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: parse failure throws', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    // Valid file
    fs.writeFileSync(
      path.join(tempDir, 'A.js'),
      'export const a = 1;\n'
    );

    // Intentionally invalid JS
    fs.writeFileSync(
      path.join(tempDir, 'B.js'),
      'this is {{{ invalid syntax'
    );

    assert.throws(() => {
      analyzeCycleHoists(tempDir);
    }, /analyzeCycleHoists: .* file\(s\) failed to parse/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('analyzeCycleHoists: acorn version mismatch throws', () => {
  const tempDir = makeTempDir('cycle-hoist-test-');
  try {
    // Create a minimal valid file
    fs.writeFileSync(
      path.join(tempDir, 'A.js'),
      'export const a = 1;\n'
    );

    assert.throws(() => {
      analyzeCycleHoists(tempDir, { acornVersionOverride: '9.9.9' });
    }, /analyzeCycleHoists: acorn version mismatch/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
