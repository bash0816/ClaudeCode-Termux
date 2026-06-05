# Release Process / リリース手順

この文書は、`ClaudeCode-Termux` の npm release をどこで完了とみなすかを明確にする。

## Release の完了条件

この repo では、release は次の 2 段階を終えた時点で完了とする。

1. `candidate` を npm に publish する
2. Device A で candidate を確認した後、`latest` を candidate に昇格する

`latest` を先に更新しない。`latest` が変わると多くの利用者にそのまま配布されるため、必ず candidate 先行にする。

## 手順

1. `README.md` と `RELEASES.md` を更新し、公開文面と version 情報を揃える。
2. `npm-package.yml` を使って `release_action=publish_candidate` を dispatch する。
3. GitHub Actions の `publish` ジョブが成功したことを確認する。
4. `npm dist-tag ls @bash0816/claude-code` で `candidate` が対象 version を指していること、`latest` がまだ前の stable を指していることを確認する。
5. Device A で candidate を実機確認する。
6. 問題がなければ `release_action=promote_latest` を dispatch する。
7. GitHub Actions の `latest` 昇格ジョブが成功したことを確認する。
8. `npm view @bash0816/claude-code version` と `npm dist-tag ls @bash0816/claude-code` で `latest` が candidate に揃ったことを確認する。

## 補足

- `verify_only` は release ではなく検証専用。
- 破壊的な publish はしない。
- README / RELEASES の更新は release の一部として扱い、公開前に必ず揃える。
- ここでの「release 完了」は、candidate publish と latest promotion の両方が終わった状態を指す。
