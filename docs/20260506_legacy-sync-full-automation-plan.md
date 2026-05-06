## STEP 1

### 目的

`ClaudeCode-Termux` の canonical release 完了後に残る `needs_legacy_sync` を、人手補完なしで old public repo `CluadeCode-Termux-public` へ反映する。

### 現状の事実

- canonical 側 `scripts/release-automation-status.js` は `needs_legacy_sync` を判定できる。
- canonical 側 `scripts/run-local-release-automation.sh` は `needs_legacy_sync=true` のとき `follow-up pending in GitHub Actions` と出して終了する。
- legacy public repo `~/CluadeCode-Termux-public` には `sync-canonical-metadata.yml` はもう無い。
- legacy public repo に残っている workflow は `npm-package.yml` のみで、metadata sync や branch promotion は自動で走らない。
- そのため `2.1.128` では legacy metadata sync を手動補完した。
- public workflow は sanitize 済みで、不要な internal automation を戻したくない。

### 問題

- canonical 側は release 完了でも、legacy metadata sync が毎回手作業で残る。
- local cron は `needs_legacy_sync` を認識しても、完了まで進める実装が無い。

### 第一候補

canonical 側 local cron から legacy sync を直接行う。

流れ:

1. canonical `latest_audited_version` を読む
2. local の old public repo clone `~/CluadeCode-Termux-public` を使って metadata を同期
3. old repo で `feature/sync-legacy-<version>` を切る
4. old repo の root/package metadata と manifest/README を更新
5. `feature -> dev -> staging -> main` を `gh pr create` / `gh pr merge` で順に進める
6. canonical status が `latest_legacy_synced_version` 追従を確認して完了

### この案を選ぶ理由

- public workflow を増やさずに済む
- canonical 側の local automation だけで完結する
- 既存の `needs_legacy_sync` 判定と噛み合う
- old repo は bridge metadata 同期だけなので、local 主導でも責務が明確

### 同期する version の範囲

- legacy 側へ同期するのは `termux_verified` のみ
- `offset_discovered` は legacy main に載せない
- legacy manifest の `latest_candidate_version` は bridge repo では `latest_audited_version` と同値に保つ

### 代替案

1. legacy public repo に sync workflow と promotion workflow を戻す
2. canonical から old repo へ dispatch する

不採用理由:

- sanitize で削った internal workflow 露出を戻すことになる
- public repo に internal automation を再度持ち込む
- 今回の方針と逆行する

### 成功条件

- canonical release 完了後に local cron だけで legacy `main` の manifest が同じ version へ追従する
- old repo の branch 昇格は `feature -> dev -> staging -> main` を維持する
- manual metadata edit や manual PR merge が不要になる
