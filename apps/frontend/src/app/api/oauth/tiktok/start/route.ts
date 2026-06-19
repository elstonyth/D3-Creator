// apps/frontend/src/app/api/oauth/tiktok/start/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { signState, makePkce } from '@gitroom/frontend/lib/oauth/state';
import { tiktokAuthorizeUrl } from '@gitroom/frontend/lib/oauth/tiktok';
import {
  tiktokClientKey,
  tiktokRedirectUri,
} from '@gitroom/frontend/lib/oauth/config';

export const runtime = 'nodejs';

const SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
];

export async function GET() {
  const auth = await getAuthContext();
  if (!auth || auth.role === 'admin') {
    return NextResponse.redirect(
      new URL(
        '/login',
        process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.d3creator.com',
      ),
    );
  }
  const state = signState(auth.userId);
  const { verifier, challenge } = makePkce();
  (await cookies()).set('tt_pkce', verifier, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/oauth/tiktok',
    maxAge: 600,
  });
  const url = tiktokAuthorizeUrl({
    clientKey: tiktokClientKey(),
    redirectUri: tiktokRedirectUri(),
    state,
    codeChallenge: challenge,
    scopes: SCOPES,
  });
  return NextResponse.redirect(url);
}
