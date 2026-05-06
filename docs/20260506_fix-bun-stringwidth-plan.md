# 2026-05-06 Fix Bun stringWidth Plan

## Goal

`2.1.128` candidate verification で `claude auth status` が `TypeError: Bun.stringWidth is not a function` で落ちる問題を、wrapper 層で吸収して再検証可能にする。

## Facts

- `2.1.128` candidate branch 上では以下が再現する。
  - `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.128 sh packages/claude-code/bin/claude auth status`
  - 結果: `TypeError: Bun.stringWidth is not a function`
- `2.1.128` の抽出 JS には `Bun.stringWidth(q, Yi9)` の直呼びが 1 箇所ある。
- `2.1.126` の抽出 JS にはその直呼びはなく、`typeof Bun.stringWidth === "function" ? ... : fallback` だけがある。
- 現在の wrapper は `globalThis.Bun = { version: '1.1.8' }` しか入れていない。
- 問題箇所は bundle 抽出後 JS の実行時であり、native binary や offset 不整合ではない。

## Working Hypothesis

- `2.1.128` 以降の bundle が Bun API surface を 1 段増やし、Node 上の fake Bun が不足した。
- `auth status` 失敗はその不足 API で止まっており、最小で `Bun.stringWidth` を polyfill すれば candidate verification を再開できる可能性が高い。

## Candidate Fix

第一候補:
- `packages/claude-code/lib/termux-run-claude-native.sh` の fake Bun に `stringWidth` polyfill を追加する。

設計意図:
- bundle 本体への version 固定 patch を避ける
- fake Bun surface を拡張するだけに留める
- 将来の近縁 Bun API surface 増加にも追従しやすくする

## Out of Scope

- native binary patch
- candidate metadata の offset 再監査
- public release 判定そのもの
