# 2026-05-06 Fix Local Candidate Detection Plan

## Goal

`release-automation-status.js` が remote candidate branch を正しく検出し、
local cron / shell が `needs_verification=true` へ進めるようにする。

## Facts

- current upstream candidate branch exists:
  - `origin/automation/native-claude-2.1.128`
- current `release-automation-status.js --json`
  - `latest_audited_version = 2.1.126`
  - `latest_candidate_version = 2.1.126`
  - `needs_verification = false`
- current state file lock is only for:
  - `2.1.126`
- `git for-each-ref --format='%(refname:short)' refs/remotes/origin/automation/native-claude-`
  - returns nothing
- `git for-each-ref --format='%(refname:short)' refs/remotes/origin/automation`
  - returns `origin/automation/native-claude-2.1.128`

## Working Hypothesis

`listRemoteBranches(prefix)` が exact ref path を見ていて、
prefix match をしていない。

そのため:
- `origin/automation/native-claude-2.1.128`
が存在しても
- `loadCandidateVersion()` が空を返し
- fallback で `origin/dev` manifest の `2.1.126` に戻っている。

## Expected Fix

1. remote branch listing を prefix match に直す
2. `automation/native-claude-*` を candidate source として拾う
3. `2.1.128 > 2.1.126` を正しく判定する
4. state lock は candidate version 単位で引き続き評価する
5. result が
   - `latest_candidate_version = 2.1.128`
   - `needs_verification = true`
   になることを確認する
