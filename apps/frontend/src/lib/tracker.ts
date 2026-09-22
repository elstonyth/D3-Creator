/**
 * Work tracker — shared types and the pure date helpers the board is built on.
 *
 * The agency runs on Malaysia time, so every calendar boundary here is fixed
 * to +08:00 rather than the server's clock (Vercel is UTC) or the visitor's
 * device. That keeps "today", "this month" and the month stats window
 * identical for the server render and the client, and for two colleagues in
 * different time zones looking at the same board.
 */

export const TRACKER_TZ_OFFSET = '+08:00';

export interface TrackerMember {
  id: string;
  name: string;
  role: string;
  sortOrder: number;
}

export interface TrackerTask {
  id: string;
  title: string;
  done: boolean;
  sortOrder: number;
}

export interface TrackerEvent {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  title: string;
}

export interface TrackerCreator {
  id: string;
  name: string;
  avatarUrl: string | null;
  platforms: string[];
  handlerId: string | null;
  editorId: string | null;
  scheduledPosting: boolean;
  /** Distinct videos published in the selected month (cross-platform copies collapsed). */
  videos: number;
  /** Every platform copy published in the selected month. */
  posts: number;
  /** Σ latest views across those posts. */
  views: number;
}

export interface TrackerData {
  /** `YYYY-MM` the stats and calendar are showing. */
  month: string;
  /** `YYYY-MM-DD` in TRACKER_TZ_OFFSET. */
  today: string;
  members: TrackerMember[];
  tasks: TrackerTask[];
  events: TrackerEvent[];
  creators: TrackerCreator[];
  remarks: string;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isMonthKey(v: unknown): v is string {
  return typeof v === 'string' && MONTH_RE.test(v);
}

export function isDateKey(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  // Reject 2026-02-31 and friends: round-trip through UTC and compare.
  const d = new Date(`${v}T00:00:00Z`);
  return d.toISOString().slice(0, 10) === v;
}

/** `YYYY-MM-DD` of an instant, in the tracker's time zone. */
export function dateKeyAt(instant: Date): string {
  const shifted = new Date(instant.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** Today in the tracker's time zone. A lib call so render bodies stay pure. */
export function todayKey(): string {
  return dateKeyAt(new Date());
}

/** `YYYY-MM-DD` shifted by `days` (calendar arithmetic, no time zone involved). */
export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM` shifted by `months`. */
export function addMonths(monthKey: string, months: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

/** Half-open ISO instants [from, to) covering the month in the tracker's zone. */
export function monthRange(monthKey: string): { from: string; to: string } {
  return {
    from: `${monthKey}-01T00:00:00${TRACKER_TZ_OFFSET}`,
    to: `${addMonths(monthKey, 1)}-01T00:00:00${TRACKER_TZ_OFFSET}`,
  };
}

/**
 * The month laid out as calendar rows, Sunday first. Cells outside the month
 * are null so the grid keeps its shape. Always 6 rows tall, so the panel
 * never jumps in height between months.
 */
export function monthGrid(monthKey: string): (string | null)[][] {
  const [y, m] = monthKey.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${monthKey}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length < 42) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < 42; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** Move the item at `from` to `to`, returning a new array. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length
  ) {
    return list;
  }
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
