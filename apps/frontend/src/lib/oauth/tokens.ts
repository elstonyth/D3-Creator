// apps/frontend/src/lib/oauth/tokens.ts
import { decryptToken } from './crypto';

export interface OAuthConnectionRow {
  id: string;
  platform: string;
  status: string;
  access_ct: string;
  access_iv: string;
  access_tag: string;
}

/**
 * Return a usable access token for a connection. For Meta the stored blob is a
 * long-lived Page token (Phase 1) — no proactive refresh; if Graph later returns
 * 401/code 190 the caller marks the connection 'expired' (reconnect to recover).
 */
export function getValidToken(c: OAuthConnectionRow): string {
  if (c.status !== 'active' || !c.access_ct) {
    throw new Error('connection not active');
  }
  return decryptToken({ ct: c.access_ct, iv: c.access_iv, tag: c.access_tag });
}
