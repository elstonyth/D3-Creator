// libraries/database/src/owned-insights.ts
import { getSupabaseAdmin } from './supabase-server';
import type { Result } from './types';

export interface ProfileInsightInput {
  profile_id: string;
  platform: 'instagram' | 'facebook';
  reach: number | null;
  views: number | null;
  accounts_engaged: number | null;
  total_interactions: number | null;
  page_engagements: number | null;
  follower_delta: number | null;
  follower_total: number | null;
  raw: unknown;
}
export async function upsertProfileInsight(
  i: ProfileInsightInput,
): Promise<Result<true>> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('owned_profile_insight')
    .upsert(
      { ...i, captured_at: new Date().toISOString() },
      { onConflict: 'profile_id,captured_date' },
    );
  return error
    ? { ok: false, error: error.message }
    : { ok: true, value: true };
}

export interface DemographicInput {
  dimension: string;
  bucket: string;
  value: number;
}
/** Replace today's demographics for a profile (delete-then-insert in one day window). */
export async function replaceAudienceDemographics(
  profile_id: string,
  rows: DemographicInput[],
): Promise<Result<number>> {
  const db = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const del = await db
    .from('owned_audience_demographic')
    .delete()
    .eq('profile_id', profile_id)
    .eq('captured_date', today);
  if (del.error) return { ok: false, error: del.error.message };
  if (rows.length === 0) return { ok: true, value: 0 };
  const ins = await db
    .from('owned_audience_demographic')
    .insert(rows.map((r) => ({ profile_id, captured_date: today, ...r })));
  return ins.error
    ? { ok: false, error: ins.error.message }
    : { ok: true, value: rows.length };
}

export interface PostInsightInput {
  profile_id: string;
  external_post_id: string;
  views: number | null;
  reach: number | null;
  saves: number | null;
  interactions: number | null;
  raw: unknown;
}
export async function upsertPostInsight(
  i: PostInsightInput,
): Promise<Result<true>> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('owned_post_insight')
    .upsert(
      { ...i, captured_at: new Date().toISOString() },
      { onConflict: 'profile_id,external_post_id,captured_date' },
    );
  return error
    ? { ok: false, error: error.message }
    : { ok: true, value: true };
}

export async function setConnectionStatus(
  connection_id: string,
  status: 'active' | 'expired' | 'revoked',
): Promise<Result<true>> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('oauth_connection')
    .update({ status })
    .eq('id', connection_id);
  return error
    ? { ok: false, error: error.message }
    : { ok: true, value: true };
}
