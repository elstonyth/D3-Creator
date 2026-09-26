/**
 * The account board on the admin's Work Tracker: every creator account (an
 * IP), who handles it and who edits its videos — fixed per account, set by
 * staff work (claim-account.ts) — with the viewed month's output. Pure:
 * shared by the board (client) and its loader.
 */

import type { RosterAccount } from './load';

export interface AccountCard extends RosterAccount {
  handlerId: string | null;
  editorId: string | null;
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
