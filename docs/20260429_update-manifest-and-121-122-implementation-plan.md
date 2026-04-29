# Update Manifest And 121-122 Prep Implementation Plan

## 対象ファイル

- `config/claude-native-audited-versions.json`
- `config/claude-termux-release-manifest.json`
- `packages/cluade-code/config/claude-native-audited-versions.json`
- `packages/cluade-code/config/claude-termux-release-manifest.json`
- `packages/cluade-code/bin/claude`
- `packages/cluade-code/lib/check-updates.js`
- `scripts/update-release-manifest.js`
- `.github/workflows/claude-native-version-watch.yml`
- `README.md`
- `packages/cluade-code/README.md`

## 実装手順

1. `2.1.121` と `2.1.122` の metadata を root / package config に追加する
2. stable / candidate version を読んで release manifest を生成する script を追加する
3. root / package 両方に manifest を配置する
4. workflow から manifest 生成 script を呼ぶ
5. `bin/claude` から呼ぶ update-check helper を追加する
6. 起動時 notify と `claude update` の manifest-aware 更新を実装する
7. README を update policy に合わせて更新する

## テスト観点

- `node --check scripts/update-release-manifest.js`
- `node --check packages/cluade-code/lib/check-updates.js`
- `node scripts/update-release-manifest.js`
- `CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 sh packages/cluade-code/bin/claude update --dry-run`
- `npm pack --dry-run ./packages/cluade-code`

## 保留

- `2.1.121` / `2.1.122` の `termux_verified` 昇格
- npm publish 実行
- 実機での install / launch / auth / update 再確認
