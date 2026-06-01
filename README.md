# ClaudeCode-Termux
---
## Unofficial Termux Build

このパッケージは Claude Code を Termux 向けに動作させるための unofficial build です。

本パッケージは Anthropic によって開発、提供、承認、支援されているものではありません。
Anthropic および Claude Code は Anthropic の商標または製品です。
公式パッケージは @anthropic-ai/claude-code を参照してください。

This package is an unofficial Termux-oriented build of Claude Code.
It is not developed, sponsored, endorsed, or supported by Anthropic.
For the official package, see @anthropic-ai/claude-code.
---


Claude Code native wrapper package for Termux.

Termux 向け Claude Code native wrapper package です。

Current install and update paths are consolidated into npm.

現在の導入・更新手順は npm package に一本化しています。

## Important Notice / 重要な注意

Use `2.1.157` or newer.

### Known issue: Claude Code 2.1.158+ / 既知の candidate 不具合: 2.1.158

`@bash0816/claude-code@2.1.158` and `2.1.159` are affected by a regression in the upstream native binary.
Print mode (`claude -p "hello"`) hangs on Termux/arm64. The `< /dev/null` workaround does **not** help on Termux.

`@bash0816/claude-code@2.1.158` および `2.1.159` は upstream native binary の regression により影響を受けています。
非対話モード（`claude -p "hello"`）が Termux/arm64 でハングします。`< /dev/null` 回避策も効きません。

Use `2.1.157` for stable Termux usage for stable Termux usage.

この candidate が解消されるまで、安定版として `2.1.157` を使用してください。

```sh
npm install -g @bash0816/claude-code@2.1.157
```

`2.1.150` through `2.1.153-2` have known interactive mode problems on Termux. Some older builds can also show an incorrect downgrade notice such as `2.1.153-1 -> 2.1.150` because of an update version comparison bug.

If you are on one of those versions, install the current package explicitly:

```sh
npm install -g @bash0816/claude-code@latest
claude --version
```

`2.1.157` 以上を使用してください。

`2.1.150` から `2.1.153-2` には、Termux の interactive mode に既知の問題があります。一部の古い build では update version 比較バグにより、`2.1.153-1 -> 2.1.150` のような誤った downgrade 通知が出る場合もあります。

該当 version を使用している場合は、現在の package を明示的に install してください:

```sh
npm install -g @bash0816/claude-code@latest
claude --version
```

## Install / インストール

```sh
npm install -g @bash0816/claude-code@latest
claude --version
claude auth status
```

Existing users on older installs should keep using `claude update` to migrate onto the current package line.

旧 install 利用者は、現行 package 系へ移行するため `claude update` を使ってください。

Install a specific audited version.

監査済みの固定 version を入れる場合:

Current quick examples:

現在の quick example:

```sh
npm install -g @bash0816/claude-code@2.1.159
```

## Update / 更新

```sh
claude update
```

`claude update` installs the latest audited package version.

`claude update` は最新の監査済み package version を install します。

If an older version shows a downgrade notice, do not follow it. Install the latest package explicitly with npm.

古い version で downgrade 通知が出た場合は従わず、npm で latest を明示 install してください。

```sh
npm install -g @bash0816/claude-code@<latest_audited_version>
```

On normal launch, the wrapper also checks the same manifest with a short timeout and prints a notice when a newer audited version is available.

通常起動時も、wrapper は短い timeout で同じ manifest を確認し、新しい監査済み version があれば通知します。

## Supported Versions / 対応バージョン

Registration in the audited metadata means the wrapper can identify and launch that version. It does not mean every historical version is recommended for new installs.

監査済み metadata への登録は、その version を wrapper が識別・起動できるという意味です。過去 version すべてを新規 install に推奨する意味ではありません。

Only versions registered in the audited metadata can run.

監査済み metadata に登録済みの version だけを実行します。

