## 2.1.220 — 2026-07-25 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.220 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Bug fixes and reliability improvements

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.219
```

---
## 2.1.219 — 2026-07-25 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.219 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added Claude Opus 5 (`claude-opus-5`), now the default Opus model — 1M context, fast mode at $10/$50 per Mtok
- Added `sandbox.network.strictAllowlist` setting to deny non-allowlisted hosts for sandboxed commands without prompting
- Added `DirectoryAdded` hook that fires after `/add-dir` or the SDK `register_repo_root` control request registers a new working directory mid-session
- Added `mcp_server_errors` to the headless stream-json init event, listing `--mcp-config` entries skipped by config validation; terminal runs print a startup warning
- Added the `workflowSizeGuideline` settings key so the advisory Dynamic workflow size guideline can be set from any settings file; the `/config` row is hidden while one does
- Added nested subagent forwarding in stream-json: subagents spawned at depth-2+ now appear when `--forward-subagent-text` is set, keyed by their spawning Agent `tool_use` id
- Fixed `claude -p` text output dropping the answer already produced when a turn dies on a mid-stream API error
- Added HTTP status and error text to `claude mcp list` and `/mcp` when a server fails to connect, and a warning for MCP config values with hidden leading or trailing whitespace
- Fixed a permission you approved while a self-hosted runner was restarting being dropped when the session resumed, so the approved action now runs
- Fixed the Fable model row showing "Requires usage credits" for plans that include it, when a stale cache had baked the label in
- Fixed a SIGTERM arriving while a self-hosted runner was starting up leaving a stale active row until the lease expired; it now deregisters cleanly
- Added structured failure categories to self-hosted runner spawn and session failures, so hook errors, runner crashes and config errors can be told apart
- Fixed the `/model` picker showing the merged Opus row as plain "Opus" instead of "Opus (1M context)"
- Fixed copy-on-select inside GNU screen printing base64 into the terminal instead of copying the selection
- Fixed Remote Control clients keeping a stale fast-mode status after a model switch, reconnect, or failed org check
- Fixed `CLAUDE_CODE_GIT_BASH_PATH` on Windows exiting or being used as bash when the path isn't a bash/sh binary; it's now ignored with a warning
- Fixed Vim mode: pressing ← on an empty prompt now returns to the agent view from NORMAL mode, not just INSERT
- Fixed screen-reader mode rewriting the entire input line on every keystroke instead of echoing only the typed character
- Improved the "Remote Control is only available via api.anthropic.com" error to name the specific setting that caused it
- Improved `claude --teleport` to show which repo your current checkout points at when it doesn't match the session's repo
- Changed dynamic workflows to default to a medium size guideline (aim for fewer than 15 agents); pick another size or unrestricted with Dynamic workflow size in `/config`
- Changed managed MCP allowlist/denylist `${VAR}` entries to resolve from the startup environment and managed-settings env instead of settings-file env
- Changed the `/model` picker to highlight only the newest model's name, so the highlight marks the new release rather than an arbitrary subset of the list
- Added the current default workflow size to the running-workflow status line, with a pointer to `/config` for changing it
- Removed Opus 4.7 from fast mode; `/fast` now applies to Opus 5 and Opus 4.8
- Updated the claude-api skill to default to Claude Opus 5, with a migration path from Opus 4.8
- Subagents can now spawn nested subagents up to depth 3 by default (was 1); set CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1 to disable nesting

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.218
```

