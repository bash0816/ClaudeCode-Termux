# STEP 3: Legacy Sync Origin Main Implementation Plan

1. `sync-legacy-metadata.js`
   - canonical source ref を `origin/main` 既定で追加
   - `git show <ref>:config/claude-native-audited-versions.json` を読む
2. `sync-legacy-metadata.sh`
   - 必要なら source ref env を明示
3. verify
   - `node --check scripts/sync-legacy-metadata.js`
   - `sh -n scripts/sync-legacy-metadata.sh`
   - temp canonical source なしでも local feature branch 上から old repo sync が成立すること
4. `2.1.138` sync 完了後に status 再確認
