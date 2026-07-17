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

This repository tracks the canonical Termux wrapper package line.

この repository は canonical な Termux wrapper package 系を追跡します。

Current install and update paths are consolidated into npm.

現在の導入・更新手順は npm package に一本化しています。

## Install / インストール

```sh
npm install -g @bash0816/claude-code@latest
claude --version
claude auth status
```

Existing users on older installs should keep using `claude update` to migrate onto the current package line.

旧 install 利用者は、現行 package 系へ移行するため `claude update` を使ってください。

Latest audited version / 最新監査済み版:

```sh
npm install -g @bash0816/claude-code@2.1.212
```

## Update / 更新

```sh
claude update
```

`claude update` installs the latest audited package version.

`claude update` は最新の監査済み package version を install します。

Checklist:

- `claude update --dry-run` の更新先が `@bash0816/claude-code@<latest_audited_version>` であることを確認してください。
- `@anthropic-ai/claude-code@latest` に戻っていた場合は、更新経路の巻き戻りとして扱ってください。

If you already have a newer upstream version installed, `claude update` will not downgrade it. Install the current audited release explicitly with npm instead.

より新しい upstream version が入っている端末では `claude update` は downgrade しません。npm で現在の audited release を明示 install してください。

If an older version shows a downgrade notice, do not follow it. Install the latest package explicitly with npm.

古い version で downgrade 通知が出た場合は従わず、npm で latest を明示 install してください。

```sh
npm install -g @bash0816/claude-code@<latest_audited_version>
```

On normal launch, the wrapper also checks the same manifest with a short timeout and prints a notice when a newer audited version is available.

通常起動時も、wrapper は短い timeout で同じ manifest を確認し、新しい監査済み version があれば通知します。

## Supported Versions / 対応バージョン

Only versions registered in the audited metadata can run.

監査済み metadata に登録済みの version だけを実行します。

<!-- SUPPORTED_VERSIONS_TABLE_START -->
| Version | Status |
|---------|--------|
| `2.1.212` | ✅ **Recommended / 推奨** — latest |
| `2.1.211` | ✅ rollback candidate — `@candidate` dist-tag |
| `2.1.193` | ✅ stable — `@stable` dist-tag |
<!-- SUPPORTED_VERSIONS_TABLE_END -->

### Fable 5 Model Fix / Fable 5 モデル選択肢修正

**English:** Version 2.1.206-1 (candidate) fixes a Termux-specific issue where Fable 5 model options were not appearing in the `/model` picker. This was caused by `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` being forcibly exported at startup, which suppressed the upstream Bootstrap process and prevented model discovery.

**日本語:** バージョン 2.1.206-1 (候補版) では、Termux 版の `/model` コマンドで Fable 5 モデル選択肢が表示されない不具合を修正しました。原因は起動時に `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` が強制 export されており、upstream の Bootstrap 処理（モデル取得）が抑制されていました。

<!-- UPSTREAM_VERSION_START -->
Official upstream (`@anthropic-ai/claude-code`): latest `2.1.201` / stable `2.1.193`
This repo's published latest audited release: `2.1.201`

公式 upstream (`@anthropic-ai/claude-code`): latest `2.1.201` / stable `2.1.193`
この repo の公開 latest audited release: `2.1.201`
<!-- UPSTREAM_VERSION_END -->

For the full version history, see [RELEASES.md](RELEASES.md).

全バージョン履歴は [RELEASES.md](RELEASES.md) を参照してください。

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
2.1.212 (Claude Code)
```

## Do Not Use / 非推奨

Do not globally install the upstream package directly on Termux.

Termux では upstream package を直接 global install しないでください。

```sh
npm install -g @anthropic-ai/claude-code@latest
```

This package launches through a Termux wrapper and audited native metadata.

この package は Termux 用 wrapper と監査済み native metadata を通して起動します。
