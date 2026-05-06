## STEP 3

### 実装方針

canonical repo に legacy sync helper を追加し、local automation から呼ぶ。

### 変更対象

1. `scripts/run-local-release-automation.sh`
2. new helper script
   - `scripts/sync-legacy-metadata.sh`
3. new helper script
   - `scripts/sync-legacy-metadata.js`

### 実装内容

#### A. legacy metadata sync helper

Node helper で canonical metadata を読み、legacy public repo `~/CluadeCode-Termux-public` へ必要な version entries を同期する。

やること:

- canonical root config 読み込み
- legacy root/package config 読み込み
- canonical `termux_verified` entries のみを legacy 側へ上書き
- legacy 側に残る `offset_discovered` entry は削除
- legacy JSON を保存

Shell helper で legacy repo の full flow を回す。

やること:

- local old repo root 解決
- `git fetch --prune`
- `feature/sync-legacy-<version>` checkout
- Node helper 実行
- legacy `update-release-manifest.js`
- legacy `update-readme-version-guidance.js`
- `git add/commit/push`
- PR create / merge
- promotion fallback 実行

resume 方針:

- 既存 open PR があれば再利用
- merged 済みの昇格はスキップ
- 次段のみ続行
- metadata diff が無くても、既存 branch / PR / merged stage が見つかれば hard-stop せず resume 判定へ進む
- hard-stop は「差分なし」単独ではなく、「差分なし かつ再開対象なし」のときだけにする

#### B. local automation integration

`run-local-release-automation.sh` の no-action 分岐を次の順にする。

1. `needs_verification=true` なら既存 verification flow
2. `needs_publish=true` なら no-op note
3. `needs_legacy_sync=true` なら legacy sync helper 実行
4. それ以外は no-op

#### C. result/state handling

legacy sync 実行結果を `result.json` に残す。

最低限の項目:

- `mode`
- `audited_version`
- `legacy_sync_completed`
- `legacy_sync_branch`
- `legacy_sync_prs`
- `legacy_sync_stage`
- `notes`

これは codex schema ではなく local shell の独自 result として扱う。

### 検証方針

#### 構文

- `node --check scripts/sync-legacy-metadata.js`
- `sh -n scripts/sync-legacy-metadata.sh`
- `sh -n scripts/run-local-release-automation.sh`

#### dry-run 相当

- helper script を env で `push/merge skip` 可能にして diff 生成確認

#### 実動作

- old repo に対して test version で metadata sync
- feature branch push
- PR create
- `dev -> staging -> main`
- canonical status 再計算で `needs_legacy_sync=false`
- partial promotion 失敗時に次回 run で resume できること

### 非目標

- legacy bridge package 再 publish
- public workflow の再追加
- canonical publish flow の変更
