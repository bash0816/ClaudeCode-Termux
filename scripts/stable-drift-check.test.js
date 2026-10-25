'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, 'stable-drift-check.js');
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WAIT_LIMIT_MS = 168 * HOUR_MS;
const BASE = new Date('2026-10-20T00:00:00.000Z');
const OFFICIAL = '2.1.400';
const OFFICIAL_PKG = '@anthropic-ai/claude-code';
const OUR_PKG = '@bash0816/claude-code';
const UNVERIFIED = { '2.1.399': { status: 'termux_verified' } };

const KEY = {
  officialStable: `view ${OFFICIAL_PKG} dist-tags.stable`,
  ourStable: `view ${OUR_PKG} dist-tags.stable`,
  officialTime: `view ${OFFICIAL_PKG} time --json`,
  ourVersion: version => `view ${OUR_PKG}@${version} version`,
};

// モック npm: argv を記録し、argv の連結文字列をキーに設定ファイルの応答を返す。未定義の argv は exit 97。
const MOCK_SOURCE = `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');

const args = process.argv.slice(2);
const key = args.join(' ');
fs.appendFileSync(process.env.MOCK_LOG, JSON.stringify(args) + '\\n');
const cfg = JSON.parse(fs.readFileSync(process.env.MOCK_CONFIG, 'utf8'));
if (!Object.prototype.hasOwnProperty.call(cfg, key)) {
  process.stderr.write('UNEXPECTED ARGV: ' + key + '\\n');
  process.exitCode = 97;
} else {
  const r = cfg[key];
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  process.exitCode = r.status || 0;
}
`;

const tempDirs = [];

function makeTempDir() {
  const base = process.env.TMPDIR || (process.env.PREFIX ? path.join(process.env.PREFIX, 'tmp') : os.tmpdir());
  const dir = fs.mkdtempSync(path.join(base, 'stable-drift-test-'));
  tempDirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function ok(stdout) {
  return { status: 0, stdout, stderr: '' };
}

function publishResponse(kind, version) {
  if (kind === 'published') {
    return ok(`${version}\n`);
  }
  if (kind === 'E404') {
    return { status: 1, stdout: '', stderr: 'npm ERR! code E404\nnpm ERR! 404 Not Found\n' };
  }
  return { status: 1, stdout: '', stderr: 'npm ERR! code E500\n' };
}

function scenario(opts = {}) {
  const official = opts.official ?? OFFICIAL;
  const ours = opts.ours ?? OFFICIAL;
  const now = opts.now ?? BASE;
  const publishedAt = opts.publishedAt ?? new Date(now.getTime() - 30 * DAY_MS);
  const audited = opts.audited ?? { [OFFICIAL]: { status: 'termux_verified' } };
  const dir = makeTempDir();
  const root = path.join(dir, 'root');
  const mockPath = path.join(dir, 'fake-npm.js');
  const cfgPath = path.join(dir, 'mock-config.json');
  const logPath = path.join(dir, 'mock-calls.log');

  writeJson(path.join(root, 'config', 'claude-native-audited-versions.json'), { versions: audited });
  writeJson(path.join(root, 'config', 'claude-termux-release-manifest.json'), {
    stable_pinned_version: opts.rootPinned ?? ours,
  });
  writeJson(path.join(root, 'packages', 'claude-code', 'config', 'claude-termux-release-manifest.json'), {
    stable_pinned_version: opts.pkgPinned ?? ours,
  });

  const mock = {
    [KEY.officialStable]: ok(`${official}\n`),
    [KEY.ourStable]: ok(`${ours}\n`),
    [KEY.officialTime]: ok(JSON.stringify({ [official]: publishedAt.toISOString() })),
    [KEY.ourVersion(official)]: publishResponse(opts.publish ?? 'published', official),
    ...(opts.mock || {}),
  };
  fs.writeFileSync(mockPath, MOCK_SOURCE);
  fs.chmodSync(mockPath, 0o755);
  writeJson(cfgPath, mock);
  return { dir, root, mockPath, cfgPath, logPath, now };
}

function runCheck(s, args = [], extraEnv = {}) {
  const env = { ...process.env };
  for (const name of ['GITHUB_STEP_SUMMARY', 'GITHUB_EVENT_NAME', 'NODE_TEST_CONTEXT']) {
    delete env[name];
  }
  Object.assign(env, {
    NPM_BIN: s.mockPath,
    STABLE_CHECK_ROOT: s.root,
    STABLE_CHECK_NOW: s.now.toISOString(),
    MOCK_CONFIG: s.cfgPath,
    MOCK_LOG: s.logPath,
  }, extraEnv);
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env });
}

function statusOf(r) {
  const match = /^STATUS=(\S+)$/m.exec(r.stdout || '');
  return match ? match[1] : null;
}

function assertRun(r, status, code) {
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  assert.equal(statusOf(r), status, output);
  assert.equal(r.status, code, output);
}

const INFRA_OFFICIAL_FAIL = { [KEY.officialStable]: { status: 1, stdout: '', stderr: 'npm ERR! network' } };

test('ok when official and our stable match and manifests are synced', () => {
  assertRun(runCheck(scenario()), 'ok', 0);
});

test('waiting_unverified within 168 h exits 0', () => {
  const s = scenario({ audited: UNVERIFIED, publishedAt: new Date(BASE.getTime() - 7 * DAY_MS) });
  assertRun(runCheck(s), 'waiting_unverified', 0);
});

test('waiting_unpublished within 168 h exits 0', () => {
  const s = scenario({ publish: 'E404', publishedAt: new Date(BASE.getTime() - 7 * DAY_MS) });
  assertRun(runCheck(s), 'waiting_unpublished', 0);
});

