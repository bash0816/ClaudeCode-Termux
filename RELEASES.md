## 2.1.186 — 2026-06-23 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.186 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added `claude mcp login <name>` and `claude mcp logout <name>` to authenticate MCP servers from the CLI without opening the interactive `/mcp` menu, with `--no-browser` stdin redirect support for completing over SSH
- Added status filtering (press `f`) to the `/workflows` agent detail view
- Added a "Skills" section to the `/plugin` Installed tab
- Added `teammateMode: "iterm2"` setting with a warning when auto mode cannot find the `it2` CLI
- Added "Claude Platform on AWS - refresh credentials" option to `/login` when `awsAuthRefresh` is configured
- `!` bash commands now trigger Claude to respond to the output automatically; set `"respondToBashCommands": false` in settings.json to keep the previous context-only behavior
- Fixed streaming requests failing with "Content block not found" or JSON parse errors after the machine wakes from sleep
- Fixed subagent transcript scroll position bleeding into the main transcript on exit
- Fixed background task previews flashing raw tool names before the agent's plan loaded
- Fixed Chrome tab-group isolation not applying when the in-product permissions gate is off for concurrent CLI sessions
- Fixed background session recaps being duplicated; the agent's own end-of-turn summary now shows as the recap line
- Fixed opening a background session from `claude agents` leaving the previous screen painted behind it
- Fixed `Agent(type)` deny rules and `Agent(x,y)` allowed-types restrictions not being enforced for named subagent spawns
- Fixed Esc and Ctrl+C not responding while background agents are still running after the main turn ends
- Fixed misaligned option numbers in permission prompts when the option text overflows
- Fixed pressing `x` on a finished subagent in the agent panel not dismissing it
- Fixed a misleading "MCP server disconnected" notice for intentionally retired tools when resuming older sessions
- Fixed `/plugin` Installed showing a "more above" indicator when already scrolled to the top
- Fixed `~~strikethrough~~` showing literal tildes in assistant messages instead of rendering as strikethrough
- Fixed `--tools` allowing feature-gated tools to slip through before flags loaded on a cold first launch
- Fixed background job status in `claude agents` showing a stale "needs input" message after replying
- Fixed a dark-theme flash when opening a background session from `claude agents` on a light terminal
- Fixed mouse-selected text staying highlighted after deleting it in `claude agents`
- Fixed session cost not showing for usage-based Enterprise and Team subscribers
- Fixed agent teams: teammates spawned via tmux/pane backends now inherit the leader's `--effort` level
- Fixed Workflow `agent({schema})` subagents looping forever on repeated schema validation failures instead of aborting after 5 attempts
- Improved `claude mcp get` and `claude mcp remove` to suggest the closest configured server name on a typo and truncate long server lists
- Improved memory: the agent is now reminded to compact its `MEMORY.md` index when nearing the size limit
- Improved skill frontmatter: `display-name`, `default-enabled`, `fallback`, and `metadata.*` keys now accept kebab-case, snake_case, and camelCase
- Improved malformed `SKILL.md` YAML frontmatter handling: loads the skill body with empty metadata instead of failing silently
- Changed `CLAUDE_CODE_MAX_RETRIES` to cap at 15; for unattended sessions, use `CLAUDE_CODE_RETRY_WATCHDOG` instead
- Changed background subagents to surface permission prompts in the main session instead of auto-denying; the dialog shows which agent is asking, and Esc denies just that tool
- Changed `/review <pr>` to use the same review engine as `/code-review medium`

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.185
```

---

## 2.1.185 — 2026-06-21 ✅ Current audited / 現在の監査済み版

claude doctor hang fix (process.exit after main) + TUI immediate-exit fix (CLAUDE_TERMUX_TUI env guard)

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.183
```

---

## 2.1.183 — 2026-06-21 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.183 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

- **Auto mode 安全性強化**: `git reset --hard` / `git checkout -- .` / `git clean -fd` / `git stash drop` をユーザーが明示的に指示していない場合にブロック。`git commit --amend` も当セッションでのコミットでない場合にブロック。`terraform destroy` / `pulumi destroy` / `cdk destroy` も保護対象に
- **非推奨モデル警告**: 非推奨または自動アップデートされたモデルを使用中の場合、stderr / エージェントフロントマターで警告を表示
- **`attribution.sessionUrl` 設定追加**: コミット・PR への claude.ai セッションリンク埋め込みを無効化できるオプション
- **`/config` 改善**: `/config --help` 追加、Enter と Space で設定変更、Esc で保存 & 閉じる
- **スタートアップの "setup issues" 行を削除**: 問題確認は `/doctor` で
- **バグ修正**: `thinking.disabled` 設定時の 400 エラー修正、WebSearch サブエージェント空結果修正、Windows Terminal でのフルスクリーン TUI 破損修正、思考ブロックのみ返却時の無音完了修正 など多数

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.181
```

---

## 2.1.181 — 2026-06-19 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.181 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.178
```

