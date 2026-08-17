/**
 * Scrape staleness — how old a profile's DATA is, not how recently we tried.
 *
 * The distinction is the whole point. `profile.last_scraped_at` records the last
 * ATTEMPT; a permanently-broken profile keeps a fresh timestamp there forever
 * because the cron retries it every day. What actually matters is
 * MAX(profile_snapshot.captured_at) — the last time data was successfully
 * captured. In production on 2026-08-17 a TikTok profile had a last_scraped_at
 * 11 hours old and data 70 days old, and had been failing daily, unnoticed,
 * for ten weeks.
 *
 * Kept pure (time passed in, no DB, no Date.now()) so it's unit-testable —
 * same convention as scrape-eligibility.ts.
 */

/**
 * A profile whose newest snapshot is older than this is stale.
 *
 * 48h, because the cron targets one scrape per profile per UTC day: a healthy
 * profile's data is always under ~24h old, so this allows one fully missed day
 * of slack before alarming.
 */
export const STALE_AFTER_HOURS = 48;

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Hours between the newest successful capture and now.
 *
 * Returns null when there is no capture at all, or the timestamp is
 * unparseable — never throws, so one corrupt row can't take down an admin page.
 */
export function dataAgeHours(
  newestCapturedAt: string | null,
  nowMs: number,
): number | null {
  if (!newestCapturedAt) return null;
  const t = Date.parse(newestCapturedAt);
  if (Number.isNaN(t)) return null;
  return (nowMs - t) / MS_PER_HOUR;
}

/**
 * Whether a profile's data is stale.
 *
 * A profile with NO capture at all counts as stale — never-captured is the
 * worst case, not an unknown to be treated as healthy.
 */
export function isStale(
  newestCapturedAt: string | null,
  nowMs: number,
): boolean {
  const age = dataAgeHours(newestCapturedAt, nowMs);
  if (age === null) return true;
  return age > STALE_AFTER_HOURS;
}

/**
 * Statuses that mean "deliberately retired", not "broken".
 *
 * `private` is the one status listScrapeableProfiles gates out of the roster
 * entirely (see ROSTER_GATED_STATUSES in libraries/database/src/snapshots.ts), so
 * such a profile is never scraped and its data age grows forever BY DESIGN.
 * Counting those as stale would make this surface permanently noisy — and the
 * recommended way to retire a dead profile is precisely to set it `private`, so
 * every correct operator action would add another false positive to the alarm
 * list. Three RedNote profiles are already in this state.
 *
 * Kept as a separate concept from isStale(): staleness stays a pure statement
 * about data age, and this filters "age I should act on" at the surface layer.
 */
export const RETIRED_STATUSES: ReadonlySet<string> = new Set(['private']);

/** Whether a profile's staleness is worth surfacing (stale AND not retired). */
export function needsAttention(
  scrapeStatus: string,
  newestCapturedAt: string | null,
  nowMs: number,
): boolean {
  if (RETIRED_STATUSES.has(scrapeStatus)) return false;
  return isStale(newestCapturedAt, nowMs);
}

/** Short label for a badge: 'no data' | '7h' | '70d'. */
export function formatDataAge(hours: number | null): string {
  if (hours === null) return 'no data';
  if (hours < STALE_AFTER_HOURS) return `${Math.round(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}
