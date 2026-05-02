# PR Fallback Runbook Design Review

## STEP 1 計画固定

- 対象: `ClaudeCode-Termux` / `CluadeCode-Termux` release automation の `createPullRequest` fallback
- 目的: GitHub Actions が PR を自動作成できない場合でも、同じ手順で安全に後段を継続できる runbook を固定する
- 範囲:
  - canonical candidate PR
  - canonical promotion PR
  - canonical `dev -> staging`
  - canonical `staging -> main`
  - legacy sync PR
  - legacy `dev -> staging`
  - legacy `staging -> main`

## 事実

- 今回の `2.1.126` では、GitHub Actions からの PR 作成がすべて同じ失敗で止まった
- failure message は `GitHub Actions is not permitted to create or approve pull requests (createPullRequest)` だった
- 一方で各 workflow は branch push や publish までは成功していた
- local `gh pr create` fallback に切り替えることで、canonical / legacy ともに `main` まで進められた
- 今回の fallback は以下で実証済み
  - canonical candidate PR `#10`
  - canonical promotion PR `#12`
  - canonical `dev -> staging` PR `#13`
  - canonical `staging -> main` PR `#14`
  - legacy sync PR `#15`
  - legacy `dev -> staging` PR `#16`
  - legacy `staging -> main` PR `#17`

## 推測

- 失敗は release logic ではなく GitHub token 権限に寄っている
- そのため、当面の安定運用では「workflow は branch 生成まで」「PR 作成は local fallback 可」と切り分けるのが合理的
- token 再設計より先に runbook を固定した方が、次回運用コストを即座に下げられる

## STEP 2 設計判断

### 基本方針

- GitHub Actions は branch / publish / metadata 更新までを正とする
- PR 作成が失敗した場合は local `gh pr create` を正規 fallback とする
- fallback は branch が実在し、前段 workflow が success のときだけ実行する
- fallback 後の merge は従来どおり `feature/* -> dev -> staging -> main` を守る

### runbook に含める項目

1. どの workflow failure が fallback 対象か
2. branch が生成済みかの確認方法
3. 実行すべき `gh pr create` コマンド
4. merge 後に確認すべき follow-up workflow
5. local fallback では進めない停止条件

### 停止条件

- branch push が失敗している場合は PR fallback に進まない
- local verification が未完了の version は promotion PR を作らない
- canonical publish が未完了なら legacy sync に進まない
- `main` へ直接 push しない

## STEP 4 再現条件・テスト観点

- `createPullRequest` failure 後に branch が remote に存在すること
- local fallback PR 作成後に merge できること
- merge 後の `Npm Package` / `Publish Audited Release` / legacy sync が続行すること
- canonical / legacy の `main` manifest が期待 version に揃うこと
- npm 公開 version が canonical 側で期待 version に上がること

## 設計結論

- `createPullRequest` failure は token 起因の運用上の問題として扱う
- 当面の最適解は別 token 導入より先に runbook 化
- runbook は今回実証した `2.1.126` の実コマンドを基に固定する
