# 2026-05-02 README Sync Automation Implementation Plan

## STEP 3

## 対象

- canonical repo
  - `scripts/update-readme-version-guidance.js`
  - `.github/workflows/claude-native-version-watch.yml`
  - `.github/workflows/promote-verified-candidate.yml`
  - `.github/workflows/npm-package.yml`
- legacy repo
  - `scripts/update-readme-version-guidance.js`
  - `.github/workflows/sync-canonical-metadata.yml`
  - `.github/workflows/npm-package.yml`

## 実装順

1. canonical 用 README sync script を追加する
2. legacy 用 README sync script を追加する
3. canonical workflows に script 実行と commit 対象追加を入れる
4. legacy sync workflow に script 実行と commit 対象追加を入れる
5. canonical npm-package verify に README drift check を入れる
6. legacy npm-package verify に README drift check を入れる
7. 実行ログと diff を確認する

## script 要件

### canonical script

- `status === "termux_verified"` の audited versions だけを semver sort して出す
- root / package README を同時更新する
- 置換対象は見出し単位で限定する
- expected output は `manifest.latest_audited_version` を example に使う
- candidate の `offset_discovered` version は README に出さない
- 置換 marker か安定した section 境界を使い、置換失敗時は hard fail にする

### legacy script

- package version は `packages/cluade-code/package.json` から読む
- default native / latest audited は legacy manifest から読む
- canonical 側から同期される version は `termux_verified` 前提とする
- canonical package 名と repository URL は固定値でよい
- root / package README を同時更新する
- 置換失敗時は hard fail にする

## validation

- `node --check scripts/update-readme-version-guidance.js`
- `node scripts/update-readme-version-guidance.js`
- `git diff -- README.md packages/claude-code/README.md`
- legacy 側でも同等確認
- workflow 側は `git diff --exit-code` で drift fail を確認する
- canonical / legacy の `npm-package.yml` path filter に root/package README を追加する

## review 観点

- 置換範囲が広すぎないか
- metadata / manifest を読んだ値と README 表示が一致するか
- legacy で package version と native version が混同されていないか
- candidate / promotion / sync のどの経路でも README が更新されるか
- README-only 修正でも drift check workflow が起動するか

## 完了条件

- canonical metadata 更新 workflow が README 同期込みで commit する
- legacy sync workflow が README 同期込みで commit する
- npm-package verify が README drift を検出できる
- 手修正無しで README stale を再現しなくなる