---

## 2.1.179 — 2026-06-17 ✅ Current audited / 現在の監査済み版

Upstream `@anthropic-ai/claude-code` minor patch from 2.1.178 to 2.1.179. No Termux-specific changes in this release.

upstream `@anthropic-ai/claude-code` の 2.1.178 から 2.1.179 へのマイナーパッチ更新。Termux 固有の変更はありません。

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.178
```

---

## 2.1.178 — 2026-06-16 ✅ Current audited / 現在の監査済み版

Upstream `@anthropic-ai/claude-code` minor patch from 2.1.177 to 2.1.178. No Termux-specific changes in this release.

upstream `@anthropic-ai/claude-code` の 2.1.177 から 2.1.178 へのマイナーパッチ更新。Termux 固有の変更はありません。

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.177-1
```

---

## 2.1.177-1 — 2026-06-14 ✅ Current audited / 現在の監査済み版

Upstream `@anthropic-ai/claude-code` update from 2.1.161 to 2.1.177, plus a Termux-specific fix to suppress the `Installed via npm (deprecated)` warning in `claude auth status`.

upstream `@anthropic-ai/claude-code` を 2.1.161 から 2.1.177 に更新。Termux 固有の修正として `claude auth status` の `Installed via npm (deprecated)` 警告を抑制しました。

**Upstream highlights / 主な変更（upstream）**

- **Claude Fable 5** が利用可能になりました（新世代モデル）
- サブエージェントが最大5階層までネスト可能に
- `--safe-mode` フラグを追加（CLAUDE.md・プラグイン・フック・MCP を全て無効化して起動）
- `/cd` コマンドを追加（プロンプトキャッシュを保持したままディレクトリ変更）
- セッションタイトルが会話言語で自動生成されるように改善
- Remote Control・バックグラウンドセッション・Linux サンドボックスなど各種バグ修正

```sh
npm install -g @bash0816/claude-code@latest
claude --version
```

---

## 2.1.161-2 — 2026-06-14 ✅ Historical stable / 旧推奨版

Fix `wrapAnsi()` behavior when `wordWrap:false` — previously text was returned as-is; now wraps by grapheme (same as `hard:true`). Also fixes `trim:true` to skip leading whitespace at line start. Adds `cleanupStaleEntryFiles()` to remove stale `cli.*.bare-path.js` extraction files older than 24 hours on each launch.

`wrapAnsi()` の `wordWrap:false` 挙動を修正しました（テキストをそのまま返していた → グラフェム単位折り返しに変更）。`trim:true` の先頭空白除去も修正。起動ごとに24時間以上古い抽出ファイルを自動削除する `cleanupStaleEntryFiles()` を追加。

```sh
npm install -g @bash0816/claude-code@2.1.161-2
```

---

## 2.1.159-13 — 2026-06-04 ✅ Historical stable / 旧推奨版

> **Previous audited release.** rollback / historical reference として残します。`claude update --dry-run` は `Already on latest audited version: 2.1.161-2` を返します。

```sh
npm install -g @bash0816/claude-code@2.1.159-13
```

---

## 2.1.161-1 — 2026-06-07 ❌ Reverted / 取り下げ

> **Checklist.** `claude update --dry-run` の更新先が `@bash0816/claude-code@2.1.159-13` であることを確認する。もし `@anthropic-ai/claude-code@latest` に戻っていたら、更新経路の巻き戻りとして扱う。

```sh
npm install -g @bash0816/claude-code@2.1.161-1
```

---

## 2.1.161 — 2026-06-04 ❌ Reverted / 取り下げ

> **取り下げ済み。** `termux_verified` に到達せず取り下げ。`2.1.161-2` を使用してください。

```sh
npm install -g @bash0816/claude-code@2.1.161
```

---

## 2.1.165 — 2026-06-05 ✅ Historical upstream reference / 公式 upstream 参照版

> **Upstream reference.** This entry is kept as the official upstream reference and is not this repo's published latest audited release.

```sh
npm install -g @bash0816/claude-code@2.1.165
```

---

