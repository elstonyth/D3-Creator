'use server';

/**
 * Shoot mutations for the staff portal. Staff only: the admin console shows
 * the schedule but changes none of it, so an admin is refused here like
 * anyone else who is not staff (asActor).
 *
 * A staff member only ever writes their own shoots: the person comes from
 * their session (requireStaff), never from the browser, and every write is
 * filtered by it, so an id belonging to someone else simply matches nothing.
 * Changing, cancelling and deleting also stay inside this month and later: a
 * month that has been counted is closed. Passing videos on is the exception
 * — a shoot's videos can be passed on whenever they are ready.
 *
 * Every input is validated here (parseShootInput, parsePassInput) as well as
 * by the database, so a refusal reads as a sentence. No revalidatePath: the
 * pages are dynamic and the schedule keeps its own state, so re-rendering
 * the page inside every action would only slow the save down.
 */

import { getSupabaseAdmin } from '@d3/database';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { todayKey } from '@gitroom/frontend/lib/tracker';
import { asActor } from './actor';
import { claimAccount, mainEditor, releaseAccount } from './claim-account';
import { dbError } from './db-error';
import { onBoard } from './on-board';
import { rowToShoot, SHOOT_COLS, type ShootRow } from './shoot-rows';
import { parseShootInput, shootPatch, type Shoot } from './shoots';
import { rowToVideo, type VideoRow } from './video-rows';
import { parsePassInput, PASS_REFUSALS, type Video } from './videos';

export interface ShootResult {
  ok: boolean;
  message?: string;
  /** The row as saved, so the client can swap in the real id. */
  shoot?: Shoot;
}

export interface PassResult extends ShootResult {
  /** The videos just passed on. */
  videos?: Video[];
}

const NOT_YOURS = 'That shoot is not yours to change, or it has moved on.';
const CLOSED = 'Shoots before this month are closed.';

/** First day of this month in the tracker's time zone, `YYYY-MM-DD`. */
const monthStart = () => `${todayKey().slice(0, 7)}-01`;

function one(res: {
  data: unknown[] | null;
  error: { message: string } | null;
}): ShootResult {
  if (res.error) return dbError('shoot', res.error);
  if (!res.data || res.data.length === 0)
    return { ok: false, message: NOT_YOURS };
  return { ok: true, shoot: rowToShoot(res.data[0] as ShootRow) };
}

export async function addShoot(input: unknown): Promise<ShootResult> {
  return asActor(async (a): Promise<ShootResult> => {
    const p = parseShootInput(input);
    if (!p.ok) return p;
    const v = p.value;
    if (v.date < monthStart()) return { ok: false, message: CLOSED };
    const { data, error } = await getSupabaseAdmin()
      .from('tracker_shoot')
      .insert({
        member_id: a.memberId,
        shoot_date: v.date,
        start_time: v.time,
        creator_id: v.creatorId,
        note: v.note,
        created_by: a.userId,
      })
      .select(SHOOT_COLS)
      .single();
    if (error) return dbError('addShoot', error);
    return { ok: true, shoot: rowToShoot(data as ShootRow) };
  });
}

/** Change what was filled in: day, time, account, note. */
export async function updateShoot(
  id: string,
  input: unknown,
  /** What the form started with; only fields changed from it are written. */
  before?: unknown,
): Promise<ShootResult> {
  return asActor(async (a): Promise<ShootResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid shoot.' };
    const p = parseShootInput(input);
    if (!p.ok) return p;
    const v = p.value;
    if (v.date < monthStart()) return { ok: false, message: CLOSED };
    const patch = shootPatch(v, before);
    const admin = getSupabaseAdmin();
    if (Object.keys(patch).length === 0)
      // Nothing changed: hand back the shoot as it is now.
      return one(
        await admin
          .from('tracker_shoot')
          .select(SHOOT_COLS)
          .eq('id', id)
          .eq('member_id', a.memberId)
          .gte('shoot_date', monthStart()),
      );
    const saved = one(
      await admin
        .from('tracker_shoot')
        .update(patch)
        .eq('id', id)
        .eq('member_id', a.memberId)
        .gte('shoot_date', monthStart())
        .select(SHOOT_COLS),
    );
    if (!saved.ok || !('creator_id' in patch)) return saved;
    // Its videos were given the shoot's account when passed on; a corrected
    // account reaches them too. The caller handles every one of them.
    const passed = await admin
      .from('tracker_video')
      .select('creator_id, editor_id')
      .eq('shoot_id', id)
      .eq('handler_id', a.memberId);
    if (passed.error) return dbError('updateShoot', passed.error);
    const { error } = await admin
      .from('tracker_video')
      .update({ creator_id: patch.creator_id })
      .eq('shoot_id', id)
      .eq('handler_id', a.memberId);
    if (error) return dbError('updateShoot', error);
    const moved = (passed.data ?? []) as {
      creator_id: string | null;
      editor_id: string;
    }[];
    if (moved.length > 0) {
      // The account board follows the videos: the account they left goes
      // back to whoever held it (if this was a mistaken pick), and the new
      // one is the caller's, with the editor given most of them.
      for (const left of new Set(moved.map((v) => v.creator_id)))
        if (left !== patch.creator_id)
          await releaseAccount(left, a.memberId, a.userId);
      await claimAccount(
        patch.creator_id,
        {
          handlerId: a.memberId,
          editorId: mainEditor(moved.map((v) => v.editor_id)) ?? undefined,
        },
        a.userId,
      );
    }
    return saved;
  });
}

