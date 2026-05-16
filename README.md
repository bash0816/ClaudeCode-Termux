# ClaudeCode-Termux

Claude Code native wrapper package for Termux.

Termux 向け Claude Code native wrapper package です。

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

Install a specific audited version.

監査済みの固定 version を入れる場合:

Current quick examples:

現在の quick example:

```sh
npm install -g @bash0816/claude-code@2.1.118
npm install -g @bash0816/claude-code@2.1.119
npm install -g @bash0816/claude-code@2.1.121
npm install -g @bash0816/claude-code@2.1.122
npm install -g @bash0816/claude-code@2.1.123
npm install -g @bash0816/claude-code@2.1.126
npm install -g @bash0816/claude-code@2.1.128
npm install -g @bash0816/claude-code@2.1.136
npm install -g @bash0816/claude-code@2.1.137
npm install -g @bash0816/claude-code@2.1.138
npm install -g @bash0816/claude-code@2.1.139
npm install -g @bash0816/claude-code@2.1.140
npm install -g @bash0816/claude-code@2.1.141
npm install -g @bash0816/claude-code@2.1.142
npm install -g @bash0816/claude-code@2.1.143
```

## Update / 更新

```sh
claude update
```

`claude update` installs the latest audited package version.

`claude update` は最新の監査済み package version を install します。

```sh
npm install -g @bash0816/claude-code@<latest_audited_version>
```

On normal launch, the wrapper also checks the same manifest with a short timeout and prints a notice when a newer audited version is available.

通常起動時も、wrapper は短い timeout で同じ manifest を確認し、新しい監査済み version があれば通知します。

## Supported Versions / 対応バージョン

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
2.1.143 (Claude Code)
```

## Do Not Use / 非推奨

Do not globally install the upstream package directly on Termux.

Termux では upstream package を直接 global install しないでください。

```sh
npm install -g @anthropic-ai/claude-code@latest
```

This package launches through a Termux wrapper and audited native metadata.

この package は Termux 用 wrapper と監査済み native metadata を通して起動します。
