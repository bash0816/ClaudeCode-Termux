# STEP 3: Native Update Guard Phase 2 Implementation Plan

## Implementation Steps

1. `native-update-guard.js`
   - command normalization helper 追加
   - package manager family helper 追加
   - manager ごとの operation/target 判定を実装
     - `npm` / `pnpm`: operation + target
     - `yarn`: `global add` + target
     - `npx`: target main arg または `-p/--package` + target
     - `corepack`: shallow normalize のみ
2. `native-update-guard.test.js`
   - `env npm`
   - `npx`
   - `pnpm`
   - `yarn`
   - `corepack pnpm`
   - `corepack yarn`
   の blocked/non-blocked case を追加
3. verify
   - `sh -n packages/claude-code/bin/claude`
   - `sh -n packages/claude-code/lib/termux-run-claude-native.sh`
   - `node --check packages/claude-code/lib/native-update-guard.js`
   - `node --test packages/claude-code/lib/native-update-guard.test.js`
   - `git diff --check`

## Test Focus

- official package だけ block すること
- canonical package は block しないこと
- sync/async API の既存挙動が壊れないこと

## Promotion Gate

- `GPT-5.5` review が `Go`
- local verification 全通過
