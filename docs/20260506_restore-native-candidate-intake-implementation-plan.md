# 2026-05-06 Restore Native Candidate Intake Implementation Plan

## Objective

`Claude Native Version Watch` を candidate intake 可能な構成へ戻し、
`2.1.128` 以降を再び拾えるようにする。

## Steps

1. `origin/main` 基準の `check-only` workflow を feature branch で修正する
2. 以下を戻す
   - `workflow_dispatch` は `dev` checkout 固定
   - `permissions.contents=write`
   - `permissions.pull-requests=write`
   - `Skip existing audited version`
   - `Prepare artifact and discover offsets`
   - `update-release-manifest.js`
   - `update-readme-version-guidance.js`
   - candidate branch `automation/native-claude-<version>`
   - best-effort `gh pr create --repo bash0816/ClaudeCode-Termux --base dev --head <candidate_branch>`
3. 実行順を固定する
   - resolve version
   - skip existing audited version
   - prepare artifact/discover offsets
   - add candidate metadata
   - validate updated JSON
   - update manifest
   - update README guidance
   - check duplicate branch / PR
   - commit candidate metadata
   - push candidate branch
   - open candidate PR best-effort
4. 明示的に残す制約
   - publish しない
   - promotion しない
   - legacy sync しない
   - PR create 失敗でも branch push まで成功していれば intake 失敗にしない
5. workflow YAML の構文確認
6. `GPT-5.5` reviewer で STEP 8
7. `dev` へ上げる
8. その後 `workflow_dispatch` で `@latest` を手動実行し、
   `2.1.128` candidate intake を確認する

## Success Criteria

- workflow が `2.1.128` を unknown audited version として失敗させない
- `exists=false` から candidate metadata 更新へ進める
- candidate branch と PR 作成が再び可能

## Non-Goals

- `2.1.128` の verification 完了
- promotion / publish / legacy sync
- local cron shell の挙動変更
