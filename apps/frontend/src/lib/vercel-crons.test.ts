/**
 * Regression guard for the media-backfill cron.
 *
 * `/api/admin/backfill-media` is the automatic healing step that re-copies post
 * thumbnails whose inline (scrape-time) persistence was skipped, while their
 * short-lived social-CDN signatures are still valid. The route being deployed
 * is NOT enough — it only ever runs if vercel.json schedules it. It shipped
 * once unscheduled, so skipped thumbnails 403'd with no automatic recovery.
 * This test fails if the cron is ever dropped from vercel.json again.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface CronJob {
  path: string;
  schedule: string;
}

const BACKFILL_PATH = '/api/admin/backfill-media';

const vercelConfig = JSON.parse(
  readFileSync(join(__dirname, '../../vercel.json'), 'utf8'),
) as { crons?: CronJob[] };

describe('vercel.json cron jobs', () => {
  const crons = vercelConfig.crons ?? [];

  it('schedules the media-backfill healing route', () => {
    const paths = crons.map((c) => c.path);
    expect(paths).toContain(BACKFILL_PATH);
  });

  it('gives the backfill cron a valid 5-field cron schedule', () => {
    const backfill = crons.find((c) => c.path === BACKFILL_PATH);
    expect(backfill).toBeDefined();
    // Vercel uses standard 5-field cron expressions (minute hour dom mon dow).
    expect(backfill?.schedule.trim().split(/\s+/)).toHaveLength(5);
  });
});
