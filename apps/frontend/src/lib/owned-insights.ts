// apps/frontend/src/lib/owned-insights.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProfileDay {
  captured_date: string;
  reach: number | null;
  views: number | null;
  accounts_engaged: number | null;
  total_interactions: number | null;
  page_engagements: number | null;
  follower_delta: number | null;
  follower_total: number | null;
}
export interface DemoRow {
  dimension: string;
  bucket: string;
  value: number;
}
export interface PostRow {
  external_post_id: string;
  views: number | null;
  reach: number | null;
  saves: number | null;
  interactions: number | null;
}
export interface OwnedInsights {
  profile: ProfileDay[];
  demographics: DemoRow[];
  posts: PostRow[];
}

function normalize(data: unknown): OwnedInsights | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<OwnedInsights>;
  return {
    profile: d.profile ?? [],
    demographics: d.demographics ?? [],
    posts: d.posts ?? [],
  };
}

export async function getMyOwnedInsights(
  client: SupabaseClient,
  profileId: string,
  days = 30,
): Promise<OwnedInsights | null> {
  const { data, error } = await client.rpc('get_my_owned_insights', {
    p_profile_id: profileId,
    p_days: days,
  });
  if (error) throw error;
  return normalize(data);
}
export async function getAdminOwnedInsights(
  client: SupabaseClient,
  profileId: string,
  days = 30,
): Promise<OwnedInsights | null> {
  const { data, error } = await client.rpc('get_admin_owned_insights', {
    p_profile_id: profileId,
    p_days: days,
  });
  if (error) throw error;
  return normalize(data);
}
