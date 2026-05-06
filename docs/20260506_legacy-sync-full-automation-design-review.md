## STEP 2

### 設計レビュー対象

`needs_legacy_sync` を検出した canonical local cron が、old public repo `CluadeCode-Termux-public` の metadata sync と branch 昇格を最後まで自動実行する案。

### 設計案

#### 実行主体

- 実行主体は `ClaudeCode-Termux/scripts/run-local-release-automation.sh`
- verification / publish と同じく local 端末の cron を正とする

#### 追加責務

- `needs_legacy_sync=true` かつ `needs_verification=false` かつ `needs_publish=false` のときだけ legacy sync を開始
- canonical と legacy の version 差分が無いときは no-op
- 対象 repo root は `CLAUDE_TERMUX_LEGACY_REPO_ROOT` 既定値 `~/CluadeCode-Termux-public` に固定する

#### 更新対象

legacy repo の以下を同期対象にする。

- `config/claude-native-audited-versions.json`
- `packages/cluade-code/config/claude-native-audited-versions.json`
- `config/claude-termux-release-manifest.json`
- `packages/cluade-code/config/claude-termux-release-manifest.json`
- `README.md`
- `packages/cluade-code/README.md`

#### 変更方法

- canonical 側から legacy 用 helper script を呼ぶ
- metadata 本体は canonical root config を source of truth とし、legacy へ必要部分を写す
- legacy 側へ写す version は `termux_verified` のみ
- manifest/README は legacy repo 既存 script
  - `scripts/update-release-manifest.js`
  - `scripts/update-readme-version-guidance.js`
  を使って再生成する

#### Git 運用

- local の old repo clone を更新
- `feature/sync-legacy-<version>` を作る
- commit / push
- `gh pr create --base dev --head feature/sync-legacy-<version>`
- merge 後に
  - `dev -> staging`
  - `staging -> main`
  を順に進める

#### 権限前提

- local `gh` 認証に PR create / merge 権限があることを前提にする
- merge method は `--merge` に固定する
- 権限不足や branch protection による merge 失敗は hard-stop する
- cron は自動再試行するが、途中成功済み PR を二重作成しない

#### PR 作成 fallback

通常の `dev -> staging` や `staging -> main` が GitHub graph 上で no-op 扱いになることがあるため、fallback を持つ。

- 失敗時は target base branch から一時 branch を切る
- source branch を merge した temp branch を push
- temp branch から base へ PR を作る

temp branch 命名:

- `feature/promote-legacy-<version>-dev`
- `feature/promote-legacy-<version>-staging`
- `feature/promote-legacy-<version>-main`

#### 停止条件

以下では hard-stop する。

- local old repo clone が無い
- legacy helper script が失敗
- commit 対象 diff が生成されず、かつ既存 branch / existing PR / merged promotion が見つからない
- PR create/merge が失敗

#### partial promotion の rollback / stop

- `feature -> dev` 済みで `dev -> staging` 失敗:
  - そこで停止
  - 次回 cron は `needs_legacy_sync=true` を見て再実行する
  - 既存 open/merged PR を再利用し、同一 version の duplicate PR は作らない
  - metadata diff が無くても、既存 branch / PR があれば resume 判定へ進む
- `dev -> staging` 済みで `staging -> main` 失敗:
  - そこで停止
  - `main` 未追従なので `needs_legacy_sync=true` が継続
  - 次回 cron は `staging -> main` 段から再開する
  - metadata diff が無くても、既存 branch / PR があれば resume 判定へ進む
- rollback は automatic revert ではなく stop-and-resume を採る
- 理由は legacy repo が bridge metadata 同期のみで、途中 branch 状態を保った方が安全だから

#### 完了条件

- old repo `origin/main` の `latest_audited_version` が canonical と一致
- canonical `release-automation-status.js` で `needs_legacy_sync=false`

### リスク

- old repo branch history が再度歪んだ場合、fallback branch を都度作る必要がある
- `gh` 権限不足だと merge で止まる
- metadata sync 対象が増えたとき helper script の追従が必要

### レビュー論点

1. public workflow を戻さず local cron 主導に寄せる判断は妥当か
2. legacy sync を `run-local-release-automation.sh` に統合してよいか
3. branch promotion fallback を script に含めるべきか
4. stop-and-resume を rollback 方針として採ってよいか