---
## 2.1.218 — 2026-07-24 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.218 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Changed `/code-review` to run as a background subagent, so review work no longer fills your conversation and keeps stacked slash commands as its review target
- Added screen-reader announcements of deleted text for word and line deletions (`Option+Delete`, `Ctrl+W`, `Cmd+Backspace`, `Ctrl+U`, `Ctrl+K`) in `--ax-screen-reader` mode
- Fixed Windows paths with `\u`-prefixed segments (like `C:\Users\unicorn`) being corrupted into CJK characters in tool inputs, which made those files inaccessible
- Fixed the left arrow key discarding the conversation with no undo: presses right after editing now ask to confirm, and Esc in the agent view returns to the conversation it backgrounded
- Added HTTP status and error text to `claude mcp list` and `/mcp` when a server fails to connect, and a warning for MCP config values with hidden leading or trailing whitespace
- Fixed multi-line paste collapsing into one line with `j` in place of newlines in terminals that encode pasted newlines as Ctrl+J
- Fixed `/context` reporting stale pre-compact token usage after compacting from the message picker
- Fixed `/ultrareview` failing on descriptive arguments like "review my auth changes" — they now run a review of your current branch with the text applied as a note to the findings
- Fixed `/code-review ultra` silently running a local review in non-interactive sessions — it now launches the cloud review
- Fixed gateway spend metering to price Bedrock application-inference-profile ARNs and other config-mapped upstream model IDs at the configured model's rates
- Fixed mojibake when a long IDE selection was truncated mid-emoji, and a case where a tool executor error could be silently dropped
- Fixed an engine teardown race that could start and abandon a phantom turn, and made input pushed after close consistently rejected
- Fixed spurious "[Request interrupted by user]" messages after interrupted tool calls, and an unpaired `tool_use` block left in the transcript when a tool aborted mid-response
- Fixed VoiceOver reading "new line" instead of echoing the typed space at the end of the input in `--ax-screen-reader` mode
- Fixed plugin and settings panels not moving the terminal cursor to the focused row, so screen readers and magnifiers can follow arrow-key navigation
- Fixed crashes (maximum call stack exceeded) when a deeply nested watched directory tree was deleted or moved, and when rendering deeply nested UI trees
- Fixed pull request events occasionally being lost when a session exited immediately after creating or linking a PR
- Fixed the Bedrock setup wizard failing profile verification for assume-role profiles in partitioned AWS regions and on proxy-only networks
- Fixed rare negative or incorrect turn duration measurements after a system clock adjustment by timing turns with a monotonic clock
- Fixed the "N MCP servers need authentication" startup notice over-counting claude.ai connectors that aren't connected in claude.ai
- Fixed prompt history entries being dropped or duplicated when history writes raced or failed
- Fixed a retry loop that re-sent identical doomed requests after a context-overflow error with a large thinking budget; `Ctrl+B` backgrounding now applies the same background-shell caps as other paths
- Fixed agent frontmatter hooks running from untrusted folders: hooks now require the agent file's own folder to have accepted workspace trust
- Fixed fork-session lineage being lost after compaction in headless and SDK sessions
- Fixed a resumed session failing every turn, or crashing on resume, when its history held a malformed delta attachment
- Improved `/ultrareview` error feedback so Claude can correct an invalid argument instead of retrying it unchanged
- Improved auto mode: the dangerous-rm, background-`&`, and suspicious-Windows-path checks no longer open permission dialogs; the auto-mode classifier adjudicates them instead
- Improved sandbox command restrictions for IDE interactions
- Improved trust dialogs to name the repository root the grant covers
- Changed `/deep-research` to start only when invoked manually; Claude no longer launches it on its own
- Changed plan mode with auto to no longer prompt for Bash commands the static analyzer can't prove read-only; the auto-mode classifier judges them instead
- Added an announcement when fast mode changes as a result of switching models via `/config model=<x>` or Remote Control
- Changed server-managed settings so benign feature and cost toggles no longer trigger the settings-approval prompt
- Changed agent markdown files to reject agent names containing `:`, which is reserved for plugin namespacing
- Changed skills with `context: fork` to run in the background by default; opt out per skill with `background: false`
- Added `yes`/`no`/`on`/`off`/`1`/`0` (case-insensitive) as accepted values for skill and plugin frontmatter booleans, alongside `true`/`false`
- Fixed remote sessions continuing to send heartbeats after their worker was replaced, which left long-lived desktop and IDE processes retrying a rejected request every few seconds forever

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.217
```

---
## 2.1.217 — 2026-07-23 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.217 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added emoji shortcode autocomplete in the prompt input: type `:heart:` to insert ❤️, or `:hea` for suggestions — disable with the `emojiCompletionEnabled` setting
- Added warnings when transcript writes are failing (e.g. disk full) or when session saving is off due to an inherited environment variable, instead of losing transcripts silently
- Fixed a memory leak where truncated MCP tool outputs kept the full untruncated result in memory for the rest of the session
- Fixed Windows auto-update failures that could leave `claude.exe` missing; failed updates now restore the preserved executable automatically
- Fixed background session isolation not canonicalizing symlinked working directories, which could let sessions escape their workspace folder
- Fixed auto-compact never triggering for Claude Opus 4.8 on Bedrock and `/compact` failing once over the limit
- Fixed corporate mTLS, TLS-verify, OAuth scope, and proxy settings being ignored in Claude Desktop sessions
- Fixed screen reader mode's startup announcement being cut off by the first prompt render, and the thinking status row re-rendering every few seconds to update elapsed time and token counts
- Fixed managed settings that set `OTEL_EXPORTER_OTLP_ENDPOINT` not governing all signals — lower-scope signal-specific overrides no longer redirect telemetry away from the managed endpoint
- Fixed `--resume`/`--continue` and `/resume` failing with a TypeError when a transcript has a malformed attachment entry
- Fixed Remote Control sessions not showing a pending permission prompt or dialog to viewers that connected after it appeared
- Fixed background shells sometimes becoming impossible to stop after a session is sent to the background (`/background` or `←`) or when the session exits on a heavily loaded machine, most visible on Windows
- Fixed a `CLAUDE.md` or `SKILL.md` paths frontmatter value with many brace groups OOM-killing or stalling the CLI at startup — brace expansion is now budget-bounded
- Fixed the transcript preview sitting flush against the input area when attaching to a starting background session; it now leaves the same one-line gap as the live layout, so the transcript no longer shifts when the session takes over
- Improved footer PR badge links to be clickable hyperlinks even when terminal support can't be detected (e.g. over ssh/tmux); set `FORCE_HYPERLINK=0` to opt out
- Changed the login-expiry warning to appear 3 days before expiry instead of 5
- Capped the frontend-design plugin suggestion tip at 3 lifetime impressions instead of repeating indefinitely
- Added a cap on concurrently-running subagents (default 20, override with `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`) so one message can't fan out unbounded background agents
- Changed subagents to no longer spawn nested subagents by default; set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to allow deeper nesting
- Fixed `--max-budget-usd` not stopping background subagents: once the cap is reached, new spawns are denied and running background agents are halted

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.216
```