## 2.1.157 — 2026-06-02 ✅ Historical stable / 旧推奨版

> **2.1.159-8 は取り下げ済みです。** 動作不良（Node v24 環境でのクラッシュ）が確認されたため unpublish。現在は 2.1.161 を使用してください。2.1.159-13 は rollback / historical reference です。

```sh
npm install -g @bash0816/claude-code@2.1.157
```

---

## 2.1.159-8 — 2026-06-02 ❌ Reverted / 取り下げ

> **取り下げ済み。** Node v24 環境で起動クラッシュが確認されたため unpublish。現在は 2.1.159-13 を使用してください。

~~upstream @anthropic-ai/claude-code@2.1.159-8 追従。~~

---
## 2.1.159-4 — 2026-06-01 ❌ Reverted / 取り下げ

> **取り下げ済み。** 2.1.159 系全体が reverted のため deprecated。2.1.157 を使用してください。

### Fix: Print mode (-p) hang on Claude Code 2.1.159 / Termux での print mode ハング修正

**English**

Fixes `claude -p` hanging indefinitely on Termux/arm64 with Claude Code 2.1.159 under Node.js.

Root cause: After fn() execution, active handles (TLSSocket, StatWatcher, timers) remained un-unref()'d, preventing the Node.js event loop from exiting.

Fix: Added `main().then(() => process.exit(process.exitCode ?? 0))` to both helper paths. Also restored missing Bun shim entries from 2.1.157 (`which`, `wrapAnsi`, `semver`, `YAML`, `BunProxy`).

Device B full verification: all tests pass (-p: 1.9s, exit=0, no BunShim missing errors).

To upgrade:
```sh
npm install -g @bash0816/claude-code@latest
claude --version
```

**日本語**

Termux/arm64 で Claude Code 2.1.159 の `claude -p`（print mode）が無限ハングする問題を修正しました。

根本原因: fn() 実行後、アクティブハンドル（TLSSocket・StatWatcher・タイマー）が `unref()` されずに残存し、Node.js イベントループが終了できませんでした。

修正: `main().then(() => process.exit(process.exitCode ?? 0))` を追加。また 2.1.157 から欠落していた Bun shim エントリ（`which`/`wrapAnsi`/`semver`/`YAML`/`BunProxy`）を復元しました。

Device B 実機全項目検証済み（-p: 1.9秒・exit=0・BunShim エラーなし）。

---
## 2.1.157 — 2026-05-30

upstream @anthropic-ai/claude-code@2.1.157 追従。Device B 実機検証済み（全7テスト通過：install / version / help / -p hello / auth status / update dry-run / rollback）。

### Install

```sh
npm install -g @bash0816/claude-code@2.1.157
claude --version
```

# Release Notes / リリースノート

## 2.1.156 — 2026-05-29

### upstream 2.1.156 追従・shim 追加修正なしで動作確認
- 2.1.154-2 の shim（Bun.YAML / Bun.semver / gc / stdin / embeddedFiles）を引き継ぎ
- 実機検証: auth / update --dry-run / rollback 全テスト通過・Bun エラー 0件

## 2.1.154-2 — 2026-05-29

### Fix: Add Bun.YAML, Bun.semver, Bun.gc, Bun.stdin, Bun.embeddedFiles to BunShim / BunShim に YAML・semver・gc・stdin・embeddedFiles を追加
- Bun.YAML（parse/stringify）追加 — skills/plugins の YAML frontmatter 読み込みが正常化
- Bun.semver（order/satisfies）追加 — node-semver 完全互換（^/~/||/prerelease 対応）
- Bun.gc / Bun.stdin / Bun.embeddedFiles 追加
- 実機検証: 全エラー 0件・2.1.153-4 以来初めてのクリーンな動作

## 2.1.154-1 — 2026-05-29 [deprecated]

### Fix: Remove globalThis.Bun cleanup from finally block / finally ブロックの globalThis.Bun クリーンアップを削除
- Bun is not defined 37件の退行を修正
- **非推奨**: Bun.YAML・Bun.semver 未実装のため 2.1.154-2 を使用してください

## 2.1.154 — 2026-05-29 [deprecated]

### upstream 2.1.154 追従
- **非推奨**: Bun is not defined 37件の退行あり。2.1.154-2 を使用してください

## 2.1.153-4 — 2026-05-28

### Fix: globalThis.Bun not cleaned up in finally (interactive mode Bun lost after fn() resolves) / finally で globalThis.Bun を削除しないよう修正

**English**

