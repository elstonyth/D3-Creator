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
import {
  addDays,
  isDateKey,
  TRACKER_TZ_OFFSET,
} from '@gitroom/frontend/lib/tracker';

export type ShootStatus = 'planned' | 'done' | 'cancelled';

export interface Shoot {
  id: string;
  memberId: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:MM`, or null for "sometime that day". */
  time: string | null;
  /** Where / what, from before the form stopped asking; null since. */
  title: string | null;
  creatorId: string | null;
  /** How many videos have been passed on from it (set when they are). */
  videosShot: number | null;
  status: ShootStatus;
  /** A note from before the form stopped asking for one; shown, never written. */
  note: string | null;
  /** Why it was last changed (day, time or account); null if never. */
  movedReason: string | null;
  /**
   * The login that added it. One added by someone else (the admin) is news
   * to its person (WorkAlerts); null for a login since deleted.
   */
  createdBy: string | null;
  /**
   * The login that last changed it (moved it, another account, cancelled or
   * reopened it). A change by someone else is news to its person too.
   */
  updatedBy: string | null;
}

/**
 * What a person fills in: when, and optionally for which account. The status
 * changes separately: cancelled and back, or done once videos are passed on
 * from it. There is no title and no note: the form no longer asks for them
 * (the owner's call), and an old shoot's are never written over.
 */
export interface ShootInput {
  date: string;
  time: string | null;
  creatorId: string | null;
  /** Why it changed: every change to a saved shoot says why. */
  reason: string | null;
}

export const REASON_MAX = 200;

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
  const creatorId = blank(o.creatorId) ? null : o.creatorId;
  if (creatorId !== null && !isUuid(creatorId))
    return { ok: false, message: 'Invalid account.' };
  if (!blank(o.reason) && typeof o.reason !== 'string')
    return { ok: false, message: 'Say why the shoot is changing.' };
  const reason = blank(o.reason)
    ? null
    : (o.reason as string).replace(/\s+/g, ' ').trim();
  if (reason !== null && reason.length > REASON_MAX)
    return { ok: false, message: 'Keep the reason under 200 characters.' };
  return { ok: true, value: { date: o.date, time, creatorId, reason } };
}

/** How long after its start a shoot is taken to be over (the owner's call). */
const SHOOT_LENGTH_MS = 60 * 60_000;

/**
 * When a shoot is due to have happened (epoch ms, Malaysia time): an hour
 * after its start time, or — for one with no time, "sometime that day" —
 * once its day is over.
 */
export function shootDueAt(s: Pick<Shoot, 'date' | 'time'>): number {
  return s.time
    ? Date.parse(`${s.date}T${s.time}:00${TRACKER_TZ_OFFSET}`) + SHOOT_LENGTH_MS
    : Date.parse(`${addDays(s.date, 1)}T00:00:00${TRACKER_TZ_OFFSET}`);
}

/**
 * One of `me`'s shoots that has happened but still has no videos passed on:
 * planned, and due (shootDueAt). Its owner is asked to pass them on.
 */
export function isDue(s: Shoot, me: string, now: number): boolean {
  return s.memberId === me && s.status === 'planned' && now >= shootDueAt(s);
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
 * Whether a change moves a shoot: to another day, or to another time than the
 * one it had. Giving a shoot with no time its first time is no move.
 */
export function isMove(
  before: { date: string; time: string | null },
  next: { date: string; time: string | null },
): boolean {
  return (
    next.date !== before.date ||
    (before.time !== null && next.time !== before.time)
  );
}

/**
 * The columns an edit writes: only the fields that differ from what the form
 * started with, so a form left open in another tab doesn't undo a newer
 * change to a field it never touched. With no starting point every field is
 * written. Any change also writes why — the caller refuses one without a
 * reason (the owner's call).
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
  if (next.creatorId !== was('creatorId')) patch.creator_id = next.creatorId;
  if (Object.keys(patch).length > 0) patch.moved_reason = next.reason;
  return patch;
}
