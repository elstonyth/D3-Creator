'use server';

/**
 * The admin's writes on the Work Tracker. Who handles each account, and the
 * order of each person's column, are the admin's to set by dragging cards
 * (placeAccount); staff choose the editors and move every step of a video
 * (lib/team/video-actions.ts). The
 * admin can also take a video off the board while it is still being edited —
 * passed on by mistake, or stuck with an editor who can't reach it. Once the
 * editor is done, the video counts toward someone's month and stays.
 */

import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin, type AuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { dbError } from '@gitroom/frontend/lib/team/db-error';
import { onBoard } from '@gitroom/frontend/lib/team/on-board';
import type { VideoResult } from '@gitroom/frontend/lib/team/video-actions';

export interface BoardResult {
  ok: boolean;
  message?: string;
}

const MOVED_ON = 'That video is already gone, or its editor is done.';
// A tab opened before someone left, or changed job, still offers them.
const NOT_HANDLER =
  'That person is not on the board, or does not handle accounts.';

async function admin(): Promise<AuthContext | null> {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

/** A card that changes column: which one, and who handles that column. */
export interface Move {
  creatorId: string;
  /** null = Unassigned. */
  handlerId: string | null;
}

/**
 * A column of the account board after a drop: `order` is its full new order
 * (the dropped card included), and `move` the card that came from another
 * column, if one did. Only that card's handler is written — the others only
 * their place — so a tab that missed a handover made elsewhere can't undo it
 * by reordering. Each handover is stamped with the admin for the log.
 */
export async function placeAccount(
  order: string[],
  move: Move | null = null,
): Promise<BoardResult> {
  const me = await admin();
  if (!me) return { ok: false, message: 'Not authorized.' };
  if (
    !Array.isArray(order) ||
    order.length === 0 ||
    order.length > 500 ||
    !order.every(isUuid) ||
    new Set(order).size !== order.length ||
    (move !== null &&
      (typeof move !== 'object' ||
        !isUuid(move.creatorId) ||
        !order.includes(move.creatorId)))
  )
    return { ok: false, message: 'Invalid order.' };
  if (move && move.handlerId !== null && !isUuid(move.handlerId))
    return { ok: false, message: 'Invalid person.' };
  try {
    if (move && !(await onBoard([move.handlerId], ['handler', 'both'])))
      return { ok: false, message: NOT_HANDLER };
    const db = getSupabaseAdmin();
    // The cards that stayed put first, the handover last: if that write
    // fails, the card is not handed over, which is what the board's rollback
    // shows. A failed order write only misorders cards until the next load.
    const rest = order.flatMap((id, i) =>
      id === move?.creatorId ? [] : [{ creator_id: id, sort_order: i }],
    );
    if (rest.length > 0) {
      const { error } = await db
        .from('tracker_assignment')
        .upsert(rest, { onConflict: 'creator_id' });
      if (error) return dbError('placeAccount', error);
    }
    if (move) {
      const { error } = await db.from('tracker_assignment').upsert(
        {
          creator_id: move.creatorId,
          handler_id: move.handlerId,
          sort_order: order.indexOf(move.creatorId),
          updated_by: me.userId,
        },
        { onConflict: 'creator_id' },
      );
      if (error) return dbError('placeAccount', error);
    }
    return { ok: true };
  } catch (e) {
    return dbError('placeAccount', e);
  }
}

export async function removeVideo(id: string): Promise<VideoResult> {
  if (!(await admin())) return { ok: false, message: 'Not authorized.' };
  if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
  const db = getSupabaseAdmin();
  const { data: video, error } = await db
    .from('tracker_video')
    .select('handler_id')
    .eq('id', id)
    .maybeSingle();
  if (error) return dbError('removeVideo', error);
  if (!video?.handler_id) return { ok: false, message: MOVED_ON };
  // The handler's own remove, run as its handler: the same "only before
  // Done" check, and the shoot's count kept true under the shoot's lock.
  // The account board is left alone: who handles an account is the admin's
  // call, and the editor's claim stays with the staff who made it.
  const { data, error: rpcError } = await db.rpc('tracker_remove_video', {
    p_video_id: id,
    p_member_id: video.handler_id,
  });
  if (rpcError) return dbError('removeVideo', rpcError);
  if (data !== true) return { ok: false, message: MOVED_ON };
  return { ok: true };
}
