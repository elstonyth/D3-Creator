'use server';

/**
 * Video job mutations.
 *
 * The admin creates, changes and deletes jobs. Staff only move their own
 * step: the editor clicks Done (with the link to the cut) or takes it back;
 * the handler — or the editor, on a job with no handler — sets the posting
 * day and clicks Done (with the link to the live post) or takes it back. A
 * staff member's person comes from their session, and every staff write is
 * filtered by it, so someone else's job simply matches nothing.
 *
 * Staff can take back only their own Done, and only from this month: a Done
 * from a month that is already counted stays put unless an admin moves it.
 */

import { getSupabaseAdmin } from '@d3/database';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { isDateKey, monthRange, todayKey } from '@gitroom/frontend/lib/tracker';
import { asActor, type Actor } from './actor';
import { onBoard } from './on-board';
import { isTimeKey } from './shoots';
import { rowToVideo, VIDEO_COLS, type VideoRow } from './video-rows';
import { parseLink, parseVideoInput, type Video } from './videos';

export interface VideoResult {
  ok: boolean;
  message?: string;
  video?: Video;
}

const NOT_YOURS = 'That video is not yours to change, or it has moved on.';
const TAKE_BACK =
  'You can only take back your own Done from this month. Ask an admin.';
const GONE = 'That video is already gone.';
const ADMIN_ONLY = 'Only an admin can do that.';

function one(
  res: {
    data: unknown[] | null;
    error: { message: string } | null;
  },
  miss = NOT_YOURS,
): VideoResult {
  if (res.error) return { ok: false, message: res.error.message };
  if (!res.data || res.data.length === 0) return { ok: false, message: miss };
  return { ok: true, video: rowToVideo(res.data[0] as VideoRow) };
}

function adminOnly(a: Actor): VideoResult | null {
  return a.memberId === null ? null : { ok: false, message: ADMIN_ONLY };
}

/** Jobs this person posts: theirs as handler, or theirs to edit with no handler. */
const postsOf = (memberId: string) =>
  `handler_id.eq.${memberId},and(handler_id.is.null,editor_id.eq.${memberId})`;

/** The first instant of this month in the tracker's time zone (ISO). */
const monthStart = () =>
  new Date(monthRange(todayKey().slice(0, 7)).from).toISOString();

// ---- admin -----------------------------------------------------------------

export async function createVideo(input: unknown): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    const refused = adminOnly(a);
    if (refused) return refused;
    const p = parseVideoInput(input);
    if (!p.ok) return p;
    const v = p.value;
    if (!(await onBoard([v.editorId, v.handlerId])))
      return { ok: false, message: 'That person is not on the board.' };
    const { data, error } = await getSupabaseAdmin()
      .from('tracker_video')
      .insert({
        creator_id: v.creatorId,
        title: v.title,
        note: v.note,
        editor_id: v.editorId,
        handler_id: v.handlerId,
        post_date: v.postDate,
        post_time: v.postTime,
        created_by: a.userId,
      })
      .select(VIDEO_COLS)
      .single();
    if (error) return { ok: false, message: error.message };
    return { ok: true, video: rowToVideo(data as VideoRow) };
  });
}

export async function updateVideo(
  id: string,
  input: unknown,
): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    const refused = adminOnly(a);
    if (refused) return refused;
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    const p = parseVideoInput(input);
    if (!p.ok) return p;
    const v = p.value;
    const admin = getSupabaseAdmin();
    const { data: was, error: readErr } = await admin
      .from('tracker_video')
      .select('editor_id, handler_id')
      .eq('id', id)
      .maybeSingle();
    if (readErr) return { ok: false, message: readErr.message };
    if (!was) return { ok: false, message: GONE };
    // Only someone newly put on the job must be on the board; a job may keep
    // a person who has since left, so its title or day can still be fixed.
    const added = [
      v.editorId !== was.editor_id ? v.editorId : null,
      v.handlerId !== was.handler_id ? v.handlerId : null,
    ];
    if (!(await onBoard(added)))
      return { ok: false, message: 'That person is not on the board.' };
    return one(
      await admin
        .from('tracker_video')
        .update({
          creator_id: v.creatorId,
          title: v.title,
          note: v.note,
          editor_id: v.editorId,
          handler_id: v.handlerId,
          post_date: v.postDate,
          post_time: v.postTime,
        })
        .eq('id', id)
        .select(VIDEO_COLS),
      GONE,
    );
  });
}

