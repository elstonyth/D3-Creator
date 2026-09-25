'use server';

/**
 * Video job mutations. Staff only: videos are made by passing them on from a
 * shoot (passVideos in shoot-actions.ts), and the admin console only looks,
 * so an admin is refused here like anyone else who is not staff (asActor).
 *
 * Each person moves only their own step. The handler — who passed the video
 * on — may change its title or editor, or remove it, until the editor clicks
 * Done; then checks the cut and clicks Verify. The editor clicks Done, with
 * a link to the cut if there is one. A staff member's person comes from
 * their session, and every write is filtered by it in the query itself, so
 * someone else's video simply matches nothing.
 *
 * Staff can take back only their own Done or Verify, and only from this
 * month: a month that is already counted stays put.
 */

import { getSupabaseAdmin } from '@d3/database';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { monthRange, todayKey } from '@gitroom/frontend/lib/tracker';
import { asActor } from './actor';
import { dbError } from './db-error';
import { onBoard } from './on-board';
import { rowToVideo, VIDEO_COLS, type VideoRow } from './video-rows';
import {
  parseLink,
  parseVideoChange,
  PASS_REFUSALS,
  videoPatch,
  type Video,
} from './videos';

export interface VideoResult {
  ok: boolean;
  message?: string;
  video?: Video;
}

const NOT_YOURS = 'That video is not yours to change, or it has moved on.';
const TAKE_BACK =
  'You can only take back your own Done from this month, before it is verified.';

function one(
  res: {
    data: unknown[] | null;
    error: { message: string } | null;
  },
  miss = NOT_YOURS,
): VideoResult {
  if (res.error) return dbError('video', res.error);
  if (!res.data || res.data.length === 0) return { ok: false, message: miss };
  return { ok: true, video: rowToVideo(res.data[0] as VideoRow) };
}

/** The first instant of this month in the tracker's time zone (ISO). */
const monthStart = () =>
  new Date(monthRange(todayKey().slice(0, 7)).from).toISOString();

// ---- the handler, while the video is with the editor ---------------------------

/** Fix the title, or give the video to another editor. */
export async function updateVideo(
  id: string,
  input: unknown,
  /** What the form started with; only fields changed from it are written. */
  before?: unknown,
): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    const p = parseVideoChange(input);
    if (!p.ok) return p;
    const patch = videoPatch(p.value, before);
    const admin = getSupabaseAdmin();
    if (Object.keys(patch).length === 0)
      // Nothing changed: hand back the video as it is now.
      return one(
        await admin
          .from('tracker_video')
          .select(VIDEO_COLS)
          .eq('id', id)
          .eq('handler_id', a.memberId)
          .is('edited_at', null),
      );
    if (
      'editor_id' in patch &&
      !(await onBoard([patch.editor_id], ['editor', 'both']))
    )
      return { ok: false, message: PASS_REFUSALS.offBoard };
    return one(
      await admin
        .from('tracker_video')
        .update(patch)
        .eq('id', id)
        .eq('handler_id', a.memberId)
        // Once the editor is done, the video stays as it was given.
        .is('edited_at', null)
        .select(VIDEO_COLS),
    );
  });
}

/** Take a video back before the editor has finished it. */
export async function deleteVideo(id: string): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('tracker_video')
      .delete()
      .eq('id', id)
      .eq('handler_id', a.memberId)
      .is('edited_at', null)
      .select('shoot_id');
    if (error) return dbError('deleteVideo', error);
    if (!data || data.length === 0) return { ok: false, message: NOT_YOURS };
    // Keep the shoot's count of videos passed on from it true.
    const shootId = (data[0] as { shoot_id: string | null }).shoot_id;
    if (shootId) {
      const { count, error: countErr } = await admin
        .from('tracker_video')
        .select('id', { count: 'exact', head: true })
        .eq('shoot_id', shootId);
      if (countErr) return dbError('deleteVideo', countErr);
      const { error: shootErr } = await admin
        .from('tracker_shoot')
        .update({ videos_shot: Math.min(99, count ?? 0) })
        .eq('id', shootId);
      if (shootErr) return dbError('deleteVideo', shootErr);
    }
    return { ok: true };
  });
}

// ---- the editor's step -------------------------------------------------------

/** The editor's Done: the cut is ready, with a link to it if there is one. */
export async function finishEdit(
  id: string,
  link?: string,
): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    const l = parseLink(link);
    if (l === undefined)
      return {
        ok: false,
        message:
          'That link does not look right. Paste one starting with https://, or leave it empty.',
      };
    return one(
      await getSupabaseAdmin()
        .from('tracker_video')
        .update({ edited_at: new Date().toISOString(), edit_link: l })
        .eq('id', id)
        .eq('editor_id', a.memberId)
        // A second Done (a stale tab) must not re-stamp the first.
        .is('edited_at', null)
        .select(VIDEO_COLS),
    );
  });
}

/** Take the editor's Done back — only while it is not verified yet. */
export async function undoEdit(id: string): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    return one(
      await getSupabaseAdmin()
        .from('tracker_video')
        .update({ edited_at: null, edit_link: null })
        .eq('id', id)
        .eq('edited_by', a.memberId)
        .gte('edited_at', monthStart())
        .is('verified_at', null)
        .select(VIDEO_COLS),
      TAKE_BACK,
    );
  });
}

// ---- the handler's check -------------------------------------------------------

/** The handler's Verify: the cut is checked and good. */
export async function verifyVideo(id: string): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    return one(
      await getSupabaseAdmin()
        .from('tracker_video')
        .update({ verified_at: new Date().toISOString() })
        .eq('id', id)
        .eq('handler_id', a.memberId)
        .not('edited_at', 'is', null)
        // A second Verify (a stale tab) must not re-stamp the first.
        .is('verified_at', null)
        .select(VIDEO_COLS),
    );
  });
}

/** Take the handler's Verify back. */
export async function undoVerify(id: string): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    return one(
      await getSupabaseAdmin()
        .from('tracker_video')
        .update({ verified_at: null })
        .eq('id', id)
        .eq('verified_by', a.memberId)
        .gte('verified_at', monthStart())
        .select(VIDEO_COLS),
      'You can only take back your own Verify from this month.',
    );
  });
}
