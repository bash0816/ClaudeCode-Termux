# 2026-05-13 Release Self-Heal Design Review

## Proposed Design

release automation に 2 つの self-heal line を追加する。

### 1. State Reconciliation

`release-automation-status.js` に candidate reconcile を追加する。

対象:

- state file
- remote candidate branch
- open candidate PR
- `origin/main` / `origin/dev` / `origin/staging`

方針:

1. `promotion_dispatched` でも固定 lock にしない
2. 次を毎回再評価する
   - candidate branch exists
   - candidate PR open / merged / absent
   - `origin/main` audited version
3. `promotion_dispatched` は
   - branch / PR / branch promotion が未完なら `pending_promotion`
   - `main` がその version 以上なら complete
   と扱う
4. hard-stop 条件
   - merge conflict
   - PR unmergeable
   - required checks failure
   - workflow dispatch failure
   を state/result に残す

### 2. Auto Promotion Line

`run-local-release-automation.sh` が起動する local `codex exec --full-auto` の prompt を拡張し、
canonical promotion reconcile を同じ run の中で続行できるようにする。

順序:

1. candidate branch verification を再実行できるよう stale lock を外す
2. candidate PR `automation/native-claude-<version> -> dev` を確認
3. README drift など sync-only drift があれば candidate branch 上で self-heal して push
4. open candidate PR が mergeable かつ visible checks success なら merge
5. `dev -> staging` PR を create / merge
6. `staging -> main` PR を create / merge
7. `main` が target version に達したら `npm-package.yml` を dispatch
8. publish 完了後に legacy sync を続行

merge 条件:

1. PR state is `OPEN`
2. `mergeStateStatus` is mergeable family
3. visible checks are completed and have no failure
4. conflict / draft / unknown なら hard-stop
5. head SHA は fetch 後の current remote head と一致していること

### Branch Promotion Rule

canonical 側でも legacy sync と同じく、
promotion branch を version 固有 temp branch で切る。

例:

- `automation/promote-dev-to-staging-2.1.139`
- `automation/promote-staging-to-main-2.1.139`

理由:

- 過去 PR の再利用誤判定を避ける
- 各 version の promotion を識別可能にする

具体手順:

1. `dev -> staging`
   - temp branch は `origin/staging` から切る
   - `origin/dev` を merge
   - PR head=temp branch, base=`staging`
2. `staging -> main`
   - temp branch は `origin/main` から切る
   - `origin/staging` を merge
   - PR head=temp branch, base=`main`

### Publish Dispatch Rule

publish は local で `gh workflow run npm-package.yml` を使って dispatch する。

条件:

1. `origin/main` audited version == target version
2. npm published version < target version
3. workflow input
   - `publish=true`
   - `npm_tag=latest`
4. dispatch 後は run success まで追う
5. npm published version >= target version を確認してから legacy sync に進む

### State Update Rule

state file / result JSON は次で更新する。

- verification 開始時
  - `verification_in_progress`
- verification 成功後、candidate PR / branch promotion / publish が残る
  - `pending_promotion`
- publish dispatch 中
  - `publish_dispatched`
- `main` 反映 + npm published + legacy sync 未完
  - canonical は complete 扱い、legacy は別 result で続行
- hard-stop
  - `promotion_failed`
  - notes に stage と reason を残す

### No-Go Conditions

- `gh` auth が使えない
- merge conflict
- candidate PR merge failure
- publish workflow dispatch failure

この場合は hard-stop して state と result JSON に残す。

## Go / No-Go

- self-heal が state reconcile と auto-promotion に分離されていれば Go
- stale lock を state file 書き換えだけで隠すなら No-Go
- `main` 反映前に publish dispatch するなら No-Go
