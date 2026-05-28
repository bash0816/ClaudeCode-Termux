# Release Notes / リリースノート

## 2.1.150-3 — 2026-05-28

### Fix: Transpiler class, spawn stdio array, Node.js >=20 requirement / Transpiler クラス化・spawn stdio 配列対応・Node.js >=20 要件追加

**English**

Fixes critical bugs found in the 2.1.150-2 Bun shim review:

- `Bun.Transpiler` — changed from plain object to proper class; `new Bun.Transpiler()` and `new Bun.Transpiler(options)` now work correctly
- `Bun.Transpiler.scanImports()` — now returns `{ path, kind }` with correct `kind` values (`import-statement`, `dynamic-import`, `require-call`) matching what Claude Code expects
- `Bun.spawn()` — fixed `stdio` array form (`["ignore","ignore","ignore"]`); background/PTY host processes with `detached:true` no longer incorrectly pipe stdio
- Node.js minimum version raised to **v20** (was v18); enforced at install time via `preinstall.js`

To upgrade:

```sh
npm install -g @bash0816/claude-code@2.1.150-3
```

---

**日本語**

2.1.150-2 の Bun shim レビューで発見された重大なバグを修正しました：

- `Bun.Transpiler` — plain object から proper class に変更；`new Bun.Transpiler()` および `new Bun.Transpiler(options)` が正しく動作するようになりました
- `Bun.Transpiler.scanImports()` — `{ path, kind }` を返すように修正；`kind` 値は Claude Code が期待する `import-statement` / `dynamic-import` / `require-call` に合わせました
- `Bun.spawn()` — `stdio` 配列形式（`["ignore","ignore","ignore"]`）を正しく処理するよう修正；`detached:true` の background/PTY host プロセスが stdio を誤って pipe しなくなりました
- Node.js 最小バージョンを **v20** に引き上げ（v18 から変更）；`preinstall.js` でインストール時に強制チェック

アップグレード:

```sh
npm install -g @bash0816/claude-code@2.1.150-3
```

---

## 2.1.150-2 — 2026-05-28

### Fix: Remaining Bun API gaps (Terminal, YAML, Transpiler, semver.satisfies, etc.) / 残存 Bun API の補完

**English**

Extends the Bun shim introduced in 2.1.150-1 with the following additions:

- `Bun.Terminal` — class shim with `write()`, `resize()`, `close()` for interactive PTY path
- `Bun.YAML.parse/stringify` — minimal YAML support
- `Bun.Transpiler.transformSync/scanImports` — identity transform and import scanner
- `Bun.semver.satisfies` — range checking (complements existing `semver.order`)
- `Bun.semver.order` — fixed return values to strict `-1/0/1` (previously returned raw diff)
- `Bun.spawn().exited` — fixed to resolve with numeric exit code (was `{ code, signal }`)
- `Bun.spawn().stdout.text()` / `.stderr.text()` — added Promise-based text readers
- `Bun.embeddedFiles` — set to `[]` (prevents false native binary detection)
- `Bun.generateHeapSnapshot` — placeholder (returns empty Buffer)

To upgrade:

```sh
npm install -g @bash0816/claude-code@2.1.150-2
```

---

**日本語**

2.1.150-1 で導入した Bun shim を以下の通り拡張しました：

- `Bun.Terminal` — 対話 PTY 経路向け `write()`/`resize()`/`close()` shim クラス
- `Bun.YAML.parse/stringify` — 最小限の YAML サポート
- `Bun.Transpiler.transformSync/scanImports` — identity transform と import スキャナ
- `Bun.semver.satisfies` — 範囲チェック（既存の `semver.order` を補完）
- `Bun.semver.order` — 戻り値を厳密な `-1/0/1` に修正（以前は生の差分値を返していた）
- `Bun.spawn().exited` — 数値の exit code で resolve するよう修正（以前は `{ code, signal }`）
- `Bun.spawn().stdout.text()` / `.stderr.text()` — Promise ベースのテキストリーダーを追加
- `Bun.embeddedFiles` — `[]` に設定（native binary 誤検知を防止）
- `Bun.generateHeapSnapshot` — placeholder（空の Buffer を返す）

アップグレード:

```sh
npm install -g @bash0816/claude-code@2.1.150-2
```

---

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
