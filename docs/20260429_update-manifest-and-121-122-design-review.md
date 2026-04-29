# Update Manifest And 121-122 Prep Design Review

## 対象

- public repo の配布導線
- `claude` 起動時 / `claude update` 実行時の更新確認
- `2.1.121` / `2.1.122` の candidate metadata 準備

## 事実

- 現在の npm package は `@bash0816/cluade-code@2.1.119`
- `claude update` は `npm install -g @bash0816/cluade-code@latest` を直接実行する
- upstream 自動更新は wrapper 側で抑止している
- public repo では `2.1.118` / `2.1.119` が stable 扱い
- `origin/automation/native-claude-2.1.121` は存在し、`2.1.121` は `offset_discovered`
- `2.1.122` は公式 upstream に存在するが、この repo にはまだ metadata がない

## 論点

- どこを update 判定の正にするか
- 監査済みでない version を通知対象や更新対象に含めるか
- 起動を遅くしすぎずに GitHub 上の状態を見に行けるか
- `121` / `122` を main 安定版へ上げずに準備だけ進められるか

## 比較

### 1. npm `latest` を正にする案

- 利点: 実装が単純
- 欠点: publish 前後のズレを吸収できない
- 欠点: `offset_discovered` と stable を分けて扱えない

### 2. GitHub manifest を正にする案

- 利点: `latest_audited_version` と `latest_candidate_version` を分離できる
- 利点: update 対象を「監査済みかつ配布許可済み」に限定できる
- 利点: `121` / `122` の候補準備を進めても、配布対象は `119` のまま維持できる
- 欠点: manifest 更新の仕組みが別途必要

## 採用案

- GitHub raw の release manifest を update 判定の正にする
- manifest には最低限次を持たせる
  - `latest_audited_version`
  - `latest_candidate_version`
  - `previous_stable_version`
  - `package_name`
  - `manifest_url`
- `claude` 起動時は manifest を短 timeout で確認し、新しい `latest_audited_version` がある場合のみ通知する
- `claude update` は GitHub manifest を再確認し、`@latest` ではなく `@bash0816/cluade-code@<latest_audited_version>` を実行する
- `2.1.121` / `2.1.122` は metadata 上は `offset_discovered` で追加し、manifest の `latest_candidate_version` に反映する
- `latest_audited_version` は stable 扱いの最大 version に固定する

## Go / No-Go

- Go:
  - manifest fetch 失敗時に起動を止めない
  - `claude update` が manifest 経由でも既存 install path を壊さない
  - `121` / `122` が stable update 対象にならない
- No-Go:
  - network failure で起動が常時失敗する
  - candidate version が stable update 対象へ混入する

## 次アクション

1. release manifest 生成 script を追加する
2. workflow で metadata 更新時に manifest も更新する
3. package に update-check helper を追加する
4. `bin/claude` を manifest-aware にする
5. `2.1.121` / `2.1.122` metadata を追加する
