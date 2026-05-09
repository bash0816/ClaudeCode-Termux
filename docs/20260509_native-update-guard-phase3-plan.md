# STEP 1: Native Update Guard Phase 3 Plan

## Goal

Phase 1/2 で未対応の shell indirection 系に対して、誤爆を増やしすぎない shallow guard を追加する。

## Facts

- `2.1.136` と `2.1.137` は完了済み。
- release automation は
  - upstream 検出
  - candidate queue
  - local cron verification
  - canonical publish
  - legacy sync
  まで通っている。
- native update guard は Phase 2 まで `main` 反映済み。
- まだ残る主要経路は
  - `sh -c "..."`
  - `bash -lc "..."`
  - 単純な command chaining を含む shell string
  である。

## Scope

- `exec` / `execSync` 文字列の shallow unwrap
- `spawn` / `execFile` の `sh -c`, `bash -lc` 形式の shallow unwrap
- direct official update だけ block

## Out of Scope

- shell parser の完全実装
- 入れ子 shell の無制限展開
- 複雑な pipeline / subshell / heredoc 解釈

## Success Criteria

- 次の direct pattern を block できる
  - `sh -c "npm install -g @anthropic-ai/claude-code"`
  - `bash -lc "pnpm add -g @anthropic-ai/claude-code"`
  - `sh -c "corepack yarn global add @anthropic-ai/claude-code"`
- canonical package への同型 command は block しない
- 既存 Phase 1/2 test を壊さない
