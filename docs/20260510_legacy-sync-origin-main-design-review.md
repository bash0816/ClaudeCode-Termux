# STEP 2: Legacy Sync Origin Main Design Review

## Proposed Design

`sync-legacy-metadata.js` は canonical worktree の JSON file を直接読む代わりに、既定で `origin/main` の `config/claude-native-audited-versions.json` を `git show` で読む。

必要に応じて source ref は env で override できるが、既定値は `origin/main` に固定する。

## Why

- local feature branch を source にすると、publish 後でも stale data を old repo へ流し得る
- legacy sync の source of truth は stable branch であるべき

## Safety

- `origin/main` が取得できない時だけ fallback を考える
- ただし silent fallback は避け、最低でも failure を明示する

## Go / No-Go

- `origin/main` 読み取りに寄せられるなら Go
- local worktree fallback を常用する設計なら No-Go
