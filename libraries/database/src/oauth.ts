// libraries/database/src/oauth.ts
import { getSupabaseAdmin } from './supabase-server';
import { findOrCreateProfile } from './claim';
import type { Platform, Result } from './types';

export type OAuthPlatform = 'instagram' | 'facebook' | 'tiktok';

export interface EncryptedBlob {
  ct: string;
  iv: string;
  tag: string;
}

/** Build the canonical profile_url for an owned account so it matches the
 *  same URL shape the scraper/admin would have stored. */
export function ownedProfileUrl(
  platform: OAuthPlatform,
  handle: string,
  externalId: string,
): string {
  switch (platform) {
    case 'instagram':
      return `https://www.instagram.com/${handle}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`;
    case 'facebook':
      // Pages are stable by id; numeric id is always resolvable.
      return `https://www.facebook.com/${externalId}`;
  }
}

/**
 * Ensure a profile + owner claim for a connected account, owned by user_id.
 * Reuses findOrCreateProfile (race-safe canonical lookup) then inserts an
 * 'owner'/'oauth' claim. The scraped profile (if any) is matched by URL.
 */
export async function attachOwnedProfile(input: {
  user_id: string;
  creator_id: string;
  platform: OAuthPlatform;
  handle: string;
  external_account_id: string;
}): Promise<Result<{ profile_id: string }>> {
  const supabase = getSupabaseAdmin();
  const url = ownedProfileUrl(
    input.platform,
    input.handle,
    input.external_account_id,
  );

  const found = await findOrCreateProfile({
    platform: input.platform as Platform,
    profile_url: url,
    fallback_creator_id: input.creator_id,
  });
  if (found.ok !== true) return { ok: false, error: found.error };
  const profileId = found.value.profile.id;

  // Owner claim. Insert directly (service role) so we can set claimed_via='oauth'.
  const claim = await supabase.from('profile_claim').upsert(
    {
      user_id: input.user_id,
      profile_id: profileId,
      claim_kind: 'owner',
      claimed_via: 'oauth',
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,profile_id' },
  );
  if (claim.error) {
    // 23505 from the partial unique "one owner per profile" => owned by someone else.
    if (claim.error.code === '23505') {
      return {
        ok: false,
        error: 'This account is already connected by another user.',
      };
    }
    return { ok: false, error: `Owner claim failed: ${claim.error.message}` };
  }
  return { ok: true, value: { profile_id: profileId } };
}

/** Upsert the encrypted token row for (user, platform, external account). */
export async function upsertOAuthConnection(input: {
  user_id: string;
  profile_id: string;
  platform: OAuthPlatform;
  external_account_id: string;
  account_name: string | null;
  scopes: string | null;
  access: EncryptedBlob;
  refresh: EncryptedBlob | null;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
}): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseAdmin();
  const row = {
    user_id: input.user_id,
    profile_id: input.profile_id,
    platform: input.platform,
    external_account_id: input.external_account_id,
    account_name: input.account_name,
    scopes: input.scopes,
    access_ct: input.access.ct,
    access_iv: input.access.iv,
    access_tag: input.access.tag,
    refresh_ct: input.refresh?.ct ?? null,
    refresh_iv: input.refresh?.iv ?? null,
    refresh_tag: input.refresh?.tag ?? null,
    access_expires_at: input.access_expires_at,
    refresh_expires_at: input.refresh_expires_at,
    status: 'active' as const,
    last_refreshed_at: new Date().toISOString(),
  };
  const res = await supabase
    .from('oauth_connection')
    .upsert(row, { onConflict: 'user_id,platform,external_account_id' })
    .select('id')
    .single();
  if (res.error || !res.data) {
    return {
      ok: false,
      error: `Connection upsert failed: ${res.error?.message ?? 'no row'}`,
    };
  }
  return { ok: true, value: { id: res.data.id } };
}

/** Disconnect: wipe token blobs + mark revoked. Keeps the profile + claim. */
export async function revokeOAuthConnection(input: {
  user_id: string;
  connection_id: string;
}): Promise<Result<true>> {
  const supabase = getSupabaseAdmin();
  const res = await supabase
    .from('oauth_connection')
    .update({
      status: 'revoked',
      access_ct: '',
      access_iv: '',
      access_tag: '',
      refresh_ct: null,
      refresh_iv: null,
      refresh_tag: null,
    })
    .eq('id', input.connection_id)
    .eq('user_id', input.user_id); // scope to owner so one user can't revoke another's
  if (res.error)
    return { ok: false, error: `Revoke failed: ${res.error.message}` };
  return { ok: true, value: true };
}

/** Delete all of a Meta user's connections (deauthorize / data-deletion). */
export async function deleteMetaConnectionsForUser(
  user_id: string,
): Promise<Result<true>> {
  const supabase = getSupabaseAdmin();
  const res = await supabase
    .from('oauth_connection')
    .delete()
    .eq('user_id', user_id)
    .in('platform', ['instagram', 'facebook']);
  if (res.error)
    return { ok: false, error: `Meta delete failed: ${res.error.message}` };
  return { ok: true, value: true };
}