---
## 2.1.216 — 2026-07-22 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.216 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added `sandbox.filesystem.disabled` setting to skip filesystem isolation while keeping network egress control
- Fixed a slowdown in long sessions where message normalization cost grew quadratically with the number of turns, causing multi-second stalls and slow resumes
- Fixed auto mode denying commands with "HTTP 401" classifier errors after the OAuth token expired or rotated mid-session
- Fixed AskUserQuestion telling Claude to continue even when your answer asked it to wait or explain first — free-text answers now get neutral wording
- Fixed Claude Code on the web re-asking the same question and dropping your answer after the session sat idle for a few minutes
- Fixed @-mentions silently attaching nothing after file-modifying hooks, vim dot-repeat of `c`-operators and paste, statusline running twice on resume, and resume-picker hangs on failure
- Fixed resumed background agent sessions reverting to the default agent: the agent's prompt and tool restrictions are now restored
- Fixed worktree-isolated subagents redirecting git into the shared checkout via `git -C`, `--git-dir`, or `GIT_DIR`/`GIT_WORK_TREE`
- Fixed worktree sessions landing in another project's leftover worktree when the working directory did not match the selected project
- Fixed background sessions whose worktree has no git repository being undeletable
- Fixed `claude daemon stop --any` potentially terminating an unrelated process via a stale legacy daemon lockfile
- Fixed Esc-Esc at an idle prompt not opening the rewind picker in long-running sessions with background tasks
- Fixed Bash command permission checking for compound statements with redirects inside `&&` lists or negations
- Fixed pressing Ctrl+X twice in the agent list failing to delete a session, and deleted sessions reappearing when their background worker had died
- Fixed background subagents getting cancelled when a high-priority message arrives during their startup window
- Fixed mouse and focus garbage in the terminal while a GUI editor from `/memory`, `/plan`, `/keybindings`, or Ctrl+G is open; `/memory` no longer waits for the editor to close
- Fixed Claude-in-Chrome 403-looping on reconnect when the session's OAuth token lacks a required scope
- Fixed workflow saves and scheduled-task writes following a symlink at `.claude`, which could redirect writes outside the project
- Fixed MCP re-authenticate revoking working credentials before the new sign-in succeeds, and the reconnect needs-auth message in background sessions pointing at an unusable command
- Fixed read-only commands on Windows accessing network paths without a permission prompt
- Fixed Bash command parsing of non-ASCII characters to match real shell word boundaries
- Fixed PowerShell tool permission validation of commands containing invisible Unicode characters
- Fixed dialogs in fullscreen mode stretching past the right-hand edge of their panel
- Fixed the `/config` settings list in fullscreen mode clipping its keyboard-hint footer
- Fixed the transcript-mode (Ctrl+O) footer hint wrapping on terminals narrower than 104 columns
- Fixed the Prometheus metrics endpoint (`OTEL_METRICS_EXPORTER=prometheus`) emitting invalid `# UNIT` lines
- Fixed skills and commands changed during a session not appearing in the slash menu until restart
- Fixed plugin skills with a `name` frontmatter field losing their plugin prefix in slash-command autocomplete
- Fixed telemetry misreporting permission denials: failed permission-prompt requests no longer count as user rejections, and user interrupts are now reported as user aborts instead of rejections
- Improved the `/fork` confirmation to one line with the new session's name, `claude attach` id, and a note when the copy shares your checkout
- Improved validation of `git` and `gh` command arguments in the PowerShell tool
- Improved the `/ultrareview` diff-too-large error to show configured limits, measured diff size, and largest contributing files
- Improved `/code-review ultra` empty-diff message to name the exact base ref and suggest passing an explicit base
- Improved the spend limit adjustment prompt to show the server's reason when a spend limit change is rejected
- `/context` now shows an explicit warning when the conversation exceeds the context window, and a failed `/compact` displays as an error
- `/rewind` no longer restores or deletes files through symlinks or hard links at tracked paths and reports how many paths it skipped
- Background sessions: `/mcp` and `/install-github-app` now park a "needs input" request in the agent view when no client is attached
- Updated the bundled dataviz skill: reordered the default chart palette and fixed guidance that suggested direct labels for four-series charts
- [VSCode] Fixed right-to-left text (Arabic, Hebrew, Persian) rendering in the wrong order when mixed with English or code
- Fixed cloud sessions dropping the in-flight message when the session's container restarts mid-turn — the interrupted turn now re-runs on resume instead of leaving the session unresponsive

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.215
```

---
## 2.1.215 — 2026-07-20 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.215 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Claude no longer runs the `/verify` and `/code-review` skills on its own; invoke them with `/verify` or `/code-review` when you want them

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.214
```

