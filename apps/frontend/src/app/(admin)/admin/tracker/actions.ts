'use server';

/**
 * The admin's one write on the Work Tracker: taking a video off the board
 * while it is still being edited — passed on by mistake, or stuck with an
 * editor who can't reach it. Every other step is staff's to move
 * (lib/team/video-actions.ts). Once the editor is done, the video counts
 * toward someone's month and stays.
 */

import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { dbError } from '@gitroom/frontend/lib/team/db-error';
import type { VideoResult } from '@gitroom/frontend/lib/team/video-actions';

const MOVED_ON = 'That video is already gone, or its editor is done.';

export async function removeVideo(id: string): Promise<VideoResult> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, message: 'Not authorized.' };
  }
  if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
  const admin = getSupabaseAdmin();
  const { data: video, error } = await admin
    .from('tracker_video')
    .select('handler_id')
    .eq('id', id)
    .maybeSingle();
  if (error) return dbError('removeVideo', error);
  if (!video?.handler_id) return { ok: false, message: MOVED_ON };
  // The handler's own remove, run as its handler: the same "only before
  // Done" check, and the shoot's count kept true under the shoot's lock.
  // The account board is left alone on purpose: taking the handler's claim
  // back can hand the account to someone who left, shown as Unassigned.
  const { data, error: rpcError } = await admin.rpc('tracker_remove_video', {
    p_video_id: id,
    p_member_id: video.handler_id,
  });
  if (rpcError) return dbError('removeVideo', rpcError);
  if (data !== true) return { ok: false, message: MOVED_ON };
  return { ok: true };
}
