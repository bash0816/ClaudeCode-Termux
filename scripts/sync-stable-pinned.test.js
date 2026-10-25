'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const SCRIPT = path.join(__dirname, 'sync-stable-pinned.js');
const MANIFEST_RELS = [
  path.join('config', 'claude-termux-release-manifest.json'),
  path.join('packages', 'claude-code', 'config', 'claude-termux-release-manifest.json'),
];
const README_MARKER = path.join('scripts', 'readme-stub-ran');

const BASE = {
  manifest_version: 1,
  package_name: '@bash0816/claude-code',
  latest_audited_version: '2.1.310',
  latest_candidate_version: '2.1.310',
  previous_stable_version: '2.1.309',
  stable_pinned_version: '2.1.308',
  manifest_url: 'https://raw.githubusercontent.com/bash0816/ClaudeCode-Termux/main/config/claude-termux-release-manifest.json',
};

// Stand-in for update-readme-version-guidance.js: it only leaves a marker file.
const README_STUB = [
  "'use strict';",
  "const fs = require('fs');",
  "const path = require('path');",
  "fs.writeFileSync(path.join(__dirname, 'readme-stub-ran'), 'ran\\n');",
  '',
].join('\n');

function serialize(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

function makeTempRoot() {
  const base = process.env.TMPDIR || (process.env.PREFIX ? path.join(process.env.PREFIX, 'tmp') : os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, 'sync-stable-pinned-'));
  for (const rel of MANIFEST_RELS) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), serialize(BASE));
  }
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts', 'update-readme-version-guidance.js'), README_STUB);
  return root;
}

function runSync(root, args) {
  return cp.spawnSync('node', [SCRIPT, ...args], {
    cwd: root,
    env: { ...process.env, STABLE_SYNC_ROOT: root },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readManifest(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function markerExists(root) {
  return fs.existsSync(path.join(root, README_MARKER));
}

test('only stable_pinned_version changes in both manifests', () => {
  const root = makeTempRoot();
  try {
    const result = runSync(root, ['2.1.309', '--skip-readme']);
    assert.equal(result.status, 0, result.stderr);
    const expected = serialize({ ...BASE, stable_pinned_version: '2.1.309' });
    for (const rel of MANIFEST_RELS) {
      assert.equal(readManifest(root, rel), expected, rel);
    }
    const output = JSON.parse(result.stdout);
    assert.equal(output.version, '2.1.309');
    assert.equal(output.changed_files.length, 2);
    assert.equal(output.readme, 'skipped');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--skip-readme does not run the readme script', () => {
  const root = makeTempRoot();
  try {
    const result = runSync(root, ['2.1.309', '--skip-readme']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(markerExists(root), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('without --skip-readme the readme script runs after a change', () => {
  const root = makeTempRoot();
  try {
    const result = runSync(root, ['2.1.309']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(markerExists(root), true);
    assert.equal(JSON.parse(result.stdout).readme, 'updated');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('idempotent: same version again writes nothing and exits 0', () => {
  const root = makeTempRoot();
  try {
    const first = runSync(root, ['2.1.309', '--skip-readme']);
    assert.equal(first.status, 0, first.stderr);

    const past = new Date('2020-01-01T00:00:00Z');
    for (const rel of MANIFEST_RELS) {
      fs.utimesSync(path.join(root, rel), past, past);
    }
    const before = MANIFEST_RELS.map(rel => ({
      content: readManifest(root, rel),
      mtimeMs: fs.statSync(path.join(root, rel)).mtimeMs,
    }));

    const second = runSync(root, ['2.1.309', '--skip-readme']);
    assert.equal(second.status, 0, second.stderr);
    MANIFEST_RELS.forEach((rel, i) => {
      assert.equal(readManifest(root, rel), before[i].content, rel);
      assert.equal(fs.statSync(path.join(root, rel)).mtimeMs, before[i].mtimeMs, `mtime changed: ${rel}`);
    });
    const output = JSON.parse(second.stdout);
    assert.deepEqual(output.changed_files, []);
    assert.equal(output.readme, 'not_needed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invalid version or missing version exits 2 and writes nothing', () => {
  const root = makeTempRoot();
  try {
    const cases = [['2.1'], ['v2.1.309'], ['2.1.309-'], ['2.1.309 '], [''], ['--skip-readme'], []];
    for (const args of cases) {
      const result = runSync(root, args);
      assert.equal(result.status, 2, `args ${JSON.stringify(args)} stderr: ${result.stderr}`);
      for (const rel of MANIFEST_RELS) {
        assert.equal(readManifest(root, rel), serialize(BASE), `${rel} changed for ${JSON.stringify(args)}`);
      }
      assert.equal(markerExists(root), false);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing stable_pinned_version in one file exits 1 and writes nothing', () => {
  const root = makeTempRoot();
  try {
    const broken = { ...BASE };
    delete broken.stable_pinned_version;
    fs.writeFileSync(path.join(root, MANIFEST_RELS[1]), serialize(broken));

    const result = runSync(root, ['2.1.309']);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /stable_pinned_version is missing/);
    assert.equal(readManifest(root, MANIFEST_RELS[0]), serialize(BASE));
    assert.equal(readManifest(root, MANIFEST_RELS[1]), serialize(broken));
    assert.equal(markerExists(root), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
