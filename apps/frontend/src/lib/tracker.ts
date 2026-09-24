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

/** A handler owns a column on the staffing board; an editor only cuts video. */
export type MemberKind = 'handler' | 'editor';

export interface TrackerMember {
  id: string;
  name: string;
  role: string;
  kind: MemberKind;
  sortOrder: number;
}

export interface TrackerTask {
  id: string;
  title: string;
  done: boolean;
  sortOrder: number;
  /** The person it was given to (they see it in the staff portal), or null. */
  assigneeId: string | null;
}

export interface TrackerEvent {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  title: string;
}

/** A staff member's shoot, as the calendar shows it (read-only here). */
export interface TrackerShoot {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  time: string | null;
  title: string;
  person: string;
  status: 'planned' | 'done' | 'cancelled';
}

/** A video job's posting slot, as the calendar shows it (read-only here). */
export interface TrackerPost {
  id: string;
  /** `YYYY-MM-DD` */
  date: string;
  time: string | null;
  title: string;
  account: string | null;
  /** The handler posting it. */
  person: string | null;
  posted: boolean;
}

export interface TrackerCreator {
  id: string;
  name: string;
  avatarUrl: string | null;
  platforms: string[];
  handlerId: string | null;
  editorId: string | null;
  scheduledPosting: boolean;
  /** Position within its handler's column (`tracker_assignment.sort_order`). */
  sortOrder: number;
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
  /** Shoots and posting slots in the same window as `events`. */
  shoots: TrackerShoot[];
  posts: TrackerPost[];
  creators: TrackerCreator[];
  remarks: string;
}

// 2000–2099: a crafted `?month=0000-05` is a year Postgres cannot parse, and
// `Date.UTC` maps 0001–0099 onto 1901–1999 silently.
const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

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

/**
 * One line of user text for a title-like column: whitespace collapsed,
 * trimmed, 1..`max` characters — or null when it does not fit. Actions check
 * this before the table's own constraint so a refusal reads as a sentence.
 */
export function cleanTitle(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length >= 1 && s.length <= max ? s : null;
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

type Placeable = { id: string; handlerId: string | null };

/**
 * Put card `id` in column `handlerId`, just before card `beforeId` — or last
 * when `beforeId` is null or not on the board. The board draws each column as
 * the list filtered by handler, so list order is column order. The same array
 * comes back when nothing moves.
 */
export function placeCard<T extends Placeable>(
  list: T[],
  id: string,
  handlerId: string | null,
  beforeId: string | null,
): T[] {
  const from = list.findIndex((x) => x.id === id);
  if (from === -1 || id === beforeId) return list;
  const next = list.filter((_, i) => i !== from);
  const at = beforeId === null ? -1 : next.findIndex((x) => x.id === beforeId);
  next.splice(at === -1 ? next.length : at, 0, { ...list[from], handlerId });
  const unchanged =
    list[from].handlerId === handlerId &&
    next.every((x, i) => x.id === list[i].id);
  return unchanged ? list : next;
}

export interface PlacementChange {
  /** The column (null = unassigned). */
  handlerId: string | null;
  /** Every card in the column, in order: index = sort_order. */
  ids: string[];
  /** Cards that arrived in the column: the only ones whose handler is written. */
  moved: string[];
}

/**
 * What to save to take the board from `base` (the placement the server last
 * accepted) to `now`: each column whose order changed or that gained a card.
 * A column that only lost one is left alone — the cards it keeps did not
 * move relative to each other. A handler that is not in `columns` (a person
 * since removed) counts as unassigned, as it does on screen.
 */
export function placementChanges<T extends Placeable>(
  base: T[],
  now: T[],
  columns: ReadonlySet<string>,
): PlacementChange[] {
  const col = (h: string | null) => (h !== null && columns.has(h) ? h : null);
  const baseHandler = new Map(base.map((x) => [x.id, x.handlerId]));
  const out: PlacementChange[] = [];
  for (const key of new Set(now.map((x) => col(x.handlerId)))) {
    const cards = now.filter((x) => col(x.handlerId) === key);
    const ids = cards.map((x) => x.id);
    const moved = cards
      .filter((x) => baseHandler.get(x.id) !== x.handlerId)
      .map((x) => x.id);
    const inColumn = new Set(ids);
    const before = base.filter((x) => inColumn.has(x.id)).map((x) => x.id);
    if (moved.length > 0 || before.join() !== ids.join())
      out.push({ handlerId: key, ids, moved });
  }
  return out;
}

/** `current` with `base`'s order and handlers, every other field kept. */
export function restorePlacement<T extends Placeable>(
  current: T[],
  base: T[],
): T[] {
  const byId = new Map(current.map((x) => [x.id, x]));
  return base.map((b) => {
    const x = byId.get(b.id);
    return x ? { ...x, handlerId: b.handlerId } : b;
  });
}