Fixes interactive mode failing silently when vm contexts are created after `fn()` resolves.

`injectBunIntoContext` reads `globalThis.Bun` at the time each vm context is created (not captured at setup). In 2.1.153-3, the `finally` block deleted `globalThis.Bun` after the module's Promise resolved + 200ms drain. Any vm context created after that point would receive `Bun = undefined`.

Fix: remove `globalThis.Bun` restore/delete from the `finally` block. The wrapper runs in a dedicated Node.js process, so leaving the shim alive for the process lifetime has no meaningful side-effect.

Root cause was identified via PR #8 from Device B (Codex + gpt-5.5), which confirmed interactive mode worked with the cleanup removed.

To upgrade:

```sh
npm install -g @bash0816/claude-code@latest
claude --version
```

---

**日本語**

`fn()` の Promise が resolve した後に vm コンテキストが作られると対話モードが無言で失敗する問題を修正します。

`injectBunIntoContext` は vm コンテキスト生成時に毎回 `globalThis.Bun` を読み取ります（セットアップ時にキャプチャしません）。2.1.153-3 では `finally` ブロックがモジュールの Promise resolve + 200ms 後に `globalThis.Bun` を削除していました。それ以降に作られる vm コンテキストには `Bun = undefined` が注入されていました。

修正: `finally` ブロックから `globalThis.Bun` の復元/削除を除去します。wrapper は専用 Node.js プロセス内で動くため、shim をプロセス終了まで残しても実質的な副作用はありません。

根本原因は Device B からの PR #8（Codex + gpt-5.5）で特定されました。クリーンアップを除去すると対話モードが動作することが Device B で確認済みです。

アップグレード:

```sh
npm install -g @bash0816/claude-code@latest
claude --version
```

---

## 2.1.153-3 — 2026-05-28

### Fix: vm context Bun injection (interactive mode silent exit root cause) / vm コンテキスト Bun 注入（対話モード即終了の根本原因修正）

**English**

Fixes the root cause of interactive mode exiting silently on launch.

Claude Code uses `require('vm').createContext()` internally to run isolated sandboxes. `globalThis.Bun` set by the launcher was not visible inside these vm contexts, causing `ReferenceError: Bun is not defined` before any interactive UI code could run.

Fix: intercept `require('vm')` and patch `createContext`, `runInNewContext`, and `Script.prototype.runInContext` / `runInNewContext` to automatically inject `globalThis.Bun` into every new vm context.

Additionally, `createFakeRequire(require)` and `eval('(' + code)` were moved to inside the try block, after `globalThis.Bun = createBunShim()`. This ensures the vm patch is applied before entry JS is evaluated, closing a window where vm contexts created during eval could have missed the injection.

Also fixed in this release:
- Root manifest `package_name` corrected from `@bash0816/cluade-code` (typo) to `@bash0816/claude-code`
- `scripts/update-release-manifest.js`: `compareVersions` fixed for `-N` suffixed versions, `package_name` now reads from `canonical_package_name`, `manifestUrl` corrected to `ClaudeCode-Termux`

This is the root cause that 2.1.153-1 and 2.1.153-2 did not address (those fixed the update-check bug and a TerminalShim regression, respectively). The vm fix was identified by independent investigation on Device B (Codex + gpt-5.5); the eval ordering and infrastructure fixes were found during GPT-5.5 pre-publish review.

To upgrade:

```sh
npm install -g @bash0816/claude-code@2.1.153-3
```

---

**日本語**

対話モードが起動直後に無言で終了する根本原因を修正します。

Claude Code は内部で `require('vm').createContext()` を使って独立したサンドボックスを作成します。ランチャーが設定した `globalThis.Bun` はこれらの vm コンテキスト内から見えないため、対話 UI コードが実行される前に `ReferenceError: Bun is not defined` が発生して即終了していました。

修正: `require('vm')` を横取りし、`createContext` / `runInNewContext` / `Script.prototype.runInContext` / `runInNewContext` をパッチして、新しい vm コンテキスト作成時に自動で `globalThis.Bun` を注入するようにします。

加えて、`createFakeRequire(require)` と `eval('(' + code)` を try ブロック内の `globalThis.Bun = createBunShim()` より後に移動しました。これにより、vm パッチが entry JS の eval より前に適用されることが保証され、eval 中に作成された vm コンテキストが注入を受け取れないウィンドウを閉じます。

