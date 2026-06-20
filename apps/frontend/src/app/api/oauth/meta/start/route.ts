// apps/frontend/src/app/api/oauth/meta/start/route.ts
import { NextResponse } from 'next/server';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { signState } from '@gitroom/frontend/lib/oauth/state';
import { metaAuthorizeUrl } from '@gitroom/frontend/lib/oauth/meta';
import {
  metaAppId,
  metaRedirectUri,
  metaIncludeBusinessPages,
} from '@gitroom/frontend/lib/oauth/config';

export const runtime = 'nodejs';

const SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
  'public_profile',
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
  const scopes = metaIncludeBusinessPages()
    ? [...SCOPES, 'business_management']
    : SCOPES;
  const url = metaAuthorizeUrl({
    appId: metaAppId(),
    redirectUri: metaRedirectUri(),
    state: signState(auth.userId),
    scopes,
  });
  return NextResponse.redirect(url);
}
