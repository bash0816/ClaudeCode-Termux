# Candidate Intake Failure Design Review

## STEP 1 計画固定

- 対象: `ClaudeCode-Termux` の `Claude Native Version Watch`
- 目的: upstream `2.1.126` の candidate intake が CI/CD で失敗している問題を修正する
- 範囲:
  - failure 再現条件の固定
  - candidate metadata 更新フローの hardening
  - workflow の failure diagnostics 強化
  - 今回に限り `workflow_dispatch` を用いた `2.1.126` の candidate intake から release までの手動実行

## 事実

- 2026-05-02 時点で upstream npm `latest` は `2.1.126`
- `Claude Native Version Watch` の schedule run は直近 2 回とも失敗している
- 失敗 run の log では `@anthropic-ai/claude-code-linux-arm64@2.1.126` の取得までは成功している
- 失敗箇所は `node scripts/update-release-manifest.js`
- error は `SyntaxError: Unexpected non-whitespace character after JSON ...`
- ローカルで `origin/main` 相当 worktree に対し、workflow と同じ
  - `termux-prepare-claude-native-version.js`
  - inline metadata 追記
  - `update-release-manifest.js`
  を実行した再現では成功した
- 修正後の `workflow_dispatch version=2.1.126` では metadata 更新と candidate branch push までは成功した
- 同 run は `gh pr create` で失敗した
- failure message は `GitHub Actions is not permitted to create or approve pull requests (createPullRequest)` だった
- その後の再実行では `Commit candidate metadata` が remote `automation/native-claude-2.1.126` への `--force-with-lease` push で失敗した
- failure message は `stale info` だった

## 推測

- failure は `2.1.126` package 自体ではなく、workflow 内の candidate metadata 更新経路の脆さに寄っている可能性が高い
- inline Node script と `update-release-manifest.js` の間に、JSON file 汚染または branch/checkout 条件差がある
- 原因切り分けのためには、workflow 内の inline mutation を専用 script に寄せて、更新後 JSON を即検証する方が安全
- candidate intake の後段 failure は metadata 更新ではなく、GitHub Actions の PR 作成権限に寄っている
- 今回の通し実行を止めないためには、candidate branch push を CI/CD の成功条件に含め、PR 作成は local `gh` fallback を許容する方が現実的
- 再実行 failure は candidate automation branch の lease 競合に寄っている
- candidate automation branch は human branch ではないため、同一 version の再実行では `--force` 上書きに寄せる方が実運用に合う

## STEP 2 設計判断

- workflow 内の inline Node mutation をやめ、専用 script に切り出す
- 専用 script は次を 1 つの責務で行う
  - target version の metadata 追加
  - package version 更新
  - root/package config 整合性検証
- `update-release-manifest.js` の前に JSON parse check を入れる
- failure 時はどの file が壊れているか分かるよう、diagnostic を増やす
- 今回は schedule を待たず、`workflow_dispatch version=2.1.126` で candidate intake を手動実行する
- candidate intake workflow の成功条件は
  - metadata 更新成功
  - candidate branch push 成功
  とし、PR 作成は best-effort に落とす
- PR 作成に失敗した場合は local `gh pr create` を手動 fallback とする
- candidate automation branch は再実行時の上書きを許容し、push は `--force-with-lease` ではなく `--force` にする
- candidate intake 成功後は既存 gate に従い
  - Termux verification
  - verified promotion
  - canonical publish
  - legacy sync
  まで進める

### 新規 script interface

- 追加候補: `scripts/add-candidate-metadata.js`
- 想定呼び出し:
  - `node scripts/add-candidate-metadata.js 2.1.126 offsets.json`
- 入力:
  - arg1: version
  - arg2: `termux-prepare-claude-native-version.js --json` の結果 file
- 出力:
  - success 時は更新した file path と version を JSON で stdout
  - failure 時はどの file の parse/update に失敗したかを stderr に出し、exit 1

## Stop / Rollback

- candidate intake failure:
  - metadata 更新または branch push に失敗した場合のみ workflow failure とする
  - local repo 側は feature branch にのみ修正を残す
- candidate branch push 成功後に PR 作成だけ失敗:
  - workflow は diagnostics を残して success で終える
  - candidate branch は維持
  - local `gh pr create` で次段へ進める
- candidate branch push が `stale info` で失敗:
  - automation branch の再実行衝突とみなし、workflow 実装を `--force` 上書きに修正する
  - human branch への影響は無い
- candidate PR 作成後に Termux verification 失敗:
  - candidate PR は close
  - target version は `offset_discovered` のまま据え置き
  - audited promotion / publish / legacy sync は開始しない
- verified promotion failure:
  - `feature -> dev` で停止
  - `dev/staging/main` には上げない
- canonical publish failure:
  - `main` metadata は残す
  - legacy sync は開始しない
- legacy sync failure:
  - canonical publish 済みは維持
  - legacy repo の sync PR/branch だけ再実行対象にする

## STEP 4 再現条件・テスト観点

- `node scripts/termux-prepare-claude-native-version.js @2.1.126 --json`
- candidate metadata 追加 script の単体実行
- `node scripts/update-release-manifest.js`
- root/package config の JSON parse check
- `npm pack --dry-run ./packages/claude-code`
- `Claude Native Version Watch` の `workflow_dispatch version=2.1.126` で candidate branch が作成されること
- GitHub Actions から PR が作れない場合、local `gh pr create` fallback で candidate PR を起こせること
- `2.1.126` の verified promotion / publish / legacy sync まで到達できること
- 各 stop 条件で後段 workflow が起動しないこと
