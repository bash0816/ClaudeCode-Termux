# 2026-04-29 Canonical Repo Bootstrap Implementation Plan

## STEP 3 実装プランレビュー

### 変更対象

- `README.md`
- `.github/workflows/claude-native-version-watch.yml`
- `.github/workflows/npm-package.yml`
- `.github/workflows/promote-verified-candidate.yml`
- `config/claude-native-audited-versions.json`
- `config/claude-termux-release-manifest.json`
- `packages/claude-code/**`
- `scripts/**`
- `docs/20260429_canonical-repo-bootstrap-design-review.md`
- `docs/20260429_canonical-repo-bootstrap-implementation-plan.md`

### 実装手順

1. 旧 public repo の公開対象 source を canonical repo に配置する
2. package 名、manifest URL、path を `claude-code` / `ClaudeCode-Termux` に揃える
3. README に canonical / legacy の役割分担を書く
4. bootstrap 用の設計レビューと実装プランを docs に追加する
5. syntax / manifest / pack dry-run を実行する
6. `feature/*` branch で初回 commit を作成する
7. remote へ push して PR 作成可能な状態にする

### 検証項目

- `node --check scripts/update-release-manifest.js`
- `node --check scripts/promote-verified-version.js`
- `node --check scripts/release-automation-status.js`
- `node --check packages/claude-code/lib/check-updates.js`
- `sh -n packages/claude-code/bin/claude`
- `sh -n packages/claude-code/lib/termux-run-claude-native.sh`
- `sh -n scripts/run-local-release-automation.sh`
- `sh -n scripts/install-local-release-cron.sh`
- `node scripts/update-release-manifest.js`
- `npm pack --dry-run ./packages/claude-code`

### 完了条件

- 新 repo に source, README, workflow, config, package が揃っている
- canonical package 名 `@bash0816/claude-code` が metadata に反映されている
- release manifest が新 repo URL を指している
- 初回 commit を `feature/*` branch に push 済みである
