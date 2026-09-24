/**
 * Who held an account at a given moment, from the handover log
 * (tracker_assignment_log, written by a trigger on every change).
 *
 * A past month is credited to whoever held the account when it ended, not
 * to today's holder — otherwise handing an account over would quietly
 * rewrite the previous holder's history. The log starts with the staff
 * portal migration; for anything older, today's holder is the only answer.
 */

export interface LogRow {
  creatorId: string;
  field: 'handler' | 'editor' | 'scheduled_posting';
  oldValue: string | null;
  newValue: string | null;
  /** ISO instant, any offset. */
  changedAt: string;
}

/**
 * The latest change strictly before `at` says who it went to; failing that,
 * the first change at or after `at` says who had it before; failing that,
 * nothing ever changed and `current` is the answer. Rows are expected in log
 * order (oldest first), which breaks ties between equal timestamps.
 */
export function holderAt(
  log: LogRow[],
  creatorId: string,
  field: 'handler' | 'editor',
  at: string,
  current: string | null,
): string | null {
  const cut = Date.parse(at);
  let before: LogRow | undefined;
  let after: LogRow | undefined;
  for (const r of log) {
    if (r.creatorId !== creatorId || r.field !== field) continue;
    if (Date.parse(r.changedAt) < cut) before = r;
    else if (!after) after = r;
  }
  if (before) return before.newValue;
  if (after) return after.oldValue;
  return current;
}
