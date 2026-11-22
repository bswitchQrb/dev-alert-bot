/** GitHub の検索 API で、放置されている Dependabot の PR を探す */

export interface PullRequest {
  title: string;
  html_url: string;
  created_at: string;
  repository_url: string;
}

export interface StalePullRequest {
  repo: string;
  title: string;
  url: string;
  ageDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 作成から staleDays 日以上たった PR を、古い順に返す */
export function pickStalePullRequests(
  items: PullRequest[],
  staleDays: number,
  now: Date,
): StalePullRequest[] {
  return items
    .map((pr) => ({
      repo: pr.repository_url.split('/').slice(-2).join('/'),
      title: pr.title,
      url: pr.html_url,
      ageDays: Math.floor((now.getTime() - new Date(pr.created_at).getTime()) / DAY_MS),
    }))
    .filter((pr) => pr.ageDays >= staleDays)
    .sort((a, b) => b.ageDays - a.ageDays);
}

export async function findStaleDependabotPullRequests(
  owner: string,
  staleDays: number,
  token: string | undefined,
  now: Date,
): Promise<StalePullRequest[]> {
  const q = encodeURIComponent(`is:pr is:open author:app/dependabot user:${owner}`);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dev-alert-bot',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=100`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API が ${res.status} を返しました`);
  }
  const body = (await res.json()) as { items: PullRequest[] };
  return pickStalePullRequests(body.items, staleDays, now);
}
