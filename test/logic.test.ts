import { describe, expect, it } from 'vitest';
import { deployFailedMessage, stalePullRequestsMessage, summarizeDependabotTitle } from '../src/discord';
import { pickStalePullRequests, type PullRequest } from '../src/github';
import { pickFailedDeploys, type RenderService } from '../src/render';

const service = (name: string, suspended = 'not_suspended'): RenderService => ({
  id: `srv-${name}`,
  name,
  suspended,
  dashboardUrl: `https://dashboard.render.com/static/srv-${name}`,
});

describe('pickFailedDeploys', () => {
  it('最新デプロイが失敗しているサービスだけを返す', () => {
    const result = pickFailedDeploys([
      { service: service('portfolio'), deploy: { id: 'dep-1', status: 'live' } },
      { service: service('onpu'), deploy: { id: 'dep-2', status: 'build_failed' } },
      { service: service('api'), deploy: { id: 'dep-3', status: 'update_failed' } },
      { service: service('new'), deploy: undefined },
    ]);
    expect(result.map((r) => r.deploy.id)).toEqual(['dep-2', 'dep-3']);
  });

  it('停止中のサービスは無視する', () => {
    const result = pickFailedDeploys([
      { service: service('old', 'suspended'), deploy: { id: 'dep-1', status: 'build_failed' } },
    ]);
    expect(result).toEqual([]);
  });
});

describe('pickStalePullRequests', () => {
  const now = new Date('2026-11-22T00:00:00Z');
  const pr = (title: string, createdAt: string): PullRequest => ({
    title,
    html_url: `https://github.com/bswitchQrb/onpu/pull/${title}`,
    created_at: createdAt,
    repository_url: 'https://api.github.com/repos/bswitchQrb/onpu',
  });

  it('指定した日数以上たった PR を古い順に返す', () => {
    const result = pickStalePullRequests(
      [pr('new', '2026-11-21T00:00:00Z'), pr('3days', '2026-11-19T00:00:00Z'), pr('10days', '2026-11-12T00:00:00Z')],
      3,
      now,
    );
    expect(result.map((r) => [r.title, r.ageDays])).toEqual([
      ['10days', 10],
      ['3days', 3],
    ]);
    expect(result[0].repo).toBe('bswitchQrb/onpu');
  });
});

describe('Discord のメッセージ', () => {
  it('デプロイ失敗の通知に、サービス名・ダッシュボードの URL・コミットの 1 行目が入る', () => {
    const message = deployFailedMessage({
      service: service('onpu'),
      deploy: {
        id: 'dep-9',
        status: 'build_failed',
        finishedAt: '2026-11-22T01:00:00Z',
        commit: { id: 'abcdef1234567', message: 'ビルドを直す\n\n詳細' },
      },
    });
    const embed = message.embeds[0];
    expect(embed.title).toContain('onpu');
    expect(embed.url).toBe('https://dashboard.render.com/static/srv-onpu/deploys/dep-9');
    expect(embed.description).toContain('`abcdef1` ビルドを直す');
    expect(embed.description).not.toContain('詳細');
  });

  it('PR の一覧をリポジトリごとの欄に分け、メジャー更新に印を付ける', () => {
    const embed = stalePullRequestsMessage(
      [
        { repo: 'bswitchQrb/onpu', title: 'Bump nanoid from 3.3.11 to 3.3.20', url: 'https://github.com/bswitchQrb/onpu/pull/28', ageDays: 3 },
        { repo: 'bswitchQrb/onpu', title: 'Bump typescript from 5.9.3 to 7.0.2', url: 'https://github.com/bswitchQrb/onpu/pull/22', ageDays: 4 },
        { repo: 'bswitchQrb/portfolio', title: 'Bump astro from 6.1.1 to 7.4.13', url: 'https://github.com/bswitchQrb/portfolio/pull/9', ageDays: 5 },
      ],
      3,
    ).embeds[0];

    expect(embed.fields?.map((f) => f.name)).toEqual(['onpu（2 件）', 'portfolio（1 件）']);
    expect(embed.fields?.[0].value).toBe(
      [
        '⚠️ [#22](https://github.com/bswitchQrb/onpu/pull/22) typescript 5.9.3 → 7.0.2 · 4 日',
        '・ [#28](https://github.com/bswitchQrb/onpu/pull/28) nanoid 3.3.11 → 3.3.20 · 3 日',
      ].join('\n'),
    );
    expect(embed.description).toContain('**3 件**');
    expect(embed.description).toContain('メジャー更新（2 件）');
  });

  it('全部同じ日数のときは、日数を省く', () => {
    const embed = stalePullRequestsMessage(
      [
        { repo: 'bswitchQrb/onpu', title: 'Bump nanoid from 3.3.11 to 3.3.20', url: 'https://github.com/bswitchQrb/onpu/pull/28', ageDays: 3 },
        { repo: 'bswitchQrb/onpu', title: 'Bump postcss from 8.5.8 to 8.5.33', url: 'https://github.com/bswitchQrb/onpu/pull/29', ageDays: 3 },
      ],
      3,
    ).embeds[0];
    expect(embed.fields?.[0].value).not.toContain('日');
  });

  it('1 つのリポジトリに PR が多すぎても、欄の上限（1024 文字）に収める', () => {
    const prs = Array.from({ length: 200 }, (_, i) => ({
      repo: 'bswitchQrb/onpu',
      title: `Bump some-very-long-package-name from 1.0.0 to 1.0.${i}`,
      url: `https://github.com/bswitchQrb/onpu/pull/${i}`,
      ageDays: 5,
    }));
    const value = stalePullRequestsMessage(prs, 3).embeds[0].fields?.[0].value ?? '';
    expect(value.length).toBeLessThanOrEqual(1024);
    expect(value).toMatch(/\[…ほか \d+ 件\]\(https:\/\/github\.com\/bswitchQrb\/onpu\/pulls\/app%2Fdependabot\)$/);
  });
});

describe('summarizeDependabotTitle', () => {
  it.each([
    ['Bump typescript from 5.9.3 to 7.0.2', 'typescript 5.9.3 → 7.0.2', true],
    ['Bump nanoid from 3.3.11 to 3.3.20', 'nanoid 3.3.11 → 3.3.20', false],
    ['Bump the npm-minor-patch group across 1 directory with 8 updates', 'npm-minor-patch グループ（8 件）', false],
    ['Bump the actions group with 5 updates', 'actions グループ（5 件）', false],
    ['Update something else', 'Update something else', false],
  ])('%s', (title, text, major) => {
    expect(summarizeDependabotTitle(title)).toEqual({ text, major });
  });
});