本リリースでの追加修正:
- root manifest の `package_name` を `@bash0816/cluade-code`（typo）から `@bash0816/claude-code` に修正
- `scripts/update-release-manifest.js`: `-N` サフィックス対応 `compareVersions` 修正・`package_name` を `canonical_package_name` から取得するよう修正・`manifestUrl` を `ClaudeCode-Termux` に修正

これは 2.1.153-1・2.1.153-2 が対処していなかった根本原因です（それらはそれぞれ update-check バグと TerminalShim regression を修正）。vm 修正は Device B での独立調査（Codex + gpt-5.5）により特定され、eval 順序・インフラ修正は GPT-5.5 の publish 前レビューで発見されました。

アップグレード:

```sh
npm install -g @bash0816/claude-code@2.1.153-3
```

---

## 2.1.153-2 — 2026-05-28

### Fix: compareVersions -N suffix; manifest_url wrong repo / compareVersions -N 対応・manifest_url 誤参照修正

**English**

Fixes two bugs introduced by the -N versioning scheme:

- `compareVersions()` — `"2.1.153-1".split('.').map(Number)` produced `NaN` for the last segment, causing any `-N` version to appear older than a plain `X.Y.Z` version. Fixed by parsing the `-N` patch suffix separately before numeric conversion.
- `manifest_url` — the bundled manifest pointed to `CluadeCode-Termux` (legacy typo repo) whose root `config/` was never updated past `2.1.150`. Changed to `ClaudeCode-Termux` (correct canonical repo).

Together these caused `claude` to show a false "update available: 2.1.153-1 → 2.1.150" notice on every launch. Running `claude update` would have downgraded the package.

To upgrade:

```sh
npm install -g @bash0816/claude-code@2.1.153-2
```

---

**日本語**

-N バージョン方式で混入した 2 つのバグを修正します：

- `compareVersions()` — `"2.1.153-1".split('.').map(Number)` が末尾セグメントを `NaN` に変換し、`-N` 付きバージョンが常に `X.Y.Z` より古く見えていた。`-N` サフィックスを分離してから数値変換するよう修正。
- `manifest_url` — バンドル済みマニフェストが `CluadeCode-Termux`（typo レガシーリポジトリ）を参照しており、そのルート `config/` は `2.1.150` から更新されていなかった。正しい `ClaudeCode-Termux` に変更。

この 2 つが重なり、`claude` 起動ごとに「update available: 2.1.153-1 → 2.1.150」という誤った通知が表示されていた。`claude update` を実行するとパッケージがダウングレードされる危険があった。

アップグレード:

```sh
npm install -g @bash0816/claude-code@2.1.153-2
```

---

## 2.1.153-1 — 2026-05-28

### Fix: TerminalShim.write() data callback regression / TerminalShim.write() データコールバック regression 修正

**English**

Fixes a regression introduced in 2.1.150-3: `TerminalShim.write()` was missing the `options.data` callback call, causing interactive mode to exit silently (exit=0) immediately on some devices.

Root cause: during the 2.1.150-3 Codex refactor, the line that fires the data callback from `write()` was accidentally dropped. Claude Code's interactive UI initialization writes initial data to a `Bun.Terminal` and expects the `data` callback to confirm the terminal is alive. Without it, the process exits immediately.

To upgrade:

```sh
npm install -g @bash0816/claude-code@2.1.153-1
```

---

**日本語**

2.1.150-3 で混入した regression を修正します：`TerminalShim.write()` から `options.data` コールバックの呼び出しが失われており、一部の端末で対話モードが即 exit=0 で終了していました。

根本原因：2.1.150-3 の Codex リファクタで `write()` から data コールバックを発火する行が誤って削除されました。Claude Code の対話 UI 初期化は `Bun.Terminal` に初期データを書き込み、`data` コールバックが呼ばれることを前提にしています。コールバックがないと即座に終了します。

アップグレード:

```sh
npm install -g @bash0816/claude-code@2.1.153-1
```

---

## 2.1.153 — 2026-05-28

### Upstream update / upstream 更新

**English**

Tracks upstream `@anthropic-ai/claude-code@2.1.153`. No new Bun APIs were added compared to 2.1.150; the same shim as 2.1.150-3 is used with updated entry offsets.

To upgrade:

```sh
npm install -g @bash0816/claude-code@2.1.153
```

---

**日本語**

upstream `@anthropic-ai/claude-code@2.1.153` に追従します。2.1.150 比で Bun API の追加はなく、2.1.150-3 と同一の shim を entry offset の更新のみで使用しています。

アップグレード:

```sh
npm install -g @bash0816/claude-code@2.1.153
```

---

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