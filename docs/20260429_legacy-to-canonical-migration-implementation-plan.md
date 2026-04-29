# Legacy To Canonical Migration Implementation Plan

## フェーズ

### Phase 1: Canonical repo 起点の整備

- `ClaudeCode-Termux` に canonical 本体を配置
- `@bash0816/claude-code` 用 package を作る
- canonical manifest, docs, workflows を canonical repo に寄せる

### Phase 2: Legacy bridge 化

- `CluadeCode-Termux` から本体 docs を削減
- 新 repo / 新 package を前面化する migration docs を追加
- 旧 package の最終版仕様を実装する

### Phase 3: Legacy final release

- `@bash0816/cluade-code` の最終版を publish
- deprecation notice と migration 導線を配る
- 必要なら `npm deprecate` を設定する

## 実装対象

### Canonical repo 側

- `README.md`
- `config/`
- `scripts/`
- `.github/workflows/`
- `packages/claude-code/`

### Legacy repo 側

- migration 用 `README.md`
- legacy final package 用 workflow
- 旧 package の最終版 implementation

## 優先順

1. canonical repo に最小稼働セットを作る
2. canonical package を publish 可能にする
3. legacy 最終版の update / notice 実装を作る
4. legacy repo を bridge docs 中心へ縮退する

## テスト観点

- canonical package の `npm pack --dry-run`
- canonical package の install / version / auth / update
- legacy package 最終版の warning 表示
- legacy package 最終版の migration command 表示
- manifest と package version の整合性

## 留保

- 実際にどの commit から canonical repo を初期化するか
- `git mirror` を使うか、ファイル単位で最小移行するか
- legacy 最終版で自動移行までやるか
