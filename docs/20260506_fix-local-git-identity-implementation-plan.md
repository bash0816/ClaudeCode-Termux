# 2026-05-06 Fix Local Git Identity Implementation Plan

## STEP 3

## Implementation

1. `run-local-release-automation.sh` に source repo identity read helper を追加する
2. clone 後に `git config user.name` / `git config user.email` を local clone に設定する
3. どちらかが空なら hard stop して identity missing を result notes に出す
4. 値が揃っている場合のみ clone local config に設定する
5. 既存 flow は変えず、commit path だけ安定化する

## STEP 4 Test Points

- dry-run path は壊れない
- actual local automation で verification success 後に `git commit` が identity 不足で止まらない
- temp clone で `git config --get user.name` / `user.email` が確認できる
- candidate branch push / PR handoff まで進む

## Minimal Commands

- `sh -n scripts/run-local-release-automation.sh`
- actual `sh scripts/run-local-release-automation.sh`
