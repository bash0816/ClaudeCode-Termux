# STEP 1: Native Update Guard Phase 2 Plan

## Goal

`claude update` の top-level intercept に加えて、native runtime 内部からの追加 update 経路をより広く block する。

## Facts

- `2.1.136` と `2.1.137` の release は完了している。
- canonical `main` は `2.1.137`。
- `release-automation-status.js` 上も `needs_verification=false`, `needs_publish=false`, `needs_legacy_sync=false`。
- Phase 1 で block 済みなのは、`npm` / `npm-cli.js` を直接叩く official package update 経路。
- residual risk は次の経路。
  - `env npm ...`
  - `npx`
  - `pnpm`
  - `yarn`
  - `corepack ...`
  - 複雑な shell chaining の `exec`

## Scope

- `child_process` / `node:child_process` guard の検出精度向上
- test 拡張
- top-level `claude update` の既存動作は変更しない

## Out of Scope

- official update を canonical package update へ rewrite すること
- native runtime の全 subprocess を網羅的に deny すること
- `main` 以外の release automation 改修

## Success Criteria

- Phase 1 で守っていた経路を壊さない
- 少なくとも次の direct pattern を block できる
  - `env npm install -g @anthropic-ai/claude-code`
  - `npx @anthropic-ai/claude-code`
  - `pnpm add -g @anthropic-ai/claude-code`
  - `yarn global add @anthropic-ai/claude-code`
  - `corepack pnpm add -g @anthropic-ai/claude-code`
  - `corepack yarn global add @anthropic-ai/claude-code`
- shell / node check と unit test が通る
