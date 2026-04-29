# Legacy To Canonical Migration Design Review

## 対象

- typo を含む legacy 系
  - repo: `CluadeCode-Termux`
  - package: `@bash0816/cluade-code`
- 正規名の canonical 系
  - repo: `ClaudeCode-Termux`
  - package: `@bash0816/claude-code`

## 定義

- `legacy`: 既存ユーザー互換と移行案内を担う系統
- `canonical`: 今後の本体開発、正式 docs、正式 release を担う系統

## 事実

- 旧 public repo `CluadeCode-Termux` は既に運用中
- 新 public repo `ClaudeCode-Termux` は新規作成済みで、まだ空
- 旧 package `@bash0816/cluade-code` は `2.1.118`, `2.1.119`, `2.1.122` が公開済み
- 新 package `@bash0816/claude-code` は未公開
- 既存端末の update は旧 package 名に依存している
- `2.1.122` の旧 package 実装では、新 package への自動移行はまだ入っていない

## 論点

- 既存端末を壊さずに正規名へ移れるか
- 新 repo に何を最初に持っていくか
- 旧 repo / 旧 package をいつ bridge 専用に縮退するか
- GitHub Actions / manifest / release の正をどちらへ置くか

## 比較

### 1. 旧 repo を rename してそのまま使う案

- 利点: 一見単純
- 欠点: 旧 URL、旧 package、既存 docs、既存 automation の責務が混ざる
- 欠点: 「旧 typo 系を残しつつ新正規系へ寄せる」という要求に合わない

### 2. 新 repo を canonical として新設し、旧 repo を bridge にする案

- 利点: 責務分離が明確
- 利点: 新規ユーザーは正規名へ統一できる
- 利点: 既存ユーザーには旧 package の最終版で移行導線を配れる
- 欠点: 一時的に repo / package / workflow が二重になる

## 採用案

- `ClaudeCode-Termux` を canonical repo にする
- `CluadeCode-Termux` は legacy bridge repo として残す
- `@bash0816/claude-code` を canonical package とする
- `@bash0816/cluade-code` は「次の 1 回を最終版」とし、その版で新 package への移行案内または移行 update を提供する

## repo ごとの責務

### Canonical repo: `ClaudeCode-Termux`

- 今後の本体 source
- 正規 docs
- 正規 GitHub Actions
- 正規 manifest
- `@bash0816/claude-code` publish

### Legacy repo: `CluadeCode-Termux`

- 既存ユーザー向け互換 docs
- 旧 package の最終版管理
- 新 repo / 新 package への移行案内
- 旧系の maintenance 最小限

## package ごとの責務

### Legacy package: `@bash0816/cluade-code`

- 既存端末互換を維持
- 次の 1 回を最終版にする
- その最終版で次を行う
  - deprecation notice 表示
  - `claude update` 時に canonical package へ誘導
  - 可能なら明示 migration command を表示

### Canonical package: `@bash0816/claude-code`

- 新規 install の正規導線
- 今後の audited update の正規導線
- 正規 manifest を参照

## Actions / Manifest / Release の持ち場所

- 正は canonical repo 側に置く
- legacy repo 側には次だけ残す
  - migration docs
  - 最終 legacy package publish 用 workflow
  - deprecation / handoff 用 release note

## Go / No-Go

- Go:
  - 旧 package が少なくとも 1 回は既存端末へ配られる
  - 新 package は旧 package と独立に publish できる
  - 正規 docs と正規 manifest の参照先が canonical repo に寄る
- No-Go:
  - 旧 package の update を突然 404 にする
  - 旧 repo と新 repo のどちらが正か不明な状態で運用を始める

## 保留条件

- legacy 最終版で「自動 install 移行」まで行うか、「警告表示と手動 install 案内」に留めるか
- canonical repo へ履歴を mirror するか、最小ファイルで新規初期化するか

## 次アクション

1. canonical repo 初期投入方針を決める
2. dual package 構成の PoC を作る
3. legacy 最終版の update 仕様を固定する
4. dual publish を canonical repo へ寄せる
