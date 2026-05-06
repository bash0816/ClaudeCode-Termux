## STEP 4

### 再現条件

- canonical `latest_audited_version` が legacy `latest_audited_version` より新しい
- `needs_verification=false`
- `needs_publish=false`
- `needs_legacy_sync=true`

### テスト観点

1. legacy helper が canonical metadata を legacy root/package config へ写せる
2. legacy manifest/README 再生成が成功する
3. commit 対象 diff が無く、かつ既存 branch / PR / merged stage も無いときだけ hard-stop する
4. `feature -> dev` PR が作成・merge される
5. `dev -> staging` が通常 PR で通る場合に成功する
6. 通常 PR が no-op 扱いなら fallback branch で進める
7. `staging -> main` も同じく進める
8. canonical status で `needs_legacy_sync=false` になる
9. verification/publish flow には影響しない
10. `feature -> dev` 済みで止まった場合に duplicate PR を作らず resume できる
11. `dev -> staging` 済みで止まった場合に `staging -> main` だけ再開できる
12. commit 対象 diff が無くても再開対象がある場合は resume 判定へ進める
