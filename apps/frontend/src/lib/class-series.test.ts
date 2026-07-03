import { buildSeriesNav, deriveSeriesLabel } from './class-series';

const items = [
  { id: 'a', title: '线上课 4月20-24 (1)' },
  { id: 'b', title: '线上课 4月20-24 (2)' },
  { id: 'c', title: '线上课 4月20-24 (3)' },
];

describe('buildSeriesNav', () => {
  test('middle item resolves prev and next neighbours', () => {
    const nav = buildSeriesNav(items, 'b');
    expect(nav.position).toBe(2);
    expect(nav.total).toBe(3);
    expect(nav.prev?.id).toBe('a');
    expect(nav.next?.id).toBe('c');
  });

  test('first item has no prev', () => {
    const nav = buildSeriesNav(items, 'a');
    expect(nav.position).toBe(1);
    expect(nav.prev).toBeNull();
    expect(nav.next?.id).toBe('b');
  });

  test('last item has no next', () => {
    const nav = buildSeriesNav(items, 'c');
    expect(nav.position).toBe(3);
    expect(nav.prev?.id).toBe('b');
    expect(nav.next).toBeNull();
  });

  test('single item has neither neighbour', () => {
    const nav = buildSeriesNav([items[0]], 'a');
    expect(nav.position).toBe(1);
    expect(nav.total).toBe(1);
    expect(nav.prev).toBeNull();
    expect(nav.next).toBeNull();
  });

  test('unknown id yields position 0 and no neighbours', () => {
    const nav = buildSeriesNav(items, 'zzz');
    expect(nav.position).toBe(0);
    expect(nav.currentIndex).toBe(-1);
    expect(nav.prev).toBeNull();
    expect(nav.next).toBeNull();
  });
});

describe('deriveSeriesLabel', () => {
  test('strips a trailing "(n)" part marker', () => {
    expect(deriveSeriesLabel('线上课 4月20-24 (1)')).toBe('线上课 4月20-24');
  });

  test('strips multi-digit markers', () => {
    expect(deriveSeriesLabel('线上课 4月20-24 (12)')).toBe('线上课 4月20-24');
  });

  test('returns null when there is no part marker to strip', () => {
    expect(deriveSeriesLabel('入门先导课')).toBeNull();
  });
});
