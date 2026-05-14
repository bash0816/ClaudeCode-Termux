# 2026-05-13 Release Self-Heal Implementation Plan

1. `run-local-release-automation.sh` の canonical flow prompt に `DIRTY` candidate rebuild 手順を追加する
2. rebuild 手順は
   - `origin/dev` reset
   - `termux-prepare-claude-native-version.js`
   - `add-candidate-metadata.js`
   - `promote-verified-version.js`
   - manifest / README update
   - force-push
   を使う
3. docs を `docs/` に追加する

## Verification

- `sh -n scripts/run-local-release-automation.sh`
- `git diff --check`
- 修正反映後に `2.1.141` intake から publish まで通す
