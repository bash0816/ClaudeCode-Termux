# Claude Native 2.1.123 Implementation Plan

## STEP 3 実装プラン

1. `scripts/termux-prepare-claude-native-version.js` で `2.1.123` の offset metadata を取得する
2. `config/claude-native-audited-versions.json` と package 側 metadata に `2.1.123` を `offset_discovered` で追加する
3. `node scripts/update-release-manifest.js` で candidate manifest を更新する
4. Termux verification を実施する
5. verification 成功後に `2.1.123` を `termux_verified` に昇格し、`packages/claude-code/package.json` を `2.1.123` に更新する
6. `npm pack --dry-run ./packages/claude-code` で publish 前整合性を確認する

## 対象ファイル

- `config/claude-native-audited-versions.json`
- `config/claude-termux-release-manifest.json`
- `packages/claude-code/config/claude-native-audited-versions.json`
- `packages/claude-code/config/claude-termux-release-manifest.json`
- `packages/claude-code/package.json`

## 完了条件

- root/package metadata が一致する
- `2.1.123` が `termux_verified`
- manifest の `latest_audited_version` が `2.1.123`
- canonical package version が `2.1.123`