test('waiting_too_long for unverified after 168 h exits 1', () => {
  const s = scenario({ audited: UNVERIFIED, publishedAt: new Date(BASE.getTime() - 8 * DAY_MS) });
  assertRun(runCheck(s), 'waiting_too_long', 1);
});

test('waiting_too_long for unpublished after 168 h exits 1', () => {
  const s = scenario({ publish: 'E404', publishedAt: new Date(BASE.getTime() - 8 * DAY_MS) });
  assertRun(runCheck(s), 'waiting_too_long', 1);
});

test('exactly 168 h of waiting is still waiting_unverified', () => {
  const s = scenario({ audited: UNVERIFIED, publishedAt: new Date(BASE.getTime() - WAIT_LIMIT_MS) });
  assertRun(runCheck(s), 'waiting_unverified', 0);
});

test('168 h + 1 ms of waiting is waiting_too_long', () => {
  const s = scenario({ audited: UNVERIFIED, publishedAt: new Date(BASE.getTime() - WAIT_LIMIT_MS - 1) });
  assertRun(runCheck(s), 'waiting_too_long', 1);
});

test('drift when our stable differs from the verified target', () => {
  assertRun(runCheck(scenario({ ours: '2.1.399' })), 'drift', 1);
});

test('drift step summary includes the retag dispatch and sync commands', () => {
  const s = scenario({ ours: '2.1.399' });
  const summary = path.join(s.dir, 'summary.md');
  const r = runCheck(s, [], { GITHUB_STEP_SUMMARY: summary, GITHUB_EVENT_NAME: 'schedule' });
  assertRun(r, 'drift', 1);
  const text = fs.readFileSync(summary, 'utf8');
  assert.ok(
    text.includes('gh workflow run npm-package.yml -R bash0816/ClaudeCode-Termux --ref main -f retag_stable=2.1.400'),
    text,
  );
  assert.ok(text.includes('node scripts/sync-stable-pinned.js 2.1.400'), text);
});

test('meta_drift when only the root manifest mismatches exits 1', () => {
  assertRun(runCheck(scenario({ rootPinned: '2.1.399' })), 'meta_drift', 1);
});

test('meta_drift when only the packages manifest mismatches exits 1', () => {
  const s = scenario({ pkgPinned: '2.1.399' });
  const summary = path.join(s.dir, 'summary.md');
  const r = runCheck(s, [], { GITHUB_STEP_SUMMARY: summary });
  assertRun(r, 'meta_drift', 1);
  assert.ok(fs.readFileSync(summary, 'utf8').includes('node scripts/sync-stable-pinned.js 2.1.400'));
});

test('infra_error when the official stable fetch fails', () => {
  assertRun(runCheck(scenario({ mock: INFRA_OFFICIAL_FAIL })), 'infra_error', 3);
});

test('infra_error when the official stable fetch reports E404', () => {
  const mock = { [KEY.officialStable]: { status: 1, stdout: '', stderr: 'npm ERR! code E404' } };
  assertRun(runCheck(scenario({ mock })), 'infra_error', 3);
});

test('infra_error when the official stable response is empty', () => {
  const mock = { [KEY.officialStable]: ok('') };
  assertRun(runCheck(scenario({ mock })), 'infra_error', 3);
});

test('infra_error when our stable is not a valid version', () => {
  const mock = { [KEY.ourStable]: ok('latest\n') };
  assertRun(runCheck(scenario({ mock })), 'infra_error', 3);
});

test('infra_error when the publish check fails with a non-E404 error', () => {
  assertRun(runCheck(scenario({ publish: 'E500' })), 'infra_error', 3);
});

test('infra_error when the publish check exits 0 with a mismatched version', () => {
  const mock = { [KEY.ourVersion(OFFICIAL)]: ok('2.1.399\n') };
  assertRun(runCheck(scenario({ mock })), 'infra_error', 3);
});

test('infra_error when the time JSON is invalid', () => {
  const mock = { [KEY.officialTime]: ok('not json') };
  assertRun(runCheck(scenario({ mock })), 'infra_error', 3);
});

test('infra_error when the official publish date is invalid', () => {
  const mock = { [KEY.officialTime]: ok(JSON.stringify({ [OFFICIAL]: 'not-a-date' })) };
  assertRun(runCheck(scenario({ mock })), 'infra_error', 3);
});

test('status file is written on infra_error with the expected keys', () => {
  const s = scenario({ mock: INFRA_OFFICIAL_FAIL });
  const statusFile = path.join(s.dir, 'status.json');
  const r = runCheck(s, ['--status-file', statusFile]);
  assertRun(r, 'infra_error', 3);
  const json = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  assert.deepEqual(
    Object.keys(json).sort(),
    ['checked_at', 'detail', 'event', 'official_stable', 'our_stable', 'status', 'target', 'waiting_hours'].sort(),
  );
  assert.equal(json.status, 'infra_error');
  assert.equal(json.official_stable, null);
});

test('--simulate drift reports drift without calling npm', () => {
  const s = scenario();
  const statusFile = path.join(s.dir, 'status.json');
  const r = runCheck(s, ['--simulate', 'drift', '--status-file', statusFile]);
  assertRun(r, 'drift', 1);
  assert.ok(r.stdout.includes('simulated'), r.stdout);
  assert.equal(fs.existsSync(s.logPath), false, 'npm mock must not be called');
  assert.equal(JSON.parse(fs.readFileSync(statusFile, 'utf8')).status, 'drift');
});

test('unknown argument is infra_error', () => {
  assertRun(runCheck(scenario(), ['--bogus']), 'infra_error', 3);
});
