import {
  addDays,
  addMonths,
  dateKeyAt,
  isDateKey,
  isMonthKey,
  monthGrid,
  monthRange,
  placeCard,
  placementChanges,
  reorder,
  restorePlacement,
} from './tracker';

describe('tracker date helpers', () => {
  it('keys dates in Malaysia time, not UTC', () => {
    // 23:30 UTC on the 21st is already the 22nd in +08:00.
    expect(dateKeyAt(new Date('2026-09-21T23:30:00Z'))).toBe('2026-09-22');
    expect(dateKeyAt(new Date('2026-09-21T15:59:59Z'))).toBe('2026-09-21');
  });

  it('validates keys strictly', () => {
    expect(isMonthKey('2026-09')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-9')).toBe(false);
    expect(isMonthKey('0000-05')).toBe(false);
    expect(isMonthKey('9999-12')).toBe(false);
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2026-02-31')).toBe(false);
    expect(isDateKey('2026-09-22T00:00')).toBe(false);
  });

  it('does calendar arithmetic across boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('builds a half-open month window in +08:00', () => {
    expect(monthRange('2026-09')).toEqual({
      from: '2026-09-01T00:00:00+08:00',
      to: '2026-10-01T00:00:00+08:00',
    });
    expect(monthRange('2026-12').to).toBe('2027-01-01T00:00:00+08:00');
  });

  it('lays the month out Sunday-first in six rows', () => {
    const grid = monthGrid('2026-09'); // 1 Sep 2026 is a Tuesday
    expect(grid).toHaveLength(6);
    expect(grid[0]).toEqual([
      null,
      null,
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
    expect(grid[4][3]).toBe('2026-09-30');
    expect(grid[4][4]).toBeNull();
    expect(grid[5].every((c) => c === null)).toBe(true);
  });

  it('reorders without mutating', () => {
    const a = ['a', 'b', 'c', 'd'];
    expect(reorder(a, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorder(a, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(reorder(a, 1, 1)).toBe(a);
    expect(reorder(a, 5, 0)).toBe(a);
    expect(a).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('card placement', () => {
  const c = (id: string, handlerId: string | null) => ({ id, handlerId });
  // Board order: column k = a, c, d; column z = b.
  const L = [c('a', 'k'), c('b', 'z'), c('c', 'k'), c('d', 'k')];
  const ids = (l: { id: string }[]) => l.map((x) => x.id).join('');

  it('drops before a card and takes its column', () => {
    const r = placeCard(L, 'b', 'k', 'c');
    expect(ids(r)).toBe('abcd');
    expect(r[1].handlerId).toBe('k');
    expect(L[1].handlerId).toBe('z'); // not mutated
  });

  it('reorders inside a column', () => {
    expect(ids(placeCard(L, 'd', 'k', 'a'))).toBe('dabc');
  });

  it('goes last when there is nothing to drop before', () => {
    expect(ids(placeCard(L, 'a', 'k', null))).toBe('bcda');
    expect(ids(placeCard(L, 'a', 'k', 'gone'))).toBe('bcda');
    expect(placeCard(L, 'b', null, null)[3]).toEqual({
      id: 'b',
      handlerId: null,
    });
  });

  it('returns the same list when nothing moves', () => {
    expect(placeCard(L, 'c', 'k', 'd')).toBe(L);
    expect(placeCard(L, 'c', 'k', 'c')).toBe(L);
    expect(placeCard(L, 'd', 'k', null)).toBe(L);
    expect(placeCard(L, 'x', 'k', null)).toBe(L);
  });
});

describe('placement saves', () => {
  const c = (id: string, handlerId: string | null, extra = '') => ({
    id,
    handlerId,
    extra,
  });
  const cols = new Set(['k', 'z']);

  it('saves a column whose order changed, with nothing moved in', () => {
    const base = [c('a', 'k'), c('b', 'z'), c('c', 'k')];
    const now = [c('c', 'k'), c('b', 'z'), c('a', 'k')];
    expect(placementChanges(base, now, cols)).toEqual([
      { handlerId: 'k', ids: ['c', 'a'], moved: [] },
    ]);
  });

  it('saves the column a card arrived in, not the one it left', () => {
    const base = [c('a', 'k'), c('b', 'z'), c('c', 'k')];
    const now = [c('a', 'k'), c('b', 'k'), c('c', 'k')];
    expect(placementChanges(base, now, cols)).toEqual([
      { handlerId: 'k', ids: ['a', 'b', 'c'], moved: ['b'] },
    ]);
  });

  it('has nothing to save when only other fields changed', () => {
    const base = [c('a', 'k'), c('b', null)];
    const now = [c('a', 'k', 'edited'), c('b', null)];
    expect(placementChanges(base, now, cols)).toEqual([]);
  });

  it('treats a handler that is not a column as unassigned', () => {
    const base = [c('a', 'gone'), c('b', null)];
    const now = [c('a', null), c('b', null)];
    expect(placementChanges(base, now, cols)).toEqual([
      { handlerId: null, ids: ['a', 'b'], moved: ['a'] },
    ]);
    // Displayed in the same place already: only the stored handler differs.
    expect(placementChanges(base, base, cols)).toEqual([]);
  });

  it('puts back order and handlers, keeping every other edit', () => {
    const base = [c('a', 'k'), c('b', 'z'), c('c', 'k')];
    const current = [c('c', 'z', 'edited'), c('b', 'z'), c('a', 'k')];
    expect(restorePlacement(current, base)).toEqual([
      c('a', 'k'),
      c('b', 'z'),
      c('c', 'k', 'edited'),
    ]);
  });
});
