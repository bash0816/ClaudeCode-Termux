'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { resolveTarget } = require('./resolve-stable-target');

const SCRIPT = path.join(__dirname, 'resolve-stable-target.js');

function makeTempDir(prefix) {
  const base = process.env.TMPDIR || (process.env.PREFIX ? path.join(process.env.PREFIX, 'tmp') : os.tmpdir());
  return fs.mkdtempSync(path.join(base, prefix));
}

// Builds the `versions` object from a { version: status } map.
function audit(statuses) {
  const versions = {};
  for (const [version, status] of Object.entries(statuses)) {
    versions[version] = { status };
  }
  return versions;
}

const allPublished = () => true;
const nonePublished = () => false;

test('single termux_verified match resolves to it', () => {
  const audited = audit({ '2.1.300': 'termux_verified' });
  assert.deepEqual(
    resolveTarget({ officialStable: '2.1.300', audited, isPublished: allPublished }),
    { target: '2.1.300', reason: 'ok' },
  );
});

test('no termux_verified candidate gives unverified', () => {
  const audited = audit({ '2.1.300': 'offset_discovered', '2.1.301': 'termux_verified' });
  assert.deepEqual(
    resolveTarget({ officialStable: '2.1.300', audited, isPublished: allPublished }),
    { target: null, reason: 'unverified' },
  );
});

test('-2 vs -10 compares numerically and -10 wins', () => {
  const audited = audit({
    '2.1.300': 'termux_verified',
    '2.1.300-2': 'termux_verified',
    '2.1.300-10': 'termux_verified',
  });
  assert.deepEqual(
    resolveTarget({ officialStable: '2.1.300', audited, isPublished: allPublished }),
    { target: '2.1.300-10', reason: 'ok' },
  );
});

test('when the max candidate is unpublished there is no fallback to a lower candidate', () => {
  const audited = audit({
    '2.1.300': 'termux_verified',
    '2.1.300-1': 'termux_verified',
    '2.1.300-2': 'termux_verified',
  });
  const isPublished = version => version === '2.1.300' || version === '2.1.300-1';
  assert.deepEqual(
    resolveTarget({ officialStable: '2.1.300', audited, isPublished }),
    { target: null, reason: 'unpublished', candidate: '2.1.300-2' },
  );
});

test('reverted, withdrawn and offset_discovered entries are not candidates', () => {
  const audited = audit({
    '2.1.301': 'termux_verified',
    '2.1.301-1': 'reverted',
    '2.1.301-2': 'withdrawn',
    '2.1.301-3': 'offset_discovered',
  });
  assert.deepEqual(
    resolveTarget({ officialStable: '2.1.301', audited, isPublished: allPublished }),
    { target: '2.1.301', reason: 'ok' },
  );

  const onlyExcluded = audit({
    '2.1.302': 'withdrawn',
    '2.1.302-1': 'reverted',
    '2.1.302-2': 'offset_discovered',
  });
  assert.deepEqual(
    resolveTarget({ officialStable: '2.1.302', audited: onlyExcluded, isPublished: allPublished }),
    { target: null, reason: 'unverified' },
  );
});

test('withdrawn base is ignored while a verified -N sibling is chosen', () => {
  // 2.1.276 is withdrawn, 2.1.276-1 is termux_verified.
  const audited = audit({
    '2.1.276': 'withdrawn',
    '2.1.276-1': 'termux_verified',
  });
  assert.deepEqual(
    resolveTarget({ officialStable: '2.1.276', audited, isPublished: allPublished }),
    { target: '2.1.276-1', reason: 'ok' },
  );
});

test('officialStable decreasing selects the older base', () => {
  const audited = audit({
    '2.1.309': 'termux_verified',
    '2.1.310': 'termux_verified',
  });
  assert.deepEqual(
    resolveTarget({ officialStable: '2.1.309', audited, isPublished: allPublished }),
    { target: '2.1.309', reason: 'ok' },
  );
  assert.deepEqual(
    resolveTarget({ officialStable: '2.1.310', audited, isPublished: allPublished }),
    { target: '2.1.310', reason: 'ok' },
  );
});

test('invalid officialStable throws Error', () => {
  const audited = audit({ '2.1.300': 'termux_verified' });
  for (const bad of ['2.1', 'v2.1.300', '2.1.300-', '2.1.300 ', '', undefined, null, 2300]) {
    assert.throws(
      () => resolveTarget({ officialStable: bad, audited, isPublished: allPublished }),
      Error,
      `expected Error for ${JSON.stringify(bad)}`,
    );
  }
});

test('same -N for two candidates throws (defensive guard for e.g. -1 and -01)', () => {
  const audited = audit({
    '2.1.300-1': 'termux_verified',
    '2.1.300-01': 'termux_verified',
  });
  assert.throws(
    () => resolveTarget({ officialStable: '2.1.300', audited, isPublished: allPublished }),
    /ambiguous candidates/,
  );
});

test('CLI prints JSON for a valid input and exits 0', () => {
  const tmp = makeTempDir('resolve-stable-cli-');
  try {
    const auditedFile = path.join(tmp, 'audited.json');
    fs.writeFileSync(auditedFile, JSON.stringify({
      versions: audit({
        '2.1.300': 'termux_verified',
        '2.1.300-1': 'termux_verified',
      }),
    }));
    const result = cp.spawnSync('node', [
      SCRIPT, '--official', '2.1.300', '--audited', auditedFile, '--published', '2.1.300-1',
    ], { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { target: '2.1.300-1', reason: 'ok' });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('CLI exits 2 for invalid input', () => {
  const tmp = makeTempDir('resolve-stable-cli-');
  try {
    const auditedFile = path.join(tmp, 'audited.json');
    fs.writeFileSync(auditedFile, JSON.stringify({ versions: audit({ '2.1.300': 'termux_verified' }) }));
    const cases = [
      ['--official', '2.1'],
      ['--audited', auditedFile],
      ['--official', '2.1.300', '--unknown', 'x'],
      ['--official', '2.1.300', '--audited', auditedFile, '--published', '2.1.300,bad'],
      ['--official', '2.1.300', '--official', '2.1.300'],
      ['--official'],
    ];
    for (const args of cases) {
      const result = cp.spawnSync('node', [SCRIPT, ...args], {
        cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      assert.equal(result.status, 2, `args ${JSON.stringify(args)} stderr: ${result.stderr}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
