# Local Release Automation Implementation Plan

## 対象ファイル

- `scripts/release-automation-status.js`
- `scripts/run-local-release-automation.sh`
- `scripts/install-local-release-cron.sh`
- `scripts/codex-release-automation-output.schema.json`
- `README.md`

## 実装手順

1. `origin/main` manifest と npm publish 状態を比較する status script を追加する
2. temp worktree を作って `codex exec` を呼ぶ local wrapper を追加する
3. candidate verify 用 prompt と publish 用 prompt を wrapper に埋め込む
4. structured JSON 出力 schema を追加する
5. `crontab` がある端末向け installer を追加し、ない場合は sample を出す
6. README に local automation 導線を追加する

## テスト観点

- `node --check scripts/release-automation-status.js`
- `sh -n scripts/run-local-release-automation.sh`
- `sh -n scripts/install-local-release-cron.sh`
- `node scripts/release-automation-status.js --json`
- `scripts/run-local-release-automation.sh --dry-run`

## 保留

- 実端末への `crontab` 登録
- merge 後の workflow_dispatch 実運用
