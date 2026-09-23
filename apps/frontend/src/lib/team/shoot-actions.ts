'use server';

/**
 * Shoot mutations for the staff portal and the admin console.
 *
 * Two kinds of caller. An admin may act on anyone's shoots and picks the
 * person when adding one. A staff member only ever writes their own: the
 * person comes from their session (requireStaff), never from the browser,
 * and every update or delete is filtered by it, so an id belonging to
 * someone else simply matches nothing. Staff also stay inside this month and
 * later: a month that has been counted is changed only by an admin.
 *
 * Every input is validated here (parseShootInput) as well as by the table,
 * so a refusal reads as a sentence. No revalidatePath: the pages are
 * dynamic and the schedule keeps its own optimistic state, so re-rendering
 * the page inside every action would only slow the save down.
 */

import { getSupabaseAdmin } from '@d3/database';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { todayKey } from '@gitroom/frontend/lib/tracker';
import { asActor } from './actor';
import { rowToShoot, SHOOT_COLS, type ShootRow } from './shoot-rows';
import {
  isShootStatus,
  parseCount,
  parseShootInput,
  type Shoot,
} from './shoots';

export interface ShootResult {
  ok: boolean;
  message?: string;
  /** The row as saved, so the client can swap in the real id. */
  shoot?: Shoot;
}

const NOT_YOURS =
  'You can only change your own shoots, from this month on. Ask an admin.';
const GONE = 'That shoot is already gone.';
const CLOSED = 'Shoots before this month are closed. Ask an admin.';

/** First day of this month in the tracker's time zone, `YYYY-MM-DD`. */
const monthStart = () => `${todayKey().slice(0, 7)}-01`;

export async function addShoot(
  input: unknown,
  memberId?: string,
): Promise<ShootResult> {
  return asActor(async (a): Promise<ShootResult> => {
    const p = parseShootInput(input);
    if (!p.ok) return p;
    const admin = getSupabaseAdmin();
    // Staff always write their own; only an admin chooses the person.
    const member = a.memberId ?? memberId;
    if (!isUuid(member)) return { ok: false, message: 'Pick a person.' };
    if (a.memberId === null) {
      const { data, error } = await admin
        .from('tracker_member')
        .select('id')
        .eq('id', member)
        .is('archived_at', null)
        .maybeSingle();
      if (error) return { ok: false, message: error.message };
      if (!data)
        return { ok: false, message: 'That person is not on the board.' };
    }
    const v = p.value;
    if (a.memberId && v.date < monthStart())
      return { ok: false, message: CLOSED };
    const { data, error } = await admin
      .from('tracker_shoot')
      .insert({
        member_id: member,
        shoot_date: v.date,
        start_time: v.time,
        title: v.title,
        creator_id: v.creatorId,
        videos_planned: v.videosPlanned,
        note: v.note,
        created_by: a.userId,
      })
      .select(SHOOT_COLS)
      .single();
    if (error) return { ok: false, message: error.message };
    return { ok: true, shoot: rowToShoot(data as ShootRow) };
  });
}

/** Change what was filled in: day, time, where/what, account, count, note. */
export async function updateShoot(
  id: string,
  input: unknown,
): Promise<ShootResult> {
  return asActor(async (a): Promise<ShootResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid shoot.' };
    const p = parseShootInput(input);
    if (!p.ok) return p;
    const v = p.value;
    if (a.memberId && v.date < monthStart())
      return { ok: false, message: CLOSED };
    let q = getSupabaseAdmin()
      .from('tracker_shoot')
      .update({
        shoot_date: v.date,
        start_time: v.time,
        title: v.title,
        creator_id: v.creatorId,
        videos_planned: v.videosPlanned,
        note: v.note,
      })
      .eq('id', id);
    if (a.memberId)
      q = q.eq('member_id', a.memberId).gte('shoot_date', monthStart());
    const { data, error } = await q.select(SHOOT_COLS);
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0)
      return { ok: false, message: a.memberId ? NOT_YOURS : GONE };
    return { ok: true, shoot: rowToShoot(data[0] as ShootRow) };
  });
}

/**
 * Mark a shoot done (with how many videos came out of it), cancelled, or
 * back to planned. The count is kept only for a done shoot.
 */
export async function setShootStatus(
  id: string,
  status: string,
  videosShot: unknown,
): Promise<ShootResult> {
  return asActor(async (a): Promise<ShootResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid shoot.' };
    if (!isShootStatus(status))
      return { ok: false, message: 'Invalid status.' };
    const shot = status === 'done' ? parseCount(videosShot) : null;
    if (shot === undefined)
      return {
        ok: false,
        message: 'Videos must be a whole number from 0 to 99.',
      };
    let q = getSupabaseAdmin()
      .from('tracker_shoot')
      .update({ status, videos_shot: shot })
      .eq('id', id);
    if (a.memberId)
      q = q.eq('member_id', a.memberId).gte('shoot_date', monthStart());
    const { data, error } = await q.select(SHOOT_COLS);
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0)
      return { ok: false, message: a.memberId ? NOT_YOURS : GONE };
    return { ok: true, shoot: rowToShoot(data[0] as ShootRow) };
  });
}

export async function deleteShoot(id: string): Promise<ShootResult> {
  return asActor(async (a): Promise<ShootResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid shoot.' };
    let q = getSupabaseAdmin().from('tracker_shoot').delete().eq('id', id);
    if (a.memberId)
      q = q.eq('member_id', a.memberId).gte('shoot_date', monthStart());
    const { data, error } = await q.select('id');
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0)
      return { ok: false, message: a.memberId ? NOT_YOURS : GONE };
    return { ok: true };
  });
}
