// apps/frontend/src/app/api/oauth/tiktok/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { verifyState } from '@gitroom/frontend/lib/oauth/state';
import { encryptToken } from '@gitroom/frontend/lib/oauth/crypto';
import {
  exchangeCode,
  fetchUserInfo,
} from '@gitroom/frontend/lib/oauth/tiktok';
import {
  tiktokClientKey,
  tiktokClientSecret,
  tiktokRedirectUri,
} from '@gitroom/frontend/lib/oauth/config';
import {
  ensureCreatorForUser,
  attachOwnedProfile,
  upsertOAuthConnection,
} from '@d3/database';

export const runtime = 'nodejs';

function back(origin: string, params: Record<string, string>) {
  const u = new URL('/me/connections', origin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const auth = await getAuthContext();
  if (!auth) return NextResponse.redirect(new URL('/login', origin));

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  if (!code || !state) return back(origin, { error: 'missing_code' });

  const payload = state ? verifyState(state) : null;
  if (!payload || payload.uid !== auth.userId)
    return back(origin, { error: 'bad_state' });

  const jar = await cookies();
  const verifier = jar.get('tt_pkce')?.value;
  if (!verifier) return back(origin, { error: 'missing_pkce' });
  jar.delete('tt_pkce');

  try {
    const tok = await exchangeCode({
      clientKey: tiktokClientKey(),
      clientSecret: tiktokClientSecret(),
      redirectUri: tiktokRedirectUri(),
      code,
      codeVerifier: verifier,
    });
    const info = await fetchUserInfo(tok.access_token);
    const handle = info.display_name ?? tok.open_id;

    const creator = await ensureCreatorForUser({ user_id: auth.userId });
    if (creator.ok !== true) return back(origin, { error: 'creator_failed' });

    const attach = await attachOwnedProfile({
      user_id: auth.userId,
      creator_id: creator.value.creator_id,
      platform: 'tiktok',
      handle,
      external_account_id: tok.open_id,
    });
    if (attach.ok !== true) return back(origin, { error: 'attach_failed' });

    const now = Date.now();
    const up = await upsertOAuthConnection({
      user_id: auth.userId,
      profile_id: attach.value.profile_id,
      platform: 'tiktok',
      external_account_id: tok.open_id,
      account_name: handle,
      scopes: tok.scope,
      access: encryptToken(tok.access_token),
      refresh: encryptToken(tok.refresh_token),
      access_expires_at: new Date(now + tok.expires_in * 1000).toISOString(),
      refresh_expires_at: new Date(
        now + tok.refresh_expires_in * 1000,
      ).toISOString(),
    });
    if (up.ok !== true) return back(origin, { error: 'store_failed' });

    return back(origin, { connected: 'tiktok' });
  } catch {
    return back(origin, { error: 'tiktok_oauth_failed' });
  }
}
