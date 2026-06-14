# Release Process

このドキュメントはメンテナー向けのリリース手順です。

---

## フロー概要

```
【手動】新upstream版を追加 → candidate publish
【人】実機確認（唯一の手動ステップ）
【手動→自動】termux_verified に昇格 → main push
  → latest に自動 retag
  → docs PR 自動作成
【人】RELEASES.md を編集してPRをマージ
  → GitHub Release 自動作成
```

---

## Phase 1: 新upstream版を追加して candidate publish

### 1-1. audited-versions.json にエントリを追加

新しいupstream版（`X.Y.Z`）の offset と tarball hash を調査し、両方の config に追加する。

```
config/claude-native-audited-versions.json
packages/claude-code/config/claude-native-audited-versions.json
```

エントリの status は `offset_discovered`。

### 1-2. manifest と package.json を candidate に更新

```bash
# latest_candidate_version を X.Y.Z-N に更新
# package.json の version も X.Y.Z-N に更新
node scripts/update-release-manifest.js
```

manifest の `latest_candidate_version` が新版、`latest_audited_version` は前の stable のまま。

### 1-3. README を更新してコミット

```bash
node scripts/update-readme-version-guidance.js
git add -A
git commit -m "chore: advance candidate to X.Y.Z-N"
git push origin main
```

### 1-4. candidate タグで npm publish

GitHub Actions → `npm-package.yml` を手動 dispatch:

```
publish: true
```

`npm-publish` environment の承認後に candidate タグで publish される。

```sh
# 確認
npm view @bash0816/claude-code dist-tags
# → { candidate: 'X.Y.Z-N', latest: '<前の stable>' }
```

---

## Phase 2: 実機確認（唯一の手動ステップ）

Device A・Device B の両端末で確認する。

```sh
npm install -g @bash0816/claude-code@candidate
claude --version
claude auth status
claude -p "hello"
claude update --dry-run
```

確認項目:
- `claude --version` が `X.Y.Z-N (Claude Code)` を返す
- `claude auth status` に不要な警告が出ない
- `claude -p "hello"` が正常終了する
- TUI が起動・応答する

問題があれば candidate を取り下げ、修正して再 publish する。

---

## Phase 3: termux_verified に昇格（自動化トリガー）

### 3-1. スクリプトで昇格

```bash
node scripts/promote-verified-version.js X.Y.Z-N
node scripts/update-release-manifest.js
node scripts/update-readme-version-guidance.js
```

これで:
- `audited-versions.json` の status が `termux_verified` に変わる
- manifest の `latest_audited_version` が `X.Y.Z-N` に変わる
- `latest_candidate_version` も `X.Y.Z-N`（同一）
- `previous_stable_version` が前の stable に更新される
- README の Supported Versions テーブル・バージョン参照が更新される

### 3-2. コミット・push（自動化トリガー）

```bash
git add -A
git commit -m "release: promote X.Y.Z-N to termux_verified, update manifest and docs"
git push origin main
```

**この push が `promote-and-publish.yml` を自動トリガーする。**

### 3-3. 自動実行される処理

`promote-and-publish.yml` が:
1. registry の `latest` dist-tag ≠ `latest_audited_version` を検出
2. `retag-latest-dist-tags.js` で latest に retag
3. `release-finalize.yml` を自動 dispatch

`release-finalize.yml` が:
1. README を更新（`update-readme-version-guidance.js`）
2. RELEASES.md にスタブエントリを prepend
3. `automation/docs-X.Y.Z-N` ブランチで PR を作成

> ⚠️ `npm-publish` environment に手動承認が設定されている場合、retag ステップで承認が必要。

---

## Phase 4: ドキュメント仕上げ（PR をマージ）

### 4-1. RELEASES.md を編集

PR 内の RELEASES.md にある `<!-- TODO: upstream highlights を追記してください -->` を実際の内容に置き換える。

**書く内容（エンドユーザー向け）:**
- upstream `X.Y.Z` の主要変更（新機能・バグ修正の箇条書き）
- Termux 固有の修正があれば追記

