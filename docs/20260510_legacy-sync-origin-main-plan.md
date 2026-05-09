# STEP 1: Legacy Sync Origin Main Plan

## Goal

legacy sync が local canonical worktree の branch 状態に引きずられず、常に canonical `origin/main` を source of truth にする。

## Facts

- `needs_legacy_sync=true` のときでも、local canonical worktree が feature branch だと `sync-legacy-metadata.js` は古い metadata を読む。
- 今回 `2.1.138` で old repo sync が止まった直接原因はこれ。
- 完全自動化では、legacy sync source は release 済み canonical `origin/main` でなければならない。

## Scope

- `scripts/sync-legacy-metadata.js`
- 必要なら `scripts/sync-legacy-metadata.sh`
- local verification

## Success Criteria

- local canonical branch に依存せず、`origin/main` の verified versions を old repo へ反映できる
- `2.1.138` の old repo sync を完了できる
