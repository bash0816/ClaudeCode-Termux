# 2026-05-13 Release Self-Heal Plan

## Goal

`ClaudeCode-Termux` の release automation が、candidate verification 後に
人手確認待ちで止まらないようにする。

## Facts

- current local status は `latest_audited_version=2.1.138`
- current candidate は `2.1.139`
- state file では `2.1.139: promotion_dispatched`
- open candidate PR は `automation/native-claude-2.1.139 -> dev`
- public workflows は `claude-native-version-watch.yml` と `npm-package.yml` のみ
- current local automation は verification と candidate PR handoff で止まる

## Problem

- `promotion_dispatched` が stale でも self-heal しない
- candidate PR が open のままでも local automation が次段 promotion を実行しない
- `dev -> staging -> main -> npm publish` が自動連結されていない

## Success

- stale state を local reconcile で再評価できる
- open candidate PR があれば local automation が merge まで進める
- `dev -> staging -> main` も local automation が自動 promotion する
- `main` 更新後は npm publish workflow を local automation が dispatch する