---
## 2.1.214 — 2026-07-19 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.214 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Fixed single-segment `dir/**` allow rules like `Edit(src/**)` auto-approving writes to nested `dir/` directories anywhere in the tree instead of only `<cwd>/dir`
- Fixed a permission-check bypass affecting commands run in Windows PowerShell 5.1 sessions
- Fixed Bash permission checks to fail closed on file-descriptor redirect forms that bash parses differently than the permission analyzer
- Fixed Bash permission checks misjudging very long commands — commands over 10,000 characters now always prompt instead of running automatically
- Fixed Bash permission checks treating zsh variable subscripts and modifiers in `[[ ]]` comparisons as inert text — these commands now prompt for approval
- Fixed Bash permission checks to no longer auto-approve certain `help` and `man` commands that could run unsafe options, command substitutions, or backslash paths
- Fixed permission prompts on remote sessions that could proceed before the local confirmation dialog
- Added the EndConversation tool: Claude can end sessions with highly abusive users or jailbreak attempts, as on claude.ai since 2025 — see https://www.anthropic.com/research/end-subset-conversations
- Added a periodic progress heartbeat for long-running tool calls that previously went silent
- Added an ISO `modified` timestamp to memory file frontmatter
- Added `message.uuid`, `client_request_id`, and `tool_source` attributes to OpenTelemetry log events for message-level correlation and tool provenance
- Added `CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH` to configure the 60 KB truncation limit on OpenTelemetry content attributes
- Added reasoning effort to the `subagentStatusLine` payload, so custom agent rows can render model and effort
- Added permission prompts for `docker` commands (including the Podman `docker` shim) carrying daemon-redirect flags (`--url`, `--connection`, `--identity`, and Podman's remote mode) that previously ran without one
- Fixed a crash when a GrowthBook feature evaluates to null, and a bug where a malformed flag payload could wipe the cached feature flags
- Fixed Bash tool killing the Claude session when a `pkill -f` pattern accidentally matched the CLI's own process (Linux)
- Fixed unbounded memory growth when `--settings` points at a device file or multi-GB file; oversized (>2 MiB) settings files now fail at startup with a clear error
- Fixed streaming turns failing with "Socket is closed" behind corporate proxies on Windows
- Fixed stream-json output truncation at exit for slow-reading SDK/pipeline consumers; the exit drain now scales with queued bytes instead of a flat 2s cap
- Fixed scheduled tasks refusing their own configured prompt as untrusted input — the fired prompt is now delivered as the session's assigned task
- Fixed PowerShell tool commands hanging until timeout when a child process waited on standard input (Windows)
- Fixed Python scripts under the PowerShell tool crashing with UnicodeDecodeError when reading non-UTF-8 data from standard input (Windows)
- Fixed Python scripts run via the PowerShell tool crashing with UnicodeEncodeError on non-ASCII output, and PowerShell 7 error messages containing raw ANSI escape sequences (Windows)
- Fixed the PowerShell tool reporting `where.exe`, `fc.exe`, and `diff.exe` as errors when they return a valid negative answer (Windows)
- Fixed `>` and `>>` under the PowerShell tool on Windows PowerShell 5.1 writing UTF-16LE files that other tools couldn't read as UTF-8
- Fixed a displaced background daemon deleting its successor's control socket on shutdown, which made the next client kill the healthy replacement daemon
- Fixed background sessions parked with `←` or `/background` and left idle keeping the background daemon and a worker process alive indefinitely
- Fixed completed background sessions being impossible to remove via `claude rm` or the agent view once the background service had gone idle
- Fixed background sessions dispatched from a non-git folder being impossible to delete from the agents view
- Fixed reopening a stopped background session failing to restore its saved conversation when an unreadable folder exists in the session store
- Fixed the Remote Control "session ready" push notification firing for sessions where Remote Control was not explicitly enabled
- Fixed `/install-github-app` and the `/mcp` settings menu being blocked in agent-view sessions — they're now refused only in background sessions with no terminal attached
- Fixed plugins enabled via the `--settings` CLI flag not loading (regression since v2.1.181)
- Fixed feature flags going stale in long-running sessions after the OAuth token rotates
- Fixed `/ultrareview` refusing to run in repos with no merge base — it now offers to review all tracked files
- Fixed `claude update` and `claude doctor` hanging silently, and the `/status` System diagnostics section going blank, when a shell-config path is a directory
- Fixed memory frontmatter values being silently truncated at an inline `#` when memory files are saved
- Fixed session cost and token telemetry double-counting on streams that emit multiple cumulative `message_delta` frames
- Fixed a spurious "check your network" warning that appeared while the advisor was thinking
- Fixed hooks with exit code 2 not blocking as documented when the hook's stdout JSON fails schema validation
- Fixed OTel log events emitted outside the turn's async context missing the interaction span's trace context
- Fixed MCP transient errors during prompts/resources refresh clearing the server's slash commands and resources
- Improved the `claude rc` workspace-trust error in the home directory to say trust there is never saved and to suggest running from a project directory
- Changed single-segment `dir/**` hook `if:` conditions to match only `<cwd>/dir`; write `**/dir/**` for any-depth matching. `deny`/`ask` permission rules keep their any-depth match.
- Changed `file` commands using `-m`/`--magic-file` or `-f`/`--files-from` to require permission instead of being auto-allowed as read-only
- Changed keep-alive connection pooling to disable after a stale-connection error, so retries open a fresh socket
- Changed SessionStart hooks to report source `"fork"` when a session begins as a fork instead of `"resume"`

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.212
```

---
## 2.1.212 — 2026-07-18 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.212 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- `/fork` now copies your conversation into a new background session (its own row in `claude agents`) while you keep working; the in-session subagent it used to launch is now `/subtask`
- Added `claude auto-mode reset` to restore the default auto-mode configuration, with a confirmation prompt (pass `--yes` to skip)
- Added a session-wide limit on WebSearch tool calls (default 200, tunable via `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`) to stop runaway search loops
- Added a per-session cap on subagent spawns (default 200, override with `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION`) to stop runaway delegation loops; `/clear` resets the budget
- MCP tool calls running longer than 2 minutes now move to the background automatically so the session stays usable; configure the threshold or disable with `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`
- Typing `/resume` in the agent view now opens a picker of past sessions — including sessions deleted from the list — and resumes your pick as a background session
- Fixed plan mode auto-running file-modifying Bash commands (e.g. `touch`, `rm`) without a permission prompt or SDK `canUseTool` callback
- Fixed worktree creation following a repository-committed symlink at `.claude/worktrees`, which could create files outside the repository
- Fixed a `continue:false` hook's halt being dropped when the tool fails or completes mid-stream, and hook infrastructure errors being misreported as user rejections
- Fixed SIGTERM during a running Bash tool orphaning the command's process tree in print/SDK mode; the CLI now aborts the turn, kills the tree, and exits 143
- Fixed `/background` and `claude --bg` failing with "EUNKNOWN: unknown error, uv_spawn" on Windows when Group Policy blocks PowerShell 5.1; the daemon now prefers PowerShell 7
- Fixed shell mode (`!`) not executing commands containing file paths while the path autocomplete popup was open
- Fixed auto-mode denial notifications rendering broken characters when a long denial reason was truncated mid-emoji
- Fixed Ctrl+J not inserting a newline in the agent view dispatch input on terminals with extended key reporting, and surfaced the newline shortcut in the `?` help overlay
- Fixed `/ultrareview` rejecting PR references like `#123`, `PR 123`, and pasted PR URLs; error hints now name the command you actually typed
- Fixed `/ultrareview <branch>` not fetching the branch from origin when it exists remotely; it now suggests the closest branch name on typos
- Fixed `/ultrareview` skipping the billing confirmation in a new conversation after `/clear`
- Fixed `/ultrareview`'s "not a git repository" error on Claude Desktop now suggesting the project's repository folder instead of terminal commands
- Fixed hosted (host-managed) sessions failing at startup when repository settings configured mTLS certs, extra CA bundles, or OAuth scopes; these transport settings are now ignored with a warning
- Fixed a spurious "File has not been read yet" error when editing a file that had been read with offset/limit before resuming a session
- Fixed `ExitWorktree` failing with "no active EnterWorktree session" after resuming a session with `--continue`/`--resume` in print/SDK mode
- Fixed the workflow agent grid staying empty for Remote Control clients that join a session mid-run
- Fixed streaming-mode control requests being marked complete before their handler finished, which could lose the request on session restart
- Fixed background sessions created with `/fork` losing their live-parent protection after a state write failure
- Fixed reopening a stopped background session from the agent view failing silently — it now resumes the session, or shows why it can't and lets you force a restart
- Fixed agent teams: a stopping teammate could send the leader duplicate idle notifications when team initialization re-ran within a session
- Fixed the plan-approval dialog footer splitting "ctrl+g to edit in <editor>" apart when the file path is long
- Fixed the welcome banner keeping its old panel widths after a combined width+height terminal resize in fullscreen mode
- Fixed diff previews losing their line numbers and +/- markers in narrow layouts
- Fixed @-mentions attaching nothing after a partial file read, plugin uninstall targeting the wrong marketplace, and false "Command timed out" on exit code 143
- Fixed OpenTelemetry HTTP exports being rejected with 411/400 by Azure Monitor and other endpoints that don't accept chunked transfer encoding
- Fixed OTLP event log records missing `trace_id`/`span_id` when `TRACEPARENT` is set in SDK/headless mode
- Fixed conversations with many images incorrectly failing with "Request too large" errors, and improved the error message to explain the actual cause
- Fixed web search and web fetch returning "API Error" text as search results or page content when the API was overloaded
- Improved web search and web fetch reliability by retrying 529 errors and rate-limited requests with bounded backoff
- Improved prompt caching: the mid-conversation system block now works behind LLM gateways and custom base URLs (Bedrock, Vertex, 1P)
- Improved background agent attach: cold-attaching now instantly shows the formatted transcript while the session boots, instead of a blank wait
- Reduced token usage in inter-agent messaging: `SendMessage` bodies are no longer duplicated into replayed history and tool results
- Changed `/fork` to name the copy after your prompt when the session has no title, so the row is recognizable in the agent view
- Changed bare `/btw` to reopen the side-question panel on your most recent exchange so you can browse earlier answers
- Changed the `←` footer hint to pulse `N done` for a moment when a background agent finishes while nothing needs your input
- Deprecated the Task tool's `mode` parameter (now ignored); subagents inherit the parent session's permission mode by default
- Changed Enterprise `forceLoginMethod` to be enforced for VS Code extension, SDK, `setup-token`, and `install-github-app` logins, not just the terminal
- Changed session transcripts to record the reasoning effort level on each assistant message
- Changed headless/SDK sessions to apply a `set_model` control request mid-turn; the next model round-trip uses the new model instead of waiting for the next turn
- Changed agent view / `claude agents --json`: sessions waiting on a sandbox, MCP-input, or managed-settings prompt now show as "Needs input" instead of "Working"
- Updated the auth status panel title from "Cloud authentication" to "Authentication"
- Corrected an earlier release note (2.1.200): tmux through the 3.6 series lacks synchronized output; newer tmux with support is detected automatically

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.211
```

---
## 2.1.211 — 2026-07-17 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.211 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added `--forward-subagent-text` flag and `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT` environment variable to include subagent text and thinking in stream-json output
- Fixed permission previews relayed to chat channels not neutralizing bidirectional-override, zero-width, and look-alike quote characters, so tool inputs cannot visually alter the approval message
- Fixed auto mode overriding a PreToolUse hook's `ask` decision for unsandboxed Bash — a hook `ask` now floors the decision at a prompt
- Fixed parallel Claude Code sessions all logging out simultaneously after wake-from-sleep when many sessions share one credential store
- Fixed plugin MCP servers not reconnecting after an idle web session woke, leaving MCP calls failing until the next message
- Fixed Claude Code on Vertex and Bedrock attempting the default Opus model at startup and printing a spurious fallback notice when a model is explicitly configured
- Fixed subagents spawned with an explicit model override reverting to the parent's model when resumed or sent a follow-up message
- Fixed nested `.claude/rules/*.md` files loading even when setting sources exclude project settings
- Fixed file upload validation: filenames ending in a DOS device suffix (`.prn`) or trailing dot are now accepted, and files with multiple hard links are refused
- Fixed file uploads to Claude in Chrome from remote and CLI sessions
- Fixed edits that leave the input as "?" being silently swallowed and toggling the shortcuts panel
- Fixed a startup hang when the Claude in Chrome extension is enabled but Chrome is not running
- Fixed a 300ms delay revealing async content (Settings tabs, Stats, diff views, and other loading states)
- Fixed reopening a just-stopped background session from the agents view starting a blank conversation under the same session id
- Fixed `/loop` hiding the session from `/resume` after a single use
- Fixed screen reader users losing the audible terminal bell after `/terminal-setup` or onboarding terminal setup
- Fixed background jobs on LLM gateway auth (`ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`) coming back "Not logged in" after the daemon respawns them
- Fixed `claude agents` jobs becoming permanently undeletable when git no longer recognizes their worktree — the row now shows why the delete was refused instead of silently reappearing
- Fixed `/clear` not resetting the session cost counter — the statusline's cost now starts at $0 after `/clear`
- Fixed Claude in Chrome setup pages failing to open in the browser on Windows
- Fixed headless print-mode sessions on Windows crashing or silently exiting when stdin is unreadable
- Fixed background session titles in the agents view showing the naming model's refusal text when the prompt contains a link
- Fixed background agents killed by the user auto-respawning, and revived agents re-running stale prompts from old sessions
- Fixed routines with no schedule reporting a next run time in the year 1
- Hardened synced skill/plugin directory naming on Windows and kept CCR web fetch/search proxies working after `/clear`
- Improved terminal layout and rendering performance
- Improved background agent result reporting — Claude now reports the status of still-running agents and waits for the real completion instead of fabricating results
- Improved the memory index over-limit warning to measure only loaded content, excluding frontmatter and HTML comments
- Updated integer environment variables (timeouts, token budgets, retry counts) to accept scientific notation and digit-separator spellings like `1e6` and `64_000`
- Updated documentation links to the current docs sites
- Changed "always allow" permission rules to save at the repository root, so approvals granted in a git worktree persist across sessions and worktrees
- Changed `/usage-credits` to ask for confirmation before sending a request to organization admins
- Changed Vim mode `s` and `S` (substitute char/line) to work in NORMAL mode, matching vim behavior
- [VSCode] Updated the Remote Control banner to describe what it does
- Claude in Chrome: hardened file-upload path validation
- Claude in Chrome: `save_to_disk` on screenshot actions now writes the image to disk and returns the path; previously it did nothing
- Fixed a prompt-caching regression on Bedrock, Vertex, Mantle, and Foundry that billed the trailing system context block as fresh input tokens on every request.

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.210
```

---
## 2.1.210 — 2026-07-16 ✅ Current audited / 現在の監査済み版

upstream claude-code 2.1.210 追従。Termux 実機検証済み（全テスト通過 / TUI 起動確認）。

**Upstream highlights / 主な変更（upstream）**

## What's changed

- Added a live elapsed-time counter to the collapsed tool summary line so long-running tool calls visibly tick instead of looking stuck
- Added a startup warning for `Write(path)`, `NotebookEdit(path)`, and `Glob(path)` permission rules — use `Edit(path)` or `Read(path)` instead
- Fixed `isolation: 'worktree'` subagents being able to run git-mutating commands against the main repo checkout instead of their own isolated worktree
- Fixed the `ultracode` keyword opt-in firing on non-human-originated input such as webhook payloads and relayed PR comments
- Fixed a rendered text fragment leaking into crash telemetry when a UI component returned content outside a styled text element
- Fixed paste markers leaking into external editors opened from Claude Code, which could appear as stray È/É characters around pasted text
- Fixed `claude attach` sometimes failing with "job not found" or "agent is still starting" errors during session transitions — attach now waits for the daemon to settle, and terminal resizes during a slow attach are applied once it completes
- Fixed a session crash when a tool's result renderer returned a numeric bigint value or plain text instead of a UI element
- Fixed a hook callback timeout being misreported to the model as a user rejection, which made unattended sessions stop and wait
- Fixed Claude assuming a `cd` took effect after its command was moved to the background; the tool result now states the working directory is unchanged
- Fixed plugin-provided MCP servers being torn down when MCP servers are re-synced mid-session
- Fixed plan approvals without edits being labeled "(edited by user)" and overwriting the plan file with a stale snapshot
- Fixed `/doctor` skipping its auto-mode-default proposal on Bedrock, Vertex, and Foundry, where auto mode no longer needs an opt-in
- Fixed Grep content mode claiming "No matches found" when paginating past the end of results
- Fixed unmatched `$1`/`$2` positional placeholders in skills and commands being silently stripped; they are now preserved verbatim
- Fixed plugin cache writes leaving temp files behind on failure and failing on locked-file renames on Windows and network filesystems
- Fixed background workers crash-looping when a client resets its connection to the background service
- Fixed `claude agents --effort ultracode` not reaching dispatched sessions; the value was silently dropped
- Fixed pressing ← to open the agents view dropping the task tracker when returning to the session
- Fixed the agents dashboard retaining pasted images from abandoned reply drafts after their session was deleted
- Fixed killed background sessions leaving a permanent `git worktree lock` behind; the periodic sweep now releases locks whose owning process is gone
- Fixed SDK MCP servers registered via an `initialize` control request waiting until the next turn to start connecting
- Fixed returning to the agents view from a session leaving overlapping ghost frames with `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1`
- Fixed late-appearing `.claude/*` symlinks not being reconciled into the sandbox deny-write list
- Hardened the Agent tool against indirect prompt injection via content a subagent read
- Improved the Bash/PowerShell tool message when a command hits its timeout and is auto-backgrounded, so the model can distinguish a hang from an explicit background request
- Improved auto mode: the permission classifier now defaults to Sonnet 5 for external sessions, validated on the session's first request and pinned for the session
- Improved the bundled dataviz skill's chart color validation with perceptual OKLab color difference and recalibrated color-blindness thresholds
- Memory writes that leave a MEMORY.md index over its read limit now produce an explicit error instead of silent truncation
- Screen reader mode now announces permission mode changes aloud when cycling modes with Shift+Tab
- The agents footer hint now shows how many background agents are waiting on your input, with a brief color emphasis when the count changes
- Agent view: the session you pressed ← from stays visibly marked even after mouse hover or arrow keys move the selection
- Fable temporarily shows as unavailable in the advisor picker while a server-side issue causing Fable advisor failures is fixed

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.209
```

---

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
