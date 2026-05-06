# 2026-05-06 Fix Bun stringWidth Design Review

## Target

`packages/claude-code/lib/termux-run-claude-native.sh`

## Proposed Design

- wrapper が注入する fake Bun object を最小拡張する
- 追加対象は `Bun.stringWidth`
- 実装は Node 上で完結する純関数にする
- 既存の `version` 偽装と同じスコープで only runtime injection とする
- extracted bundle や native binary は書き換えない

## Why This Layer

- 再現箇所は extracted bundle 実行時の fake Bun 不足
- candidate metadata や offset mismatch ではない
- bundle 書換えより wrapper 層の方が update 追従性が高い
- future bundle が同系の `Bun.stringWidth` 利用を増やしても吸収しやすい

## Polyfill Shape

最小要件:
- `Bun.stringWidth(input, options)` 形式で呼べる
- string coercion を行う
- crash せず number を返す

第一候補:
- `Intl.Segmenter` ベースの grapheme count を width として返す
- `options` は受け取るが、まずは `ambiguousIsNarrow` などを無視してもよい

理由:
- 今回の gate は width 精度ではなく runtime crash 解消
- `auth status` や CLI 表示では、この近似でも regression risk は低い
- dependency 追加なしで済む

## Risks

- East Asian width や ANSI escape 幅の完全再現ではない
- 今後 `Bun.stringWidth` の厳密意味に依存する UI では表示ズレの可能性がある
- ただし現時点では `crash > slight width drift` の優先度

## Rollback

- wrapper への polyfill 追加 1 箇所を revert すれば戻せる
- bundle / cache / metadata を汚さないので rollback は容易
