import { deployFailedMessage, sendDiscord, stalePullRequestsMessage } from './discord';
import { findStaleDependabotPullRequests } from './github';
import { findFailedDeploys } from './render';

const DAILY_CRON = '0 0 * * *';
/** 通知済みのデプロイ ID を覚えておく期間 */
const NOTIFIED_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Render のデプロイ失敗を、まだ通知していないものだけ通知する */
async function checkRenderDeploys(env: Env): Promise<void> {
  const failed = await findFailedDeploys(env.RENDER_API_KEY);
  console.log(`Render: 失敗しているデプロイ ${failed.length} 件`);
  for (const item of failed) {
    const key = `notified:render-deploy:${item.deploy.id}`;
    if (await env.STATE.get(key)) continue;

    await sendDiscord(env.DISCORD_WEBHOOK_URL, deployFailedMessage(item));
    await env.STATE.put(key, '1', { expirationTtl: NOTIFIED_TTL_SECONDS });
  }
}

/** 放置されている Dependabot の PR を 1 通にまとめて通知する（0 件なら送らない） */
async function checkStalePullRequests(env: Env, now: Date): Promise<void> {
  const staleDays = Number(env.STALE_PR_DAYS);
  const prs = await findStaleDependabotPullRequests(env.GITHUB_OWNER, staleDays, env.GITHUB_TOKEN, now);
  console.log(`GitHub: ${staleDays} 日以上たった Dependabot の PR ${prs.length} 件`);
  if (prs.length === 0) return;
  await sendDiscord(env.DISCORD_WEBHOOK_URL, stalePullRequestsMessage(prs, staleDays));
}

export default {
  // HTTP では何も提供しない。wrangler dev で Cron を手動実行するときに fetch ハンドラーが必要になるため置いている
  async fetch() {
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(controller, env) {
    if (controller.cron === DAILY_CRON) {
      await checkStalePullRequests(env, new Date(controller.scheduledTime));
    } else {
      await checkRenderDeploys(env);
    }
  },
} satisfies ExportedHandler<Env>;
