# claude-code 2.1.161-3 実機検証チェックリスト

作成日: 2026-06-01

## 目的

`@bash0816/claude-code@2.1.161-3` の candidate を Termux 実機で検証し、
latest 昇格前の前提条件を満たしているか確認する。

配布手順は次の通り。

1. まず `candidate` dist-tag で npm に公開する
2. 実機検証を行う
3. 検証完了後に `latest` へ昇格し、必要なら前回の安定版を `candidate` に戻してタグを入れ替える

主な修正内容: `-p` (print mode) 時の stdin ハング修正
（`node - "$@" <<'NODE'` → 一時ファイル経由 `node "$_helper" "$@" </dev/null`）

## 検証対象

- `TARGET_VERSION`: `2.1.161-3`
- `PREV_STABLE_VERSION`: `2.1.157`
- パッケージ名: `@bash0816/claude-code`
- 実行コマンド: `claude`
- 検証端末: Device B

## 事前条件

- [ ] `npm view @bash0816/claude-code@candidate version` で candidate の存在を確認済み（`2.1.161-3` を想定）
- [ ] 実機のネットワークが安定している
- [ ] `claude auth status` で認証済みであること
- [ ] 検証ログの保存先を決めている

## 実行手順

| Step | コマンド | 期待値 | 補足 |
| --- | --- | --- | --- |
| 1. preflight | `npm view @bash0816/claude-code@candidate version` | `2.1.161-3` が返ること | candidate の存在確認 |
| 2. install 前後確認 | `npm list -g @bash0816/claude-code --depth=0` → `npm install -g @bash0816/claude-code@candidate` → `npm list -g @bash0816/claude-code --depth=0` | install 前後で `2.1.161-3` が解決されること | |
| 3. version 確認 | `claude --version` | `2.1.161-3` が出力されること | 起動確認を兼ねる |
| 4. 認証確認 | `claude auth status` | exit code 0 かつ認証状態が確認できること | auth フローが壊れていないこと |
| 5. print mode（修正確認・空 stdin） | `claude -p "hello" </dev/null` | 30秒以内に応答が返り、ハングしないこと | 今回の主要修正の確認 |
| 6. print mode（パイプ入力） | `printf 'こんにちは\n' | claude -p "上記を英訳して"` | 30秒以内に応答が返り、ハングしないこと | パイプ経由の stdin 確認 |
| 7. 通常モード起動確認 | `claude --help` | ヘルプが表示されること | 通常経路が壊れていないこと |
| 8. update dry-run | `npm outdated -g @bash0816/claude-code` | exit code 0 かつ `2.1.159` 行が表示されない、または更新可能の表示のみで実更新が走らないこと | `npm install` / `npm update` / `claude update` は実行しないことで dry-run を担保する |
| 9. rollback 確認 | `npm install -g @bash0816/claude-code@2.1.157` → `npm list -g @bash0816/claude-code --depth=0` → `claude --version` | `2.1.157` に戻り、`npm list -g` でも `2.1.157` が解決されること | rollback の動作確認 |
| 10. rollback 後の print mode | `claude -p "hello" </dev/null` | 2.1.157 でも正常動作すること（旧動作確認） | |

## 合否判定

以下をすべて満たしたら verified 相当とみなす。

- [ ] candidate の存在確認ができる
- [ ] install が成功する
- [ ] install 前後の `npm list -g` で package/version を確認できる
- [ ] `claude --version` が `2.1.159` を返す
- [ ] `claude auth status` が exit code 0
- [ ] `claude -p "hello" </dev/null` が 30秒以内に終了する（ハングなし）
- [ ] `printf '...' | claude -p "..."` がハングせず終了する
- [ ] `claude --help` が正常表示される
- [ ] update dry-run が exit code 0 かつ実更新なし
- [ ] rollback が成功する
- [ ] 証跡が保存されている

## 証跡の保存形式

```md
## claude-code-2.1.159-<date>

- 保存先: `docs/build/verification-records/claude-code-2.1.159-<date>.md`
- 検証日:
- Device B Termux version:
- Android version:
- Node version:
- npm version:

| Step | Command | 期待値 | 実出力 | pass or fail | Notes |
| --- | --- | --- | --- | --- | --- |
| 1. preflight | `npm view @bash0816/claude-code@2.1.159 version` | `2.1.159` が返ること | ... | pass/fail | exit code: ... |
| 2. install 前後確認 | `npm list -g @bash0816/claude-code --depth=0` → `npm install -g @bash0816/claude-code@2.1.159` → `npm list -g @bash0816/claude-code --depth=0` | install 前後で `2.1.159` が解決されること | ... | pass/fail | exit code: ... |
| 3. version 確認 | `claude --version` | `2.1.159` が出力されること | ... | pass/fail | exit code: ... |
| 4. 認証確認 | `claude auth status` | exit code 0 かつ認証状態が確認できること | ... | pass/fail | exit code: ... |
| 5. print mode（修正確認・空 stdin） | `claude -p "hello" </dev/null` | 30秒以内に応答が返り、ハングしないこと | ... | pass/fail | exit code: ... |
| 6. print mode（パイプ入力） | `printf 'こんにちは\n' | claude -p "上記を英訳して"` | 30秒以内に応答が返り、ハングしないこと | ... | pass/fail | exit code: ... |
| 7. 通常モード起動確認 | `claude --help` | ヘルプが表示されること | ... | pass/fail | exit code: ... |
| 8. update dry-run | `npm outdated -g @bash0816/claude-code` | exit code 0 かつ `2.1.159` 行が表示されない、または更新可能の表示のみで実更新が走らないこと | ... | pass/fail | exit code: ... / 実更新なしを確認 |
| 9. rollback 確認 | `npm install -g @bash0816/claude-code@2.1.157` → `npm list -g @bash0816/claude-code --depth=0` → `claude --version` | `2.1.157` に戻り、`npm list -g` でも `2.1.157` が解決されること | ... | pass/fail | exit code: ... |
| 10. rollback 後の print mode | `claude -p "hello" </dev/null` | 2.1.157 でも正常動作すること（旧動作確認） | ... | pass/fail | exit code: ... |
```

## 緊急時: dist-tag 修正手順（管理者のみ）

この手順は検証段階では実行しない。`dist-tag` の誤昇格や運用事故が起きた後に、管理者が復旧目的でのみ使う。

前提:

- 事前に `npm dist-tag ls @bash0816/claude-code` で現在の tag を確認する
- その確認結果を記録に残す
- 既存の tag 状態を理解しないまま `npm dist-tag add` を実行しない

```sh
npm dist-tag ls @bash0816/claude-code
npm dist-tag add @bash0816/claude-code@<new_version> latest
npm dist-tag add @bash0816/claude-code@<previous_latest> candidate
```

`latest` を動かしたら、`candidate` も前回の安定版に戻して役割を入れ替える。
