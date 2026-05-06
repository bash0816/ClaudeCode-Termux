# 2026-05-06 Fix Local Candidate Detection Implementation Plan

## Objective

`scripts/release-automation-status.js` の remote candidate branch 検出を修正する。

## Steps

1. `listRemoteBranches(prefix)` を prefix match へ直す
2. `loadCandidateVersion()` が
   - `automation/native-claude-<version>`
   を拾えることを確認する
3. `node --check scripts/release-automation-status.js`
4. `git fetch --prune origin` 後に
   - `node scripts/release-automation-status.js --json`
   を実行
5. `GPT-5.5` reviewer で STEP 8/9
6. その後
   - `sh scripts/run-local-release-automation.sh --dry-run`
   - 必要なら本実行
   まで進む

## Success Criteria

- `latest_candidate_version = 2.1.128`
- `needs_verification = true`
- `local_verification_locked = false`

## Non-Goals

- state file schema 変更
- cron 時刻変更
- verification logic 自体の変更
