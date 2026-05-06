# 2026-05-06 Fix Bun stringWidth Result

## Repro

Candidate clone:
- `/data/data/com.termux/files/home/.codex-release-cicd/work/20260506T004224Z/repo`

Failing command before patch:
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.128 sh packages/claude-code/bin/claude auth status`

Observed failure:
- `TypeError: Bun.stringWidth is not a function`

## Patch

- target: `packages/claude-code/lib/termux-run-claude-native.sh`
- change: fake Bun object に `stringWidth` polyfill を追加
- shape:
  - `Intl.Segmenter` があれば grapheme count
  - 無ければ `Array.from(text).length`

## Verification

Patched script mirrored into candidate clone for runtime validation only.

- `sh -n packages/claude-code/lib/termux-run-claude-native.sh`
  - success
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 node packages/claude-code/lib/prepare-native.js 2.1.128`
  - success
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.128 sh packages/claude-code/bin/claude --version`
  - expected `2.1.128 (Claude Code)`
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.128 sh packages/claude-code/bin/claude auth status`
  - success after patch
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.128 sh packages/claude-code/bin/claude update --dry-run`
  - success

- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.126 sh packages/claude-code/bin/claude --version`
  - success
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.126 sh packages/claude-code/bin/claude auth status`
  - success
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.126 sh packages/claude-code/bin/claude update --dry-run`
  - success

## Facts

- `2.1.128` extracted JS has one direct `Bun.stringWidth` call.
- `2.1.126` extracted JS does not have that direct call and keeps fallback-only shape.
- The wrapper-layer polyfill is sufficient to move `auth status` past the crash in the real candidate environment.

## Residual Risk

- width calculation is approximate, not Bun-compatible in full detail
- display alignment drift is still possible even though runtime crash is removed
