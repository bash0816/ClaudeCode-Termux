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

## 推測

- failure は `2.1.126` package 自体ではなく、workflow 内の candidate metadata 更新経路の脆さに寄っている可能性が高い
- inline Node script と `update-release-manifest.js` の間に、JSON file 汚染または branch/checkout 条件差がある
- 原因切り分けのためには、workflow 内の inline mutation を専用 script に寄せて、更新後 JSON を即検証する方が安全

## STEP 2 設計判断

- workflow 内の inline Node mutation をやめ、専用 script に切り出す
- 専用 script は次を 1 つの責務で行う
  - target version の metadata 追加
  - package version 更新
  - root/package config 整合性検証
- `update-release-manifest.js` の前に JSON parse check を入れる
- failure 時はどの file が壊れているか分かるよう、diagnostic を増やす
- 今回は schedule を待たず、`workflow_dispatch version=2.1.126` で candidate intake を手動実行する
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
  - workflow は branch/PR を作らず停止
  - local repo 側は feature branch にのみ修正を残す
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
- `Claude Native Version Watch` の `workflow_dispatch version=2.1.126` で candidate branch/PR が作成されること
- `2.1.126` の verified promotion / publish / legacy sync まで到達できること
- 各 stop 条件で後段 workflow が起動しないこと
