'use server';

/**
 * The admin's writes on the Work Tracker. Who handles each account is the
 * admin's to set, when a new client comes in (setHandler); staff choose the
 * editors and move every step of a video (lib/team/video-actions.ts). The
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

/**
 * Who handles an account; null puts it back in Unassigned. Only the handler
 * is written (and who changed it, for the handover log): its editor and its
 * place in the column stay as they are.
 */
export async function setHandler(
  creatorId: string,
  handlerId: string | null,
): Promise<BoardResult> {
  const me = await admin();
  if (!me) return { ok: false, message: 'Not authorized.' };
  if (!isUuid(creatorId)) return { ok: false, message: 'Invalid account.' };
  if (handlerId !== null && !isUuid(handlerId))
    return { ok: false, message: 'Invalid person.' };
  try {
    if (!(await onBoard([handlerId], ['handler', 'both'])))
      return { ok: false, message: NOT_HANDLER };
    const { error } = await getSupabaseAdmin()
      .from('tracker_assignment')
      .upsert(
        { creator_id: creatorId, handler_id: handlerId, updated_by: me.userId },
        { onConflict: 'creator_id' },
      );
    return error ? dbError('setHandler', error) : { ok: true };
  } catch (e) {
    return dbError('setHandler', e);
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
