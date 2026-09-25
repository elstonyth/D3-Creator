/**
 * Video jobs — one video from a shoot, through two hands.
 *
 * After a shoot, its owner passes the videos on and gives each to an editor;
 * that owner is the video's handler. The editor clicks Done (a link to the
 * cut is optional), then the handler checks the cut and clicks Verify. The
 * database stamps each Done with when and whom it counts for (editedBy /
 * verifiedBy), and those stamps are what the console counts per person per
 * month. On a small team one person may be both hands of a video.
 *
 * Pure: shared by the video board (client), the pages and the actions.
 */

import { isUuid } from '@gitroom/frontend/lib/ids';
import {
  cleanTitle,
  dateKeyAt,
  type MemberKind,
} from '@gitroom/frontend/lib/tracker';

export interface Video {
  id: string;
  creatorId: string | null;
  /** The shoot it was passed on from; null once that shoot is deleted. */
  shootId: string | null;
  title: string;
  editorId: string;
  /** Who passed it on, and checks the cut. */
  handlerId: string;
  /** When the editor clicked Done (ISO), and whose edit it counts as. */
  editedAt: string | null;
  editedBy: string | null;
  editLink: string | null;
  /** When the handler clicked Verify (ISO), and whose check it counts as. */
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
}

export type VideoStage = 'editing' | 'verifying' | 'done';

/** With the editor until their Done, then with the handler until Verify. */
export function videoStage(
  v: Pick<Video, 'editedAt' | 'verifiedAt'>,
): VideoStage {
  if (v.verifiedAt) return 'done';
  if (v.editedAt) return 'verifying';
  return 'editing';
}

/** Where a video sits on a staff member's own list. */
export type MySection = 'toEdit' | 'toVerify' | 'withEditor' | 'done';

/**
 * Which of `me`'s lists a video goes on, or null for none. Each video is on
 * one list only, even when `me` is both its editor and its handler: to edit
 * before verifying, and done only for a Done of theirs from `month`
 * (`YYYY-MM`, Malaysia).
 */
export function mySection(
  v: Video,
  me: string,
  month: string,
): MySection | null {
  if (!v.editedAt) {
    if (v.editorId === me) return 'toEdit';
    return v.handlerId === me ? 'withEditor' : null;
  }
  if (!v.verifiedAt && v.handlerId === me) return 'toVerify';
  const thisMonth = (iso: string | null) =>
    iso !== null && dateKeyAt(new Date(iso)).slice(0, 7) === month;
  return (v.editedBy === me && thisMonth(v.editedAt)) ||
    (v.verifiedBy === me && thisMonth(v.verifiedAt))
    ? 'done'
    : null;
}

/** Whether someone with this job cuts video, so can be given one. */
export function isEditorKind(kind: MemberKind): boolean {
  return kind === 'editor' || kind === 'both';
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

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

/** At most this many videos are passed on in one go. */
export const PASS_MAX = 30;

/** One video passed on from a shoot. */
export interface PassRow {
  title: string;
  editorId: string;
}

/**
 * Why a pass was refused. tracker_pass_shoot raises these same sentences,
 * word for word, so the action can show the database's refusal as it is.
 */
export const PASS_REFUSALS = {
  gone: 'That shoot is already gone.',
  notYours: 'You can only pass videos from your own shoots.',
  cancelled: 'That shoot was cancelled. Reopen it first.',
  count: 'Add between 1 and 30 videos.',
  title: 'Give each video a title (up to 200 characters).',
  editor: 'Pick an editor for each video.',
  offBoard: 'Pick an editor who is on the team.',
} as const;

/** The rows of a pass: 1..30, each a title and an editor's id. */
export function parsePassInput(v: unknown): Parsed<PassRow[]> {
  if (!Array.isArray(v) || v.length < 1 || v.length > PASS_MAX)
    return { ok: false, message: PASS_REFUSALS.count };
  const rows: PassRow[] = [];
  for (const r of v) {
    if (!r || typeof r !== 'object')
      return { ok: false, message: PASS_REFUSALS.count };
    const o = r as Record<string, unknown>;
    const title = cleanTitle(o.title);
    if (!title) return { ok: false, message: PASS_REFUSALS.title };
    if (!isUuid(o.editorId))
      return { ok: false, message: PASS_REFUSALS.editor };
    rows.push({ title, editorId: o.editorId });
  }
  return { ok: true, value: rows };
}

/** What the handler may change while the video is still with the editor. */
export interface VideoChange {
  title: string;
  editorId: string;
}

export function parseVideoChange(v: unknown): Parsed<VideoChange> {
  if (!v || typeof v !== 'object')
    return { ok: false, message: 'Invalid video.' };
  const o = v as Record<string, unknown>;
  const title = cleanTitle(o.title);
  if (!title)
    return {
      ok: false,
      message: 'Say which video this is (up to 200 characters).',
    };
  if (!isUuid(o.editorId)) return { ok: false, message: 'Pick an editor.' };
  return { ok: true, value: { title, editorId: o.editorId } };
}

/**
 * The videos a person finished in [from, to): the edits and the checks
 * whose Done was stamped with them. By the stamp, not the job's people now, so a
 * job reassigned after its Done keeps its credit. Instants are compared as
 * instants, whatever offset each string carries.
 */
export function finishedBy(
  videos: Video[],
  memberId: string,
  from: string,
  to: string,
): { edited: Video[]; verified: Video[] } {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const inside = (iso: string | null) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= start && t < end;
  };
  return {
    edited: videos.filter((v) => v.editedBy === memberId && inside(v.editedAt)),
    verified: videos.filter(
      (v) => v.verifiedBy === memberId && inside(v.verifiedAt),
    ),
  };
}

/** How many videos a person finished in [from, to) — see finishedBy. */
export function doneCounts(
  videos: Video[],
  memberId: string,
  from: string,
  to: string,
): { edited: number; verified: number } {
  const f = finishedBy(videos, memberId, from, to);
  return { edited: f.edited.length, verified: f.verified.length };
}

/**
 * The columns a change writes: only the fields that differ from what the
 * form started with, so a form left open does not undo a newer change to
 * the other field. With no starting point both are written.
 */
export function videoPatch(
  next: VideoChange,
  before: unknown,
): Record<string, string> {
  const b = (before && typeof before === 'object' ? before : {}) as Record<
    string,
    unknown
  >;
  const patch: Record<string, string> = {};
  if (next.title !== b.title) patch.title = next.title;
  if (next.editorId !== b.editorId) patch.editor_id = next.editorId;
  return patch;
}
