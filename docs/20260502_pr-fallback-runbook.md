# PR Fallback Runbook

## 目的

GitHub Actions が `createPullRequest` 権限不足で止まったとき、branch 生成済みの後段を local `gh pr create` で継続する。

## 前提

- `gh auth status` で対象 repo に操作できること
- branch push 自体は workflow success か log で確認済みであること
- `main` へ直接 push しないこと

## 共通確認

1. 対象 workflow run が branch 生成まで成功している
2. remote branch が存在する
3. 前段 gate を満たしている

例:

```sh
git -C /data/data/com.termux/files/home/ClaudeCode-Termux ls-remote --heads origin automation/native-claude-2.1.126
git -C /data/data/com.termux/files/home/ClaudeCode-Termux ls-remote --heads origin automation/promote-claude-2.1.126
```

## 1. Canonical Candidate PR

条件:
- candidate intake workflow success
- `automation/native-claude-<version>` branch が存在

実行:

```sh
gh pr create \
  --repo bash0816/ClaudeCode-Termux \
  --base dev \
  --head automation/native-claude-2.1.126 \
  --title "Add Claude native 2.1.126 metadata" \
  --body "Automated native metadata candidate for Claude Code 2.1.126."
```

次:
- local verification shell を実行する

## 2. Canonical Promotion PR

条件:
- local verification 成功
- promotion workflow success
- `automation/promote-claude-<version>` branch が存在

実行:

```sh
gh pr create \
  --repo bash0816/ClaudeCode-Termux \
  --base dev \
  --head automation/promote-claude-2.1.126 \
  --title "Promote Claude native 2.1.126" \
  --body "Promotion candidate for Claude Code 2.1.126."
```

次:
- merge 後に `Npm Package` on `dev` を確認する

## 3. Canonical `dev -> staging`

条件:
- `Npm Package` on `dev` success

実行:

```sh
gh pr create \
  --repo bash0816/ClaudeCode-Termux \
  --base staging \
  --head dev \
  --title "Promote canonical release flow to staging" \
  --body "Automated dev to staging promotion for canonical release metadata."
```

次:
- merge 後に `Npm Package` on `staging` を確認する

## 4. Canonical `staging -> main`

条件:
- `Npm Package` on `staging` success

実行:

```sh
gh pr create \
  --repo bash0816/ClaudeCode-Termux \
  --base main \
  --head staging \
  --title "Release canonical audited version to main" \
  --body "Automated staging to main promotion for canonical audited metadata."
```

補足:
- `main` 側 hotfix と `staging` 側 release flow が競合する場合は、先に `staging` に `main` を取り込んでから merge する

次:
- merge 後に `Publish Audited Release` と `Npm Package` workflow_dispatch publish を確認する

## 5. Legacy Sync PR

条件:
- canonical publish success
- `automation/legacy-sync-claude-<version>` branch が存在

実行:

```sh
gh pr create \
  --repo bash0816/CluadeCode-Termux \
  --base dev \
  --head automation/legacy-sync-claude-2.1.126 \
  --title "Sync legacy metadata to Claude 2.1.126" \
  --body "Automated sync from canonical ClaudeCode-Termux main."
```

次:
- merge 後に `Npm Package` on `dev` を確認する

## 6. Legacy `dev -> staging`

条件:
- legacy `Npm Package` on `dev` success

実行:

```sh
gh pr create \
  --repo bash0816/CluadeCode-Termux \
  --base staging \
  --head dev \
  --title "Promote legacy release flow to staging" \
  --body "Automated legacy dev to staging promotion for synced metadata."
```

次:
- merge 後に legacy `Npm Package` on `staging` を確認する

## 7. Legacy `staging -> main`

条件:
- legacy `Npm Package` on `staging` success

実行:

```sh
gh pr create \
  --repo bash0816/CluadeCode-Termux \
  --base main \
  --head staging \
  --title "Release legacy synced version to main" \
  --body "Automated legacy staging to main promotion for synced metadata."
```

次:
- merge 後に legacy `main` manifest が同期されたことを確認する

## やってはいけないこと

- branch push 未確認で PR だけ作らない
- local verification 未完了で promotion PR を作らない
- canonical publish 前に legacy sync を始めない
- `main` へ直接 push しない

## 2.1.126 実績

- canonical candidate PR: `#10`
- canonical promotion PR: `#12`
- canonical `dev -> staging`: `#13`
- canonical `staging -> main`: `#14`
- legacy sync PR: `#15`
- legacy `dev -> staging`: `#16`
- legacy `staging -> main`: `#17`
