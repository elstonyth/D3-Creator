// apps/frontend/src/lib/oauth/config.ts
import { SITE_URL } from '@gitroom/frontend/lib/site';

export const META_GRAPH_VERSION = 'v25.0'; // bump to latest stable if needed

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

/**
 * Read a required env var, trimming stray whitespace. Env values sometimes carry
 * a leading tab or space — a leading tab in prod `META_APP_ID` once put `%09`
 * into the OAuth client_id, so Facebook couldn't match the app and re-prompted
 * login. Whitespace-only is treated as unset.
 */
function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export function metaAppId(): string {
  return requireEnv('META_APP_ID');
}
export function metaAppSecret(): string {
  return requireEnv('META_APP_SECRET');
}

/**
 * Opt-in: also discover Pages owned by a Business Manager portfolio (which never
 * appear in `/me/accounts`). Requires the `business_management` scope, which in
 * turn requires Meta App Review + Business Verification for non-test users — so
 * it stays OFF by default and is enabled per-deployment once that's in place.
 */
export function metaIncludeBusinessPages(): boolean {
  return process.env.META_INCLUDE_BUSINESS_PAGES === 'true';
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
