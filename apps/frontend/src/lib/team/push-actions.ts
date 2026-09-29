'use server';

/**
 * Turning push notifications on and off for this device (the tracker's
 * PushToggle; lib/team/push.ts sends them). Only staff and the admin have a
 * tracker to be told about. A device is filed under the login from the
 * session, never one the browser names, and saving again moves it to
 * whoever is signed in on it now: one row per endpoint.
 */

import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { dbError } from './db-error';
import { parsePushSubscription } from './push-input';

export interface PushResult {
  ok: boolean;
  message?: string;
}

const NOT_AUTHORIZED = { ok: false, message: 'Not authorized.' } as const;

async function myLogin(): Promise<string | null> {
  const auth = await getAuthContext();
  return auth?.role === 'staff' || auth?.role === 'admin' ? auth.userId : null;
}

/** Keep this device's subscription, in its language, landing on `path`. */
export async function savePush(
  sub: unknown,
  locale: unknown,
  path: unknown,
): Promise<PushResult> {
  try {
    const userId = await myLogin();
    if (!userId) return NOT_AUTHORIZED;
    const p = parsePushSubscription(sub, locale, path);
    if (!p.ok) return p;
    const { error } = await getSupabaseAdmin()
      .from('push_subscription')
      .upsert({ ...p.value, user_id: userId }, { onConflict: 'endpoint' });
    if (error) return dbError('savePush', error);
    return { ok: true };
  } catch (e) {
    return dbError('savePush', e);
  }
}

/** Forget this device (only if it is this login's). */
export async function dropPush(endpoint: unknown): Promise<PushResult> {
  try {
    const userId = await myLogin();
    if (!userId) return NOT_AUTHORIZED;
    if (typeof endpoint !== 'string' || endpoint.length > 1000)
      return { ok: false, message: 'Could not save. Try again.' };
    const { error } = await getSupabaseAdmin()
      .from('push_subscription')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', userId);
    if (error) return dbError('dropPush', error);
    return { ok: true };
  } catch (e) {
    return dbError('dropPush', e);
  }
}
