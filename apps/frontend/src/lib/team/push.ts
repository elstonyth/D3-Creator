/**
 * Push notifications: the pop-up's news (components/team/work-alerts.tsx)
 * sent to the devices of whoever it is for, so it reaches a phone with the
 * portal closed. What each says is push-words.ts; devices sign up through
 * push-actions.ts; a due shoot's reminder is app/api/cron/work-due.
 *
 * - Nobody is pushed about their own act: an event whose person's login is
 *   the one that did it is skipped, as the pop-up does. Nor about what the
 *   pop-up would not show (isNews: a done shoot, one already due).
 * - People who left the board, or have no login, get nothing.
 * - A push never fails, or slows, the save that caused it: actions queue it
 *   with notify(), to run once the response is out, and sendPush never
 *   throws. A device its push service no longer knows (404/410) is dropped.
 * - Without the VAPID keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) nothing is
 *   sent.
 *
 * Server-only; a plain module so nothing here is a callable action.
 */

import { after } from 'next/server';
import { sendNotification } from 'web-push';
import { getSupabaseAdmin } from '@d3/database';
import { parseLocale } from '@gitroom/frontend/lib/i18n';
import {
  isNews,
  pushText,
  type PushEvent,
  type PushText,
} from './push-words';

export type { PushEvent } from './push-words';

// Who push services contact about our key.
const SUBJECT = 'https://www.d3creator.com';
// A push nobody could deliver in a day is stale news.
const TTL_SECONDS = 24 * 60 * 60;

interface SubscriptionRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  locale: string;
  path: string;
}

/** The public key devices subscribe with, or null while push is off. */
export function pushKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? process.env.VAPID_PUBLIC_KEY
    : null;
}

/** Push these once the response is out: the save never waits on it. */
export function notify(events: PushEvent[], actorUserId: string): void {
  if (events.length === 0 || !pushKey()) return;
  try {
    after(() => sendPush(events, actorUserId));
  } catch (err) {
    // Nothing to run after (called outside a request): no push — and never
    // a saved change reported as failed.
    console.error('[push] could not queue', err);
  }
}

/**
 * Push each event to every device of its person, in that device's language.
 * `actorUserId` is the login that did it (null: nobody, as for the cron).
 * How many were delivered; never throws.
 */
export async function sendPush(
  events: PushEvent[],
  actorUserId: string | null,
): Promise<number> {
  const publicKey = pushKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const now = Date.now();
  const news = events.filter((e) => isNews(e, now));
  if (!publicKey || !privateKey || news.length === 0) return 0;
  try {
    const db = getSupabaseAdmin();
    const personIds = new Set<string>();
    const creatorIds = new Set<string>();
    for (const e of news) {
      personIds.add(e.to);
      if (e.kind === 'edit') personIds.add(e.from);
      if (e.kind === 'verify') personIds.add(e.by);
      const creator = 'shoot' in e ? e.shoot.creatorId : e.creatorId;
      if (creator) creatorIds.add(creator);
    }
    const [people, accounts] = await Promise.all([
      db
        .from('tracker_member')
        .select('id, name, user_id, archived_at')
        .in('id', [...personIds]),
      creatorIds.size > 0
        ? db
            .from('creator')
            .select('id, display_name')
            .in('id', [...creatorIds])
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (people.error) throw people.error;
    if (accounts.error) throw accounts.error;
    const members = (people.data ?? []) as {
      id: string;
      name: string;
      user_id: string | null;
      archived_at: string | null;
    }[];
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const accountOf = new Map(
      ((accounts.data ?? []) as { id: string; display_name: string }[]).map(
        (a) => [a.id, a.display_name],
      ),
    );
    // Who is told: on the board, with a login, and not the one who did it.
    const loginOf = new Map(
      members
        .filter((m) => m.archived_at === null && m.user_id !== null)
        .map((m) => [m.id, m.user_id as string]),
    );
    const told = news.filter((e) => {
      const login = loginOf.get(e.to);
      return login !== undefined && login !== actorUserId;
    });
    if (told.length === 0) return 0;

    const subs = await db
      .from('push_subscription')
      .select('endpoint, user_id, p256dh, auth, locale, path')
      .in('user_id', [...new Set(told.map((e) => loginOf.get(e.to)!))]);
    if (subs.error) throw subs.error;
    const names = {
      person: (id: string) => nameOf.get(id) ?? '—',
      account: (id: string | null) => (id ? (accountOf.get(id) ?? null) : null),
    };
    const sends: Promise<boolean>[] = [];
    for (const e of told)
      for (const s of (subs.data ?? []) as SubscriptionRow[])
        if (s.user_id === loginOf.get(e.to))
          sends.push(
            deliver(s, pushText(e, parseLocale(s.locale), names), {
              publicKey,
              privateKey,
            }),
          );
    return (await Promise.all(sends)).filter(Boolean).length;
  } catch (err) {
    console.error('[push] could not send', err);
    return 0;
  }
}

async function deliver(
  s: SubscriptionRow,
  text: PushText,
  keys: { publicKey: string; privateKey: string },
): Promise<boolean> {
  try {
    await sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      JSON.stringify({ ...text, path: s.path }),
      {
        TTL: TTL_SECONDS,
        urgency: 'high',
        vapidDetails: { subject: SUBJECT, ...keys },
      },
    );
    return true;
  } catch (err) {
    const status = (err as { statusCode?: unknown } | null)?.statusCode;
    if (status === 404 || status === 410) {
      // Unsubscribed, or the app removed: this device is gone for good.
      await getSupabaseAdmin()
        .from('push_subscription')
        .delete()
        .eq('endpoint', s.endpoint);
    } else {
      // The endpoint is the device's address: log only whose service it is.
      console.error('[push] not delivered', {
        status,
        service: new URL(s.endpoint).host,
      });
    }
    return false;
  }
}
