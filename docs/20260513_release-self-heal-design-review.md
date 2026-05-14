# 2026-05-13 Release Self-Heal Design Review

## Proposed Design

release automation の self-heal を 2 層で維持する。

### 1. State Reconciliation

`promotion_dispatched` は fixed lock にしない。

扱い:

- `verification_in_progress`
  - verification lock
- `promotion_dispatched`
  - follow-up state
- `publish_dispatched`
  - publish 完了済み follow-up state

### 2. Candidate Rebuild On DIRTY

`run-local-release-automation.sh` が生成する local Codex prompt に、
candidate PR が `DIRTY` のときの rebuild 手順を含める。

方針:

1. candidate branch を `origin/dev` へ reset
2. `termux-prepare-claude-native-version.js` で offset を再取得
3. `add-candidate-metadata.js` で `offset_discovered` を再生成
4. `promote-verified-version.js` と manifest / README update を再実行
5. candidate branch を force-push
6. PR check rerun 後に merge 判定へ戻る

理由:

- stale candidate branch の `DIRTY` は metadata drift ではなく base branch drift だから
- repo 本体に新しい helper script を増やさず、既存 intake toolchain を再利用できるから

## Go / No-Go

- 既存 intake toolchain を再利用して `DIRTY` candidate を再構成できるなら Go
- `DIRTY` を user 手作業前提のまま残すなら No-Go
