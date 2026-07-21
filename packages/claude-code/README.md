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
npm install -g @bash0816/claude-code@2.1.216
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
