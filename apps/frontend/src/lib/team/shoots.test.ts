import {
  isTimeKey,
  parseShootInput,
  shootPatch,
  sortShoots,
  weekDays,
  weekStart,
  type Shoot,
} from './shoots';

describe('weeks', () => {
  it('run Monday to Sunday, the way the team writes its schedule', () => {
    expect(weekStart('2026-09-23')).toBe('2026-09-21'); // Wednesday
    expect(weekStart('2026-09-21')).toBe('2026-09-21'); // Monday
    expect(weekStart('2026-09-27')).toBe('2026-09-21'); // Sunday
    expect(weekStart('2026-10-01')).toBe('2026-09-28'); // across a month
    expect(weekDays('2026-09-28')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });
});

describe('isTimeKey', () => {
  it('accepts a 24-hour HH:MM and nothing else', () => {
    for (const ok of ['00:00', '09:05', '19:30', '23:59'])
      expect(isTimeKey(ok)).toBe(true);
    for (const bad of ['24:00', '7:30', '19:60', '19:30:00', '', null, 1930])
      expect(isTimeKey(bad)).toBe(false);
  });
});

describe('parseShootInput', () => {
  const base = {
    date: '2026-09-23',
    time: '19:30',
    title: '  Hotpot   shop ',
    creatorId: '',
    videosPlanned: '3',
    note: ' bring the ring light ',
  };

  it('tidies a good entry', () => {
    expect(parseShootInput(base)).toEqual({
      ok: true,
      value: {
        date: '2026-09-23',
        time: '19:30',
        title: 'Hotpot shop',
        creatorId: null,
        videosPlanned: 3,
        note: 'bring the ring light',
      },
    });
  });

  it('lets time, account, count and note be blank', () => {
    const r = parseShootInput({ date: '2026-09-24', title: 'Furniture shop' });
    expect(r).toEqual({
      ok: true,
      value: {
        date: '2026-09-24',
        time: null,
        title: 'Furniture shop',
        creatorId: null,
        videosPlanned: null,
        note: null,
      },
    });
    expect(
      parseShootInput({ ...base, time: '', note: '   ', videosPlanned: '' }),
    ).toMatchObject({
      ok: true,
      value: { time: null, note: null, videosPlanned: null },
    });
  });

  it('refuses what the table would refuse, in words', () => {
    const bad = (patch: Record<string, unknown>) =>
      parseShootInput({ ...base, ...patch });
    expect(bad({ date: '2026-02-31' })).toMatchObject({ ok: false });
    expect(bad({ time: '7pm' })).toMatchObject({ ok: false });
    expect(bad({ title: '   ' })).toMatchObject({ ok: false });
    expect(bad({ title: 'x'.repeat(201) })).toMatchObject({ ok: false });
    expect(bad({ creatorId: 'not-a-uuid' })).toMatchObject({ ok: false });
    expect(bad({ videosPlanned: '100' })).toMatchObject({ ok: false });
    expect(bad({ videosPlanned: '2.5' })).toMatchObject({ ok: false });
    expect(bad({ videosPlanned: '-1' })).toMatchObject({ ok: false });
    expect(bad({ note: 'x'.repeat(1001) })).toMatchObject({ ok: false });
    expect(parseShootInput(null)).toMatchObject({ ok: false });
  });

  it('keeps a real account id', () => {
    const id = 'bbbbbbbb-0000-4000-8000-000000000001';
    expect(parseShootInput({ ...base, creatorId: id })).toMatchObject({
      ok: true,
      value: { creatorId: id },
    });
  });
});

describe('sortShoots', () => {
  const s = (id: string, date: string, time: string | null): Shoot => ({
    id,
    memberId: 'm',
    date,
    time,
    title: id,
    creatorId: null,
    videosPlanned: null,
    videosShot: null,
    status: 'planned',
    note: null,
  });

  it('orders by day, then time, with untimed shoots last in their day', () => {
    const list = [
      s('d', '2026-09-24', null),
      s('c', '2026-09-23', null),
      s('b', '2026-09-23', '21:00'),
      s('a', '2026-09-23', '09:30'),
      s('e', '2026-09-24', '10:00'),
    ];
    expect(
      sortShoots(list)
        .map((x) => x.id)
        .join(''),
    ).toBe('abced');
    expect(list[0].id).toBe('d'); // not mutated
  });
});

describe('shootPatch', () => {
  // As the form holds it: the count is text.
  const form = {
    date: '2026-09-26',
    time: '10:00',
    title: 'Mall shoot',
    creatorId: '',
    videosPlanned: '3',
    note: '',
  };
  const next = (patch: Record<string, unknown> = {}) => {
    const p = parseShootInput({ ...form, ...patch });
    if (!p.ok) throw new Error(p.message);
    return p.value;
  };

  it('writes only what the form changed', () => {
    expect(shootPatch(next(), form)).toEqual({});
    expect(shootPatch(next({ note: 'Bring the lights' }), form)).toEqual({
      note: 'Bring the lights',
    });
    expect(shootPatch(next({ videosPlanned: '4' }), form)).toEqual({
      videos_planned: 4,
    });
  });

  it('writes everything when it does not know what the form started with', () => {
    expect(Object.keys(shootPatch(next(), null)).sort()).toEqual([
      'creator_id',
      'note',
      'shoot_date',
      'start_time',
      'title',
      'videos_planned',
    ]);
  });
});
