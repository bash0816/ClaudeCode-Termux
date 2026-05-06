# 2026-05-06 Fix Local Verification Handoff Test Scope

## STEP 4

## Repro

- status is now correct:
  - `latest_candidate_version = 2.1.128`
  - `needs_verification = true`
- actual local run still fails because repo checkout remains at stale `main`
- prompt still references removed `promote-verified-candidate.yml`

## Test Points

1. candidate branch existence check
2. candidate branch checkout in cloned repo
3. prompt no longer references removed workflow
4. success path references local promote script + manifest/readme sync
5. push target is the candidate branch itself
6. PR create is best-effort and only when no open PR exists
7. JSON schema remains unchanged

## Minimal Commands

- `sh -n scripts/run-local-release-automation.sh`
- `sh scripts/run-local-release-automation.sh --dry-run`
- actual `sh scripts/run-local-release-automation.sh`
