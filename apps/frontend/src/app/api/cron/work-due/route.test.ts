/**
 * The time's-up reminder: once a minute, a shoot that has just fallen due
 * pushes its person — once per push time, however many runs overlap.
 */

import { getSupabaseAdmin } from '@d3/database';
import { pushKey, sendPush } from '@gitroom/frontend/lib/team/push';
import { GET } from './route';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), init),
  },
}));
jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('@gitroom/frontend/lib/team/push', () => ({
  pushKey: jest.fn(() => 'pub-key'),
  sendPush: jest.fn(async (events: unknown[]) => events.length),
}));

const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  member_id: KEE,
  shoot_date: '2026-09-30',
  start_time: '10:00:00',
  title: null,
  creator_id: null,
  videos_shot: null,
  status: 'planned',
  note: null,
  moved_reason: null,
  created_by: null,
  updated_by: null,
  due_pushed_for: null,
  ...over,
});

type Step = [string, ...unknown[]];

/** The read answers `planned`; each claim answers `claimed(id)`. */
function fakeDb(planned: unknown[], claimed = (id: string) => [row(id)]) {
  const claims: Step[][] = [];
  const from = () => {
    const steps: Step[] = [];
    let id = '';
    const q: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({
          data: steps[0][0] === 'update' ? claimed(id) : planned,
          error: null,
        }).then(ok),
    };
    for (const m of ['select', 'update', 'eq', 'gte', 'lte', 'or'])
      q[m] = (...args: unknown[]) => {
        steps.push([m, ...args]);
        if (m === 'eq' && args[0] === 'id') id = args[1] as string;
        if (m === 'update') claims.push(steps);
        return q;
      };
    return q;
  };
  (getSupabaseAdmin as jest.Mock).mockReturnValue({ from });
  return claims;
}

const call = (auth = 'Bearer s3cret') =>
  GET(
    new Request('https://www.d3creator.com/api/cron/work-due', {
      headers: { authorization: auth },
    }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = 's3cret';
  jest.useFakeTimers().setSystemTime(new Date('2026-09-30T11:30:00+08:00'));
});
afterEach(() => jest.useRealTimers());

it('turns away a caller without the cron secret', async () => {
  fakeDb([]);
  expect((await call('Bearer nope')).status).toBe(401);
  expect(getSupabaseAdmin).not.toHaveBeenCalled();
});

it('does nothing while push is off', async () => {
  (pushKey as jest.Mock).mockReturnValueOnce(null);
  const res = await call();
  expect(await res.json()).toEqual({ skipped: 'push is off' });
  expect(getSupabaseAdmin).not.toHaveBeenCalled();
});

it('claims a shoot that just fell due, then pushes its person', async () => {
  const claims = fakeDb([row('s-due')]);
  const res = await call();
  expect(await res.json()).toEqual({ due: 1, pushed: 1 });
  // Due at 11:00 (+08): an hour after its 10:00 start.
  expect(claims).toEqual([
    [
      ['update', { due_pushed_for: '2026-09-30T03:00:00.000Z' }],
      ['eq', 'id', 's-due'],
      ['eq', 'status', 'planned'],
      [
        'or',
        'due_pushed_for.is.null,due_pushed_for.neq."2026-09-30T03:00:00.000Z"',
      ],
      ['select', expect.any(String)],
    ],
  ]);
  expect(sendPush).toHaveBeenCalledWith(
    [
      {
        kind: 'due',
        to: KEE,
        shoot: expect.objectContaining({ id: 's-due', time: '10:00' }),
      },
    ],
    null,
  );
});

it('pushes a shoot once per push time, and again once it is moved', async () => {
  const claims = fakeDb([
    // Already pushed for 11:00.
    row('s-told', { due_pushed_for: '2026-09-30T03:00:00+00:00' }),
    // Pushed for 11:00, then moved to 10:15: due 11:15, not yet told.
    row('s-moved', {
      start_time: '10:15:00',
      due_pushed_for: '2026-09-30T03:00:00+00:00',
    }),
    // Not due until 12:00.
    row('s-later', { start_time: '11:00:00' }),
  ]);
  expect(await (await call()).json()).toEqual({ due: 1, pushed: 1 });
  expect(claims.map((c) => c[1])).toEqual([['eq', 'id', 's-moved']]);
});

it('pushes nothing another run has already claimed', async () => {
  fakeDb([row('s-due')], () => []);
  expect(await (await call()).json()).toEqual({ due: 0, pushed: 0 });
  expect(sendPush).not.toHaveBeenCalled();
});

it('reads only planned shoots from yesterday and today', async () => {
  const reads: Step[] = [];
  (getSupabaseAdmin as jest.Mock).mockReturnValue({
    from: (table: string) => {
      reads.push(['from', table]);
      const q: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(ok),
      };
      for (const m of ['select', 'eq', 'gte', 'lte'])
        q[m] = (...args: unknown[]) => {
          if (m !== 'select') reads.push([m, ...args]);
          return q;
        };
      return q;
    },
  });
  await call();
  expect(reads).toEqual([
    ['from', 'tracker_shoot'],
    ['eq', 'status', 'planned'],
    ['gte', 'shoot_date', '2026-09-29'],
    ['lte', 'shoot_date', '2026-09-30'],
  ]);
});
