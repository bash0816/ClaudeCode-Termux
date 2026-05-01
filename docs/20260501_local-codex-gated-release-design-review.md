# Local Codex Gated Release Design Review

## STEP 1 計画固定

- 対象: `ClaudeCode-Termux` canonical release automation
- 目的: この端末の `crontab` から `codex exec` を自動起動し、Termux 実機検証だけを local で実行し、その後の promotion / publish / legacy sync を GitHub Actions 側へ戻す
- 範囲:
  - candidate intake 後の local verification gate
  - branch promotion automation
  - canonical npm publish automation
  - legacy metadata sync automation

## 事実

- 現在の cron 登録は legacy repo の script を叩いている  
  `30 9 * * * /bin/sh /data/data/com.termux/files/home/CluadeCode-Termux-public/scripts/run-local-release-automation.sh ...`
- canonical repo には local follow-up automation script がある  
  `scripts/run-local-release-automation.sh`
- canonical repo には candidate intake workflow がある  
  `.github/workflows/claude-native-version-watch.yml`
- canonical repo には verified promotion workflow がある  
  `.github/workflows/promote-verified-candidate.yml`
- canonical repo には npm publish workflow がある  
  `.github/workflows/npm-package.yml`
- 現在の local automation は
  - candidate verification が必要か
  - publish が必要か
  の 2 モードしか持たない
- 現在の GitHub Actions は `feature/* -> dev -> staging -> main` を自動昇格しない
- 現在の legacy sync は別 repo に対して手動で PR / merge している

## 推測

- 既存構成を最大活用するなら、local Codex は「実機でしかできない verification gate」に責務を限定した方がよい
- branch promotion と publish と legacy sync は GitHub Actions 側に戻した方がログが一元化される
- local script から直接 `git push` や `gh pr merge` を多用するより、workflow dispatch を段階的に投げる方が rollback しやすい
- cron の重複実行は避けられないので、candidate verification には local idempotency state が必要

## STEP 2 設計判断

### 正規フロー

1. GitHub Actions が upstream candidate を検出する
2. candidate metadata branch / PR を `dev` 向けに自動作成する
3. この端末の `cron` が canonical repo の `run-local-release-automation.sh` を起動する
4. local status script が
   - candidate version
   - published canonical version
   - legacy main synced version
   - local verification state
   を集約して mode を決める
5. local Codex が candidate version を実機検証する
6. 検証成功時のみ GitHub Actions の verified promotion workflow を `dev` 向けに dispatch する
7. GitHub Actions が verified promotion branch を作成し、`feature -> dev` PR を開く
8. `dev` 反映後の workflow が `dev -> staging` PR を作る
9. `staging` 反映後の workflow が `staging -> main` PR を作る
10. canonical `main` 更新後の workflow が canonical publish workflow を dispatch する
11. canonical publish 成功後の workflow が legacy sync workflow を dispatch する
12. legacy repo でも `feature -> dev -> staging -> main` を順に昇格する

### local Codex の責務

- candidate version の Termux 実機 verification
- 失敗時の停止と結果記録
- 成功時の verified promotion workflow dispatch
- publish や legacy sync は行わない

### GitHub Actions の責務

- metadata candidate branch / PR 作成
- verified metadata promotion branch / PR 作成
- branch promotion PR 作成
- canonical npm publish
- legacy sync branch / PR 作成

### Source Of Truth

- candidate / audited state:
  - canonical repo の各 branch manifest
- publish state:
  - npm registry の `@bash0816/claude-code`
- legacy sync state:
  - legacy repo `origin/main:config/claude-termux-release-manifest.json`
- local verification idempotency state:
  - `${HOME}/.codex-release-cicd/state/canonical-release-state.json`

### 停止条件

- local verification のどれか 1 つでも失敗したら promotion を dispatch しない
- local state に `verification_in_progress` または `promotion_dispatched_for_candidate` がある candidate は再検証しない
- canonical `dev/staging/main` のどこかで verify workflow が落ちたら次段 promotion を作らない
- canonical publish が失敗したら legacy sync を開始しない

## STEP 4 再現条件・テスト観点

- cron が canonical repo の script を叩くこと
- `release-automation-status.js --json` が
  - `needs_verification`
  - `needs_publish`
  - `needs_legacy_sync`
  - `local_verification_locked`
  を判定できること
- local Codex が candidate verification 成功時だけ verified promotion workflow を dispatch すること
- local Codex が publish workflow を dispatch しないこと
- `feature -> dev -> staging -> main` の PR 生成が workflow で段階的に行えること
- canonical publish 成功後にだけ legacy sync workflow が動くこと
- 同じ candidate で cron を複数回回しても verification が多重起動しないこと

## 主要リスク

- cron が legacy repo の script を叩いたままだと canonical automation が始まらない
- local Codex が `main` 以外を clone して誤判定すると publish 条件が崩れる
- branch promotion を一気に自動 merge すると、途中検証失敗時の停止点が分かりにくくなる
- legacy sync を publish 前に走らせると、既存利用者が未公開 canonical version を参照する危険がある
- local state が壊れると verification lock が残るので、手動解除手順が必要

## Rollback

- local verification lock は state file を削除して解除する
- candidate PR / promotion PR は該当 branch を close して再実行する
- publish 失敗時は canonical `main` を維持したまま legacy sync を止める
- legacy sync 失敗時は canonical publish 済みを維持し、legacy repo だけ再同期する

## 設計結論

- local Codex は verification gate に限定する
- cron の正規起動先は canonical repo に切り替えるが、切り替えは runner/workflow 完成後に行う
- publish の起動主体は GitHub Actions follow-up workflow に一本化する
- その後段の promotion / publish / legacy sync は GitHub Actions の多段 workflow へ戻す
- legacy repo は canonical publish 成功後に同期する従系として扱う