**書かない内容（内部情報）:**
- Device A・Device B 確認済み
- GPT-5.5 / Opus レビュー済み
- offset_discovered・termux_verified などの内部ステータス

upstream の変更内容は npm / GitHub releases で確認する:
```
https://github.com/anthropics/claude-code/releases
https://www.npmjs.com/package/@anthropic-ai/claude-code
```

**RELEASES.md フォーマット:**

```markdown
## X.Y.Z-N — YYYY-MM-DD ✅ Current audited / 現在の監査済み版

Upstream `@anthropic-ai/claude-code` update from A.B.C to X.Y.Z, plus ...（Termux固有修正があれば）

upstream `@anthropic-ai/claude-code` を A.B.C から X.Y.Z に更新。...

**Upstream highlights / 主な変更（upstream）**

- **新モデル名** が利用可能に
- `--new-flag` を追加（説明）
- バグ修正: 〇〇が動作しない問題を修正

\```sh
npm install -g @bash0816/claude-code@latest
\```

\```sh
npm install -g @bash0816/claude-code@<previous_stable>
\```

---
```

### 4-2. PR をマージ

PR をマージすると `create-github-release.yml` が自動トリガーされ、RELEASES.md の内容を使って GitHub Release が作成される。

### 4-3. GitHub Release の確認・編集

自動作成された GitHub Release のノートを確認し、必要であれば編集する:

```sh
gh release edit vX.Y.Z-N --notes "..."
```

---

## チェックリスト

### candidate publish 時
- [ ] 両 config に `offset_discovered` エントリを追加
- [ ] manifest の `latest_candidate_version` を更新
- [ ] `npm-package.yml` dispatch → candidate publish 確認

### termux_verified 昇格時
- [ ] `promote-verified-version.js` 実行
- [ ] `update-release-manifest.js` 実行
- [ ] `update-readme-version-guidance.js` 実行
- [ ] commit & push
- [ ] `promote-and-publish.yml` が自動起動し retag 完了を確認
- [ ] `npm view @bash0816/claude-code dist-tags` で `latest` が新版になっていることを確認

### docs PR
- [ ] RELEASES.md の TODO を upstream highlights で埋める
- [ ] PR をマージ
- [ ] GitHub Release が自動作成されたことを確認
- [ ] 内容を確認・必要であれば `gh release edit` で修正

---

## スクリプト一覧

| スクリプト | 用途 |
|-----------|------|
| `scripts/promote-verified-version.js <ver>` | status を `termux_verified` に変更・package.json を更新 |
| `scripts/update-release-manifest.js` | manifest の audited/candidate/previous を再計算 |
| `scripts/update-readme-version-guidance.js` | README のバージョン参照・Supported Versions テーブルを更新 |
| `scripts/retag-latest-dist-tags.js` | npm dist-tag を latest/candidate 入れ替え（CI から呼ばれる） |

## ワークフロー一覧

| ワークフロー | トリガー | 役割 |
|-------------|---------|------|
| `npm-package.yml` | 手動 dispatch | candidate publish（実機確認前） |
| `promote-and-publish.yml` | main push（config変更時） | latest retag + release-finalize dispatch |
| `release-finalize.yml` | 手動 dispatch / 自動 | docs PR 作成（README・RELEASES.md） |
| `create-github-release.yml` | `automation/docs-*` PR マージ | GitHub Release 作成 |

---

## バージョン番号規則

- Termux wrapper の修正のみ → パッチサフィックスをインクリメント（例: `2.1.177` → `2.1.177-1`）
- upstream 追従 → upstream のバージョンをそのまま使用（例: `2.1.177`）
- upstream 追従 + Termux 修正 → サフィックス付き（例: `2.1.177-1`）

## ロールバック

```sh
# 前の stable に戻す
npm install -g @bash0816/claude-code@<previous_stable_version>
```

`previous_stable_version` は manifest に記録されている:
```
config/claude-termux-release-manifest.json
```
