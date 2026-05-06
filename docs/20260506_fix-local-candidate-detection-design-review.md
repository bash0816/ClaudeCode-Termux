# 2026-05-06 Fix Local Candidate Detection Design Review

## Reviewed Target

- `20260506_fix-local-candidate-detection-plan.md`

## Design Question

`release-automation-status.js` の candidate branch 検出を、
exact ref path から prefix match へ直す設計は妥当か。

## Proposed Answer

Go.

## Rationale

1. branch 自体は存在している
   - `origin/automation/native-claude-2.1.128`
2. state lock も candidate 側を塞いでいない
   - lock は `2.1.126`
3. local result が `2.1.126` に戻るのは、
   branch detection failure から `origin/dev` manifest fallback している説明と整合する
4. したがって、まず直すべきは
   - remote branch listing
   - version extraction
   であり、local shell そのものではない

## Boundary

- state file schema は変えない
- candidate branch naming は変えない
- local cron 時刻も変えない
- `run-local-release-automation.sh` 本体は変えない

## Expected Outcome

- `release-automation-status.js --json`
  - `latest_candidate_version = 2.1.128`
  - `needs_verification = true`
- local shell が `no_action` ではなく verification path へ進める
