import {
  addDays,
  addMonths,
  dateKeyAt,
  isDateKey,
  isMonthKey,
  monthRange,
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
});
