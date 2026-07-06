import { isDueForScrape, REPROBE_AFTER_MS } from './scrape-eligibility';

const TODAY = '2026-07-06';
// Fixed "now" at 2026-07-06T12:00:00Z so back-off math is deterministic.
const NOW = Date.parse('2026-07-06T12:00:00.000Z');
const daysAgoIso = (d: number) =>
  new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

describe('isDueForScrape', () => {
  it('scrapes an ok profile not yet attempted today', () => {
    expect(isDueForScrape('ok', daysAgoIso(1), TODAY, NOW)).toBe(true);
  });

  it('skips any profile already attempted today (UTC)', () => {
    expect(isDueForScrape('ok', '2026-07-06T02:00:00.000Z', TODAY, NOW)).toBe(
      false,
    );
    // Same-day guard wins even for a re-probe status.
    expect(
      isDueForScrape('not_found', '2026-07-06T02:00:00.000Z', TODAY, NOW),
    ).toBe(false);
  });

  it('scrapes failed/pending/throttled (not gated) whenever not done today', () => {
    for (const s of ['failed', 'pending', 'throttled']) {
      expect(isDueForScrape(s, daysAgoIso(3), TODAY, NOW)).toBe(true);
    }
  });

  it('does NOT re-probe not_found within the back-off window', () => {
    expect(isDueForScrape('not_found', daysAgoIso(2), TODAY, NOW)).toBe(false);
  });

  it('re-probes not_found once the back-off window has passed', () => {
    expect(isDueForScrape('not_found', daysAgoIso(8), TODAY, NOW)).toBe(true);
  });

  it('re-probes handle_changed after the back-off window', () => {
    expect(isDueForScrape('handle_changed', daysAgoIso(10), TODAY, NOW)).toBe(
      true,
    );
    expect(isDueForScrape('handle_changed', daysAgoIso(1), TODAY, NOW)).toBe(
      false,
    );
  });

  it('treats the back-off boundary as due (>=)', () => {
    const exactlyWindow = new Date(NOW - REPROBE_AFTER_MS).toISOString();
    expect(isDueForScrape('not_found', exactlyWindow, TODAY, NOW)).toBe(true);
  });

  it('probes a never-scraped not_found profile once', () => {
    expect(isDueForScrape('not_found', null, TODAY, NOW)).toBe(true);
  });

  it('leaves a not_found profile gated on a malformed timestamp', () => {
    expect(isDueForScrape('not_found', 'not-a-date', TODAY, NOW)).toBe(false);
  });
});
