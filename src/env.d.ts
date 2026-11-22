// `wrangler secret put` で登録するシークレット（wrangler types では生成されないので手で宣言する）
interface Env {
  DISCORD_WEBHOOK_URL: string;
  RENDER_API_KEY: string;
  /** なくても動くが、GitHub API のレート制限が厳しくなる */
  GITHUB_TOKEN?: string;
}
