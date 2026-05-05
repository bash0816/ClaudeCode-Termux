# 2026-05-06 Restore Native Candidate Intake Plan

## Goal

`ClaudeCode-Termux` の `Claude Native Version Watch` を、`check-only` 状態から
再び candidate intake できる状態へ戻す。

## Facts

- upstream npm latest
  - `@anthropic-ai/claude-code@latest = 2.1.128`
- current canonical manifest
  - `latest_audited_version = 2.1.126`
  - `latest_candidate_version = 2.1.126`
- local cron
  - `JST 04:30`
  - `run-local-release-automation.sh`
- current local automation result
  - `needs_verification = false`
  - `no_action`
- latest GitHub scheduled run
  - resolved `version=2.1.128`
  - failed in `Check audited version status`

## Root Cause

- `origin/main` の `.github/workflows/claude-native-version-watch.yml` は
  `check-native-candidate` のみを持つ `check-only` 版になっている
- そこで `2.1.128` が audited metadata に無いと `exit 1` で job が落ちる
- 本来必要な
  - candidate metadata prepare
  - manifest/update guidance refresh
  - candidate branch push
  - candidate PR create
  が消えている

## Expected Fix

1. `check-only` をやめる
2. public workflow の例外として、candidate intake だけを public から許可する
   - 許可するもの:
     - metadata update
     - candidate branch push
     - candidate PR create
   - 禁止するもの:
     - publish
     - promotion
     - legacy sync
3. `Skip existing audited version` へ戻す
4. `exists=false` のとき、次の順で実行する
   - `termux-prepare-claude-native-version.js`
   - `add-candidate-metadata.js`
   - `update-release-manifest.js`
   - `update-readme-version-guidance.js`
   - candidate branch `automation/native-claude-<version>` 作成
   - candidate PR を `dev` へ best-effort で作成
5. `workflow_dispatch` は `dev` 固定で candidate intake する
6. schedule 実行でも candidate intake は許可する
   - 理由: local cron が candidate branch/manifest を前提に follow-up するため
   - ただし schedule では publish/promotion/legacy sync は行わない

## Out of Scope

- local cron の時刻変更
- release automation shell の大改修
- `2.1.128` の実機 verification 自体