export async function deleteVideo(id: string): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    const refused = adminOnly(a);
    if (refused) return refused;
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    const { data, error } = await getSupabaseAdmin()
      .from('tracker_video')
      .delete()
      .eq('id', id)
      .select('id');
    if (error) return { ok: false, message: error.message };
    if (!data || data.length === 0) return { ok: false, message: GONE };
    return { ok: true };
  });
}

// ---- the editor's step -------------------------------------------------------

/** The editor's Done: the cut is ready, here is the link to it. */
export async function finishEdit(
  id: string,
  link: string,
): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    const l = parseLink(link);
    if (!l)
      return {
        ok: false,
        message: 'Paste the link to the edited video (starting with https://).',
      };
    let q = getSupabaseAdmin()
      .from('tracker_video')
      .update({ edited_at: new Date().toISOString(), edit_link: l })
      .eq('id', id)
      // A second Done (a stale tab) must not re-stamp the first.
      .is('edited_at', null)
      .is('posted_at', null)
      .not('editor_id', 'is', null);
    if (a.memberId) q = q.eq('editor_id', a.memberId);
    return one(await q.select(VIDEO_COLS));
  });
}

/** Take the editor's Done back — only while the video is not out yet. */
export async function undoEdit(id: string): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    let q = getSupabaseAdmin()
      .from('tracker_video')
      .update({ edited_at: null, edit_link: null })
      .eq('id', id)
      .is('posted_at', null)
      .not('edited_at', 'is', null);
    if (a.memberId)
      q = q.eq('edited_by', a.memberId).gte('edited_at', monthStart());
    return one(await q.select(VIDEO_COLS), a.memberId ? TAKE_BACK : NOT_YOURS);
  });
}

// ---- the poster's step -------------------------------------------------------

/** When the video goes out. Blank day clears it; a time needs a day. */
export async function schedulePost(
  id: string,
  date: string,
  time: string,
): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    const day = date ? date : null;
    const at = time ? time : null;
    if (day !== null && !isDateKey(day))
      return { ok: false, message: 'Pick a posting day.' };
    if (at !== null && !isTimeKey(at))
      return { ok: false, message: 'Time must look like 19:30.' };
    if (at !== null && day === null)
      return { ok: false, message: 'A posting time needs a day.' };
    let q = getSupabaseAdmin()
      .from('tracker_video')
      .update({ post_date: day, post_time: at })
      .eq('id', id)
      .is('posted_at', null);
    if (a.memberId) q = q.or(postsOf(a.memberId));
    return one(await q.select(VIDEO_COLS));
  });
}

/**
 * The poster's Done: it is live, here is the link to the post. Only once
 * the editor is done (or there is no editor).
 */
export async function finishPost(
  id: string,
  link: string,
): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    const l = parseLink(link);
    if (!l)
      return {
        ok: false,
        message: 'Paste the link to the live post (starting with https://).',
      };
    let q = getSupabaseAdmin()
      .from('tracker_video')
      .update({ posted_at: new Date().toISOString(), post_link: l })
      .eq('id', id)
      .is('posted_at', null)
      .or('editor_id.is.null,edited_at.not.is.null');
    // A second or() is ANDed with the first.
    if (a.memberId) q = q.or(postsOf(a.memberId));
    return one(await q.select(VIDEO_COLS));
  });
}

/** Take the post's Done back. */
export async function undoPost(id: string): Promise<VideoResult> {
  return asActor(async (a): Promise<VideoResult> => {
    if (!isUuid(id)) return { ok: false, message: 'Invalid video.' };
    let q = getSupabaseAdmin()
      .from('tracker_video')
      .update({ posted_at: null, post_link: null })
      .eq('id', id)
      .not('posted_at', 'is', null);
    if (a.memberId)
      q = q.eq('posted_by', a.memberId).gte('posted_at', monthStart());
    return one(await q.select(VIDEO_COLS), a.memberId ? TAKE_BACK : NOT_YOURS);
  });
}
