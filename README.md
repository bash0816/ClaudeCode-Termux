# ClaudeCode-Termux

Claude Code native wrapper package for Termux.

Termux 向け Claude Code native wrapper package です。

Canonical repository:

正規 repository:

- `https://github.com/bash0816/ClaudeCode-Termux`

Legacy compatibility repository:

互換維持用の旧 repository:

- `https://github.com/bash0816/CluadeCode-Termux`

This project is moving from the legacy typo repository to `ClaudeCode-Termux`.

この project は、旧 typo repository から `ClaudeCode-Termux` へ移行します。

Use `ClaudeCode-Termux` for new links, new installs, and future release tracking.

新しい link、install、今後の release 追跡は `ClaudeCode-Termux` を使ってください。

Normal install and update paths are consolidated into npm.

通常の導入・更新手順は npm package に一本化しています。

## Install / インストール

```sh
npm install -g @bash0816/claude-code@latest
claude --version
claude auth status
```

Existing users on the legacy typo package should keep using `claude update` until the final migration release is announced.

旧 typo package 利用者は、最終 migration release が出るまでは `claude update` を継続してください。

Install a specific audited version.

監査済みの固定 version を入れる場合:

```sh
npm install -g @bash0816/claude-code@2.1.118
npm install -g @bash0816/claude-code@2.1.119
npm install -g @bash0816/claude-code@2.1.121
npm install -g @bash0816/claude-code@2.1.122
```

## Update / 更新

```sh
claude update
```

`claude update` checks the GitHub release manifest and installs the latest audited package version.

`claude update` は GitHub release manifest を確認し、最新の監査済み package version を install します。

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
ls -l /data/data/com.termux/files/usr/bin/claude
```

Expected version output:

期待値:

```text
2.1.122 (Claude Code)
```

## Package Development / package 開発

```sh
npm pack --dry-run ./packages/claude-code
```

For development and verification, the launcher can switch between audited versions from the same package.

開発・検証時のみ、同じ package から監査済み version を切り替えられます。

```sh
CLAUDE_TERMUX_CLAUDE_VERSION=2.1.118 claude --version
CLAUDE_TERMUX_CLAUDE_VERSION=2.1.119 claude --version
CLAUDE_TERMUX_CLAUDE_VERSION=2.1.121 claude --version
CLAUDE_TERMUX_CLAUDE_VERSION=2.1.122 claude --version
```

## Native Version Metadata / native metadata

Discover offsets for a new upstream version.

新しい upstream version の offset を調べる場合:

```sh
node ./scripts/termux-prepare-claude-native-version.js @latest --json
```

## CI/CD

- `.github/workflows/claude-native-version-watch.yml`
  - Checks npm latest once per day.
  - npm latest を 1 日 1 回確認します。
  - Creates an automation branch with native offset metadata for unknown versions.
  - 未登録 version の native offset metadata を automation branch に生成します。
  - Updates the release manifest for stable / candidate tracking.
  - stable / candidate 追跡用の release manifest も更新します。
- `.github/workflows/npm-package.yml`
  - Runs package syntax checks.
  - package syntax check を実行します。
  - Verifies audited metadata.
  - 監査済み metadata を確認します。
  - Runs `npm pack --dry-run`.
  - `npm pack --dry-run` を実行します。
  - Publishes to npm via `workflow_dispatch` when `NPM_TOKEN` is configured.
  - `NPM_TOKEN` 設定後、`workflow_dispatch` で npm publish します。
- `.github/workflows/promote-verified-candidate.yml`
  - Creates a promotion PR after device verification of a candidate version.
  - candidate version を実機確認した後、昇格 PR を自動作成します。

## Do Not Use / 非推奨

Do not globally install the upstream package directly on Termux.

Termux では upstream package を直接 global install しないでください。

```sh
npm install -g @anthropic-ai/claude-code@latest
```

This package launches through a Termux wrapper and audited native metadata.

この package は Termux 用 wrapper と監査済み native metadata を通して起動します。
