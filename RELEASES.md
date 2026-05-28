# Release Notes / リリースノート

## 2.1.150-1 — 2026-05-28

### Fix: Interactive launch crash on Node v24 (2.1.128+) / Node v24 での対話起動クラッシュ修正 (2.1.128+)

**English**

Starting from version 2.1.128, Claude Code began using Bun runtime APIs (`Bun.spawn`, `Bun.hash`, `Bun.listen`, `Bun.which`, `Bun.gc`, `Bun.semver`, `Bun.wrapAnsi`, `Bun.stripANSI`, etc.) in its interactive UI initialization path. The Termux wrapper's fake Bun shim only provided `{ version, stringWidth }`, causing a silent `exit=0` immediately after launch on devices running Node v24.

This release replaces the shim with a full `createBunShim()` implementation that covers the missing APIs. Interactive launch on Node v24.x is restored.

**Known residual gaps:** `Bun.Terminal`, `Bun.Transpiler`, `Bun.YAML`, `Bun.semver.satisfies`, `Bun.generateHeapSnapshot`, `Bun.embeddedFiles` are not yet fully implemented. These will be addressed in a follow-up release if they cause issues in practice.

To upgrade:

```sh
npm install -g @bash0816/claude-code@2.1.150-1
```

---

**日本語**

2.1.128 以降、Claude Code の対話 UI 初期化経路が `Bun.spawn`、`Bun.hash`、`Bun.listen`、`Bun.which`、`Bun.gc`、`Bun.semver`、`Bun.wrapAnsi`、`Bun.stripANSI` などの Bun ランタイム API を使用するようになりました。Termux wrapper の fake Bun shim は `{ version, stringWidth }` しか提供していなかったため、Node v24 の端末では起動直後に無言で `exit=0` となっていました。

このリリースでは shim を `createBunShim()` による完全実装に差し替え、不足 API を補完しています。Node v24.x での対話起動が復旧します。

**残存する未対応 API:** `Bun.Terminal`、`Bun.Transpiler`、`Bun.YAML`、`Bun.semver.satisfies`、`Bun.generateHeapSnapshot`、`Bun.embeddedFiles` は完全実装されていません。実使用上の問題が確認された場合はフォローアップリリースで対応します。

アップグレード:

```sh
npm install -g @bash0816/claude-code@2.1.150-1
```

---

## 2.1.150

Initial release of 2.1.150 wrapper. / 2.1.150 wrapper の初回リリース。

---

## 2.1.144 and earlier / 2.1.144 以前

See git history for earlier releases.

以前のリリースは git 履歴を参照してください。
