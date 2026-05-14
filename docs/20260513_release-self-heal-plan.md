# 2026-05-13 Release Self-Heal Plan

## Goal

`ClaudeCode-Termux` の release automation が、candidate verification 後に
人手確認待ちで止まらないようにする。

## Facts

- `2.1.140` 完了後も local state file には `promotion_dispatched` が残った
- stale `promotion_dispatched` は次 candidate の固定 lock にはしない方針が既に必要だった
- `2.1.140` candidate PR は `dev` が先に `2.1.139` を取り込んだため `DIRTY` になった
- candidate branch を `origin/dev` ベースで再構成すると `PR #90` は解消できた
- `2.1.141` はまだ candidate intake されていない

## Problem

- stale state を見て user が確認しないと release 状態を誤読する
- stale candidate branch が `dev` に追従できず、`DIRTY` を local automation が自己修復できない

## Success

- stale `promotion_dispatched` が verification lock にならない
- local automation prompt が `DIRTY` candidate branch の rebuild 手順を持つ
- 修正を `feature/* -> dev -> staging -> main` で反映した後、`2.1.141` の intake から publish まで通せる
