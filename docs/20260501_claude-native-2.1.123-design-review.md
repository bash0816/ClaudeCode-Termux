# Claude Native 2.1.123 Design Review

## STEP 1 計画固定

- 対象: `ClaudeCode-Termux` canonical repo
- 目的: upstream `@anthropic-ai/claude-code@2.1.123` を Termux wrapper の audited version として取り込む
- 範囲:
  - candidate intake
  - Termux verification
  - audited promotion
  - canonical package publish 前提の metadata 更新

## 事実

- 2026-05-01 時点で `npm view @anthropic-ai/claude-code version dist-tags --json` は `latest=2.1.123` を返す
- 現在の canonical metadata は `2.1.122` までしか持たない
- 現在の canonical package version は `2.1.122`
- `claude-native-version-watch.yml` は npm registry を正として candidate version を解決する

## 推測

- `2.1.123` は GitHub Releases 表示より npm publish が先行している可能性が高い
- canonical repo 側では `2.1.123` を candidate intake し、Termux verification が通れば audited promotion してよい

## STEP 2 設計判断

- canonical repo を正規導線とする
- `2.1.123` は最初に `offset_discovered` で追加し、その後 `termux_verified` へ昇格する
- package version は audited promotion 後に `2.1.123` と一致させる
- release manifest は `latest_candidate_version` と `latest_audited_version` を `2.1.123` へ更新する

## STEP 4 再現条件・テスト観点

- `node scripts/termux-prepare-claude-native-version.js @2.1.123 --json`
- `CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 node packages/claude-code/lib/prepare-native.js 2.1.123`
- `CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.123 sh packages/claude-code/bin/claude --version`
- `CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.123 sh packages/claude-code/bin/claude auth status`
- `CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.123 sh packages/claude-code/bin/claude update --dry-run`
- temp prefix での `npm install -g --prefix ... ./packages/claude-code`
