/** Render API から、各サービスの最新デプロイを取得して失敗しているものを探す */

const RENDER_API = 'https://api.render.com/v1';

/** 失敗とみなすデプロイのステータス */
export const FAILED_STATUSES = new Set(['build_failed', 'update_failed', 'pre_deploy_failed']);

export interface RenderService {
  id: string;
  name: string;
  suspended: string;
  dashboardUrl: string;
}

export interface RenderDeploy {
  id: string;
  status: string;
  finishedAt?: string | null;
  commit?: { id: string; message: string } | null;
}

export interface FailedDeploy {
  service: RenderService;
  deploy: RenderDeploy;
}

async function renderGet<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${RENDER_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Render API ${path} が ${res.status} を返しました`);
  }
  return res.json() as Promise<T>;
}

/** サービスと最新デプロイの組から、失敗しているものだけを選ぶ */
export function pickFailedDeploys(
  latest: { service: RenderService; deploy: RenderDeploy | undefined }[],
): FailedDeploy[] {
  return latest.flatMap(({ service, deploy }) =>
    deploy && service.suspended !== 'suspended' && FAILED_STATUSES.has(deploy.status)
      ? [{ service, deploy }]
      : [],
  );
}

export async function findFailedDeploys(apiKey: string): Promise<FailedDeploy[]> {
  const services = await renderGet<{ service: RenderService }[]>('/services?limit=100', apiKey);
  const latest = await Promise.all(
    services.map(async ({ service }) => {
      const deploys = await renderGet<{ deploy: RenderDeploy }[]>(
        `/services/${service.id}/deploys?limit=1`,
        apiKey,
      );
      return { service, deploy: deploys[0]?.deploy };
    }),
  );
  return pickFailedDeploys(latest);
}
