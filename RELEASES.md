## 2.1.179 — 2026-06-17 ✅ Current audited / 現在の監査済み版

Upstream `@anthropic-ai/claude-code` minor patch from 2.1.178 to 2.1.179. No Termux-specific changes in this release.

upstream `@anthropic-ai/claude-code` の 2.1.178 から 2.1.179 へのマイナーパッチ更新。Termux 固有の変更はありません。

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.178
```

---

## 2.1.178 — 2026-06-16 ✅ Current audited / 現在の監査済み版

Upstream `@anthropic-ai/claude-code` minor patch from 2.1.177 to 2.1.178. No Termux-specific changes in this release.

upstream `@anthropic-ai/claude-code` の 2.1.177 から 2.1.178 へのマイナーパッチ更新。Termux 固有の変更はありません。

```sh
npm install -g @bash0816/claude-code@latest
```

```sh
npm install -g @bash0816/claude-code@2.1.177-1
```

---

## 2.1.177-1 — 2026-06-14 ✅ Current audited / 現在の監査済み版

Upstream `@anthropic-ai/claude-code` update from 2.1.161 to 2.1.177, plus a Termux-specific fix to suppress the `Installed via npm (deprecated)` warning in `claude auth status`.

upstream `@anthropic-ai/claude-code` を 2.1.161 から 2.1.177 に更新。Termux 固有の修正として `claude auth status` の `Installed via npm (deprecated)` 警告を抑制しました。

**Upstream highlights / 主な変更（upstream）**

- **Claude Fable 5** が利用可能になりました（新世代モデル）
- サブエージェントが最大5階層までネスト可能に
- `--safe-mode` フラグを追加（CLAUDE.md・プラグイン・フック・MCP を全て無効化して起動）
- `/cd` コマンドを追加（プロンプトキャッシュを保持したままディレクトリ変更）
- セッションタイトルが会話言語で自動生成されるように改善
- Remote Control・バックグラウンドセッション・Linux サンドボックスなど各種バグ修正

```sh
npm install -g @bash0816/claude-code@latest
claude --version
```

---