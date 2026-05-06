# 2026-05-06 Fix Local Git Identity Design Review

## Target

- `scripts/run-local-release-automation.sh`

## Proposed Design

- temp clone 作成後、source repo local config を clone local config へ移す
- source of truth は `${REPO_ROOT}` の git local config
- global git config には依存しない
- commit command 自体は変えない

## Why This Layer

- 失敗は verification 後の temp clone handoff に限定される
- promotion script や manifest logic ではない
- one-shot clone local config 追加なら rollback が簡単

## Rollback

- clone local config 設定処理を revert すれば元に戻る
- metadata/package/cache/state への副作用はない
