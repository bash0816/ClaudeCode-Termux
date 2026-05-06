# 2026-05-06 Fix Local Verification Handoff Design Review

## Reviewed Target

- `20260506_fix-local-verification-handoff-plan.md`

## Design Question

local verification automation を、
- `main` clone 実体ではなく candidate branch 実体で検証し
- success 後は removed workflow dispatch ではなく
- same candidate branch を `termux_verified` に更新して push/PR へ進める
設計は妥当か。

## Proposed Answer

Go.

## Rationale

1. current failure は verification logic ではなく repo checkout の問題。
   - candidate branch はある
   - status detection も直った
   - だが verification repo 実体が `main` のまま
2. removed workflow への dispatch は現在の public 実体と整合しない。
3. candidate branch 自体は `dev` ベースで作られている。
   - その branch 上で `offset_discovered -> termux_verified` に上げれば
   - 既存 PR をそのまま review 導線として使える
4. publish / legacy sync をここでやらない設計は安全。

## Boundary

- local automation shell only
- no change to cron schedule
- no change to state schema
- no direct merge
- no npm publish
- if candidate branch is missing:
  - hard stop
  - no stale-main verification

## Expected Outcome

- local actual run on `2.1.128` no longer fails at `Unsupported audited Claude Code version`
- success時は candidate branch が verified content に更新される
- open PR があればその PR が更新される
