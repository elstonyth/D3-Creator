/**
 * The time's-up reminder, pushed — every minute (vercel.json). A planned
 * shoot whose push time (pushDueAt: an hour after its start, or 9 the next
 * morning with no time) has just come pushes its person "Shoot time is up —
 * pass the videos on" (lib/team/push.ts): the pop-up's reminder, for when
 * the portal is closed.
 *
 * Only reminders due in the last two hours (dueForPush), so the first run
 * after a deploy does not push every old one. Each shoot is claimed before it
 * is pushed — `due_pushed_for` set to its push time, only if not already — so
 * overlapping runs never push it twice, and a moved shoot (a new push time)
 * is reminded again.
 *
 * Auth: Bearer ${CRON_SECRET}, as the other crons.
 */

import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getSupabaseAdmin } from '@d3/database';
import { pushKey, sendPush } from '@gitroom/frontend/lib/team/push';
import {
  rowToShoot,
  SHOOT_COLS,
  type ShootRow,
} from '@gitroom/frontend/lib/team/shoot-rows';
import {
  dueForPush,
  pushDueAt,
  type Shoot,
} from '@gitroom/frontend/lib/team/shoots';
import { addDays, todayKey } from '@gitroom/frontend/lib/tracker';

export const dynamic = 'force-dynamic';

function assertAuth(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured on the server' },
      { status: 500 },
    );
  }
  const auth = request.headers.get('authorization') || '';
  const expectedFull = `Bearer ${expected}`;
  if (
    auth.length !== expectedFull.length ||
    !timingSafeEqual(
      Buffer.from(auth, 'utf8'),
      Buffer.from(expectedFull, 'utf8'),
    )
  ) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const denied = assertAuth(request);
  if (denied) return denied;
  if (!pushKey()) return NextResponse.json({ skipped: 'push is off' });

  const now = Date.now();
  const today = todayKey();
  const db = getSupabaseAdmin();
  // A shoot late yesterday, or with no time yesterday, falls due today.
  const { data, error } = await db
    .from('tracker_shoot')
    .select(`${SHOOT_COLS}, due_pushed_for`)
    .eq('status', 'planned')
    .gte('shoot_date', addDays(today, -1))
    .lte('shoot_date', today);
  if (error) {
    console.error('[cron work-due] read failed', error);
    return NextResponse.json({ error: 'read failed' }, { status: 500 });
  }
  const rows = (data ?? []) as (ShootRow & { due_pushed_for: string | null })[];
  const due = dueForPush(
    rows.map((r) => ({ ...rowToShoot(r), pushedFor: r.due_pushed_for })),
    now,
  ).filter(
    (s) => s.pushedFor === null || Date.parse(s.pushedFor) !== pushDueAt(s),
  );

  const claimed: Shoot[] = [];
  for (const s of due) {
    const at = new Date(pushDueAt(s)).toISOString();
    // Quoted: a timestamp's ':' and '.' are reserved in or().
    const res = await db
      .from('tracker_shoot')
      .update({ due_pushed_for: at })
      .eq('id', s.id)
      .eq('status', 'planned')
      .or(`due_pushed_for.is.null,due_pushed_for.neq."${at}"`)
      .select(SHOOT_COLS);
    if (res.error) console.error('[cron work-due] claim failed', res.error);
    else if (res.data && res.data.length > 0)
      claimed.push(rowToShoot(res.data[0] as ShootRow));
  }

  const pushed =
    claimed.length > 0
      ? await sendPush(
          claimed.map((shoot) => ({
            kind: 'due' as const,
            to: shoot.memberId,
            shoot,
          })),
          null,
        )
      : 0;
  return NextResponse.json({ due: claimed.length, pushed });
}
