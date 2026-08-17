/**
 * Staleness is measured from the newest SUCCESSFUL capture, never from the last
 * scrape attempt. The production regression these tests pin: a TikTok profile
 * whose last attempt was 11h old but whose newest data was 70 days old, retried
 * and failing daily for ten weeks without anyone noticing.
 */
import {
  STALE_AFTER_HOURS,
  dataAgeHours,
  formatDataAge,
  isStale,
} from './scrape-staleness';

const NOW = Date.parse('2026-08-17T07:00:00Z');
const hoursAgo = (h: number) =>
  new Date(NOW - h * 60 * 60 * 1000).toISOString();

test('fresh data is not stale and reads in hours', () => {
  const at = hoursAgo(2);
  expect(dataAgeHours(at, NOW)).toBeCloseTo(2);
  expect(isStale(at, NOW)).toBe(false);
  expect(formatDataAge(dataAgeHours(at, NOW))).toBe('2h');
});

test('exactly at the threshold is not yet stale (boundary is exclusive)', () => {
  const at = hoursAgo(STALE_AFTER_HOURS);
  expect(isStale(at, NOW)).toBe(false);
});

test('just past the threshold is stale and switches to days', () => {
  const at = hoursAgo(STALE_AFTER_HOURS + 1);
  expect(isStale(at, NOW)).toBe(true);
  expect(formatDataAge(dataAgeHours(at, NOW))).toBe('2d');
});

test('the real regression: sunsunnn33, last captured 2026-06-08', () => {
  // Production values, 2026-08-17. last_scraped_at was 11h old at the time —
  // using THAT clock is what kept this invisible for ten weeks.
  const at = '2026-06-08T04:00:20Z';
  const age = dataAgeHours(at, NOW);
  expect(age).not.toBeNull();
  expect(Math.round(age as number)).toBe(1683);
  expect(isStale(at, NOW)).toBe(true);
  expect(formatDataAge(age)).toBe('70d');
});

test('never captured counts as stale, not as unknown-and-healthy', () => {
  expect(dataAgeHours(null, NOW)).toBeNull();
  expect(isStale(null, NOW)).toBe(true);
  expect(formatDataAge(null)).toBe('no data');
});

test('a malformed timestamp yields null instead of throwing', () => {
  expect(() => dataAgeHours('not-a-date', NOW)).not.toThrow();
  expect(dataAgeHours('not-a-date', NOW)).toBeNull();
  // Unparseable is treated the same as missing: surface it, don't hide it.
  expect(isStale('not-a-date', NOW)).toBe(true);
});
