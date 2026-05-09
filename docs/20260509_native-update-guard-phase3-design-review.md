# STEP 2: Native Update Guard Phase 3 Design Review

## Proposed Design

Phase 3 では shell command を完全解析しない。代わりに、`sh -c` / `bash -c` / `bash -lc` の 1 段だけ unwrap して、その inner string に既存の `shouldBlockExecString()` を再適用する。

## Rules

### Spawn/ExecFile

- 次の形だけ shallow unwrap する
  - `sh -c "<command>"`
  - `bash -c "<command>"`
  - `bash -lc "<command>"`
- 上記以外は既存判定のまま

### Exec/ExecSync

- 既存の string tokenization を維持
- ただし token 先頭が
  - `sh -c`
  - `bash -c`
  - `bash -lc`
  の場合だけ inner string を再帰 1 回で判定する
- 実装は `inner string` に既存 guard を再適用するため、単純な入れ子 shell を副次的に拾うことがある
- ただし parser 自体は shallow tokenizer のままで、完全 shell parser にはしない

### Chaining

- `&&` / `||` / `;` / `|` を完全解釈しない
- ただし shallow unwrap 後の inner string 全体に既存 `shouldBlockExecString()` を再適用することで、
  - `sh -c "npm install ... && echo ok"`
  のような単純例だけ副次的に拾う

## Safety

- unwrap は 1 段のみ
- shell family は `sh`, `bash` のみ
- `zsh`, `fish`, `busybox sh` などは scope 外

## Go / No-Go Gate

- 1 段 unwrap で direct official update だけを狙えるなら Go
- parser 拡張が広すぎて誤爆リスクが上がるなら No-Go
