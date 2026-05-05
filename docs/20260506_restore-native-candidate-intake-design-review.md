# 2026-05-06 Restore Native Candidate Intake Design Review

## Reviewed Target

- `20260506_restore-native-candidate-intake-plan.md`

## Design Question

`check-only` 版へ縮退してしまった `Claude Native Version Watch` を、
candidate intake 可能な状態へ戻す設計は妥当か。

## Proposed Answer

Go.

## Rationale

1. 現在の失敗は仕様どおりではなく、機能欠落によるもの。
   - `2.1.128` を解決できているのに
   - audited metadata に無いことを失敗扱いして止まっている
2. local cron は candidate branch/manifest 更新が前提。
   - ここが無いと `needs_verification=false` のままになる
3. 以前の candidate intake 版 workflow は、
   - metadata update
   - branch push
   - PR create
   の最小導線を持っていた
4. 今回必要なのは、新機能追加ではなく
   - intended pipeline の復旧
   である

## Required Restoration

- public 例外として candidate intake のみ write を許可
  - allowed:
    - metadata update
    - candidate branch push
    - candidate PR create
  - forbidden:
    - publish
    - promotion
    - legacy sync
- `workflow_dispatch` は `dev` 固定
- `permissions: contents: write, pull-requests: write`
- `Skip existing audited version`
- `Prepare artifact and discover offsets`
- `update-release-manifest.js`
- `update-readme-version-guidance.js`
- candidate branch push
- candidate PR create

## Risks

- public workflow minimalization と衝突しないよう、
  candidate intake に必要な最小権限だけを戻す必要がある
- `gh pr create` 失敗時は job 自体を失敗させず、branch 作成までを優先する方が安全
- schedule 実行でも branch/PR が作られるため、
  その scope が candidate intake 限定であることを workflow 内で明示する必要がある

## Verdict Target

Go.
