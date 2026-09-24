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
  videosPlanned: number | null;
  videosShot: number | null;
  status: ShootStatus;
  note: string | null;
}

/** What a person fills in. Status and videos shot change separately. */
export interface ShootInput {
  date: string;
  time: string | null;
  title: string;
  creatorId: string | null;
  videosPlanned: number | null;
  note: string | null;
}

export const NOTE_MAX = 1000;
export const VIDEOS_MAX = 99;

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

/** A video count: blank = null, a whole number 0..99, else undefined (bad). */
export function parseCount(v: unknown): number | null | undefined {
  if (blank(v)) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isInteger(n) && n >= 0 && n <= VIDEOS_MAX ? n : undefined;
}

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
  const videosPlanned = parseCount(o.videosPlanned);
  if (videosPlanned === undefined)
    return {
      ok: false,
      message: 'Videos must be a whole number from 0 to 99.',
    };
  if (!blank(o.note) && typeof o.note !== 'string')
    return { ok: false, message: 'Invalid note.' };
  const note = blank(o.note) ? null : (o.note as string).trim();
  if (note !== null && note.length > NOTE_MAX)
    return { ok: false, message: 'Notes are limited to 1,000 characters.' };
  return {
    ok: true,
    value: { date: o.date, time, title, creatorId, videosPlanned, note },
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
