import {
  isDue,
  isMove,
  isTimeKey,
  parseShootInput,
  shootDueAt,
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
    creatorId: '',
  };

  it('tidies a good entry', () => {
    expect(parseShootInput(base)).toEqual({
      ok: true,
      value: {
        date: '2026-09-23',
        time: '19:30',
        creatorId: null,
        reason: null,
      },
    });
  });

  it('needs nothing but the day', () => {
    const r = parseShootInput({ date: '2026-09-24' });
    expect(r).toEqual({
      ok: true,
      value: {
        date: '2026-09-24',
        time: null,
        creatorId: null,
        reason: null,
      },
    });
    expect(parseShootInput({ ...base, time: '' })).toMatchObject({
      ok: true,
      value: { time: null },
    });
  });

  it('refuses what the table would refuse, in words', () => {
    const bad = (patch: Record<string, unknown>) =>
      parseShootInput({ ...base, ...patch });
    expect(bad({ date: '2026-02-31' })).toMatchObject({ ok: false });
    expect(bad({ time: '7pm' })).toMatchObject({ ok: false });
    expect(bad({ creatorId: 'not-a-uuid' })).toMatchObject({ ok: false });
    expect(parseShootInput(null)).toMatchObject({ ok: false });
  });

  it('drops a title or note sent by an old page: the form has neither', () => {
    const r = parseShootInput({ ...base, title: 'Hotpot shop', note: 'x' });
    expect(r.ok && ('title' in r.value || 'note' in r.value)).toBe(false);
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
    videosShot: null,
    status: 'planned',
    createdBy: null,
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
  // As the form holds it: blanks are empty strings.
  const form = {
    date: '2026-09-26',
    time: '10:00',
    creatorId: '',
  };
  const next = (patch: Record<string, unknown> = {}) => {
    const p = parseShootInput({ ...form, ...patch });
    if (!p.ok) throw new Error(p.message);
    return p.value;
  };

  it('writes only what the form changed', () => {
    expect(shootPatch(next(), form)).toEqual({});
    // Any change says why (here, nothing yet: the action refuses that).
    expect(shootPatch(next({ time: '' }), form)).toEqual({
      start_time: null,
      moved_reason: null,
    });
    // An old note is never written over.
    expect(shootPatch(next({ note: 'Bring the lights' }), form)).toEqual({});
  });

  it('writes everything when it does not know what the form started with', () => {
    // Never the title or note: an old shoot keeps what it was saved with.
    expect(Object.keys(shootPatch(next(), null)).sort()).toEqual([
      'creator_id',
      'moved_reason',
      'shoot_date',
      'start_time',
    ]);
  });
});

describe('when a shoot is due', () => {
  const at = (iso: string) => Date.parse(iso);
  const s = (patch: Partial<Shoot>): Shoot => ({
    id: 'x',
    memberId: 'kee',
    date: '2026-09-30',
    time: '17:00',
    title: null,
    creatorId: null,
    videosShot: null,
    status: 'planned',
    createdBy: null,
    note: null,
    ...patch,
  });

  it('is an hour after its start in Malaysia, or the end of its day with no time', () => {
    expect(shootDueAt(s({}))).toBe(at('2026-09-30T10:00:00Z'));
    // A late shoot is due the next day.
    expect(shootDueAt(s({ time: '23:30' }))).toBe(at('2026-09-30T16:30:00Z'));
    // No time: once the day is over — here across a month's end.
    expect(shootDueAt(s({ time: null }))).toBe(at('2026-09-30T16:00:00Z'));
  });

  it('asks only the owner, only while planned, only an hour into the shoot', () => {
    const after = at('2026-09-30T18:00:00+08:00');
    const before = after - 60_000;
    expect(isDue(s({}), 'kee', after)).toBe(true);
    expect(isDue(s({}), 'kee', before)).toBe(false);
    // Not at its start: the shoot is still going on.
    expect(isDue(s({}), 'kee', at('2026-09-30T17:00:00+08:00'))).toBe(false);
    expect(isDue(s({}), 'mei', after)).toBe(false);
    expect(isDue(s({ status: 'done' }), 'kee', after)).toBe(false);
    expect(isDue(s({ status: 'cancelled' }), 'kee', after)).toBe(false);
    expect(
      isDue(s({ time: null }), 'kee', at('2026-10-01T00:00:00+08:00')),
    ).toBe(true);
    expect(
      isDue(s({ time: null }), 'kee', at('2026-09-30T23:59:00+08:00')),
    ).toBe(false);
  });
});

describe('moving a shoot', () => {
  it('is another day, or another time than the one it had', () => {
    const at = { date: '2026-09-29', time: '17:00' };
    expect(isMove(at, { date: '2026-09-30', time: '17:00' })).toBe(true);
    expect(isMove(at, { date: '2026-09-29', time: '19:00' })).toBe(true);
    expect(isMove(at, { date: '2026-09-29', time: null })).toBe(true);
    expect(isMove(at, at)).toBe(false);
    // Giving an untimed shoot its first time is no move.
    expect(
      isMove(
        { date: '2026-09-29', time: null },
        { date: '2026-09-29', time: '10:00' },
      ),
    ).toBe(false);
  });

  it('tidies the reason, and refuses a long one', () => {
    const base = { date: '2026-09-29', time: '17:00', creatorId: '' };
    expect(
      parseShootInput({ ...base, reason: '  client   changed it ' }),
    ).toMatchObject({ ok: true, value: { reason: 'client changed it' } });
    expect(parseShootInput({ ...base, reason: '   ' })).toMatchObject({
      ok: true,
      value: { reason: null },
    });
    expect(parseShootInput({ ...base, reason: 'x'.repeat(201) })).toMatchObject(
      { ok: false },
    );
  });

  it('writes why with every change, and nothing when nothing changed', () => {
    const form = { date: '2026-09-29', time: '17:00', creatorId: '' };
    const next = (patch: Record<string, unknown>) => {
      const p = parseShootInput({ ...form, ...patch });
      if (!p.ok) throw new Error(p.message);
      return p.value;
    };
    expect(
      shootPatch(next({ time: '19:00', reason: 'Client changed it' }), form),
    ).toEqual({ start_time: '19:00', moved_reason: 'Client changed it' });
    // A change with no reason still says so; the action refuses it.
    expect(shootPatch(next({ date: '2026-09-30' }), form)).toEqual({
      shoot_date: '2026-09-30',
      moved_reason: null,
    });
    // Not a move, still a change: a first time, another account.
    expect(
      shootPatch(next({ time: '10:00', reason: 'Time set' }), {
        ...form,
        time: '',
      }),
    ).toEqual({ start_time: '10:00', moved_reason: 'Time set' });
    const acct = 'bbbbbbbb-0000-4000-8000-000000000001';
    expect(
      shootPatch(next({ creatorId: acct, reason: 'Wrong account' }), form),
    ).toEqual({ creator_id: acct, moved_reason: 'Wrong account' });
    // Nothing changed: nothing written, a reason or not.
    expect(shootPatch(next({ reason: 'x' }), form)).toEqual({});
  });
});
