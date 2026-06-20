// apps/frontend/src/lib/oauth/meta.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { META_GRAPH_VERSION, metaIncludeBusinessPages } from './config';

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
  const res = await fetch(`${GRAPH}/oauth/access_token?${p.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });
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
  const res = await fetch(`${GRAPH}/oauth/access_token?${p.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });
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

interface PageNode {
  id: string;
  name: string;
  access_token?: string;
  instagram_business_account?: { id: string; username?: string };
}

const PAGE_FIELDS = 'id,name,access_token,instagram_business_account{id,username}';

function mapPageNode(pg: PageNode): MetaTarget {
  return {
    pageId: pg.id,
    pageName: pg.name,
    pageAccessToken: pg.access_token ?? '',
    igId: pg.instagram_business_account?.id ?? null,
    igUsername: pg.instagram_business_account?.username ?? null,
  };
}

/** Pages where the user has a direct role (`/me/accounts`). */
async function fetchMeAccounts(userToken: string): Promise<MetaTarget[]> {
  const p = new URLSearchParams({
    fields: PAGE_FIELDS,
    access_token: userToken,
    limit: '100',
  });
  const res = await fetch(`${GRAPH}/me/accounts?${p.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok)
    throw new Error(
      `Meta /me/accounts failed: ${res.status} ${await res.text()}`,
    );
  const json = (await res.json()) as { data?: PageNode[] };
  return (json.data ?? []).map(mapPageNode);
}

/**
 * Pages owned by (or shared into) the user's Business Manager portfolios. These
 * never surface in `/me/accounts`, so a creator whose Page lives in a business
 * portfolio would otherwise connect with zero Pages found. Requires the
 * `business_management` scope. Best-effort: any failure (scope not granted →
 * `#100`, no businesses, network) yields `[]` rather than breaking the connect.
 */
async function fetchBusinessPagesAndIg(userToken: string): Promise<MetaTarget[]> {
  const p = new URLSearchParams({
    fields: `owned_pages.limit(100){${PAGE_FIELDS}},client_pages.limit(100){${PAGE_FIELDS}}`,
    access_token: userToken,
    limit: '100',
  });
  const res = await fetch(`${GRAPH}/me/businesses?${p.toString()}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data?: Array<{
      owned_pages?: { data?: PageNode[] };
      client_pages?: { data?: PageNode[] };
    }>;
  };
  const out: MetaTarget[] = [];
  for (const biz of json.data ?? []) {
    for (const pg of biz.owned_pages?.data ?? []) out.push(mapPageNode(pg));
    for (const pg of biz.client_pages?.data ?? []) out.push(mapPageNode(pg));
  }
  // Without a Page token we can't read insights, so drop tokenless entries.
  return out.filter((t) => t.pageAccessToken);
}

/**
 * List the user's Pages + each Page's linked IG business account. Always covers
 * directly-administered Pages; when `META_INCLUDE_BUSINESS_PAGES` is enabled it
 * also merges in business-portfolio-owned Pages (deduped by id, direct wins).
 */
export async function listPagesAndIg(userToken: string): Promise<MetaTarget[]> {
  const direct = await fetchMeAccounts(userToken);
  if (!metaIncludeBusinessPages()) return direct;

  let business: MetaTarget[] = [];
  try {
    business = await fetchBusinessPagesAndIg(userToken);
  } catch {
    business = []; // keep the direct results if the business edge throws
  }

  const byId = new Map<string, MetaTarget>();
  for (const t of [...business, ...direct]) byId.set(t.pageId, t);
  return [...byId.values()];
}
