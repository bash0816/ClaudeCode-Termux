# STEP 2: Native Update Guard Phase 2 Design Review

## Proposed Design

Phase 2 では、Phase 1 の `npm` 直接検出を一般化して、`command + args` から「実際に official package update を起動する package manager call か」を判定する。

### Detection Layers

1. launcher command normalization
   - `env npm ...` を `npm ...` として扱う
   - `corepack pnpm ...` と `corepack yarn ...` を後段 manager call として扱う
2. package manager family detection
   - `npm`, `npm-cli.js`
   - `npx`
   - `pnpm`
   - `yarn`
3. operation/target detection
   - install/update/add/upgrade 系 operation
   - `@anthropic-ai/claude-code` target

### Manager-Specific Rules

- `npm` / `pnpm`
  - operation token と official target の両方を要求する
- `yarn`
  - `global add <target>` を block 対象にする
  - `add <target>` 単独は scope 外にする
- `npx`
  - `npx @anthropic-ai/claude-code`
  - `npx -p @anthropic-ai/claude-code ...`
  を例外ルールとして block 対象にする
- `corepack`
  - 自身を package manager として判定しない
  - `corepack <manager> ...` の形を normalize して `<manager>` 側規則に流す
  - その結果として `corepack npm ...` も副次的に block され得るが、安全側挙動として許容する

### Blocking Policy

- rewrite しない
- official package update と判定できたときだけ block
- 非 official subprocess はそのまま delegate

### Exec String Policy

- Phase 1 の簡易 tokenizer は維持
- ただし `env npm ...` と shallow な `corepack <manager> ...` の先頭 normalize までは対応する
- shell chaining の完全解釈はしない

## Risk Assessment

### Accepted

- `bash -lc "..."` のような深い shell indirection は対象外
- `yarn dlx` や未知の package manager alias は対象外

### Avoided

- package manager 名だけで広く block しない
- canonical package install まで誤爆しない

## Go / No-Go Gate

- direct invocation family を安全に増やせるなら Go
- shell parser を広げすぎて誤爆リスクが高いなら No-Go
