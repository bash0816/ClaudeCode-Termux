# @bash0816/claude-code

Termux-native Claude Code wrapper package.

Termux 向け Claude Code native wrapper package です。

This package is the current Termux wrapper package line.

この package は現行の Termux wrapper package 系です。

## Install / インストール

```sh
npm install -g @bash0816/claude-code@latest
```

If an older audited launcher from this repository already exists at `$PREFIX/bin/claude`, migrate through the updated launcher.

この repository の古い監査済み launcher が `$PREFIX/bin/claude` にある場合は、更新済み launcher 経由で移行します。

```sh
claude update
```

If npm reports `EEXIST` before package scripts run, use a one-time forced migration.

package script 実行前に npm が `EEXIST` を返す場合は、初回だけ forced migration を使います。

```sh
npm install -g --force @bash0816/claude-code@latest
```

After npm owns the `claude` bin link, normal `npm install -g` updates work.

npm が `claude` bin link を管理する状態になれば、通常の `npm install -g` 更新が使えます。

Latest audited version / 最新監査済み版:

```sh
npm install -g @bash0816/claude-code@2.1.289
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

If you already have the repo's `2.1.161` release or the official upstream
`2.1.165` installed, install `2.1.159-13` explicitly. `claude update` will not
roll a newer installed terminal back to this repo's current audited release.

この repo の `2.1.161` release または official upstream の `2.1.165` を
すでに入れている端末では、`2.1.159-13` を明示 install してください。
`claude update` だけでは、より新しい端末をこの repo の現在の audited release に戻しません。

Normal launch also checks the same manifest with a short timeout and prints a notice when a newer audited version is available.

通常起動時も、同じ manifest を短い timeout で確認し、新しい監査済み version があれば通知します。

## Known Issues / 既知の問題

Background sessions (`/background`, `claude agents`, the on-demand daemon) do not work on this
Termux wrapper: the Bun `Terminal` (PTY) API is not implemented by the compatibility shim. Since
`2.1.223-1`, this feature is disabled by default (`CLAUDE_CODE_DISABLE_AGENT_VIEW=1`) because
attempting to use it can cause an in-progress foreground conversation to be unexpectedly moved to
the background and become unreachable.

この Termux wrapper では、background session 機能(`/background`、`claude agents`、on-demand
daemon)が動作しません。互換 shim には Bun の `Terminal`(PTY)API が実装されていないためです。
`2.1.223-1` からはこの機能をデフォルトで無効化しています(`CLAUDE_CODE_DISABLE_AGENT_VIEW=1`)。
これは、この機能を使おうとすると、**進行中のフォアグラウンド会話が予告なくバックグラウンドへ
移動し、到達不能になることがある**ためです。

If you want to re-enable it anyway (understanding it may cause this issue), set the variable to
exactly `0` before launching:

理解した上であえて再有効化したい場合は、起動前に厳密に `0` を設定してください:

```sh
CLAUDE_CODE_DISABLE_AGENT_VIEW=0 claude
```

Any value other than `1`/`true`/`yes`/`on` (case-insensitive) re-enables the feature, so a typo
like `disable` or `Y` will silently turn protection off. Use exactly `0` to be safe.

`1`/`true`/`yes`/`on`(大文字小文字を区別しません)以外の値は全て機能を再有効化してしまうため、
`disable` や `Y` のような typo でも保護が黙って外れます。安全のため厳密に `0` を指定してください。

### Tool Search Disabled by Default / Tool Search は既定で無効化

This Termux wrapper disables the upstream's automatic tool discovery feature (`ENABLE_TOOL_SEARCH=false`
by default) to prevent unnecessary dynamic tool loading in normal conversations. Without this setting,
the model may spontaneously activate `ToolSearch` and trigger `WebSearch`/`WebFetch` calls, consuming
your conversation turn limit (`--max-turns`).

この Termux wrapper は、upstream の自動 tool discovery 機能を既定で無効化しています
(`ENABLE_TOOL_SEARCH=false`)。この設定がないと、モデルが通常の会話で自発的に `ToolSearch` を活動化させ、
`WebSearch`/`WebFetch` を呼び出し、会話の turn 上限(`--max-turns`)を消費するおそれがあります。

If you want to re-enable tool search (for example, if you explicitly use `--tools` and want the model
to load additional tools dynamically), set the variable before launching:

tool search を再有効化したい場合（例えば `--tools` を明示的に指定して、モデルが追加の tool を
動的にロードしてほしい場合）、起動前に環境変数を設定してください：

```sh
ENABLE_TOOL_SEARCH=true claude
```

or:

または：

```sh
ENABLE_TOOL_SEARCH=auto claude
```

**Note on `settings.json`:** If you want to configure this in `settings.json`, place `ENABLE_TOOL_SEARCH` in
the `env` block with the value `force`. The environment variable default (`false`) takes precedence over `true`,
so use the `env` block to force-enable it:

```json
{ "env": { "ENABLE_TOOL_SEARCH": "force" } }
```

**`settings.json` を使う場合の注意:** `settings.json` で設定する場合、`env` ブロック内に `ENABLE_TOOL_SEARCH`
を置いて、値を `force` にしてください。環境変数の既定値(`false`)が `true` より優先されるため、
force-enable するには `env` ブロックを使う必要があります：

```json
{ "env": { "ENABLE_TOOL_SEARCH": "force" } }
```

> **お知らせ / Notice (2026-09-21)**: 2.1.276 は、特定の条件で起動しない問題があったため取り下げ、修正版 **2.1.276-1** を `latest` として公開しました。2.1.276 をお使いの場合は `npm install -g @bash0816/claude-code@latest` で更新してください。
> Version 2.1.276 was withdrawn because it could fail to start under certain conditions. The fixed release **2.1.276-1** is now `latest`. If you are on 2.1.276, update with `npm install -g @bash0816/claude-code@latest`.

## Policy / 方針

- Only audited versions in `config/claude-native-audited-versions.json` can run.
- `config/claude-native-audited-versions.json` にある監査済み version だけを実行できます。
- See `config/claude-native-audited-versions.json` for the full list of included versions.
- 含まれるバージョンの全リストは `config/claude-native-audited-versions.json` を参照してください。
- The metadata file is the source of truth for the currently audited set.
- 現在の監査済み version 集合の source of truth は metadata file です。
- Native artifacts are cached under `${HOME}/.claude-termux-native-package`.
- native artifact は `${HOME}/.claude-termux-native-package` に cache します。
- If native preparation fails, the command exits with an error.
- native preparation に失敗した場合、command は error で終了します。

## patchelf 起動方式 / patchelf launch mode

`patchelf` 方式は既定では無効です。利用する場合は `CLAUDE_TERMUX_LAUNCH_MODE=patchelf` を設定して起動してください。`claude --termux-verify` は準備済みファイルの整合性を確認し、`claude --termux-gc` は不要になった実行世代を回収します。hook の環境設定に使うパスは `claude --termux-hook-env-path` で取得できます。

### 既知の制約

- 内容の完全な確認は準備時と `claude --termux-verify` 実行時に行います。起動時の再利用判定はファイル情報に基づくため、同一カーネル時刻粒度内に行われた同一 inode・同サイズの変更と時刻の復元は検出を保証しません。
- glibc のライブラリ本体は Termux のパッケージ管理下にあります。glibc の更新や削除による起動中プロセスへの影響は、その更新処理の挙動に依存します。
- 起動には Termux の `sh`（dash）が必要です。Android の `/system/bin/sh`（mksh）からの起動はサポートしません。
- 実行世代の保護対象は claude プロセス本体です。子プロセスや native 側が独自に起動するプロセスへの保護の引き継ぎは保証しません。
- hook 設定には `claude --termux-hook-env-path` が返すパスを指定してください。hook 用パスは保存済み設定から後で使われる場合があるため、自動回収しません。公開済み `shell/<wid>` も自動削除しません。破損した wid を手動削除する前に、保存済み hook と既存セッションへの影響を確認してください。
- cold 準備は `patchelf/<version>/prepare.lock` と `patchelf/shell.lock` の kernel flock で排他します。`flock` がない場合は `pkg install util-linux` が必要です。古い一時ディレクトリは次回ロック取得時に回収します。
