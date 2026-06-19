// apps/frontend/src/lib/oauth/insights-tiktok.ts
// TikTok Open API (Display) v2. Account stats (user.info.stats) + recent videos
// (video.list). Stable field set; defensive — a failed call yields null/[].
const USERINFO = 'https://open.tiktokapis.com/v2/user/info/';
const VIDEO_LIST = 'https://open.tiktokapis.com/v2/video/list/';
const TIMEOUT = 15000;
const VIDEO_FETCH_LIMIT = 20;

interface TikTokVideo {
  id?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  [k: string]: unknown;
}

export interface TikTokAccountRow {
  follower_total: number | null;
  total_interactions: number | null;
  following_count: number | null;
  video_count: number | null;
}
export function mapTikTokAccount(json: {
  data?: { user?: Record<string, unknown> };
}): TikTokAccountRow {
  const u = json?.data?.user ?? {};
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  return {
    follower_total: num(u.follower_count),
    total_interactions: num(u.likes_count),
    following_count: num(u.following_count),
    video_count: num(u.video_count),
  };
}

export interface TikTokVideoRow {
  external_post_id: string;
  views: number | null;
  interactions: number | null;
  raw: unknown;
}
export function mapTikTokVideos(videos: TikTokVideo[]): TikTokVideoRow[] {
  return (videos ?? [])
    .filter((v) => typeof v.id === 'string')
    .map((v) => ({
      external_post_id: v.id as string,
      views: typeof v.view_count === 'number' ? v.view_count : null,
      interactions:
        (v.like_count ?? 0) + (v.comment_count ?? 0) + (v.share_count ?? 0),
      raw: v,
    }));
}
export function sumVideoViews(videos: TikTokVideo[]): number {
  return (videos ?? []).reduce(
    (acc, v) => acc + (typeof v.view_count === 'number' ? v.view_count : 0),
    0,
  );
}

export async function fetchUserStats(
  token: string,
): Promise<{ data?: { user?: Record<string, unknown> } }> {
  const fields =
    'open_id,follower_count,following_count,likes_count,video_count';
  const res = await fetch(`${USERINFO}?fields=${fields}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const json = await res.json();
  if (!res.ok || json.error?.code !== 'ok') {
    const err = new Error(`TikTok user/info failed: ${res.status}`) as Error & {
      httpStatus?: number;
    };
    err.httpStatus = res.status;
    throw err;
  }
  return json;
}

export async function fetchVideoList(token: string): Promise<TikTokVideo[]> {
  const fields =
    'id,view_count,like_count,comment_count,share_count,title,create_time';
  const res = await fetch(`${VIDEO_LIST}?fields=${fields}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ max_count: VIDEO_FETCH_LIMIT }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const json = await res.json();
  if (!res.ok || json.error?.code !== 'ok') {
    const err = new Error(
      `TikTok video/list failed: ${res.status}`,
    ) as Error & { httpStatus?: number };
    err.httpStatus = res.status;
    throw err;
  }
  return (json.data?.videos ?? []) as TikTokVideo[];
}
