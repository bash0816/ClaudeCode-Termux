# 2026-05-06 Fix Local Verification Handoff Implementation Plan

## Objective

`scripts/run-local-release-automation.sh` を current public shape に合わせる。

## Steps

1. derive `candidate_branch=automation/native-claude-<version>`
2. after clone/fetch, if branch exists:
   - checkout candidate branch in `run_dir/repo`
3. if branch does not exist:
   - stop before verification
   - emit failure/no-verification result
4. update prompt facts:
   - repository checkout branch
   - candidate branch name
5. replace success action from removed workflow dispatch to:
   - `node scripts/promote-verified-version.js <version>`
   - `node scripts/update-release-manifest.js`
   - `node scripts/update-readme-version-guidance.js`
   - commit
   - push `--force-with-lease`
   - create PR best-effort only if none exists
6. keep JSON schema unchanged
   - `promotion_dispatched=true` means branch/PR handoff prepared
7. notes must state that `promotion_dispatched` means local branch/PR handoff prepared, not workflow dispatch
8. dry-run
9. actual run

## Success Criteria

- dry-run prompt references candidate branch checkout
- actual run verifies against candidate metadata instead of stale `main`
- removed workflow name is no longer referenced

## Non-Goals

- merge automation
- npm publish automation
- legacy sync automation
