// apps/frontend/src/lib/oauth/tiktok.ts
const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const USERINFO = 'https://open.tiktokapis.com/v2/user/info/';

export function tiktokAuthorizeUrl(opts: {
  clientKey: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: string[];
}): string {
  const p = new URLSearchParams({
    client_key: opts.clientKey,
    response_type: 'code',
    scope: opts.scopes.join(','),
    redirect_uri: opts.redirectUri,
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE}?${p.toString()}`;
}

export interface TikTokToken {
  access_token: string;
  expires_in: number; // seconds (~86400)
  refresh_token: string;
  refresh_expires_in: number; // seconds (~31536000)
  open_id: string;
  scope: string;
}

export async function exchangeCode(opts: {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<TikTokToken> {
  const body = new URLSearchParams({
    client_key: opts.clientKey,
    client_secret: opts.clientSecret,
    code: opts.code,
    grant_type: 'authorization_code',
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `TikTok code exchange failed: ${res.status} ${JSON.stringify(json)}`,
    );
  }
  return json as TikTokToken;
}

export async function refresh(opts: {
  clientKey: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TikTokToken> {
  const body = new URLSearchParams({
    client_key: opts.clientKey,
    client_secret: opts.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
  });
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `TikTok refresh failed: ${res.status} ${JSON.stringify(json)}`,
    );
  }
  return json as TikTokToken;
}

export async function fetchUserInfo(
  accessToken: string,
): Promise<{ open_id: string; display_name: string | null }> {
  const res = await fetch(`${USERINFO}?fields=open_id,display_name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json();
  if (!res.ok || json.error?.code !== 'ok') {
    throw new Error(
      `TikTok user/info failed: ${res.status} ${JSON.stringify(json)}`,
    );
  }
  return {
    open_id: json.data?.user?.open_id ?? '',
    display_name: json.data?.user?.display_name ?? null,
  };
}
