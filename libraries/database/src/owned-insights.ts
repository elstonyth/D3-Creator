// libraries/database/src/owned-insights.ts
import { getSupabaseAdmin } from './supabase-server';
import type { Result } from './types';
import type { EncryptedBlob } from './oauth';

export interface ProfileInsightInput {
  profile_id: string;
  /** Single source of truth for the day key — passed by the caller so the
   *  JS clock and the DB `current_date` default can never disagree at a TZ/
   *  midnight boundary. ISO date (YYYY-MM-DD). */
  captured_date: string;
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
/** Replace one day's demographics for a profile (delete-then-insert). The day
 *  key is passed in (not computed here) so it matches the profile/post upserts
 *  exactly — see ProfileInsightInput.captured_date. */
export async function replaceAudienceDemographics(
  profile_id: string,
  captured_date: string,
  rows: DemographicInput[],
): Promise<Result<number>> {
  const db = getSupabaseAdmin();
  const del = await db
    .from('owned_audience_demographic')
    .delete()
    .eq('profile_id', profile_id)
    .eq('captured_date', captured_date);
  if (del.error) return { ok: false, error: del.error.message };
  if (rows.length === 0) return { ok: true, value: 0 };
  const ins = await db
    .from('owned_audience_demographic')
    .insert(rows.map((r) => ({ profile_id, captured_date, ...r })));
  return ins.error
    ? { ok: false, error: ins.error.message }
    : { ok: true, value: rows.length };
}

export interface PostInsightInput {
  profile_id: string;
  external_post_id: string;
  /** Day key, passed by the caller (see ProfileInsightInput.captured_date). */
  captured_date: string;
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

export async function updateConnectionTokens(
  connection_id: string,
  input: {
    access: EncryptedBlob;
    refresh: EncryptedBlob;
    access_expires_at: string;
    refresh_expires_at: string;
  },
): Promise<Result<true>> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from('oauth_connection')
    .update({
      access_ct: input.access.ct,
      access_iv: input.access.iv,
      access_tag: input.access.tag,
      refresh_ct: input.refresh.ct,
      refresh_iv: input.refresh.iv,
      refresh_tag: input.refresh.tag,
      access_expires_at: input.access_expires_at,
      refresh_expires_at: input.refresh_expires_at,
      last_refreshed_at: new Date().toISOString(),
    })
    .eq('id', connection_id);
  return error
    ? { ok: false, error: error.message }
    : { ok: true, value: true };
}