/**
 * Cancel a planned shoot, or reopen a cancelled one. A shoot is done only by
 * passing its videos on, and stays done while any of them is left
 * (deleteVideo puts it back to planned once none is).
 */
export async function setShootStatus(
  id: string,
  status: string,
): Promise<ShootResult> {
  return asActor(async (a): Promise<ShootResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid shoot.' };
    if (status !== 'planned' && status !== 'cancelled')
      return { ok: false, message: 'Invalid status.' };
    return one(
      await getSupabaseAdmin()
        .from('tracker_shoot')
        .update({ status })
        .eq('id', id)
        .eq('member_id', a.memberId)
        .eq('status', status === 'cancelled' ? 'planned' : 'cancelled')
        .gte('shoot_date', monthStart())
        .select(SHOOT_COLS),
    );
  });
}

export async function deleteShoot(id: string): Promise<ShootResult> {
  return asActor(async (a): Promise<ShootResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid shoot.' };
    const { data, error } = await getSupabaseAdmin()
      .from('tracker_shoot')
      .delete()
      .eq('id', id)
      .eq('member_id', a.memberId)
      .gte('shoot_date', monthStart())
      .select('id');
    if (error) return dbError('deleteShoot', error);
    if (!data || data.length === 0) return { ok: false, message: NOT_YOURS };
    return { ok: true };
  });
}

/**
 * After a shoot: pass its videos on, one row per video, each to an editor.
 * The caller becomes every video's handler, and the shoot is marked done
 * with how many videos have come out of it. Passing again adds more.
 *
 * The shoot's account follows the work on the admin's account board: the
 * caller becomes its handler (if they run accounts) and the editor given
 * most of these videos its editor (claimAccount).
 *
 * tracker_pass_shoot does all of it in one transaction and re-checks
 * everything: that the shoot is the caller's and not cancelled, the rows,
 * and that each editor is on the team and cuts video.
 */
export async function passVideos(
  shootId: string,
  input: unknown,
): Promise<PassResult> {
  return asActor(async (a): Promise<PassResult> => {
    if (!isUuid(shootId)) return { ok: false, message: 'Invalid shoot.' };
    const p = parsePassInput(input);
    if (!p.ok) return p;
    const rows = p.value;
    if (
      !(await onBoard(
        rows.map((r) => r.editorId),
        ['editor', 'both'],
      ))
    )
      return { ok: false, message: PASS_REFUSALS.offBoard };
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc('tracker_pass_shoot', {
      p_shoot_id: shootId,
      p_member_id: a.memberId,
      p_user_id: a.userId,
      // The function reads snake_case keys.
      p_videos: rows.map((r) => ({ title: r.title, editor_id: r.editorId })),
    });
    if (error) {
      // The function's own refusals are sentences meant for the screen.
      const known: string[] = Object.values(PASS_REFUSALS);
      return known.includes(error.message)
        ? { ok: false, message: error.message }
        : dbError('passVideos', error);
    }
    const shoot = await admin
      .from('tracker_shoot')
      .select(SHOOT_COLS)
      .eq('id', shootId)
      .single();
    if (shoot.error) return dbError('passVideos', shoot.error);
    const passed = rowToShoot(shoot.data as ShootRow);
    await claimAccount(
      passed.creatorId,
      {
        handlerId: a.memberId,
        editorId: mainEditor(rows.map((r) => r.editorId)) ?? undefined,
      },
      a.userId,
    );
    return {
      ok: true,
      shoot: passed,
      videos: ((data ?? []) as VideoRow[]).map(rowToVideo),
    };
  });
}
