# 2026-05-06 Fix Local Verification Handoff Plan

## Goal

`run-local-release-automation.sh` を、
- candidate branch を checkout した実体で検証し
- 成功時は同じ candidate branch を `termux_verified` へ更新して
- 既存 PR を進める
形へ直す。

## Facts

- current dry-run after status fix:
  - `latest_candidate_version = 2.1.128`
  - `needs_verification = true`
- current actual local run failed because:
  - cloned repo manifest still had `latest_candidate_version = 2.1.126`
  - `config/claude-native-audited-versions.json` did not include `2.1.128`
  - `prepare-native.js 2.1.128` failed with `Unsupported audited Claude Code version: 2.1.128`
- current prompt still asks Codex to run:
  - `gh workflow run promote-verified-candidate.yml ...`
- but current public repo no longer has:
  - `.github/workflows/promote-verified-candidate.yml`

## Root Cause

1. local automation clones `main` and keeps that checkout for verification
2. verification therefore runs against stale metadata instead of candidate branch content
3. post-verification path still targets a removed workflow

## Expected Fix

1. after reading `candidate_version`, derive:
   - `candidate_branch = automation/native-claude-<version>`
2. if that remote branch exists:
   - checkout `origin/<candidate_branch>` in the cloned repo before Codex verification
3. if that remote branch does not exist:
   - hard stop
   - do not verify against stale `main`
   - write a failure/no-verification result instead
4. update prompt so that success path is:
   - `node scripts/promote-verified-version.js <version>`
   - `node scripts/update-release-manifest.js`
   - `node scripts/update-readme-version-guidance.js`
   - commit
   - `git push --force-with-lease origin <candidate_branch>`
   - if no open PR exists for head `<candidate_branch>` base `dev`, create one best-effort
5. do not merge
6. do not publish
7. do not sync legacy
