// apps/frontend/src/lib/oauth/tokens.ts
import { decryptToken, encryptToken } from './crypto';
import { refresh as tiktokRefresh } from './tiktok';
import { tiktokClientKey, tiktokClientSecret } from './config';
import { updateConnectionTokens } from '@d3/database';

export interface OAuthConnectionRow {
  id: string;
  platform: string;
  status: string;
  access_ct: string;
  access_iv: string;
  access_tag: string;
  refresh_ct: string | null;
  refresh_iv: string | null;
  refresh_tag: string | null;
  access_expires_at: string | null;
}

const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Usable access token for a connection.
 *  - Meta (instagram/facebook): the stored blob is a long-lived Page token — no
 *    refresh; just decrypt.
 *  - TikTok: access expires ~24h. Refresh when near/past expiry, persist the
 *    rotated access+refresh, and return the fresh access token.
 */
export async function getValidToken(c: OAuthConnectionRow): Promise<string> {
  if (c.status !== 'active' || !c.access_ct) {
    throw new Error('connection not active');
  }
  if (c.platform === 'tiktok') {
    const expMs = c.access_expires_at ? Date.parse(c.access_expires_at) : 0;
    const needsRefresh =
      !c.access_expires_at || expMs - Date.now() < REFRESH_SKEW_MS;
    if (needsRefresh) {
      // All three blob fields must be present together — a half-written row
      // (refresh_ct set but iv/tag null) would otherwise fail obscurely inside
      // decryptToken. Fail explicitly instead.
      if (!c.refresh_ct || !c.refresh_iv || !c.refresh_tag) {
        throw new Error('invalid refresh token data');
      }
      const refreshToken = decryptToken({
        ct: c.refresh_ct,
        iv: c.refresh_iv,
        tag: c.refresh_tag,
      });
      const tok = await tiktokRefresh({
        clientKey: tiktokClientKey(),
        clientSecret: tiktokClientSecret(),
        refreshToken,
      });
      const now = Date.now();
      // TikTok has already rotated the refresh token, so if we can't persist the
      // new pair the connection is desynced — fail loudly rather than return a
      // token built on un-saved state (the cron then marks the connection bad).
      const saved = await updateConnectionTokens(c.id, {
        access: encryptToken(tok.access_token),
        refresh: encryptToken(tok.refresh_token),
        access_expires_at: new Date(now + tok.expires_in * 1000).toISOString(),
        refresh_expires_at: new Date(
          now + tok.refresh_expires_in * 1000,
        ).toISOString(),
      });
      if (saved.ok !== true) {
        throw new Error(`failed to persist refreshed token: ${saved.error}`);
      }
      return tok.access_token;
    }
  }
  return decryptToken({ ct: c.access_ct, iv: c.access_iv, tag: c.access_tag });
}
