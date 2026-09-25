/**
 * Shoots — the team's schedule of when and where they film.
 *
 * Pure: shared by the week schedule (client), the staff and admin pages, and
 * the server actions, which validate every input with `parseShootInput`
 * before the table's own checks so a refusal reads as a sentence.
 *
 * Dates are `YYYY-MM-DD` in Malaysia time and weeks run Monday to Sunday,
 * the way the team writes its schedule in the group chat.
 */

import { isUuid } from '@gitroom/frontend/lib/ids';
import { addDays, cleanTitle, isDateKey } from '@gitroom/frontend/lib/tracker';

export type ShootStatus = 'planned' | 'done' | 'cancelled';

export interface Shoot {
  id: string;
  memberId: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM`, or null for "sometime that day". */
  time: string | null;
  /** Where / what, in the team's own words. */
  title: string;
  creatorId: string | null;
  /** How many videos have been passed on from it (set when they are). */
  videosShot: number | null;
  status: ShootStatus;
  note: string | null;
}

/**
 * What a person fills in. The status changes separately: cancelled and back,
 * or done once videos are passed on from it.
 */
export interface ShootInput {
  date: string;
  time: string | null;
  title: string;
  creatorId: string | null;
  note: string | null;
}

export const NOTE_MAX = 1000;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTimeKey(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v);
}

export function isShootStatus(v: unknown): v is ShootStatus {
  return v === 'planned' || v === 'done' || v === 'cancelled';
}

/** The Monday of the week `dateKey` falls in. */
export function weekStart(dateKey: string): string {
  const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(dateKey, day === 0 ? -6 : 1 - day);
}

/** The seven days from `start`. */
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const blank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export function parseShootInput(v: unknown): Parsed<ShootInput> {
  if (!v || typeof v !== 'object')
    return { ok: false, message: 'Invalid shoot.' };
  const o = v as Record<string, unknown>;
  if (!isDateKey(o.date)) return { ok: false, message: 'Pick a day.' };
  const time = blank(o.time) ? null : o.time;
  if (time !== null && !isTimeKey(time))
    return { ok: false, message: 'Time must look like 19:30.' };
  const title = cleanTitle(o.title);
  if (!title)
    return {
      ok: false,
      message: 'Say where or what you are shooting (up to 200 characters).',
    };
  const creatorId = blank(o.creatorId) ? null : o.creatorId;
  if (creatorId !== null && !isUuid(creatorId))
    return { ok: false, message: 'Invalid account.' };
  if (!blank(o.note) && typeof o.note !== 'string')
    return { ok: false, message: 'Invalid note.' };
  const note = blank(o.note) ? null : (o.note as string).trim();
  if (note !== null && note.length > NOTE_MAX)
    return { ok: false, message: 'Notes are limited to 1,000 characters.' };
  return {
    ok: true,
    value: { date: o.date, time, title, creatorId, note },
  };
}

/** By day, then time; a shoot with no time goes last in its day. Stable. */
export function sortShoots(list: Shoot[]): Shoot[] {
  return list.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.time === b.time) return 0;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time < b.time ? -1 : 1;
  });
}

/**
 * The columns an edit writes: only the fields that differ from what the form
 * started with, so a form left open in another tab doesn't undo a newer
 * change to a field it never touched. With no starting point every field is
 * written.
 */
export function shootPatch(
  next: ShootInput,
  before: unknown,
): Record<string, string | null> {
  const b = (before && typeof before === 'object' ? before : {}) as Record<
    string,
    unknown
  >;
  const was = (k: string) => (k in b ? (blank(b[k]) ? null : b[k]) : undefined);
  const patch: Record<string, string | null> = {};
  if (next.date !== was('date')) patch.shoot_date = next.date;
  if (next.time !== was('time')) patch.start_time = next.time;
  if (next.title !== was('title')) patch.title = next.title;
  if (next.creatorId !== was('creatorId')) patch.creator_id = next.creatorId;
  if (next.note !== was('note')) patch.note = next.note;
  return patch;
}
