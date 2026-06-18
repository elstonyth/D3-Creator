// apps/frontend/src/app/api/oauth/meta/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { verifyState } from '@gitroom/frontend/lib/oauth/state';
import { encryptToken } from '@gitroom/frontend/lib/oauth/crypto';
import {
  exchangeCode,
  exchangeLongLived,
  listPagesAndIg,
} from '@gitroom/frontend/lib/oauth/meta';
import {
  metaAppId,
  metaAppSecret,
  metaRedirectUri,
} from '@gitroom/frontend/lib/oauth/config';

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
  const payload = verifyState(state);
  if (!payload || payload.uid !== auth.userId)
    return back(origin, { error: 'bad_state' });

  try {
    const short = await exchangeCode({
      appId: metaAppId(),
      appSecret: metaAppSecret(),
      redirectUri: metaRedirectUri(),
      code,
    });
    const long = await exchangeLongLived({
      appId: metaAppId(),
      appSecret: metaAppSecret(),
      shortToken: short.access_token,
    });
    const targets = await listPagesAndIg(long.access_token);
    if (targets.length === 0) return back(origin, { error: 'no_pages' });

    // Stash: encrypted long-lived user token + non-secret target list.
    const enc = encryptToken(long.access_token);
    const stash = {
      userToken: enc,
      userTokenExp: long.expires_in
        ? Date.now() + long.expires_in * 1000
        : null,
      targets: targets.map((t) => ({
        pageId: t.pageId,
        pageName: t.pageName,
        igId: t.igId,
        igUsername: t.igUsername,
      })),
    };
    (await cookies()).set(
      'meta_pending',
      Buffer.from(JSON.stringify(stash), 'utf8').toString('base64'),
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/me/connections',
        maxAge: 600,
      },
    );
    return back(origin, { pick: 'meta' });
  } catch {
    return back(origin, { error: 'meta_oauth_failed' });
  }
}
