# 2026-05-02 README Sync Automation Design Review

## STEP 2

## 背景

- canonical README は audited version を固定列挙しており、`2.1.123` と `2.1.126` 追加時に stale になった
- legacy README も bridge package version と synced metadata version がずれやすい
- 今回は手修正で直したが、今後も metadata / manifest 更新のたびに同じズレが起こり得る

## 事実

- canonical の source of truth は次
  - `config/claude-native-audited-versions.json`
  - `config/claude-termux-release-manifest.json`
- legacy の source of truth は次
  - `packages/cluade-code/package.json`
  - `config/claude-termux-release-manifest.json`
  - `config/claude-native-audited-versions.json`
- canonical 側では candidate intake と verified promotion の workflow が metadata / manifest を commit している
- legacy 側では canonical sync workflow が metadata / manifest を commit している

## 問題

- README の version 節が source of truth から独立している
- workflow は metadata / manifest 更新を自動化しているが、README 更新は人手依存
- その結果、release は正しく進んでも user-facing docs が古くなる

## 方針候補

### 案 A: README の version 節を script で再生成し、workflow で必ず実行する

- 利点
  - source of truth と docs を機械的に同期できる
  - candidate intake / promotion / legacy sync の既存 commit に README 変更を同梱できる
  - `npm-package.yml` で drift check をかけられる
- 欠点
  - README 構造に依存する置換 script が必要

### 案 B: README から固定 version 列挙を外し、metadata file 参照だけにする

- 利点
  - stale 化しにくい
  - automation 実装が軽い
- 欠点
  - end-user README として不親切
  - install / expected output の quick example が消える

## 判断

- 採用は `案 A`
- fixed list は残すが、README 上でも `quick examples` とし、source of truth は metadata / manifest と明記する
- legacy README は package version と synced metadata version を分離して出す

## 設計

### canonical

- script が次を metadata / manifest から再生成する
  - root `README.md`
  - `packages/claude-code/README.md`
- user-facing canonical version list は `status === "termux_verified"` の version だけを使う
- `offset_discovered` の candidate は README の audited examples / supported list / override examples に出さない
- 再生成対象
  - specific audited version examples
  - supported version list
  - expected output example
  - development override examples

### legacy

- legacy repo に別 script を置く
- script が次を package metadata / manifest から再生成する
  - root `README.md`
  - `packages/cluade-code/README.md`
- legacy sync 対象 version も `status === "termux_verified"` 前提で扱う
- 再生成対象
  - final bridge package version
  - default native version
  - latest audited version in synced metadata
  - canonical install guidance
  - expected output example

## CI/CD 組み込み点

### canonical

- `.github/workflows/claude-native-version-watch.yml`
  - `update-release-manifest.js` 後に README sync script を実行
  - commit 対象に README を追加
- `.github/workflows/promote-verified-candidate.yml`
  - `update-release-manifest.js` 後に README sync script を実行
  - commit 対象に README を追加
- `.github/workflows/npm-package.yml`
  - syntax check に README sync script の `node --check`
  - verify step で script 実行後 `git diff --exit-code` を取り、README drift を fail にする
  - path filter に root `README.md` と `packages/claude-code/README.md` を追加する

### legacy

- `.github/workflows/sync-canonical-metadata.yml`
  - metadata / manifest mirror 後に README sync script を実行
  - commit 対象に README を追加
- legacy `npm-package.yml` にも同じ drift check を必須で入れる
- path filter に root `README.md` と `packages/cluade-code/README.md` を追加する

## 期待結果

- metadata / manifest を更新する automation が、そのまま README の version 節も同期する
- user-facing README が audited state とずれない
- 手修正忘れは CI で検出できる

## リスク

- README の見出しや文言を大きく変えると script の置換条件が壊れる
- そのため section 単位の明示 marker か、見出し境界ベースの安定した置換が必要
- 置換失敗時は hard fail にして silent drift を避ける

## Go 条件

- canonical / legacy の source of truth が明確
- workflow に組み込む位置が明確
- drift check が publish 前に効く
- legacy bridge package と synced metadata version の表現が混同されない
