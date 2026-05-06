# 2026-05-06 Fix Local Candidate Detection Test Scope

## STEP 4

## Repro

- remote branch exists:
  - `origin/automation/native-claude-2.1.128`
- current status script still returns:
  - `latest_candidate_version = 2.1.126`
  - `needs_verification = false`

## Test Points

1. branch listing returns prefixed branches
2. version extraction still returns bare version
3. candidate version is compared against `latest_audited_version`
4. stale state lock for another version does not suppress `2.1.128`
5. fallback to `origin/dev` manifest only happens when no newer branch exists

## Minimal Commands

- `node --check scripts/release-automation-status.js`
- `git fetch --prune origin`
- `node scripts/release-automation-status.js --json`
- `sh scripts/run-local-release-automation.sh --dry-run`
