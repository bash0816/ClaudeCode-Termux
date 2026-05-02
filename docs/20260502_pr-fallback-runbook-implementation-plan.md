# PR Fallback Runbook Implementation Plan

## STEP 3 実装プラン

1. `docs/` に PR fallback 専用 runbook を追加する
2. canonical / legacy の 7 パターンをそれぞれ明記する
3. 各パターンに以下を固定する
   - 事前条件
   - branch existence check
   - `gh pr create` 例
   - merge 後の確認対象 workflow
4. `2.1.126` で実際に使った PR 番号と run 種別を記録する
5. 「いつ fallback してはいけないか」の停止条件も併記する
6. 最後に reviewer に runbook の妥当性を確認して閉じる

## 対象ファイル

- `docs/20260502_pr-fallback-runbook-design-review.md`
- `docs/20260502_pr-fallback-runbook-implementation-plan.md`
- `docs/20260502_pr-fallback-runbook.md`

## runbook で固定する fallback 一覧

1. canonical candidate PR
2. canonical promotion PR
3. canonical `dev -> staging`
4. canonical `staging -> main`
5. legacy sync PR
6. legacy `dev -> staging`
7. legacy `staging -> main`

## 完了条件

- 次回 `createPullRequest` failure 時に、runbook だけで同じ復旧手順を辿れる
- canonical / legacy のどこで local fallback するかが曖昧でない
- branch 未生成や verification 未完了など、fallback 禁止条件が明記されている
