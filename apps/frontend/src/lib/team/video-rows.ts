/**
 * tracker_video rows <-> the app's Video. Kept out of video-actions.ts:
 * everything exported from a 'use server' file becomes a callable endpoint.
 */

import type { Video } from './videos';

export const VIDEO_COLS =
  'id, creator_id, title, note, editor_id, handler_id, edited_at, edited_by, edit_link, post_date, post_time, posted_at, posted_by, post_link, created_at';

export interface VideoRow {
  id: string;
  creator_id: string | null;
  title: string;
  note: string | null;
  editor_id: string | null;
  handler_id: string | null;
  edited_at: string | null;
  edited_by: string | null;
  edit_link: string | null;
  post_date: string | null;
  post_time: string | null;
  posted_at: string | null;
  posted_by: string | null;
  post_link: string | null;
  created_at: string;
}

export function rowToVideo(r: VideoRow): Video {
  return {
    id: r.id,
    creatorId: r.creator_id,
    title: r.title,
    note: r.note,
    editorId: r.editor_id,
    handlerId: r.handler_id,
    editedAt: r.edited_at,
    editedBy: r.edited_by,
    editLink: r.edit_link,
    postDate: r.post_date,
    // Postgres `time` reads back as HH:MM:SS.
    postTime: r.post_time ? r.post_time.slice(0, 5) : null,
    postedAt: r.posted_at,
    postedBy: r.posted_by,
    postLink: r.post_link,
    createdAt: r.created_at,
  };
}
