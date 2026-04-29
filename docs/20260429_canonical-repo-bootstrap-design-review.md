# 2026-04-29 Canonical Repo Bootstrap Design Review

## STEP 2 設計レビュー

### 目的

- `ClaudeCode-Termux` を typo なしの正規 repo として成立させる
- source, README, workflow, package metadata を新 repo に揃える
- 既存利用者は旧 repo / 旧 package で壊さず、新規利用者は新 repo / 新 package へ誘導する

### 事実

- 新 GitHub repo `ClaudeCode-Termux` は作成済みだが、まだ空である
- 旧 public repo `CluadeCode-Termux` には `2.1.122` までの source, workflow, docs が存在する
- 旧 npm package `@bash0816/cluade-code` は `2.1.122` まで公開済み
- 新 npm package `@bash0816/claude-code` は未公開である
- 既存端末の update 導線は旧 package 名を前提にしている

### 判断対象

- 新 repo は fork ではなく独立した canonical repo とするか
- source の初回投入をどこまで旧 repo から引き継ぐか
- legacy migration 文脈を新 repo にどこまで残すか

### 採用方針

- 新 repo `ClaudeCode-Termux` は独立した canonical repo とする
- source は旧 public repo の公開済み wrapper / metadata / workflow をベースに投入する
- package 名、manifest URL、README 導線は canonical 名へ修正する
- migration に必要な文書は新 repo にも残すが、README は canonical 利用者向けに簡潔化する
- 旧 repo は compatibility / migration hub として別運用を継続する

### 採用理由

- fork では upstream 関係が逆転して見え、正規 repo の責務が不明瞭になる
- 旧 repo の実装資産を再利用すると、新 repo の bootstrap を最短で成立させられる
- 既存端末の互換維持は旧 repo / 旧 package 側で続ける方が安全である

### 非採用案

- 旧 repo を rename して一気に移行する
  - 既存 URL, package 名, update 導線を壊すため不採用
- 新 repo を空のまま docs だけ先に置く
  - canonical repo として機能しないため不採用

### リスク

- docs 内に typo 名が説明用途で残る
- 新 package 未公開の間、README の install 導線は先行状態になる

### Go / No-Go

- Go
- 条件: 初回 commit 前に syntax / manifest / pack dry-run を通すこと
