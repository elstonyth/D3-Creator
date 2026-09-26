/**
 * The account board on the admin's Work Tracker: every creator account (an
 * IP), who handles it, who edits its videos, and whether it posts on a
 * schedule — fixed per account, never per video — with the viewed month's
 * output. Pure: shared by the board (client), its loader and its actions.
 */

import type { RosterAccount } from './load';

export interface AccountCard extends RosterAccount {
  handlerId: string | null;
  editorId: string | null;
  scheduledPosting: boolean;
  /** Position within its handler's column (`tracker_assignment.sort_order`). */
  sortOrder: number;
  /** Distinct videos published in the month (cross-platform copies collapsed). */
  videos: number;
  /** Every platform copy published in the month. */
  posts: number;
  /** Σ latest views across those posts. */
  views: number;
}

/** A `tracker_assignment` row. */
export interface AssignmentRow {
  creator_id: string;
  handler_id: string | null;
  editor_id: string | null;
  scheduled_posting: boolean;
  sort_order: number;
}

/** A `tracker_creator_month_stats` row. */
export interface MonthStatsRow {
  creator_id: string;
  videos: number;
  posts: number;
  views: number | string;
}

/**
 * The board's cards, in board order. Someone who has left the board no
 * longer handles or edits anything here (removing a person keeps their rows
 * as they were), so their slots read as Unassigned / Nobody.
 */
export function boardOf(
  roster: RosterAccount[],
  assignments: AssignmentRow[],
  stats: MonthStatsRow[],
  onBoard: ReadonlySet<string>,
): AccountCard[] {
  const byCreator = new Map(assignments.map((a) => [a.creator_id, a]));
  const statsBy = new Map(stats.map((s) => [s.creator_id, s]));
  const active = (id: string | null | undefined) =>
    id && onBoard.has(id) ? id : null;
  return (
    roster
      .map((c) => {
        const a = byCreator.get(c.id);
        const s = statsBy.get(c.id);
        return {
          ...c,
          handlerId: active(a?.handler_id),
          editorId: active(a?.editor_id),
          scheduledPosting: a?.scheduled_posting ?? false,
          sortOrder: a?.sort_order ?? 0,
          videos: s?.videos ?? 0,
          posts: s?.posts ?? 0,
          views: Number(s?.views ?? 0),
        };
      })
      // Stable: cards the team never ordered keep the roster's name order.
      .sort((a, b) => a.sortOrder - b.sortOrder)
  );
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