- `2.1.118`
- `2.1.119`
- `2.1.121`
- `2.1.122`
- `2.1.123`
- `2.1.126`
- `2.1.128`
- `2.1.136`
- `2.1.137`
- `2.1.138`
- `2.1.139`
- `2.1.140`
- `2.1.141`
- `2.1.142`
- `2.1.143`
- `2.1.144`
- `2.1.150` — ⚠️ **deprecated** — known interactive mode issues
- `2.1.150` — ⚠️ **deprecated** — 対話モードに既知の問題あり
- `2.1.150-1` — fixes interactive launch crash on Node v24 (see [RELEASES.md](RELEASES.md)) ⚠️ **deprecated** — known interactive mode issues
- `2.1.150-1` — Node v24 での対話起動クラッシュを修正（[RELEASES.md](RELEASES.md) 参照）⚠️ **deprecated** — 対話モードに既知の問題あり
- `2.1.150-2` — completes Bun shim (Terminal, YAML, Transpiler, semver.satisfies, spawn fixes) ⚠️ **deprecated** — known interactive mode issues
- `2.1.150-2` — Bun shim 完全版（Terminal / YAML / Transpiler / semver.satisfies / spawn 修正）⚠️ **deprecated** — 対話モードに既知の問題あり
- `2.1.150-3` — fixes Transpiler class, spawn stdio array, raises Node.js minimum to v20 (see [RELEASES.md](RELEASES.md)) ⚠️ **deprecated** — known interactive mode issues
- `2.1.150-3` — Transpiler クラス化・spawn stdio 配列修正・Node.js 最小バージョン v20 に引き上げ（[RELEASES.md](RELEASES.md) 参照）⚠️ **deprecated** — 対話モードに既知の問題あり
- `2.1.153` — upstream 2.1.153 (no new Bun APIs; same shim as 2.1.150-3) ⚠️ **deprecated** — known interactive mode issues
- `2.1.153` — upstream 2.1.153（Bun API 追加なし；shim は 2.1.150-3 と同一）⚠️ **deprecated** — 対話モードに既知の問題あり
- `2.1.153-1` — fixes TerminalShim.write() data callback regression (interactive mode silent exit on some devices) ⚠️ **deprecated** — root cause not yet fixed
- `2.1.153-1` — TerminalShim.write() データコールバック regression 修正（一部端末で対話モードが即終了する問題）⚠️ **deprecated** — 根本原因は未修正
- `2.1.153-2` — fixes compareVersions() for -N suffixed versions; fixes manifest_url pointing to wrong repo ⚠️ **deprecated** — root cause not yet fixed
- `2.1.153-2` — compareVersions() の -N サフィックス対応修正；manifest_url が誤ったリポジトリを参照していた問題を修正 ⚠️ **deprecated** — 根本原因は未修正
- `2.1.153-3` — fixes root cause of interactive mode silent exit: injects Bun into vm contexts created by Claude Code ⚠️ **deprecated** — globalThis.Bun cleanup bug causes Bun is not defined in vm contexts
- `2.1.153-3` — 対話モード即終了の根本原因修正：Claude Code が作成する vm コンテキストに Bun を注入 ⚠️ **deprecated** — globalThis.Bun クリーンアップバグにより vm コンテキストで Bun is not defined が発生
- `2.1.153-4` — fixes globalThis.Bun being cleared in finally after fn() resolves (interactive mode fix completion)
- `2.1.153-4` — finally で globalThis.Bun が削除される問題を修正（対話モード修正の完成版）
- `2.1.157` — upstream 2.1.157 tracking
- `2.1.157` — upstream 2.1.157 追従

The source of truth is the metadata files below.

正式な source of truth は、下の metadata files です。

Metadata files:

metadata:

```text
config/claude-native-audited-versions.json
packages/claude-code/config/claude-native-audited-versions.json
config/claude-termux-release-manifest.json
packages/claude-code/config/claude-termux-release-manifest.json
```

## Verify / 確認

```sh
claude --version
claude auth status
npm ls -g @bash0816/claude-code --depth=0
```

Expected version output:

期待値:

```text
<installed_audited_version> (Claude Code)
```

Example:

例:

```text
2.1.159 (Claude Code)
```

## Do Not Use / 非推奨

Do not globally install the upstream package directly on Termux.

Termux では upstream package を直接 global install しないでください。

```sh
npm install -g @anthropic-ai/claude-code@latest
```

This package launches through a Termux wrapper and audited native metadata.

この package は Termux 用 wrapper と監査済み native metadata を通して起動します。
