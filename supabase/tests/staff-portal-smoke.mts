/**
 * Read-only smoke test: run the staff portal's and the work tracker's real
 * loaders against a live database, so a column, embed or or() filter that
 * the database rejects fails here rather than on the deployed page. Nothing
 * is written. Prints row counts only (no names, no keys).
 *
 * Run (bash, repo root, service-role key in .env):
 *   set -a; . ./.env; set +a
 *   npx tsx --tsconfig tsconfig.base.json supabase/tests/staff-portal-smoke.mts
 */
import { loadTrackerData } from '@gitroom/frontend/app/(admin)/admin/tracker/data';
import {
  loadAccountsAt,
  loadAssignments,
  loadMyTasks,
  loadPeople,
  loadRoster,
  loadShoots,
  loadVideos,
  loadVideosDone,
  monthDays,
} from '@gitroom/frontend/lib/team/load';
import { addMonths, monthRange, todayKey } from '@gitroom/frontend/lib/tracker';
import { weekStart } from '@gitroom/frontend/lib/team/shoots';
import { addDays } from '@gitroom/frontend/lib/tracker';

// Counts only: a list's length, or each list inside a result object.
const size = (v: unknown): string => {
  if (Array.isArray(v)) return `${v.length} rows`;
  if (!v || typeof v !== 'object') return String(v);
  const lists = Object.entries(v).filter(([, x]) => Array.isArray(x));
  return lists.length > 0
    ? lists.map(([k, x]) => `${k}=${(x as unknown[]).length}`).join(' ')
    : `${Object.keys(v).length} entries`;
};

let failed = 0;
async function step(name: string, run: () => Promise<unknown>) {
  try {
    console.log('ok  ', name, '→', size(await run()));
  } catch (e) {
    failed++;
    console.log('FAIL', name, '→', e instanceof Error ? e.message : e);
  }
}

const month = todayKey().slice(0, 7);
const { from, to } = monthRange(month);
const start = new Date(from).toISOString();
const end = new Date(to).toISOString();
const days = monthDays(month);
const monday = weekStart(todayKey());

const people = await loadPeople();
const someone = people[0]?.id;
console.log('people on record:', people.length);

await step('tracker, this month', () => loadTrackerData(month));
// A month far from today: the calendar must read two windows, not one span.
await step('tracker, a far month', () => loadTrackerData(addMonths(month, -8)));
await step('roster', () => loadRoster());
await step('assignments', () => loadAssignments());
await step('week of shoots', () => loadShoots(monday, addDays(monday, 7)));
await step('videos, everyone', () => loadVideos(start));
await step('videos done, everyone', () => loadVideosDone(start, end));
if (someone) {
  await step('shoots, one person', () =>
    loadShoots(days.from, days.to, someone),
  );
  await step('videos, one person', () => loadVideos(start, someone));
  await step('videos done, one person', () =>
    loadVideosDone(start, end, someone),
  );
  await step('tasks, one person', () => loadMyTasks(someone));
  await step('accounts + handovers, one person', () =>
    loadAccountsAt(someone, month, people),
  );
}

console.log(failed ? `${failed} FAILED` : 'all loaders ran');
process.exit(failed ? 1 : 0);
