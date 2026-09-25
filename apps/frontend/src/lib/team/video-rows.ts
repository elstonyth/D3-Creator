/**
 * tracker_video rows <-> the app's Video. Kept out of video-actions.ts:
 * everything exported from a 'use server' file becomes a callable endpoint.
 */

import type { Video } from './videos';

export const VIDEO_COLS =
  'id, creator_id, shoot_id, title, editor_id, handler_id, edited_at, edited_by, edit_link, verified_at, verified_by, created_at';

export interface VideoRow {
  id: string;
  creator_id: string | null;
  shoot_id: string | null;
  title: string;
  editor_id: string;
  handler_id: string;
  edited_at: string | null;
  edited_by: string | null;
  edit_link: string | null;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
}

export function rowToVideo(r: VideoRow): Video {
  return {
    id: r.id,
    creatorId: r.creator_id,
    shootId: r.shoot_id,
    title: r.title,
    editorId: r.editor_id,
    handlerId: r.handler_id,
    editedAt: r.edited_at,
    editedBy: r.edited_by,
    editLink: r.edit_link,
    verifiedAt: r.verified_at,
    verifiedBy: r.verified_by,
    createdAt: r.created_at,
  };
}
