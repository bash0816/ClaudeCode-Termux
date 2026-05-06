# 2026-05-06 Fix Local Git Identity Plan

## Goal

`run-local-release-automation.sh` の candidate verification 成功後に、temp clone で `git commit` が author identity 不足で落ちる問題を解消する。

## Facts

- current local automation run `20260506T030013Z` では candidate verification 自体は成功した。
- 失敗点は success path の `git commit -m "Promote native Claude 2.1.128"`。
- エラーは `Author identity unknown`。
- source repo `/data/data/com.termux/files/home/ClaudeCode-Termux` には local git config がある。
  - `user.name = Vash0001`
  - `user.email = bash0816@gmail.com`
- global git config には user identity が無い。

## Working Hypothesis

- temp clone 作成後に source repo の local identity を clone 側へコピーすれば、automation handoff の commit は通る。

## Candidate Fix

- `run-local-release-automation.sh` で clone/fetch/checkout の後、source repo から `git config --get user.name` / `user.email` を読む。
- 値があれば temp clone に `git config user.name` / `git config user.email` を設定する。
- `user.name` または `user.email` が取れなければ verification/prompt 作成前に hard stop し、identity missing を result notes に明記する。
