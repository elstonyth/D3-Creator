'use server';

/**
 * The account board's writes: who handles an account, who edits its videos,
 * whether it posts on a schedule, and the order of each handler's column.
 * Admin only — the one thing on the admin's Work Tracker that the admin
 * sets; staff never see the board.
 *
 * Every write records the admin as `updated_by`, which the handover log
 * trigger copies onto each change. Inputs are checked here as well as by the
 * tables, so a refusal reads as a sentence. No revalidatePath: the board
 * keeps its own state and refreshes the router itself after a save.
 */

import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin, type AuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { dbError } from './db-error';
import { onBoard } from './on-board';

export interface BoardResult {
  ok: boolean;
  message?: string;
}

// A tab opened before someone was removed still offers them; the server
// refuses rather than handing an account to a person who has left.
const NOT_ON_BOARD = 'That person is not on the board.';

async function guarded(
  fn: (me: AuthContext) => Promise<BoardResult>,
): Promise<BoardResult> {
  let me: AuthContext;
  try {
    me = await requireAdmin();
  } catch {
    return { ok: false, message: 'Not authorized.' };
  }
  try {
    return await fn(me);
  } catch (e) {
    return dbError('account board', e);
  }
}

/** A card's own controls. Who handles it moves with the card (placeCards). */
export interface AssignmentPatch {
  editorId?: string | null;
  scheduledPosting?: boolean;
}

export async function setAssignment(
  creatorId: string,
  patch: AssignmentPatch,
): Promise<BoardResult> {
  return guarded(async (me) => {
    if (!isUuid(creatorId)) return { ok: false, message: 'Invalid creator.' };
    if (!patch || typeof patch !== 'object')
      return { ok: false, message: 'Invalid creator.' };
    const row: Record<string, unknown> = {
      creator_id: creatorId,
      updated_by: me.userId,
    };
    if ('editorId' in patch) {
      if (patch.editorId != null && !isUuid(patch.editorId))
        return { ok: false, message: 'Invalid person.' };
      row.editor_id = patch.editorId ?? null;
    }
    if ('scheduledPosting' in patch)
      row.scheduled_posting = Boolean(patch.scheduledPosting);
    if (!('editorId' in patch) && !('scheduledPosting' in patch))
      return { ok: false, message: 'Invalid creator.' };
    if (!(await onBoard([patch.editorId ?? null])))
      return { ok: false, message: NOT_ON_BOARD };
    const { error } = await getSupabaseAdmin()
      .from('tracker_assignment')
      .upsert(row, { onConflict: 'creator_id' });
    return error ? dbError('setAssignment', error) : { ok: true };
  });
}

/**
 * One column's full order: index in `creatorIds` becomes sort_order. Only the
 * cards in `movedIds` — the ones that arrived in this column — have their
 * handler written. The rest keep whatever handler the database holds, so a
 * tab that has not seen a handover made elsewhere cannot undo it by
 * reordering. Merge-duplicates writes only the columns sent, so every card
 * keeps its editor and posting flag.
 */
export async function placeCards(
  handlerId: string | null,
  creatorIds: string[],
  movedIds: string[],
): Promise<BoardResult> {
  return guarded(async (me) => {
    if (handlerId !== null && !isUuid(handlerId))
      return { ok: false, message: 'Invalid person.' };
    if (
      !Array.isArray(creatorIds) ||
      creatorIds.length === 0 ||
      creatorIds.length > 500 ||
      !creatorIds.every(isUuid) ||
      new Set(creatorIds).size !== creatorIds.length ||
      !Array.isArray(movedIds) ||
      !movedIds.every((id) => creatorIds.includes(id))
    )
      return { ok: false, message: 'Invalid order.' };
    if (!(await onBoard([handlerId])))
      return { ok: false, message: NOT_ON_BOARD };
    const admin = getSupabaseAdmin();
    const moved = new Set(movedIds);
    // The cards that stayed put first, the handovers last. If the handover
    // write fails, none of it is saved — exactly what the board's rollback
    // shows. A failed order write only misorders cards until the next load.
    const rest = creatorIds.flatMap((id, i) =>
      moved.has(id) ? [] : [{ creator_id: id, sort_order: i }],
    );
    if (rest.length > 0) {
      const { error } = await admin
        .from('tracker_assignment')
        .upsert(rest, { onConflict: 'creator_id' });
      if (error) return dbError('placeCards', error);
    }
    if (moved.size === 0) return { ok: true };
    // updated_by names who made the handover in the log the trigger writes.
    const { error } = await admin.from('tracker_assignment').upsert(
      creatorIds.flatMap((id, i) =>
        moved.has(id)
          ? [
              {
                creator_id: id,
                handler_id: handlerId,
                sort_order: i,
                updated_by: me.userId,
              },
            ]
          : [],
      ),
      { onConflict: 'creator_id' },
    );
    return error ? dbError('placeCards', error) : { ok: true };
  });
}
