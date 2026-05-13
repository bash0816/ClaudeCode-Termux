# 2026-05-13 Release Self-Heal Implementation Plan

1. `release-automation-status.js` に candidate reconcile を追加する
2. stale `promotion_dispatched` を fixed lock にせず、branch/PR/main 状態から再評価する
3. `run-local-release-automation.sh` の local `codex exec --full-auto` prompt を拡張する
   - candidate drift self-heal
   - candidate PR merge
   - `dev -> staging`
   - `staging -> main`
   - publish dispatch
   - legacy sync
   を同じ flow で扱えるようにする
4. candidate PR merge 前に
   - mergeable state
   - draft ではない
   - head SHA 一致
   - visible checks success
   を確認する
5. `dev -> staging` / `staging -> main` の version 固有 temp PR promotion を追加する
   - `origin/staging` / `origin/main` 起点 merge を固定
6. `main` 到達後の npm publish workflow dispatch を追加する
   - dispatch 後の run は
     - workflow name
     - event=`workflow_dispatch`
     - head branch=`main`
     - dispatch 後 createdAt
     で特定する
   - run success と npm published version を確認する
7. result JSON に
   - promotion stage
   - merged PR URLs
   - publish dispatch result
   を残す
8. state file に
   - `pending_promotion`
   - `publish_dispatched`
   - `promotion_failed`
   の更新条件を明記どおり反映する

## Verification

- `node --check scripts/release-automation-status.js`
- `sh -n scripts/run-local-release-automation.sh`
- local status JSON diff
- current stuck case `2.1.139` で reconcile が前へ進むこと

## Deliverable

- self-heal / auto-promotion diff
- docs
- reviewer gate
