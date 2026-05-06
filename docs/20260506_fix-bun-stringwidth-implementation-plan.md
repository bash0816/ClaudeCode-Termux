# 2026-05-06 Fix Bun stringWidth Implementation Plan

## STEP 3

## Files

- `packages/claude-code/lib/termux-run-claude-native.sh`
- `docs/20260506_fix-bun-stringwidth-*.md`

## Implementation

1. Node heredoc 内に `createBunStringWidth()` を追加する
2. `Intl.Segmenter` で grapheme 単位に数える最小 polyfill を実装する
3. fake Bun を
   - `version: '1.1.8'`
   - `stringWidth: createBunStringWidth()`
   に拡張する
4. 既存 Bun restore path を壊さない

## STEP 4 Test Points

- `2.1.128 prepare-native` succeeds
- `2.1.128 claude --version` succeeds
- `2.1.128 claude auth status` no longer throws `Bun.stringWidth`
- `2.1.128 claude update --dry-run` still succeeds
- if possible, rerun local automation path for candidate branch after patch

## Minimal Commands

- `sh -n packages/claude-code/lib/termux-run-claude-native.sh`
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 node packages/claude-code/lib/prepare-native.js 2.1.128`
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.128 sh packages/claude-code/bin/claude --version`
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.128 sh packages/claude-code/bin/claude auth status`
- `env CLAUDE_TERMUX_SKIP_UPDATE_CHECK=1 CLAUDE_TERMUX_CLAUDE_VERSION=2.1.128 sh packages/claude-code/bin/claude update --dry-run`

## Stop Condition

- if `auth status` moves past `Bun.stringWidth` but fails at a new candidate-specific runtime layer, stop and record the new blocker before promotion
