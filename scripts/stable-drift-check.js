#!/usr/bin/env node
'use strict';

// 公式 @anthropic-ai/claude-code の stable と、自前 @bash0816/claude-code の stable の差分を検出する読み取り専用チェック。
// npm への書き込み・workflow dispatch・承認操作は行わない。

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveTarget } = require('./resolve-stable-target');

const OFFICIAL_PKG = '@anthropic-ai/claude-code';
const OUR_PKG = '@bash0816/claude-code';
const WAIT_LIMIT_MS = 168 * 60 * 60 * 1000;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?$/;
const EXIT_CODES = {
  ok: 0,
  waiting_unverified: 0,
  waiting_unpublished: 0,
  waiting_too_long: 1,
  drift: 1,
  meta_drift: 1,
  infra_error: 3,
};
const DRIFT_DISPATCH = 'gh workflow run npm-package.yml -R bash0816/ClaudeCode-Termux --ref main -f retag_stable=';
const SYNC_CMD = 'node scripts/sync-stable-pinned.js';

class InfraError extends Error {}

function infra(message) {
  return new InfraError(message);
}

function outputOf(r) {
  return `${r.stdout || ''}${r.stderr || ''}`.trim();
}

function npmView(npmBin, args) {
  const r = spawnSync(npmBin, ['view', ...args], { encoding: 'utf8', env: process.env });
  if (r.error) {
    throw infra(`npm view ${args.join(' ')} を起動できません: ${r.error.message}`);
  }
  return r;
}

function fetchStable(npmBin, pkg, label) {
  const r = npmView(npmBin, [pkg, 'dist-tags.stable']);
  if (r.status !== 0) {
    throw infra(`${label} の stable 取得に失敗 (exit ${r.status}): ${outputOf(r)}`);
  }
  const version = (r.stdout || '').trim();
  if (!VERSION_RE.test(version)) {
    throw infra(`${label} の stable が不正または空です: "${version}"`);
  }
  return version;
}

function fetchPublishedAt(npmBin, officialStable) {
  const r = npmView(npmBin, [OFFICIAL_PKG, 'time', '--json']);
  if (r.status !== 0) {
    throw infra(`公式 time の取得に失敗 (exit ${r.status}): ${outputOf(r)}`);
  }
  let time;
  try {
    time = JSON.parse(r.stdout || '');
  } catch (err) {
    throw infra(`公式 time の JSON が不正です: ${err.message}`);
  }
  if (time === null || typeof time !== 'object' || Array.isArray(time)) {
    throw infra('公式 time が object ではありません');
  }
  const raw = Object.prototype.hasOwnProperty.call(time, officialStable) ? time[officialStable] : undefined;
  if (typeof raw !== 'string') {
    throw infra(`公式 ${officialStable} の公開日時が time にありません`);
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    throw infra(`公式 ${officialStable} の公開日時が不正です: "${raw}"`);
  }
  return ms;
}

function makeIsPublished(npmBin) {
  return version => {
    const r = npmView(npmBin, [`${OUR_PKG}@${version}`, 'version']);
    if (r.status === 0) {
      const out = (r.stdout || '').trim();
      if (out === version) {
        return true;
      }
      throw infra(`${OUR_PKG}@${version} の version 確認が一致しません: "${out}"`);
    }
    if (outputOf(r).includes('E404')) {
      return false;
    }
    throw infra(`${OUR_PKG}@${version} の公開確認に失敗 (exit ${r.status}): ${outputOf(r)}`);
  };
}

