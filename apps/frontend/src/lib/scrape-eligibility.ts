/**
 * Per-tick scrape eligibility for the daily-snapshot cron.
 *
 * Two rules, kept pure so they're unit-testable without a DB or the wall clock:
 *   1. One scrape per profile per UTC day — skip anything already attempted today.
 *   2. `not_found` / `handle_changed` profiles are re-probed only after a back-off
 *      window. These statuses are usually a TRANSIENT upstream 404 (TikHub's
 *      IG/TikTok lookups are flaky) misclassified as a dead handle. Left fully
 *      gated they freeze a healthy profile forever (this happened: two live
 *      profiles sat `not_found` for weeks). Re-probing on a cadence lets a
 *      transient 404 self-heal while a genuinely dead handle isn't hammered every
 *      tick (each re-probe burns a paid upstream call).
 *
 * `private` never reaches here — it's excluded from the roster at the DB level.
 */

/** scrape_status values that are re-probed on a cadence rather than every tick. */
export const REPROBE_STATUSES: ReadonlySet<string> = new Set([
  'not_found',
  'handle_changed',
]);

/** Back-off between re-probes of a not_found/handle_changed profile. */
export const REPROBE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Whether a profile is due for a scrape attempt on this tick.
 *
 * @param status         profile.scrape_status
 * @param lastScrapedAt  profile.last_scraped_at (ISO timestamptz or null)
 * @param todayUtc       YYYY-MM-DD for the current UTC day
 * @param nowMs          Date.now() at tick start
 */
export function isDueForScrape(
  status: string,
  lastScrapedAt: string | null,
  todayUtc: string,
  nowMs: number,
): boolean {
  // Already attempted today (UTC) — one scrape per profile per day. Compare by
  // date prefix (PostgREST returns timestamptz as a UTC ISO string), so a
  // malformed value can't throw here.
  if ((lastScrapedAt ?? '').slice(0, 10) === todayUtc) return false;

  if (REPROBE_STATUSES.has(status)) {
    // Never actually probed → try once. Otherwise wait out the back-off window.
    if (lastScrapedAt === null) return true;
    const last = Date.parse(lastScrapedAt);
    // A malformed timestamp yields NaN → not due (stays gated). Safe: PostgREST
    // timestamps are well-formed, so this only guards against corrupt data.
    return nowMs - last >= REPROBE_AFTER_MS;
  }

  // ok / failed / pending / throttled — due whenever not already done today.
  return true;
}
