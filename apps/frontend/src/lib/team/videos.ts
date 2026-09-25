/**
 * Video jobs — one video for one account, through two hands.
 *
 * The admin gives a video to the account's editor and handler (filled in
 * from the staffing board). The editor clicks Done with a link to the cut;
 * the handler — or, on a job with no handler, the editor — sets when it goes
 * out and clicks Done with a link to the live post. The database stamps each
 * Done with when and whom it counts for (editedBy / postedBy), and those
 * stamps are what the console counts per person per month.
 *
 * Pure: shared by the video board (client), the pages and the actions.
 */

import { isUuid } from '@gitroom/frontend/lib/ids';
import { cleanTitle, isDateKey } from '@gitroom/frontend/lib/tracker';
import { isTimeKey, NOTE_MAX } from './shoots';

export interface Video {
  id: string;
  creatorId: string | null;
  title: string;
  note: string | null;
  editorId: string | null;
  handlerId: string | null;
  /** When the editor clicked Done (ISO), and whose edit it counts as. */
  editedAt: string | null;
  editedBy: string | null;
  editLink: string | null;
  /** When it is meant to go out, `YYYY-MM-DD` / `HH:MM`. */
  postDate: string | null;
  postTime: string | null;
  /** When the post was marked Done (ISO), and whose post it counts as. */
  postedAt: string | null;
  postedBy: string | null;
  postLink: string | null;
  createdAt: string;
}

export type VideoStage = 'editing' | 'posting' | 'done';

/** With the editor until their Done, then with the handler until theirs. */
export function videoStage(v: Video): VideoStage {
  if (v.postedAt) return 'done';
  if (v.editorId && !v.editedAt) return 'editing';
  return 'posting';
}

/** Who schedules and posts it: the handler, or the editor if it has none. */
export function posterOf(
  v: Pick<Video, 'handlerId' | 'editorId'>,
): string | null {
  return v.handlerId ?? v.editorId;
}

export const LINK_MAX = 500;

const blank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

// Share sheets (Douyin, Xiaohongshu) wrap the link in text; take the first web
// link in what was pasted. Printable ASCII only, so Chinese text and full-width
// punctuation after the link end it.
const LINK_IN_TEXT = /https?:\/\/[\x21-\x7e]+/i;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/**
 * A pasted link, or the share text around one: blank = null, the first
 * http(s) URL in it (up to 500 characters), else undefined (refused). Only
 * web links — anything else could run script when it is rendered as a link.
 */
export function parseLink(v: unknown): string | null | undefined {
  if (blank(v)) return null;
  if (typeof v !== 'string') return undefined;
  const match = v.match(LINK_IN_TEXT)?.[0];
  // Too long to be one link, even with some punctuation after it: refuse
  // before TRAILING, which is slow on a long run of punctuation.
  if (!match || match.length > LINK_MAX + 20) return undefined;
  const found = match.replace(TRAILING, '');
  if (found.length > LINK_MAX) return undefined;
  try {
    const u = new URL(found);
    return u.protocol === 'https:' || u.protocol === 'http:'
      ? found
      : undefined;
  } catch {
    return undefined;
  }
}

/** The link, if it is safe to put in an href. A second lock at render time. */
export function safeHref(link: string | null): string | null {
  return link !== null && parseLink(link) === link ? link : null;
}

export interface VideoInput {
  creatorId: string;
  title: string;
  note: string | null;
  editorId: string | null;
  handlerId: string | null;
  postDate: string | null;
  postTime: string | null;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const optionalId = (v: unknown): string | null | undefined =>
  blank(v) ? null : isUuid(v) ? v : undefined;

export function parseVideoInput(v: unknown): Parsed<VideoInput> {
  if (!v || typeof v !== 'object')
    return { ok: false, message: 'Invalid video.' };
  const o = v as Record<string, unknown>;
  if (!isUuid(o.creatorId))
    return { ok: false, message: 'Pick the account the video is for.' };
  const title = cleanTitle(o.title);
  if (!title)
    return {
      ok: false,
      message: 'Say which video this is (up to 200 characters).',
    };
  const editorId = optionalId(o.editorId);
  const handlerId = optionalId(o.handlerId);
  if (editorId === undefined || handlerId === undefined)
    return { ok: false, message: 'Invalid person.' };
  if (editorId === null && handlerId === null)
    return { ok: false, message: 'Give the video to an editor or a handler.' };
  const postDate = blank(o.postDate) ? null : o.postDate;
  if (postDate !== null && !isDateKey(postDate))
    return { ok: false, message: 'Pick a posting day.' };
  const postTime = blank(o.postTime) ? null : o.postTime;
  if (postTime !== null && !isTimeKey(postTime))
    return { ok: false, message: 'Time must look like 19:30.' };
  if (postTime !== null && postDate === null)
    return { ok: false, message: 'A posting time needs a day.' };
  if (!blank(o.note) && typeof o.note !== 'string')
    return { ok: false, message: 'Invalid note.' };
  const note = blank(o.note) ? null : (o.note as string).trim();
  if (note !== null && note.length > NOTE_MAX)
    return { ok: false, message: 'Notes are limited to 1,000 characters.' };
  return {
    ok: true,
    value: {
      creatorId: o.creatorId,
      title,
      note,
      editorId,
      handlerId,
      postDate,
      postTime,
    },
  };
}

/**
 * The videos a person finished in [from, to): the edits and the posts whose
 * Done was stamped with them. By the stamp, not the job's people now, so a
 * job reassigned after its Done keeps its credit. Instants are compared as
 * instants, whatever offset each string carries.
 */
export function finishedBy(
  videos: Video[],
  memberId: string,
  from: string,
  to: string,
): { edited: Video[]; posted: Video[] } {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const inside = (iso: string | null) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= start && t < end;
  };
  return {
    edited: videos.filter((v) => v.editedBy === memberId && inside(v.editedAt)),
    posted: videos.filter((v) => v.postedBy === memberId && inside(v.postedAt)),
  };
}

/** How many videos a person finished in [from, to) — see finishedBy. */
export function doneCounts(
  videos: Video[],
  memberId: string,
  from: string,
  to: string,
): { edited: number; posted: number } {
  const f = finishedBy(videos, memberId, from, to);
  return { edited: f.edited.length, posted: f.posted.length };
}

/**
 * The columns an edit writes: only the fields that differ from what the form
 * started with, so a newer change by someone else to another field (the
 * handler setting the posting day, say) is not written over by a form opened
 * before it. The posting day and time are one slot and always go together.
 * With no starting point every field is written.
 */
export function videoPatch(
  next: VideoInput,
  before: unknown,
): Record<string, string | null> {
  const b = (before && typeof before === 'object' ? before : {}) as Record<
    string,
    unknown
  >;
  const was = (k: string) => (k in b ? (blank(b[k]) ? null : b[k]) : undefined);
  const patch: Record<string, string | null> = {};
  if (next.creatorId !== was('creatorId')) patch.creator_id = next.creatorId;
  if (next.title !== was('title')) patch.title = next.title;
  if (next.note !== was('note')) patch.note = next.note;
  if (next.editorId !== was('editorId')) patch.editor_id = next.editorId;
  if (next.handlerId !== was('handlerId')) patch.handler_id = next.handlerId;
  if (next.postDate !== was('postDate') || next.postTime !== was('postTime')) {
    patch.post_date = next.postDate;
    patch.post_time = next.postTime;
  }
  return patch;
}
