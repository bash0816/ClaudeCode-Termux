# STEP 3: Native Update Guard Phase 3 Implementation Plan

## Implementation Steps

1. `native-update-guard.js`
   - shell launcher 判定 helper 追加
   - `sh -c`, `bash -c`, `bash -lc` の shallow unwrap helper 追加
   - `shouldBlockCommand()` / `shouldBlockExecString()` に 1 段 unwrap を統合
2. `native-update-guard.test.js`
   - blocked
     - `sh -c "npm install -g @anthropic-ai/claude-code"`
     - `bash -lc "pnpm add -g @anthropic-ai/claude-code"`
     - `sh -c "corepack yarn global add @anthropic-ai/claude-code"`
   - non-block
     - `sh -c "npm install -g @bash0816/claude-code@2.1.137"`
3. verify
   - `sh -n packages/claude-code/bin/claude`
   - `sh -n packages/claude-code/lib/termux-run-claude-native.sh`
   - `node --check packages/claude-code/lib/native-update-guard.js`
   - `node --test packages/claude-code/lib/native-update-guard.test.js`
   - `git diff --check`

## Review Gate

- `GPT-5.5` review で `Go`
- local verification 全通過
