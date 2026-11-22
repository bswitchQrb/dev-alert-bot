/** Discord の Webhook に送るメッセージを組み立てて送信する */

import type { FailedDeploy } from './render';
import type { StalePullRequest } from './github';

const COLOR_RED = 0xdd5050;
const COLOR_YELLOW = 0xe3b860;
/** Discord の embed の説明文の上限（4096 文字）より少し短めに切る */
const MAX_DESCRIPTION = 4000;

export interface DiscordMessage {
  username: string;
  embeds: {
    title: string;
    url?: string;
    description: string;
    color: number;
    timestamp?: string;
  }[];
}

export function deployFailedMessage({ service, deploy }: FailedDeploy): DiscordMessage {
  const commit = deploy.commit
    ? `\nコミット: \`${deploy.commit.id.slice(0, 7)}\` ${deploy.commit.message.split('\n')[0]}`
    : '';
  return {
    username: 'dev-alert-bot',
    embeds: [
      {
        title: `🚨 Render のデプロイが失敗：${service.name}`,
        url: `${service.dashboardUrl}/deploys/${deploy.id}`,
        description: `ステータス: \`${deploy.status}\`${commit}`,
        color: COLOR_RED,
        timestamp: deploy.finishedAt ?? undefined,
      },
    ],
  };
}

export function stalePullRequestsMessage(prs: StalePullRequest[], staleDays: number): DiscordMessage {
  const lines = prs.map((pr) => `・[${pr.repo}] [${pr.title}](${pr.url})（${pr.ageDays} 日前）`);
  let description = lines.join('\n');
  if (description.length > MAX_DESCRIPTION) {
    description = `${description.slice(0, MAX_DESCRIPTION)}\n…ほか`;
  }
  return {
    username: 'dev-alert-bot',
    embeds: [
      {
        title: `📦 ${staleDays} 日以上マージされていない Dependabot の PR：${prs.length} 件`,
        description,
        color: COLOR_YELLOW,
      },
    ],
  };
}

export async function sendDiscord(webhookUrl: string, message: DiscordMessage): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    throw new Error(`Discord Webhook が ${res.status} を返しました`);
  }
}
