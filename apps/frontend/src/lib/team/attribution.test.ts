import { holderAt, type LogRow } from './attribution';

const row = (
  field: LogRow['field'],
  oldValue: string | null,
  newValue: string | null,
  changedAt: string,
  creatorId = 'c1',
): LogRow => ({ creatorId, field, oldValue, newValue, changedAt });

// End of September in Malaysia time.
const SEP_END = '2026-10-01T00:00:00+08:00';

describe('holderAt', () => {
  it('is today’s holder when the account never changed hands', () => {
    expect(holderAt([], 'c1', 'handler', SEP_END, 'kee')).toBe('kee');
  });

  it('is whoever the last change before the moment handed it to', () => {
    const log = [
      row('handler', null, 'kee', '2026-09-02T03:00:00+00:00'),
      row('handler', 'kee', 'zuwei', '2026-09-20T03:00:00+00:00'),
      row('handler', 'zuwei', 'sk', '2026-10-05T03:00:00+00:00'),
    ];
    expect(holderAt(log, 'c1', 'handler', SEP_END, 'sk')).toBe('zuwei');
  });

  it('reads the first later change backwards when nothing came before', () => {
    const log = [row('handler', 'kee', 'zuwei', '2026-10-05T03:00:00+00:00')];
    expect(holderAt(log, 'c1', 'handler', SEP_END, 'zuwei')).toBe('kee');
  });

  it('compares instants, not strings in different offsets', () => {
    // 23:30 UTC on the 30th is already 1 October in Malaysia.
    const log = [row('handler', 'kee', 'zuwei', '2026-09-30T23:30:00+00:00')];
    expect(holderAt(log, 'c1', 'handler', SEP_END, 'zuwei')).toBe('kee');
  });

  it('keeps fields and accounts apart', () => {
    const log = [
      row('editor', null, 'ali', '2026-09-02T03:00:00+00:00'),
      row('handler', null, 'kee', '2026-09-02T03:00:00+00:00', 'c2'),
    ];
    expect(holderAt(log, 'c1', 'handler', SEP_END, 'sk')).toBe('sk');
    expect(holderAt(log, 'c1', 'editor', SEP_END, null)).toBe('ali');
  });

  it('can say nobody held it', () => {
    const log = [row('handler', 'kee', null, '2026-09-10T03:00:00+00:00')];
    expect(holderAt(log, 'c1', 'handler', SEP_END, 'kee')).toBeNull();
  });
});
