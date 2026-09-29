/**
 * What a browser hands over when notifications are turned on, checked before
 * it is kept (lib/team/push-actions.ts). The server later POSTs to the
 * endpoint, so only a real push service's https address gets in — never one
 * a browser made up. Pure: shared by the action and its tests.
 */

import type { Locale } from '@gitroom/frontend/lib/i18n';

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** The device's language: pushes are worded in it. */
  locale: Locale;
  /** Where a tap on a notification lands, on this device's host. */
  path: string;
}

// Chrome and Android (FCM), Safari and iPhone (Apple), Firefox (Mozilla),
// Edge on Windows (WNS).
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
// A tracker page on this host: `/`, `/tracker`, `/staff`, `/admin/tracker`.
const PATH = /^\/[a-z0-9/-]{0,60}$/;

const REFUSED = 'That browser gave a subscription that cannot be used.';

export function parsePushSubscription(
  sub: unknown,
  locale: unknown,
  path: unknown,
): { ok: true; value: PushSubscriptionInput } | { ok: false; message: string } {
  const no = { ok: false as const, message: REFUSED };
  if (!sub || typeof sub !== 'object') return no;
  const { endpoint, keys } = sub as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown } | null;
  };
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return no;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return no;
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.port !== '' ||
    !PUSH_HOSTS.some((h) => h.test(url.hostname))
  )
    return no;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (
    typeof p256dh !== 'string' ||
    !B64URL.test(p256dh) ||
    p256dh.length < 80 ||
    p256dh.length > 100
  )
    return no;
  if (
    typeof auth !== 'string' ||
    !B64URL.test(auth) ||
    auth.length < 16 ||
    auth.length > 30
  )
    return no;
  if (locale !== 'en' && locale !== 'zh') return no;
  if (typeof path !== 'string' || !PATH.test(path) || path.startsWith('//'))
    return no;
  return { ok: true, value: { endpoint, p256dh, auth, locale, path } };
}
