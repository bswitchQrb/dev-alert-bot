/** Discord の Webhook に送るメッセージを組み立てて送信する */

import type { FailedDeploy } from './render';
import type { StalePullRequest } from './github';

const COLOR_RED = 0xdd5050;
const COLOR_YELLOW = 0xe3b860;
/** Discord の embed の上限：field は 25 個まで、field の値は 1024 文字まで */
const MAX_FIELDS = 25;
const MAX_FIELD_VALUE = 1024;

export interface DiscordMessage {
  username: string;
  embeds: {
    title: string;
    url?: string;
    description: string;
    color: number;
    timestamp?: string;
    fields?: { name: string; value: string }[];
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

/** Dependabot の PR タイトルを短くする。メジャー更新かどうかも判定する */
export function summarizeDependabotTitle(title: string): { text: string; major: boolean } {
  const single = title.match(/^Bump (\S+) from (\S+) to (\S+)/);
  if (single) {
    const [, name, from, to] = single;
    const major = from.split('.')[0] !== to.split('.')[0];
    return { text: `${name} ${from} → ${to}`, major };
  }
  const group = title.match(/^Bump the (\S+) group.* with (\d+) updates?/);
  if (group) {
    return { text: `${group[1]} グループ（${group[2]} 件）`, major: false };
  }
  return { text: title, major: false };
}

function prLine(pr: StalePullRequest, showAge: boolean): string {
  const { text, major } = summarizeDependabotTitle(pr.title);
  const age = showAge ? ` · ${pr.ageDays} 日` : '';
  return `${major ? '⚠️' : '・'} [#${prNumber(pr)}](${pr.url}) ${text}${age}`;
}

function prNumber(pr: StalePullRequest): number {
  return Number(pr.url.split('/').pop());
}

/** メジャー更新を上に、その中は PR の番号順に並べる */
function sortForDisplay(prs: StalePullRequest[]): StalePullRequest[] {
  const isMajor = (pr: StalePullRequest) => summarizeDependabotTitle(pr.title).major;
  return [...prs].sort((a, b) => Number(isMajor(b)) - Number(isMajor(a)) || prNumber(a) - prNumber(b));
}

/** 1 つの欄（field）に収まるように行を詰める。あふれた分は、PR 一覧へのリンク付きの「ほか N 件」にする */
function fitLines(lines: string[], limit: number, moreUrl: string): string {
  const more = (n: number) => `[…ほか ${n} 件](${moreUrl})`;
  const kept: string[] = [];
  for (const [i, line] of lines.entries()) {
    const rest = lines.length - i;
    const suffix = rest > 1 ? `\n${more(rest - 1)}` : '';
    if ([...kept, line].join('\n').length + suffix.length > limit) {
      return `${kept.join('\n')}\n${more(rest)}`;
    }
    kept.push(line);
  }
  return kept.join('\n');
}

export function stalePullRequestsMessage(prs: StalePullRequest[], staleDays: number): DiscordMessage {
  const byRepo = new Map<string, StalePullRequest[]>();
  for (const pr of prs) {
    byRepo.set(pr.repo, [...(byRepo.get(pr.repo) ?? []), pr]);
  }
  // 全部同じ日数なら、各行の日数は省く
  const showAge = new Set(prs.map((pr) => pr.ageDays)).size > 1;

  const fields = [...byRepo.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, MAX_FIELDS)
    .map(([repo, items]) => ({
      name: `${repo.split('/').pop()}（${items.length} 件）`,
      value: fitLines(
        sortForDisplay(items).map((pr) => prLine(pr, showAge)),
        MAX_FIELD_VALUE,
        `https://github.com/${repo}/pulls/app%2Fdependabot`,
      ),
    }));

  const majors = prs.filter((pr) => summarizeDependabotTitle(pr.title).major).length;
  const description = [
    `${staleDays} 日以上マージされていない PR が **${prs.length} 件**あります。`,
    majors > 0 ? `⚠️ はメジャー更新（${majors} 件）。動作確認してからマージしてね。` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    username: 'dev-alert-bot',
    embeds: [
      {
        title: '📦 たまっている Dependabot の PR',
        description,
        color: COLOR_YELLOW,
        fields,
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
