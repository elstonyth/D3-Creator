// apps/frontend/src/lib/oauth/meta.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { META_GRAPH_VERSION } from './config';

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** Verify a Meta signed_request ("<sig>.<payload>", base64url). */
export function verifySignedRequest(
  signed: string,
  appSecret: string,
): Record<string, unknown> | null {
  const [encodedSig, payload] = signed.split('.');
  if (!encodedSig || !payload) return null;
  const expected = createHmac('sha256', appSecret).update(payload).digest();
  const provided = Buffer.from(encodedSig, 'base64url');
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      data.algorithm &&
      String(data.algorithm).toUpperCase() !== 'HMAC-SHA256'
    )
      return null;
    return data;
  } catch {
    return null;
  }
}

export function metaAuthorizeUrl(opts: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string {
  const p = new URLSearchParams({
    client_id: opts.appId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    response_type: 'code',
    scope: opts.scopes.join(','),
  });
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${p.toString()}`;
}

export interface MetaToken {
  access_token: string;
  expires_in?: number;
}

export async function exchangeCode(opts: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<MetaToken> {
  const p = new URLSearchParams({
    client_id: opts.appId,
    client_secret: opts.appSecret,
    redirect_uri: opts.redirectUri,
    code: opts.code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${p.toString()}`);
  if (!res.ok)
    throw new Error(
      `Meta code exchange failed: ${res.status} ${await res.text()}`,
    );
  return (await res.json()) as MetaToken;
}

export async function exchangeLongLived(opts: {
  appId: string;
  appSecret: string;
  shortToken: string;
}): Promise<MetaToken> {
  const p = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: opts.appId,
    client_secret: opts.appSecret,
    fb_exchange_token: opts.shortToken,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${p.toString()}`);
  if (!res.ok)
    throw new Error(
      `Meta long-lived exchange failed: ${res.status} ${await res.text()}`,
    );
  return (await res.json()) as MetaToken;
}

export interface MetaTarget {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igId: string | null;
  igUsername: string | null;
}

/** List the user's Pages + each Page's linked IG business account. */
export async function listPagesAndIg(userToken: string): Promise<MetaTarget[]> {
  const p = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: userToken,
    limit: '100',
  });
  const res = await fetch(`${GRAPH}/me/accounts?${p.toString()}`);
  if (!res.ok)
    throw new Error(
      `Meta /me/accounts failed: ${res.status} ${await res.text()}`,
    );
  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string };
    }>;
  };
  return (json.data ?? []).map((pg) => ({
    pageId: pg.id,
    pageName: pg.name,
    pageAccessToken: pg.access_token,
    igId: pg.instagram_business_account?.id ?? null,
    igUsername: pg.instagram_business_account?.username ?? null,
  }));
}
