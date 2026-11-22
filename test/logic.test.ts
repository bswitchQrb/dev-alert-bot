import { describe, expect, it } from 'vitest';
import { deployFailedMessage, stalePullRequestsMessage } from '../src/discord';
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

  it('長すぎる PR 一覧は Discord の上限に収まるように切る', () => {
    const prs = Array.from({ length: 200 }, (_, i) => ({
      repo: 'bswitchQrb/onpu',
      title: `Bump some-very-long-package-name from 1.0.0 to 2.0.${i}`,
      url: `https://github.com/bswitchQrb/onpu/pull/${i}`,
      ageDays: 5,
    }));
    const embed = stalePullRequestsMessage(prs, 3).embeds[0];
    expect(embed.description.length).toBeLessThanOrEqual(4096);
    expect(embed.title).toContain('200 件');
  });
});
