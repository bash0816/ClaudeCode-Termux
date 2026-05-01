# Local Codex Gated Release Implementation Plan

## STEP 3 実装プラン

1. `scripts/release-automation-status.js` を拡張して、少なくとも次を返せるようにする
   - `needs_verification`
   - `needs_legacy_sync`
   - `latest_legacy_synced_version`
   - `local_verification_locked`
   - `local_state_file`
2. local state file を導入して、candidate ごとの
   - `verification_in_progress`
   - `verification_failed`
   - `promotion_dispatched`
   を記録する
3. `scripts/run-local-release-automation.sh` を拡張して、candidate verification 成功後に canonical verified promotion workflow だけを dispatch する
4. `scripts/run-local-release-automation.sh` から publish dispatch 分岐を削除する
5. canonical repo に branch promotion workflow を追加する
   - `promote-feature-to-dev.yml`
   - `promote-dev-to-staging.yml`
   - `promote-staging-to-main.yml`
6. canonical repo の candidate intake / verified promotion workflow を `dev` 基準へ変更する
7. canonical repo に publish follow-up workflow を追加する
   - `publish-audited-release.yml`
   - canonical `main` の audited version を npm publish
8. legacy sync 用 workflow を canonical 側または legacy 側に追加する
   - canonical publish 成功後に dispatch
   - legacy metadata branch / PR を作る
9. legacy repo にも branch promotion workflow を追加する
   - `feature -> dev`
   - `dev -> staging`
   - `staging -> main`
10. `scripts/install-local-release-cron.sh` に
   - `--dry-run`
   - backup 出力
   - canonical path への明示切替
   を追加する
11. local automation の dry-run と end-to-end dispatch path を検証する
12. 最後に cron を canonical repo へ切り替える

## 実装方針

### local script 側

- 直接 `git push` や `gh pr merge` はしない
- verified promotion workflow dispatch のみを行う
- local result JSON に
  - verification 結果
  - dispatch 成否
  - dispatch 済み candidate version
  - local state file path
  を残す

### workflow 側

- 1 workflow 1責務に分ける
- merge 先 branch を inputs で固定できるようにする
- 各段で verify job を再実行し、成功したときだけ次 workflow を起動する
- canonical publish は `staging -> main` 完了後の follow-up workflow だけが起動する

### legacy 側

- package publish は新規には行わない
- metadata / manifest 同期だけを自動化する
- legacy package version は bridge version のまま維持する

## 対象ファイル

- `scripts/run-local-release-automation.sh`
- `scripts/release-automation-status.js`
- `scripts/install-local-release-cron.sh`
- `.github/workflows/claude-native-version-watch.yml`
- `.github/workflows/promote-verified-candidate.yml`
- `.github/workflows/npm-package.yml`
- `.github/workflows/publish-audited-release.yml`
- `.github/workflows/promote-feature-to-dev.yml`
- `.github/workflows/promote-dev-to-staging.yml`
- `.github/workflows/promote-staging-to-main.yml`
- 新規 workflow 複数
- legacy repo の sync / promotion workflows

## 完了条件

- cron が canonical repo の local automation を起動する
- candidate 検出後、local Codex が自動で verification し、成功時に canonical promotion workflow を dispatch する
- local Codex は publish workflow を dispatch しない
- canonical `main` までの昇格が workflow で追跡できる
- canonical publish 成功後にだけ legacy sync が走る
- 既存利用者は legacy package から canonical package へ安全に移行できる
- 同一 candidate に対する cron の多重検証が local state で抑止される

## 実装順

1. local status / runner 拡張
2. candidate / verified workflow の `dev` 基準化
3. canonical branch promotion workflows
4. canonical publish follow-up
5. legacy sync automation
6. cron installer hardening
7. end-to-end dry-run
8. 最後に cron 切り替え
