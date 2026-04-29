# Local Release Automation Design Review

## 対象

- GitHub Actions の candidate 生成後に、この Termux 端末で Codex を自動起動する導線
- candidate 検証成功時の promotion workflow dispatch
- `main` の audited version が npm 公開版より進んだ時の publish workflow dispatch

## 事実

- upstream intake は `.github/workflows/claude-native-version-watch.yml` が担当する
- verified promotion は `.github/workflows/promote-verified-candidate.yml` が担当する
- npm publish は `.github/workflows/npm-package.yml` が担当する
- ローカルでは `codex exec` を non-interactive で起動できる
- `gh` は認証済みで、workflow_dispatch を叩ける
- この端末では `crontab` / `crond` の存在が未保証なので、cron 登録処理は script 化し、未導入環境では sample を出す

## 論点

- candidate がある時だけ Codex を起動したい
- publish が必要な時だけ workflow_dispatch を叩きたい
- ユーザーの通常 worktree を汚さずに自動化したい
- 再実行時に promotion PR や publish を重複起動しにくくしたい

## 採用案

- repo に状態判定 script を置き、`latest_candidate_version`, `latest_audited_version`, npm 公開 version を比較する
- daily cron は shell wrapper 1 本だけを叩く
- wrapper は毎回専用 temp worktree を作り、そこから `codex exec` を headless 起動する
- candidate > audited の時だけ Codex verification prompt を実行する
- audited > npm published の時だけ Codex publish prompt を実行する
- workflow 実行自体は `gh workflow run` を Codex から呼ばせる
- no-op の時は Codex を起動せずログだけ残す

## Go / No-Go

- Go:
  - candidate 不在時は何もしない
  - publish 不要時は何もしない
  - temp worktree に閉じる
  - Codex の最終出力は JSON に固定して、cron 側で機械的に保存できる
- No-Go:
  - 通常 worktree を直接変更する
  - candidate 未検証なのに publish へ進む
  - main manifest と npm publish 条件の比較なしで publish を叩く

## 次アクション

1. release 状態判定 script を追加する
2. Codex headless wrapper を追加する
3. crontab installer / sample を追加する
4. README と skill に運用導線を追記する
