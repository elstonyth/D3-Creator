/**
 * What the two work trackers read: the staff portal's home (one person's
 * own work) and the admin console's /tracker (everyone's). Server-only,
 * service-role reads through ./load; client components import only its
 * types.
 *
 * The staff read is scoped by the person from the session, and here is the
 * only place the staff page reads shoots or videos: everything a client
 * component is handed ends up in the page, so a team-wide read filtered in
 * the browser would show every staff member everyone's work.
 */

import { addDays, monthRange } from '@gitroom/frontend/lib/tracker';
import { boardOf, type AccountCard } from './accounts';
import {
  loadPeople,
  loadPlacements,
  loadRoster,
  loadShoots,
  loadVideos,
  loadVideosDone,
  monthDays,
  type TeamPerson,
} from './load';
import { sortShoots, type Shoot } from './shoots';
import { doneCounts, type Video } from './videos';

const iso = (instant: string) => new Date(instant).toISOString();

/**
 * The viewed month's shoots plus today's and tomorrow's (the spotlight),
 * which may fall in another month, each once.
 */
function withSoon(month: Shoot[], soon: Shoot[]): Shoot[] {
  return sortShoots([
    ...new Map([...month, ...soon].map((s) => [s.id, s])).values(),
  ]);
}

interface Common {
  /** The viewed month's shoots, plus today's and tomorrow's. */
  shoots: Shoot[];
  /** In hand, plus verified since the start of this month (not the viewed one). */
  videos: Video[];
  people: TeamPerson[];
  accounts: { id: string; name: string }[];
}

export interface StaffTrackerData extends Common {
  /** Edits and checks stamped with this person in the viewed month. */
  edited: number;
  verified: number;
}

/** One staff member's own work. Throws without a person rather than read everyone's. */
export async function loadStaffTracker(
  memberId: string,
  month: string,
  today: string,
): Promise<StaffTrackerData> {
  // loadShoots and loadVideos read the whole team when given no person.
  if (!memberId) throw new Error('staff tracker: no person to scope to');
  const days = monthDays(month);
  const { from, to } = monthRange(month);
  const [shoots, soon, videos, done, people, roster] = await Promise.all([
    loadShoots(days.from, days.to, memberId),
    loadShoots(today, addDays(today, 2), memberId),
    loadVideos(iso(monthRange(today.slice(0, 7)).from), memberId),
    loadVideosDone(iso(from), iso(to), memberId),
    loadPeople(),
    loadRoster(),
  ]);
  const counts = doneCounts(done, memberId, iso(from), iso(to));
  return {
    shoots: withSoon(shoots, soon),
    videos,
    edited: counts.edited,
    verified: counts.verified,
    people,
    accounts: roster.map(({ id, name }) => ({ id, name })),
  };
}

export interface AdminTrackerData extends Common {
  /** Per person: edits and checks stamped with them in the viewed month. */
  done: Record<string, { edited: number; verified: number }>;
  /** The whole team's edits and checks in the viewed month. */
  edited: number;
  verified: number;
  /** Every account, who handles and edits it, and its viewed-month output. */
  board: AccountCard[];
}

/** Everyone's work, for the admin's read-only tracker. */
export async function loadAdminTracker(
  month: string,
  today: string,
): Promise<AdminTrackerData> {
  const days = monthDays(month);
  const { from, to } = monthRange(month);
  const [shoots, soon, videos, done, people, roster, placements] =
    await Promise.all([
      loadShoots(days.from, days.to),
      loadShoots(today, addDays(today, 2)),
      loadVideos(iso(monthRange(today.slice(0, 7)).from)),
      loadVideosDone(iso(from), iso(to)),
      loadPeople(),
      loadRoster(),
      loadPlacements(month),
    ]);
  const start = Date.parse(from);
  const end = Date.parse(to);
  const inside = (at: string | null) =>
    at !== null && Date.parse(at) >= start && Date.parse(at) < end;
  return {
    shoots: withSoon(shoots, soon),
    videos,
    done: Object.fromEntries(
      people.map((p) => [p.id, doneCounts(done, p.id, iso(from), iso(to))]),
    ),
    edited: done.filter((v) => inside(v.editedAt)).length,
    verified: done.filter((v) => inside(v.verifiedAt)).length,
    people,
    accounts: roster.map(({ id, name }) => ({ id, name })),
    board: boardOf(
      roster,
      placements.assignments,
      placements.stats,
      new Set(people.filter((p) => !p.archived).map((p) => p.id)),
    ),
  };
}
