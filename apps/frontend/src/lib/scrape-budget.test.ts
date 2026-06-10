import {
  DEFAULT_SCRAPE_TIMEOUT_MS,
  FACEBOOK_SCRAPE_TIMEOUT_MS,
  MIN_SCRAPE_BUDGET_MS,
  WRAPUP_RESERVE_MS,
  minScrapeBudgetMsFor,
  orderFacebookFirst,
  scrapeTimeoutMsFor,
} from './scrape-budget';

describe('scrapeTimeoutMsFor', () => {
  it('gives facebook the long cap — Bright Data posts collector runs 164-244s under load', () => {
    expect(scrapeTimeoutMsFor('facebook')).toBe(FACEBOOK_SCRAPE_TIMEOUT_MS);
  });

  it.each(['instagram', 'tiktok', 'rednote', 'douyin'])(
    'keeps the default 120s cap for %s',
    (platform) => {
      expect(scrapeTimeoutMsFor(platform)).toBe(DEFAULT_SCRAPE_TIMEOUT_MS);
    },
  );

  it('falls back to the default cap for an unknown platform', () => {
    expect(scrapeTimeoutMsFor('myspace')).toBe(DEFAULT_SCRAPE_TIMEOUT_MS);
  });

  it('caps facebook above the adapter internal budget so the adapter times out first', () => {
    // facebook.ts polls Bright Data with FB_BUDGET_MS = 240_000. The route's
    // wrapper cap must exceed that, or every legitimately-slow FB scrape is
    // killed by withTimeout and stamped 'failed' (the post-PR-#38 outage:
    // all 21 FB profiles failing every attempt since 2026-06-09).
    // Strictly greater: at exactly 240s the wrapper and adapter would race.
    expect(FACEBOOK_SCRAPE_TIMEOUT_MS).toBeGreaterThan(240_000);
  });

  it('fits the facebook cap plus the wrap-up reserve inside the 300s function budget', () => {
    // route.ts exports maxDuration = 300 (must stay a literal for Next's
    // static analysis, so pin it here instead of importing the route).
    expect(FACEBOOK_SCRAPE_TIMEOUT_MS + WRAPUP_RESERVE_MS).toBeLessThanOrEqual(
      300_000,
    );
  });
});

describe('minScrapeBudgetMsFor', () => {
  it('requires the full facebook window before starting a facebook scrape', () => {
    // Starting FB with only the generic 60s floor would always time out and
    // stamp a false 'failed' — and the due-filter then skips the (healthy)
    // profile until tomorrow. Defer instead until a full window is available.
    expect(minScrapeBudgetMsFor('facebook')).toBe(FACEBOOK_SCRAPE_TIMEOUT_MS);
  });

  it.each(['instagram', 'tiktok', 'rednote', 'douyin'])(
    'keeps the generic 60s floor for %s',
    (platform) => {
      expect(minScrapeBudgetMsFor(platform)).toBe(MIN_SCRAPE_BUDGET_MS);
    },
  );
});

describe('orderFacebookFirst', () => {
  const p = (id: string, platform: string) => ({ id, platform });

  it('moves facebook profiles to the front so they see the full wall-clock window', () => {
    const batch = [
      p('ig1', 'instagram'),
      p('fb1', 'facebook'),
      p('tt1', 'tiktok'),
      p('fb2', 'facebook'),
    ];
    expect(orderFacebookFirst(batch).map((x) => x.id)).toEqual([
      'fb1',
      'fb2',
      'ig1',
      'tt1',
    ]);
  });

  it('preserves least-recently-scraped order within each group', () => {
    const batch = [
      p('fb1', 'facebook'),
      p('ig1', 'instagram'),
      p('dy1', 'douyin'),
      p('fb2', 'facebook'),
      p('ig2', 'instagram'),
    ];
    expect(orderFacebookFirst(batch).map((x) => x.id)).toEqual([
      'fb1',
      'fb2',
      'ig1',
      'dy1',
      'ig2',
    ]);
  });

  it('returns a new array and leaves the input untouched', () => {
    const batch = [p('ig1', 'instagram'), p('fb1', 'facebook')];
    const ordered = orderFacebookFirst(batch);
    expect(ordered).not.toBe(batch);
    expect(batch.map((x) => x.id)).toEqual(['ig1', 'fb1']);
  });
});
