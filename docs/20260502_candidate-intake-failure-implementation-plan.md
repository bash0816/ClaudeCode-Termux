# Candidate Intake Failure Implementation Plan

## STEP 3 実装プラン

1. candidate metadata 更新用の専用 script を追加する
   - name: `scripts/add-candidate-metadata.js`
   - interface: `node scripts/add-candidate-metadata.js <version> <offset-json-file>`
2. workflow から inline Node mutation を除去し、新 script を呼ぶ
3. 新 script で
   - root config 更新
   - package config 更新
   - package version 更新
   - JSON parse check
   - root/package version key 一致確認
   を行う
4. workflow に diagnostic step を追加し、failure 時に
   - target version
   - updated file paths
   - JSON parse check
   を残す
5. local で `2.1.126` candidate intake を再現し、script / manifest 更新が通ることを確認する
6. `workflow_dispatch` で `2.1.126` candidate intake を再実行する
7. candidate branch/PR 作成後、Termux verification を通して `2.1.126` を verified promotion する
8. canonical `dev -> staging -> main` と canonical publish を進める
9. legacy sync 完了まで確認する

## 停止条件

- `add-candidate-metadata.js` が失敗したら candidate intake workflow は exit 1 で停止する
- candidate PR 作成後に Termux verification が失敗したら、その版では verified promotion を実行しない
- canonical publish が失敗したら legacy sync を dispatch しない
- legacy sync が失敗したら canonical publish は rollback せず、legacy sync だけ再試行対象にする

## 対象ファイル

- `.github/workflows/claude-native-version-watch.yml`
- `scripts/update-release-manifest.js`
- `scripts/termux-prepare-claude-native-version.js`
- `scripts/add-candidate-metadata.js`

## 完了条件

- local 再現で `2.1.126` candidate metadata 更新が通る
- `Claude Native Version Watch` の `workflow_dispatch` が success
- `automation/native-claude-2.1.126` branch か candidate PR が作成される
- canonical package `@bash0816/claude-code` が `2.1.126` になる
- legacy metadata が `2.1.126` へ同期される
- stop 条件で後段 workflow が進まないことを確認できる
