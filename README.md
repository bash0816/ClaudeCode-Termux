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
npm install -g @bash0816/claude-code@2.1.159-13
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

If you already have the repo's `2.1.161` release or the official upstream
`2.1.165` installed, install `2.1.161-1` explicitly. `claude update` will not
roll a newer installed terminal back to this repo's current audited release.

この repo の `2.1.161` release または official upstream の `2.1.165` を
すでに入れている端末では、`2.1.161-1` を明示 install してください。
`claude update` だけでは、より新しい端末をこの repo の現在の audited release に戻しません。

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

| Version | Status |
|---------|--------|
| `2.1.161-1` | ✅ **Recommended / 推奨** — current audited release |
| `2.1.161` | reverted — do not keep using this line |
| `2.1.159-13` | historical — rollback candidate |
| `2.1.157` | historical — rollback candidate |
| `2.1.153-4` and earlier | historical — not recommended for new installs |

Official upstream Claude Code may be newer. This repo's published latest audited
release is `2.1.161-1`.

公式 upstream の Claude Code は別で更新されることがあります。この repo の公開 latest audited release は `2.1.161-1` です。

If your terminal is already on the repo's `2.1.161` release or the official
upstream `2.1.165`, do not rely on `claude update` to move it to the current
release. Install `2.1.161-1` explicitly instead.

この repo の `2.1.161` release または official upstream の `2.1.165` を
当てた端末では `claude update` に頼らず、`2.1.161-1` を明示 install
してください。

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
2.1.159-13 (Claude Code)
```

## Do Not Use / 非推奨

Do not globally install the upstream package directly on Termux.

Termux では upstream package を直接 global install しないでください。

```sh
npm install -g @anthropic-ai/claude-code@latest
```

This package launches through a Termux wrapper and audited native metadata.

この package は Termux 用 wrapper と監査済み native metadata を通して起動します。
