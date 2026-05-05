# 2026-05-06 Restore Native Candidate Intake Test Scope

## STEP 4

## Repro / Failure

- current `origin/main` workflow:
  - resolves `2.1.128`
  - fails when the version is not already audited
- expected restored behavior:
  - unknown audited version does not fail
  - candidate metadata path is taken

## Verification Points

1. workflow YAML remains syntax-valid
2. schedule / workflow_dispatch are both defined
3. write permissions are limited to:
   - `contents: write`
   - `pull-requests: write`
4. workflow body does **not** include:
   - `npm publish`
   - `gh workflow run`
   - legacy sync
   - promotion workflow dispatch
   - legacy repo token usage
5. candidate branch naming is fixed:
   - `automation/native-claude-<version>`
6. PR creation is best-effort
7. duplicate open PR check exists
8. base branch is fixed to `dev`
9. manifest update and README guidance update are included

## Minimal Checks

- grep checks for forbidden strings:
  - `npm publish`
  - `gh workflow run`
  - `legacy`
  - `promote-`
  - `NPM_TOKEN`
- branch/PR logic check:
  - existing PR detection
  - branch push before PR create
- candidate path check:
  - `Skip existing audited version`
  - `Prepare artifact and discover offsets`
  - `update-release-manifest.js`
  - `update-readme-version-guidance.js`
