// apps/frontend/src/lib/oauth/config.ts
import { SITE_URL } from '@gitroom/frontend/lib/site';

export const META_GRAPH_VERSION = 'v21.0'; // bump to latest stable if needed

export function metaRedirectUri(): string {
  return `${SITE_URL}/api/oauth/meta/callback`;
}
export function tiktokRedirectUri(): string {
  return `${SITE_URL}/api/oauth/tiktok/callback`;
}

export function requireOauthEncKey(): Buffer {
  const b64 = process.env.OAUTH_ENC_KEY;
  if (!b64) throw new Error('OAUTH_ENC_KEY is not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32)
    throw new Error(`OAUTH_ENC_KEY must decode to 32 bytes, got ${key.length}`);
  return key;
}

export function metaAppId(): string {
  const v = process.env.META_APP_ID;
  if (!v) throw new Error('META_APP_ID is not set');
  return v;
}
export function metaAppSecret(): string {
  const v = process.env.META_APP_SECRET;
  if (!v) throw new Error('META_APP_SECRET is not set');
  return v;
}
export function tiktokClientKey(): string {
  const v = process.env.TIKTOK_CLIENT_KEY;
  if (!v) throw new Error('TIKTOK_CLIENT_KEY is not set');
  return v;
}
export function tiktokClientSecret(): string {
  const v = process.env.TIKTOK_CLIENT_SECRET;
  if (!v) throw new Error('TIKTOK_CLIENT_SECRET is not set');
  return v;
}
