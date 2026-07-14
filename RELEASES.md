## 2.1.209 — 2026-07-15 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.209 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Fixed /model and other dialogs being blocked in `claude agents` background sessions (reverts an overly broad guard)

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.207
```

---

## 2.1.207 — 2026-07-12 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.207 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Auto mode is now available without `CLAUDE_CODE_ENABLE_AUTO_MODE` opt-in on Bedrock, Vertex AI, and Foundry; disable via `disableAutoMode` in settings
- Fixed the terminal freezing and keystrokes lagging while streaming responses containing very long lists, tables, paragraphs, or code blocks
- Fixed remote managed settings from a non-interactive run (`claude -p`, the SDK) being permanently recorded as consented without ever showing the security consent dialog
- Fixed spurious prompt-injection warnings triggered by benign system-generated conversation updates
- Fixed the auto-updater overwriting a custom launcher script or symlink at `~/.local/bin/claude` on every release; `/doctor` now reports an externally managed launcher
- Fixed compound commands with `cd` prompting for permission when the only output redirect was to `/dev/null`
- Fixed the transcript jumping above the start of the answer when a response finishes streaming
- Fixed `extensions.worktreeConfig` being left in the repo's `.git/config` (breaking go-git tools like `tea`) after the last `worktree.sparsePaths` worktree was removed
- Fixed malformed bracket patterns in rules globs, skill paths, `.ignore`, and `.worktreeinclude` breaking file reads, file suggestions, and worktree creation
- Fixed a crash loop in agent teams where a malformed teammate mailbox message caused repeated errors every second until the mailbox file was manually deleted
- Fixed background sessions auto-named by accepting a plan not showing that name on their agent-view row
- Fixed background sessions that entered a git worktree resuming blank after a cold reopen from the agent list
- Fixed Remote Control task status updates being lost when the connection recovered from a network interruption or credential refresh
- Fixed Remote Control sessions hosted by the desktop app not showing background agent and workflow progress on mobile and web
- Fixed Deep research runs labeling every Fetch-phase agent "unknown" — chips now show the source hostname
- Fixed Bedrock repeatedly requesting fresh AWS SSO credentials from IAM Identity Center on every API request
- Improved agent view: pasting the same text again now expands the collapsed `[Pasted text #N]` placeholder instead of adding a second one
- Improved agent view: blocked session peeks now lead with the question and show a worded staleness clock (`waiting 3m`) instead of the same timestamp twice
- Changed Bedrock, Vertex, and Claude Platform on AWS to default to Claude Opus 4.8
- Changed auto mode to no longer read `autoMode` from `.claude/settings.local.json` (repo-resident); use `~/.claude/settings.json` instead
- Fixed an indefinite hang on Windows when AWS credential resolution stalls (e.g. a stuck `credential_process`): the 60-second stall guard now fires instead of waiting forever.
- Plugin hooks/monitors/MCP headersHelper: `${user_config.*}` in shell-form commands is now rejected (shell-injection fix). Hooks: use exec form (`args` array) or `$CLAUDE_PLUGIN_OPTION_<KEY>`; monitors and headersHelper: read the value inside the script (config file or the server's `env` block).
- Plugin option values (`pluginConfigs`) are no longer read from project-level `.claude/settings.json`; only user, `--settings`, and managed settings are honored
- Fixed `/usage-credits` amount inputs silently stripping malformed values (e.g. a pasted timestamp) to digits; malformed amounts are now rejected with an error, and amounts over $1,000 require a typed confirmation

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.206-1
```

---

## 2.1.206-1 — 2026-07-10 🔄 Candidate / 候補版

Termux wrapper-only fix. Upstream version remains 2.1.206 (no upstream changes). Fixes `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` being forcibly exported at startup, which suppressed the Bootstrap process (`/api/claude_cli/bootstrap` endpoint) and prevented Fable 5 model options from appearing in `/model` picker. The environment variable was introduced in commit e7e0211 (2026-06-02) with unclear intent and inadvertently disabled multiple non-essential features (DesignSync, Projects, `/feedback`, and others as side-effects). Version 2.1.206-1 removes this forced export from both helper and bootstrap entry paths, restoring normal Fable 5 model discovery. Note: `DISABLE_AUTOUPDATER=1` remains separately maintained, so upstream auto-update suppression is unchanged.

Termux wrapper 単独の修正。upstream version は 2.1.206 のまま変更なし。起動時に `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` が強制 export されていた不具合を修正しました。この環境変数は 2026-06-02 のコミット e7e0211 で導入されたものですが、意図が明確でないまま Bootstrap 処理（`/api/claude_cli/bootstrap` エンドポイント経由のモデル取得）を丸ごと抑制し、その結果 `/model` コマンドで Fable 5 モデルが表示されなくなっていました。この変数は意図せず DesignSync・Projects・`/feedback` など多くの非必須機能を巻き添えで無効化していました。2.1.206-1 では helper・bootstrap 両方の起動経路から強制 export を削除し、Fable 5 モデル選択肢の取得が正常に復元されています。なお `DISABLE_AUTOUPDATER=1` は別途維持されているため、upstream 自動アップデート抑制の動作は変わりません。

```sh
npm install -g @bash0816/claude-code@2.1.206-1
```

---

## 2.1.206 — 2026-07-10 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.206 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added directory path suggestions to `/cd`, matching `/add-dir` behavior
- Added a `/doctor` check that proposes trimming checked-in `CLAUDE.md` files by cutting content Claude could derive from the codebase
- `/commit-push-pr` now auto-allows `git push` to the repo's configured push remote (`remote.pushDefault`, or the sole remote when only one is configured) in addition to `origin`
- Gateway: `/login` now supports Anthropic-operated public gateway endpoints
- `EnterWorktree` now asks for confirmation before entering a git worktree outside the project's `.claude/worktrees/` directory
- Background agents now upgrade to a new version in the background right after a Claude Code update, instead of paying a slow stale-session upgrade when you attach
- Fixed an expired login failing every model with a misleading "There's an issue with the selected model" error instead of prompting to run `/login`
- Fixed `claude --resume` and `--continue` not responding to keyboard input on startup
- Fixed MCP servers configured via `--mcp-config` or `.mcp.json` ignoring a per-server `request_timeout_ms`, which caused long-running MCP tool calls to time out at the 60s default in fresh sessions
- Fixed `CLAUDE_CODE_EXTRA_BODY` being silently ignored by `claude agents` / `--bg` background workers; the shell-exported override now follows the dispatching session
- Fixed OAuth MCP servers requiring manual re-authentication after a single failed token refresh
- Fixed `--permission-prompt-tool` pointing at an MCP server crashing with "MCP tool not found" on cold start before the server finishes connecting
- Fixed `/model` picker rows printing a price for a different model than the row named, and stopped quoting first-party list prices on providers that don't bill them
- Fixed server-provided model rows being misplaced in the `/model` picker when an entitlement or allowlist restriction drops the row they were positioned against
- Fixed desktop sessions getting stuck showing "running" after a slash command was sent mid-turn
- Fixed keyboard input being ignored in the agents view when a setup prompt appeared before a bare `claude --resume` on Windows
- Fixed `claude rm` leaving the removed job in the daemon roster, causing the row to reappear in `claude agents`
- Fixed `/remote-control` showing "Unknown command" when logged out — it now explains how to sign in
- Fixed left arrow not stepping back out of a phase or agent in the workflow detail view
- Fixed `/status` listing the same broken-install warning twice
- Fixed false "disused plugin" tips and skewed disuse telemetry for LSP plugins
- Fixed `/doctor`'s update check to compare Homebrew installs against their cask's channel instead of the settings channel
- Fixed the fullscreen jump-to-bottom pill suggesting Ctrl+End on macOS, not showing rebound chords, and wrapping over the transcript
- Bedrock: fixed a multi-minute startup hang when using an `awsCredentialExport` helper on networks with restricted egress
- Improved `/code-review` findings quality on claude-opus-4-8 across all effort levels
- Improved agents view: status column now uses full terminal width instead of truncating at 64 characters
- Changed agents view: Ctrl+X now permanently removes a completed session, and sessions no longer render twice; deleted background jobs stay deleted

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.205
```

---

## 2.1.205 — 2026-07-10 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.205 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added an auto mode rule that blocks tampering with session transcript files
- Fixed `--json-schema` silently producing unstructured output when the schema was invalid, and schemas using the `format` keyword being rejected
- Fixed a message sent while Claude was working being silently lost when the turn ended at the `--max-turns` limit
- Fixed Windows worktree removal deleting files outside the worktree when an NTFS junction or directory symlink existed inside it
- Fixed background agents staying shown as "failed" or "completed" in the agent list after being resumed with `SendMessage`
- Fixed background jobs flipping from "needs input" back to "working" in the agent list when the agent's turn contained no readable text
- Fixed `claude attach` erroring when a background agent was mid-upgrade restart instead of waiting for it to come back
- Fixed session-to-PR linking missing a PR created in a Bash call whose output exceeded the 30K inline limit
- Fixed `claude mcp add-from-claude-desktop` getting stuck when a server name contains unsupported characters; invalid names are now reported and remaining servers still import
- Fixed a plugin LSP server that fails to initialize preventing a valid LSP server from another plugin handling the same file extension
- Fixed a Windows crash when the directory Claude was launched from is deleted, locked, or unmounted while a command is running
- Fixed a crash when a file watcher was closed while a directory scan was still in flight
- Fixed project verify skills being rewritten on every session instead of only when a documented command changed
- Fixed the agent view rendering one line too high and clipping its header when the job list slightly overflowed the screen
- Fixed background tasks in the web and mobile Remote Control panels showing stale "Running" status by forwarding full task state on every membership change
- Improved auto mode to ask before running `rm -rf` on a variable it can't resolve from context
- Auto-update binary downloads now stream to disk instead of buffering in memory, cutting the updater's peak memory usage by roughly 400 MB
- Background task notifications now explicitly state that no human input has occurred, preventing fabricated in-transcript approvals from being acted on
- Improved agent view: sessions that edit, merge, comment on, or push to an existing PR now link it in `claude agents`
- Improved agent view: rows now show a colored state word and a classifier-written headline instead of raw tool call text, and the peek opens with full status including the exact ask for blocked sessions
- `/doctor` is now a full setup checkup that can diagnose and fix issues; `/checkup` is its alias
- Reserved the "Claude Browser" MCP server name (alongside "Claude Preview") ahead of the Claude Desktop pane rename; user-configured MCP servers can no longer register under either name
- Fixed Cowork VM-mode local-agent sessions failing to start with "Not logged in · Please run /login" on CLI 2.1.203+

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.204
```

---

## 2.1.204 — 2026-07-08 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.204 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Fixed hook events not streaming during SessionStart hooks in headless sessions, which could cause remote workers to be idle-reaped mid-hook

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.203
```

---

## 2.1.203 — 2026-07-08 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.203 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added a warning when your login is about to expire, so you can re-authenticate before background sessions are interrupted
- Added a grey ⏸ badge to the footer when in manual permission mode, making the active mode always visible
- Added the session's additional working directories to MCP `roots/list`, with `notifications/roots/list_changed` sent when the set changes
- Fixed opening or switching background agent sessions on macOS stalling for 15–20 seconds due to a false low-memory detection (regression in 2.1.196)
- Fixed background sessions becoming permanently unresponsive to attach, replies, and stop when the daemon's session token went stale — the session now recovers automatically
- Fixed returning to `claude agents` silently stopping running subagents and re-running the prompt from scratch — their work now carries over
- Fixed a memory and per-turn CPU regression in interactive sessions: the context-usage indicator no longer re-analyzes the entire transcript after every turn
- Fixed background agents inheriting a stale `PATH` from the daemon instead of the dispatching shell, causing missing tools on Windows
- Fixed background and agent-view sessions dropping a shell-exported `ANTHROPIC_BASE_URL`, which sent API keys to the default endpoint and failed with 401
- Fixed Bash failing with "argument list too long" in repos with many git worktrees
- Fixed worktree-isolated subagents sometimes running shell commands in the parent checkout instead of their own worktree
- Fixed worktree creation rejecting nested repositories in multi-repo workspaces, leaving background sessions unable to isolate and edit
- Fixed background agents crash-looping when their working directory was deleted, replaced by a file, or became an invalid path — they now fail once with a clear error
- Fixed a background daemon auto-upgrade failure silently killing all running background sessions
- Fixed `TaskStop` and `TaskOutput` failing to find background agents spawned by another agent — errors now list running agents by id and description
- Fixed the `claude agents` composer discarding your typed message when a slash command isn't available there
- Fixed the agent list crashing when opening a stopped session whose conversation was already open in another session
- Fixed background sessions showing "Needs input" in the agent list after the question was already answered
- Fixed background agent startup failures showing only "exit_with_message" instead of the actual error
- Fixed background sessions ignoring `effortLevel` changes in settings.json when forked through the daemon
- Fixed attached background sessions ignoring `CLAUDE_CODE_DISABLE_MOUSE` and `CLAUDE_CODE_DISABLE_MOUSE_CLICKS` opt-outs
- Fixed `/exit` incorrectly warning about running background agents after all named agents had completed
- Fixed background sessions started from a non-git directory unable to edit files when a `WorktreeCreate` hook was configured
- Fixed the `@` directory picker in `claude agents` not showing registered git worktrees
- Fixed background task output on Windows being permanently replaced by an empty file after `/clear`
- Fixed content jumping when scrolling up through long transcript history
- Fixed the terminal flickering and jumping while typing in bash mode when a shell-history suggestion was shown
- Fixed literal `^[[I` / `^[[O` escape codes being printed when reattaching to a background session
- Fixed LSP-only plugins being incorrectly flagged for disuse when their language servers deliver diagnostics or answer navigation requests
- Improved responsiveness while long responses stream: live-preview updates no longer re-render the whole screen
- Improved subagent behavior: agents are now less likely to re-delegate their entire task to another subagent
- Reduced binary size by ~7 MB and startup memory by ~7 MB by loading a large bundled dependency lazily instead of inlining it
- Changed left arrow to no longer close the background tasks, diff, and workflow detail views — press Esc instead
- Changed the empty `claude agents` view to always show the organized sections (Needs input / Working / Completed) with descriptions
- Removed the startup "claude command missing or broken" warnings — they now appear in `/doctor` and `/status` instead
- Removed a redundant navigation hint from the `claude agents` footer
- [VSCode] Added a Settings toggle for "Enable Remote Control for all sessions"

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.202
```

---

## 2.1.202 — 2026-07-07 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.202 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added a "Dynamic workflow size" setting in `/config` for controlling how large Claude generally makes dynamic workflows (small/medium/large agent counts) — an advisory guideline, not an enforced cap
- Added `workflow.run_id` and `workflow.name` OpenTelemetry attributes to telemetry emitted by workflow-spawned agents, so a workflow run's activity can be reconstructed from OTel data
- Fixed a crash in the inline Ctrl+R history search when accepting or cancelling while the search was still scanning the history file
- Fixed `/rename` on background sessions being reverted when the job restarts, which broke addressing the session by its new name
- Fixed transient mTLS handshake failures when settings were re-applied during an in-place client certificate rotation
- Fixed commands sent from Remote Control (mobile/web) into an interactive session failing with "Unknown command"
- Fixed images and files sent from the Remote Control mobile or web app without a caption being silently dropped
- Fixed the sign-in URL printed by `claude auth login` and `claude mcp login --no-browser` not being reliably clickable when it wraps over SSH — it is now emitted as a single hyperlink
- Fixed opening a chat from `claude agents` sometimes failing with "currently running as a background agent" followed by a worker crash/respawn loop
- Fixed workflow scripts with unicode quote escapes in strings being corrupted before parsing; workflow parse errors now show the offending line instead of always blaming TypeScript
- Fixed voice dictation retrying in an unbounded loop when the microphone or audio recorder fails — repeated capture failures now pause voice input
- Fixed `/remote-control` sessions showing the wrong permission mode in the mobile and web apps
- Fixed resuming a session by name, or opening the resume picker, taking minutes and using a large amount of memory in repositories with many git worktrees
- Fixed installer and updater downloads failing immediately with "aborted" when a proxy or network drops the connection mid-download — transient connection drops now retry
- Fixed re-invoking an already-loaded skill appending a duplicate copy of its instructions to context
- Improved `/workflows` agent list layout: wider titles, a dedicated time column, shorter model names, and no per-row tool-call counts
- Improved MCP error messages: clearer error when a server config has `url` but no `type`, suggesting `"type": "http"` instead of the misleading "command: expected string"
- Changed `/review <pr>` back to a fast single-pass review; use `/code-review <level> <pr#>` for the multi-agent review at a chosen effort level

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.201
```

---

## 2.1.201 — 2026-07-04 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.201 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Claude Sonnet 5 sessions no longer use the mid-conversation system role for harness reminders

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.200
```

---

## 2.1.200 — 2026-07-04 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.200 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Changed `AskUserQuestion` dialogs to no longer auto-continue by default; opt into an idle timeout via `/config`
- Changed the "default" permission mode to "Manual" across the CLI, `--help`, VS Code, and JetBrains; `--permission-mode manual` and `"defaultMode": "manual"` are accepted alongside `default`
- Fixed a crash at startup when `disabledMcpServers` or `enabledMcpServers` in `.claude.json` is set to a non-array value
- Fixed background sessions silently stopping mid-turn after sleep/wake or when reopening a stalled session
- Fixed background sessions re-running a turn cancelled with Esc after a stall respawn
- Fixed background agents never starting again after a crash left a stale `daemon.lock` whose PID the OS reused
- Fixed background-agent daemon handover so a reinstalled older build can no longer take over the daemon; build recency is now judged by the version's embedded build timestamp
- Fixed background-agent roster issues: transient corruption permanently disabling orphan cleanup, older binaries not preserving fields written by newer versions, and socket auth tokens being stripped during daemon restarts
- Fixed subagents cut off by a rate limit before producing any text output returning an empty result instead of failing cleanly
- Fixed control bytes from background-agent output reaching the terminal in the agent view
- Fixed `claude agents --plugin-dir <dir>` not showing the plugin's agents and skills in the agent view when the flag is placed after `agents`
- Fixed project-scoped plugins not loading correctly from git worktrees of the same repository
- Fixed `/mcp` server list not tracking focus for screen readers and magnifiers
- Fixed voice dictation showing a misleading "Voice connection failed" message when a recording captures no audio
- Fixed rendering flicker under tmux 3.4+ by enabling synchronized terminal output
- Improved screen-reader output: decorative glyphs are now hidden, transcript symbols read as short labels, and nested tables read as `Header: value.` lines
- Improved the install script to explain when installation is killed by the system running out of memory

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.198
```

---

## 2.1.198 — 2026-07-03 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.198 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Claude in Chrome is now generally available
- Added background agent notifications in `claude agents` — sessions that need input or finish now fire the `Notification` hook (`agent_needs_input` / `agent_completed`)
- Added `/dataviz` skill for chart and dashboard design guidance with a runnable color-palette validator
- Gateway: added Claude Platform on AWS (anthropicAws) as an upstream provider; model-not-found responses now advance the failover chain
- Background agents launched from `claude agents` now commit, push, and open a draft PR when they finish code work in a worktree, instead of stopping to ask
- The built-in Explore agent now inherits the main session's model (capped at opus) instead of running on haiku
- Subagents and context compaction now inherit the session's extended thinking configuration, improving output quality on delegated tasks
- Fixed brief network drops mid-response aborting the turn — transient errors like ECONNRESET now retry with backoff instead of failing
- Fixed excessive background classifier requests when sandboxed processes repeatedly accessed the same network host
- Fixed background tasks in web, desktop, and VS Code task panels getting stuck on "Running" after they finish or after resuming a session
- Fixed agent teams: a teammate that dies on an API error now reports "failed" to the lead, and messaging a stuck teammate wakes it to retry immediately
- Fixed the `/diff` panel not refreshing when you switch branches or commit outside the session
- Fixed markdown tables overflowing and wrapping their right border when rendered in fullscreen mode
- Fixed Claude Platform on AWS and Mantle sessions dead-ending with "Please run /login" when the STS token expires — `awsAuthRefresh` now runs automatically
- Fixed "no route to host" for local-network hosts in macOS background agent sessions by declaring Local Network entitlements
- Fixed `/desktop` failing with "Cannot determine working directory" after entering and exiting a worktree
- Fixed background agents repeatedly showing "Reconnecting…" every ~52 seconds on macOS while the agents view was open
- Fixed pressing `←` inside `claude attach <id>` exiting to the shell instead of opening the agent view
- Fixed `claude --bg` silently creating an unattachable session when combined with `--print`/`-p`; the conflicting flags are now rejected up front
- Fixed the workflow progress view dropping the earliest agents from the list while the phase counter stayed correct in SDK and desktop-app sessions
- Fixed `.claude/rules/` conditional rules not loading when the target file is reached via a symlinked path
- Fixed Cmd+click not opening URLs in fullscreen mode in Warp on macOS
- Fixed double-click word selection in fullscreen mode to select the entire URL including the scheme
- Fixed plan mode not auto-allowing read-only tool calls when a session starts in plan mode
- Fixed `/branch` deriving its default fork name from the compaction summary instead of the first real prompt
- Improved focus mode: subagents launched in a turn now appear in its activity summary, and completed background notifications fold into a single count
- Improved syntax highlighting accuracy in code blocks, diffs, and file previews by upgrading to highlight.js 11
- Keyboard shortcut hints now show opt/cmd instead of alt/super when connected from a Mac over SSH
- Improved API retry UX: the error reason is now shown after the second attempt, and a status page link replaces the spinner tip when the API is overloaded
- `/login` now opens the sign-in dialog from the `claude agents` view instead of saying it isn't available
- Subagents now treat messages from the agent that launched them as normal task direction; an agent's message is still never treated as the user's approval
- Removed the `/agents` wizard; ask Claude to create or manage subagents, or edit `.claude/agents/` directly

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.197
```

---

## 2.1.197 — 2026-07-01 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.196 → 2.1.197 追従（2.1.195 から2バージョン分のアップグレード）。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

**2.1.197**

- Introducing Claude Sonnet 5: now the default model in Claude Code, with a native 1M-token context window and promotional pricing of $2/$10 per Mtok through August 31. Update to version 2.1.197 for access. https://www.anthropic.com/news/claude-sonnet-5

**2.1.196**

- Added support for organization default models — admins set it in the org console; it shows as "Org default" (or "Role default") in `/model` when you haven't picked one yourself
- Added readable default names for sessions at start, making them easier to identify and message
- Added clickable file attachments in chat — Cmd/Ctrl-click reveals the file in Finder/Explorer
- Security: `claude mcp list`/`get` no longer spawn `.mcp.json` servers that a repo self-approved via a committed `.claude/settings.json`; untrusted workspaces show `⏸ Pending approval`
- Fixed waking a background job permanently deleting its conversation and re-running the original prompt when the transcript probe misread a real transcript; the file is now set aside, never deleted
- Fixed the rate-limit warning flickering off and rate-limit telemetry being over-counted when multiple parallel requests were in flight at the moment a usage limit was hit
- Fixed duplicate recap lines after a background session's turn: a schema-rejected StructuredOutput attempt no longer renders alongside its retry
- Fixed PowerShell `git diff`/`git grep`, `egrep`/`fgrep`, and quoted search patterns containing `|` being reported as failures when they exit 1, matching Bash behavior
- Fixed multiple `claude agents` side panel issues: keyboard focus getting stuck when opening an agent, background jobs losing their subagent types on every open, and sessions showing incorrect status while actively running
- Fixed `claude agents --dangerously-skip-permissions` silently falling back to auto mode instead of showing the bypass disclaimer and applying bypass mode to spawned agents
- Fixed mid-turn crash recovery for Remote sessions — sessions interrupted by a server restart now auto-resume on the next worker
- Fixed sessions moved with `/cd` reappearing in the old directory's resume list after a non-graceful exit when the old path contained special characters
- Fixed `claude plugin validate` skipping local plugins whose source is "." and stopping after the first error class
- Fixed Esc Esc at an idle prompt not opening the rewind menu (regression); use Ctrl+C or Ctrl+X Ctrl+K to stop background agents
- Fixed MCP OAuth requesting the authorization server's full `scopes_supported` catalog when no scope is specified, causing `invalid_scope` failures on GitLab self-hosted and other enterprise IdPs
- Fixed `/context` showing 0 tokens for all tool groups on Bedrock
- Fixed `/deep-research` misreporting verifier failures as "all claims refuted" instead of `unverified`
- Fixed plugin dependency version pins not being honored when the marketplace was added as a local folder path backed by a git repo
- Fixed `claude agents` session status: completed rows no longer flip between "Done" and "Needs your input", stalled agents are now labeled "Needs attention", and results that mention a PR show a clickable link
- Fixed voice dictation swallowing spaces and spuriously starting a recording during very fast typing when voice mode is enabled
- Improved background session reliability: long-running commands and workflows now survive the session's process being stopped, restarted, or updated — including on Windows, where background shells are handed off instead of being killed
- Improved background agents: workers killed by a daemon restart are now automatically resumed from where they left off the next time the agents view opens
- Improved `/code-review` workflow: merged five cleanup finders into one, cutting token usage by roughly 25%
- Reduced per-frame rendering work in the terminal UI by skipping no-op subtree walks during streaming
- The streaming idle watchdog is now on by default for all providers — it aborts and retries when a response stream produces no events for 5 minutes. Set `CLAUDE_ENABLE_STREAM_WATCHDOG=0` to disable.
- Remote Control is now disabled when `ANTHROPIC_BASE_URL` points at a non-Anthropic host, matching the existing behavior under `CLAUDE_CODE_USE_BEDROCK`/`_VERTEX`/`_FOUNDRY`
- Changed opening the agents view from a foreground session to require a single `←` press instead of two, matching the behavior in background sessions

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.195
```

---

## 2.1.195 — 2026-06-27 ✅ Current audited / 現在の監査済み版

Tracks upstream @anthropic-ai/claude-code@2.1.195. Binary offset and Bun property access count updated for this release.

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.191
```

---

## 2.1.193 — 2026-06-27 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.193 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added `autoMode.classifyAllShell` setting to route all Bash/PowerShell commands through the auto-mode classifier instead of only arbitrary-code-execution patterns
- Added auto-mode denial reasons to the transcript, the denial toast, and `/permissions` recent denials
- Added `claude_code.assistant_response` OpenTelemetry log event containing the model's response text. Redacted unless `OTEL_LOG_ASSISTANT_RESPONSES=1`; when that var is unset it follows `OTEL_LOG_USER_PROMPTS`, so deployments that already log prompt content will start receiving response content on upgrade — set `OTEL_LOG_ASSISTANT_RESPONSES=0` to keep prompts-only.
- Added live file path autocomplete to bash mode (`!`)
- Added a startup notice when MCP servers need authentication, pointing at `/mcp`
- Added automatic memory-pressure reaping for idle background shell commands (disable with `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1`)
- Fixed `/model` and other client-data-gated UI showing stale/empty state immediately after `/login`
- Fixed backgrounding (←←) spuriously cancelling with "N background tasks would be abandoned" when all running tasks carry over to the new session
- Fixed pinned background agents being re-prompted to "Continue from where you left off" after every auto-update
- Fixed backgrounding the main turn spawning a phantom "general-purpose (resumed)" subagent that re-ran the main conversation
- Fixed agent panel hiding sibling agents when viewing a subagent
- Improved background agents: the launch result no longer instructs Claude to "end your response" — it keeps working on other tasks while the agent runs
- Improved MCP `headersHelper` auth: the helper now re-runs and reconnects automatically when a tool call returns 401/403
- Improved plugin auto-rename: marketplace `renames` maps are now followed automatically, updating your settings to the new name
- Improved `/add-dir` message when the directory is already a working directory

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.191
```

---

## 2.1.187 — 2026-06-24 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.187 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added `sandbox.credentials` setting to block sandboxed commands from reading credential files and secret environment variables
- Added org-configured model restrictions to the model picker, `--model`, `/model`, and `ANTHROPIC_MODEL`, with a "restricted by your organization's settings" message when a restricted model is selected
- Added mouse click support to select menus (permission prompts, `/model`, `/config`, etc.) in fullscreen mode
- Fixed `--resume` failing with "No conversation found" when the original `-p` run produced no model turns
- Fixed `--json-schema` and workflow `agent({schema})` structured output: the model can no longer re-call `StructuredOutput` indefinitely after a successful call, and follow-up turns now reliably return structured output
- Fixed remote MCP tool calls that hang with no response for 5 minutes — they now abort with an error instead of blocking indefinitely (override with `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`)
- Fixed Claude Code Remote sessions taking ~2.7s longer to start after the agent proxy CA system-trust install was added
- Fixed pasted Korean/CJK text turning into mojibake in terminals that deliver paste as per-byte extended-key events
- Fixed `/update` over Remote Control hanging when a startup trust dialog would have shown
- Fixed background jobs in the agents view getting stuck in "working" indefinitely when the agent ended a turn without producing structured output
- Fixed channel connections dropping after navigating to the agents view and back, and after `/bg`, `/tui`, or `/update`
- Fixed agent stop notifications not correctly attributing who stopped the agent, and improved wording ("finished"/"stopped" instead of "came to rest")
- Fixed subagent depth tracking: resumed subagents now restore their original spawn depth, and forked subagents now count toward the depth cap
- Fixed leaked agent worktree registrations: locked `.git/worktrees/` entries from killed agents are now cleaned up automatically
- Fixed Cmd+click not opening URLs in fullscreen mode in Ghostty on macOS
- Fixed `claude --help` not listing the `--bg`/`--background` flag
- Fixed Esc, Ctrl-C, and Ctrl-D not working while `/share` is uploading
- Improved `/install-github-app`: GitHub Actions workflow setup is now optional — you can install just the GitHub App and skip the workflow/secret steps
- Improved `/btw` with ←/→ arrow navigation to step through earlier answers
- Improved `/plugin` to surface plugins you haven't used recently so you can clean them up
- [VSCode] Fixed extension becoming unresponsive when resuming a large session

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.186
```

---

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
