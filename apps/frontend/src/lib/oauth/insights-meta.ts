// apps/frontend/src/lib/oauth/insights-meta.ts
// Meta Graph v25.0 owner insights. Live metrics only (spec §11). Fetchers degrade
// gracefully — a metric the API rejects yields null, never throws past the caller.
import { META_GRAPH_VERSION } from './config';

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const TIMEOUT = 15000;

interface MetricEntry {
  name: string;
  total_value?: {
    value?: number;
    breakdowns?: Array<{
      dimension_keys?: string[];
      results?: Array<{ dimension_values?: string[]; value?: number }>;
    }>;
  };
  values?: Array<{ value?: number | Record<string, number> }>;
}
interface InsightsResponse {
  data?: MetricEntry[];
}

export function pickMetric(
  data: MetricEntry[] | undefined,
  name: string,
): number | null {
  const e = (data ?? []).find((m) => m.name === name);
  if (!e) return null;
  if (typeof e.total_value?.value === 'number') return e.total_value.value;
  const v = e.values?.[0]?.value;
  return typeof v === 'number' ? v : null;
}

export interface IgAccountRow {
  reach: number | null;
  views: number | null;
  accounts_engaged: number | null;
  total_interactions: number | null;
  follower_delta: number | null;
}
export function mapIgAccount(json: InsightsResponse): IgAccountRow {
  const d = json.data;
  return {
    reach: pickMetric(d, 'reach'),
    views: pickMetric(d, 'views'),
    accounts_engaged: pickMetric(d, 'accounts_engaged'),
    total_interactions: pickMetric(d, 'total_interactions'),
    follower_delta: pickMetric(d, 'follower_count'),
  };
}

export interface DemographicRow {
  dimension: string;
  bucket: string;
  value: number;
}
export function mapDemographics(
  dimension: string,
  json: InsightsResponse,
): DemographicRow[] {
  const e = (json.data ?? []).find((m) => m.name === 'follower_demographics');
  const out: DemographicRow[] = [];
  for (const b of e?.total_value?.breakdowns ?? []) {
    for (const r of b.results ?? []) {
      const bucket = r.dimension_values?.[0];
      if (bucket != null && typeof r.value === 'number')
        out.push({ dimension, bucket, value: r.value });
    }
  }
  return out;
}

export interface MediaRow {
  views: number | null;
  reach: number | null;
  saves: number | null;
  interactions: number | null;
}
export function mapMedia(json: InsightsResponse): MediaRow {
  const d = json.data;
  return {
    views: pickMetric(d, 'views'),
    reach: pickMetric(d, 'reach'),
    saves: pickMetric(d, 'saved'),
    interactions: pickMetric(d, 'total_interactions'),
  };
}

export interface FbPageRow {
  views: number | null;
  page_engagements: number | null;
  reach: number | null;
}
export function mapFbPage(json: InsightsResponse): FbPageRow {
  const d = json.data;
  return {
    views: pickMetric(d, 'page_media_view'),
    page_engagements: pickMetric(d, 'page_post_engagements'),
    reach: pickMetric(d, 'page_total_media_view_unique'),
  };
}

export interface FbPostRow {
  views: number | null;
  interactions: number | null;
}
export function mapFbPost(
  viewsJson: InsightsResponse,
  engagedJson: InsightsResponse,
): FbPostRow {
  return {
    views: pickMetric(viewsJson.data, 'post_media_view'),
    interactions: pickMetric(engagedJson.data, 'post_engaged_users'),
  };
}

// ---- Fetchers (verified against Explorer with a real connected account before trusting) ----
async function getJson(
  url: string,
): Promise<InsightsResponse & { error?: { code?: number; message?: string } }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  const json = await res.json();
  if (!res.ok || json.error) {
    const err = new Error(
      `Graph ${res.status}: ${json?.error?.message ?? 'error'}`,
    ) as Error & { graphCode?: number; httpStatus?: number };
    err.graphCode = json?.error?.code;
    err.httpStatus = res.status;
    throw err;
  }
  return json;
}

const q = (params: Record<string, string>) =>
  new URLSearchParams(params).toString();

export function fetchIgAccount(igId: string, token: string) {
  return getJson(
    `${GRAPH}/${igId}/insights?${q({ metric: 'reach,views,accounts_engaged,total_interactions', period: 'day', metric_type: 'total_value', access_token: token })}`,
  ).then(mapIgAccount);
}
export async function fetchFollowerCountDay(
  igId: string,
  token: string,
): Promise<number | null> {
  const json = await getJson(
    `${GRAPH}/${igId}/insights?${q({ metric: 'follower_count', period: 'day', access_token: token })}`,
  );
  return pickMetric(json.data, 'follower_count');
}
export async function fetchFollowerTotal(
  nodeId: string,
  token: string,
): Promise<number | null> {
  const res = await fetch(
    `${GRAPH}/${nodeId}?${q({ fields: 'followers_count', access_token: token })}`,
    { signal: AbortSignal.timeout(TIMEOUT) },
  );
  const json = await res.json();
  return typeof json?.followers_count === 'number'
    ? json.followers_count
    : null;
}
export async function fetchIgDemographics(
  igId: string,
  token: string,
): Promise<DemographicRow[]> {
  const dims = ['age', 'gender', 'country', 'city'];
  const out: DemographicRow[] = [];
  for (const dim of dims) {
    try {
      const json = await getJson(
        `${GRAPH}/${igId}/insights?${q({ metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', timeframe: 'last_90_days', breakdown: dim, access_token: token })}`,
      );
      out.push(...mapDemographics(dim, json));
    } catch {
      /* a dimension failing (e.g. <100 followers) is non-fatal */
    }
  }
  return out;
}
export function fetchIgMedia(mediaId: string, token: string) {
  return getJson(
    `${GRAPH}/${mediaId}/insights?${q({ metric: 'views,reach,saved,total_interactions', access_token: token })}`,
  ).then(mapMedia);
}
export function fetchFbPage(pageId: string, token: string) {
  return getJson(
    `${GRAPH}/${pageId}/insights?${q({ metric: 'page_media_view,page_post_engagements,page_total_media_view_unique', period: 'day', access_token: token })}`,
  ).then(mapFbPage);
}
export async function fetchFbPostInsight(
  postId: string,
  token: string,
): Promise<FbPostRow> {
  // post_media_view must be requested SOLO (can't combine in one call — spec §11).
  const views = await getJson(
    `${GRAPH}/${postId}/insights?${q({ metric: 'post_media_view', period: 'lifetime', access_token: token })}`,
  ).catch(() => ({ data: [] }));
  const engaged = await getJson(
    `${GRAPH}/${postId}/insights?${q({ metric: 'post_engaged_users', period: 'lifetime', access_token: token })}`,
  ).catch(() => ({ data: [] }));
  return mapFbPost(views, engaged);
}
