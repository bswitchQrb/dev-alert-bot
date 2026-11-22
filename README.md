# dev-alert-bot

個人開発の運用アラートを Discord に送る Cloudflare Worker。

| タイミング | 内容 |
|---|---|
| 15 分ごと | Render の各サービスの最新デプロイが失敗していたら通知（同じデプロイは 1 回だけ） |
| 毎朝 9:00（JST） | 3 日以上マージされていない Dependabot の PR をまとめて通知 |

## 構成

- Cloudflare Workers（Cron Triggers）
- Workers KV：通知済みのデプロイ ID を 30 日間記録
- Discord Webhook

## シークレット

```sh
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put RENDER_API_KEY
npx wrangler secret put GITHUB_TOKEN   # 任意（public リポジトリの読み取りのみ）
```

## 開発

```sh
cp .dev.vars.example .dev.vars   # 値を入れる
npm run dev                      # http://localhost:8787/__scheduled?cron=*/15+*+*+*+* で Cron を手動実行
npm test
```

## ライセンス

[MIT License](LICENSE) © 2026 bswitchQrb