function readJson(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw infra(`${label} を読めません: ${err.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw infra(`${label} の JSON が不正です: ${err.message}`);
  }
}

function pinnedVersion(file, label) {
  const manifest = readJson(file, label);
  const version = manifest !== null && typeof manifest === 'object' ? manifest.stable_pinned_version : undefined;
  if (typeof version !== 'string' || !VERSION_RE.test(version)) {
    throw infra(`${label} の stable_pinned_version が不正です: ${JSON.stringify(version)}`);
  }
  return version;
}

function readAudited(file) {
  const config = readJson(file, 'audited versions');
  const versions = config !== null && typeof config === 'object' ? config.versions : undefined;
  if (versions === null || typeof versions !== 'object' || Array.isArray(versions)) {
    throw infra('audited versions に versions object がありません');
  }
  return versions;
}

function parseNow(value) {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw infra(`STABLE_CHECK_NOW が不正です: "${value}"`);
  }
  return new Date(ms);
}

function parseArgs(argv, ctx) {
  const opts = { simulate: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg !== '--status-file' && arg !== '--simulate') {
      throw infra(`不明な引数です: ${arg}`);
    }
    if (i + 1 >= argv.length) {
      throw infra(`${arg} には値が必要です`);
    }
    i += 1;
    if (arg === '--status-file') {
      ctx.statusFile = argv[i];
    } else {
      opts.simulate = argv[i];
    }
  }
  if (opts.simulate !== null && opts.simulate !== 'drift') {
    throw infra(`--simulate は drift のみ対応です: ${opts.simulate}`);
  }
  return opts;
}

function evaluate(opts, env, now, known) {
  if (opts.simulate === 'drift') {
    return { status: 'drift', detail: 'simulated drift: npm は呼び出していません' };
  }

  const npmBin = env.NPM_BIN || 'npm';
  const root = env.STABLE_CHECK_ROOT || path.resolve(__dirname, '..');

  const officialStable = fetchStable(npmBin, OFFICIAL_PKG, '公式');
  known.official_stable = officialStable;
  const ourStable = fetchStable(npmBin, OUR_PKG, '自前');
  known.our_stable = ourStable;
  const publishedAt = fetchPublishedAt(npmBin, officialStable);
  const audited = readAudited(path.join(root, 'config', 'claude-native-audited-versions.json'));
  const rootPinned = pinnedVersion(
    path.join(root, 'config', 'claude-termux-release-manifest.json'),
    'root manifest',
  );
  const pkgPinned = pinnedVersion(
    path.join(root, 'packages', 'claude-code', 'config', 'claude-termux-release-manifest.json'),
    'packages manifest',
  );

  let resolved;
  try {
    resolved = resolveTarget({ officialStable, audited, isPublished: makeIsPublished(npmBin) });
  } catch (err) {
    if (err instanceof InfraError) {
      throw err;
    }
    throw infra(`target 解決に失敗: ${err.message}`);
  }

  const ageMs = now.getTime() - publishedAt;
  const hours = Math.round(ageMs / 36000) / 100;

  if (resolved.reason !== 'ok') {
    known.waiting_hours = hours;
    const waitingStatus = resolved.reason === 'unverified' ? 'waiting_unverified' : 'waiting_unpublished';
    const cause = resolved.reason === 'unverified'
      ? `${officialStable} に検証済みの候補がありません`
      : `候補 ${resolved.candidate} が ${OUR_PKG} に未公開です`;
    if (ageMs > WAIT_LIMIT_MS) {
      return {
        status: 'waiting_too_long',
        detail: `${cause}。公式公開から ${hours} h 経過し、上限 168 h を超えました`,
      };
    }
    return {
      status: waitingStatus,
      detail: `${cause}。公式公開から ${hours} h 経過（上限 168 h 以内）`,
    };
  }

  const target = resolved.target;
  known.target = target;
  if (ourStable !== target) {
    return {
      status: 'drift',
      detail: `自前 stable ${ourStable} が検証済み target ${target} と一致しません`,
    };
  }
  if (rootPinned !== ourStable || pkgPinned !== ourStable) {
    return {
      status: 'meta_drift',
      detail: `stable_pinned_version が自前 stable ${ourStable} と一致しません (root=${rootPinned}, packages=${pkgPinned})`,
    };
  }
  return {
    status: 'ok',
    detail: `自前 stable ${ourStable} は target ${target} と一致し、manifest も同期済みです`,
  };
}

function buildResult(outcome, known, now, env) {
  return {
    status: outcome.status,
    detail: outcome.detail,
    official_stable: known.official_stable,
    our_stable: known.our_stable,
    target: known.target,
    waiting_hours: known.waiting_hours,
    event: env.GITHUB_EVENT_NAME || null,
    checked_at: now.toISOString(),
  };
}

function show(value) {
  return value === null || value === undefined ? '-' : String(value);
}

function summaryMarkdown(r) {
  const target = r.target ?? '<target>';
  const lines = [
    '## Stable drift check',
    '',
    '| 項目 | 値 |',
    '| --- | --- |',
    `| status | \`${r.status}\` |`,
    `| 公式 stable | ${show(r.official_stable)} |`,
    `| 自前 stable | ${show(r.our_stable)} |`,
    `| target | ${show(r.target)} |`,
    `| 待機時間 | ${r.waiting_hours === null ? '-' : `${r.waiting_hours} h`} |`,
    '',
    `詳細: ${r.detail}`,
    '',
  ];
  if (r.status === 'drift') {
    lines.push('次の操作（人が実行）:', '', '```sh', `${DRIFT_DISPATCH}${target}`, `${SYNC_CMD} ${target}`, '```', '');
  }
  if (r.status === 'meta_drift') {
    lines.push('次の操作（人が実行）:', '', '```sh', `${SYNC_CMD} ${r.our_stable}`, '```', '');
  }
  return `${lines.join('\n')}\n`;
}

function main(argv, env) {
  const ctx = { statusFile: null };
  const known = { official_stable: null, our_stable: null, target: null, waiting_hours: null };
  let now = new Date();
  let outcome;
  try {
    const opts = parseArgs(argv, ctx);
    if (env.STABLE_CHECK_NOW) {
      now = parseNow(env.STABLE_CHECK_NOW);
    }
    outcome = evaluate(opts, env, now, known);
  } catch (err) {
    outcome = { status: 'infra_error', detail: err.message };
  }

  const result = buildResult(outcome, known, now, env);
  let exitCode = EXIT_CODES[result.status];

  if (ctx.statusFile !== null) {
    try {
      fs.writeFileSync(ctx.statusFile, `${JSON.stringify(result, null, 2)}\n`);
    } catch (err) {
      console.error(`status-file を書き込めません: ${err.message}`);
      exitCode = 3;
    }
  }

  if (env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summaryMarkdown(result));
    } catch (err) {
      console.error(`GITHUB_STEP_SUMMARY に追記できません: ${err.message}`);
      exitCode = 3;
    }
  }

  console.log(`STATUS=${result.status}`);
  console.log(`detail: ${result.detail}`);
  console.log(
    `official_stable=${show(result.official_stable)} our_stable=${show(result.our_stable)} target=${show(result.target)}`,
  );
  return exitCode;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2), process.env);
}

module.exports = { main };
