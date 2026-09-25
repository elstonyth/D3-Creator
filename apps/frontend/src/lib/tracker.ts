/**
 * The team's shared pieces: what a person on the board does, and the pure
 * date helpers the staff portal and the console's team pages are built on.
 *
 * The agency runs on Malaysia time, so every calendar boundary here is fixed
 * to +08:00 rather than the server's clock (Vercel is UTC) or the visitor's
 * device. That keeps "today", "this month" and the month stats window
 * identical for the server render and the client, and for two colleagues in
 * different time zones looking at the same board.
 */

export const TRACKER_TZ_OFFSET = '+08:00';

/**
 * A handler shoots and passes videos on; an editor cuts them; 'both' does
 * both.
 */
export type MemberKind = 'handler' | 'editor' | 'both';

export const MEMBER_KINDS: readonly MemberKind[] = [
  'handler',
  'editor',
  'both',
];

/** A stored or submitted job. Anything unknown is a handler, the default. */
export function parseMemberKind(value: unknown): MemberKind {
  return value === 'editor' || value === 'both' ? value : 'handler';
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
