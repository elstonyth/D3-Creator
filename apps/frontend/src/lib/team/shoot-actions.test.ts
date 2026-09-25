/**
 * A shoot's videos carry its account from when they were passed on, so a
 * corrected account has to reach them — and only from a shoot that is
 * really the caller's.
 */

import { getSupabaseAdmin } from '@d3/database';
import { updateShoot } from './shoot-actions';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('./staff-context', () => ({
  requireStaff: jest.fn(async () => ({
    userId: 'u1',
    memberId: 'aaaaaaaa-0000-4000-8000-000000000009', // ALI
  })),
}));

const ALI = 'aaaaaaaa-0000-4000-8000-000000000009';
const ID = 'cccccccc-0000-4000-8000-000000000001';
const ACC_A = 'bbbbbbbb-0000-4000-8000-000000000001';
const ACC_B = 'bbbbbbbb-0000-4000-8000-000000000002';

type Step = [string, ...unknown[]];

/** Records every query; the shoot update answers with `shootRows`. */
function fakeDb(shootRows: unknown[]) {
  const calls: { table: string; steps: Step[] }[] = [];
  const from = (table: string) => {
    const call = { table, steps: [] as Step[] };
    calls.push(call);
    const done = () =>
      Promise.resolve({
        data: table === 'tracker_shoot' ? shootRows : null,
        error: null,
      });
    const q: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
        done().then(ok, fail),
    };
    for (const m of ['select', 'update', 'eq', 'gte'])
      q[m] = (...args: unknown[]) => {
        call.steps.push([m, ...args]);
        return q;
      };
    return q;
  };
  (getSupabaseAdmin as jest.Mock).mockReturnValue({ from });
  return calls;
}

const form = (creatorId: string | null) => ({
  date: '2099-01-05',
  title: 'Hotpot shop',
  creatorId,
});
const row = (creatorId: string | null) => ({
  id: ID,
  member_id: ALI,
  shoot_date: '2099-01-05',
  start_time: null,
  title: 'Hotpot shop',
  creator_id: creatorId,
  videos_shot: 2,
  status: 'done',
  note: null,
});

beforeEach(() => jest.clearAllMocks());

it('moves the videos to the corrected account, or off one', async () => {
  for (const next of [ACC_B, null]) {
    const calls = fakeDb([row(next)]);
    const r = await updateShoot(ID, form(next), form(ACC_A));
    expect(r).toMatchObject({ ok: true, shoot: { creatorId: next } });
    const videos = calls.find((c) => c.table === 'tracker_video');
    expect(videos?.steps).toEqual([
      ['update', { creator_id: next }],
      ['eq', 'shoot_id', ID],
      ['eq', 'handler_id', ALI],
    ]);
  }
});

it('leaves the videos alone when the account did not change', async () => {
  const calls = fakeDb([row(ACC_A)]);
  const r = await updateShoot(
    ID,
    { ...form(ACC_A), title: 'Noodle bar' },
    form(ACC_A),
  );
  expect(r).toMatchObject({ ok: true });
  expect(calls.some((c) => c.table === 'tracker_video')).toBe(false);
});

it('touches no video when the shoot is not the caller’s', async () => {
  const calls = fakeDb([]);
  const r = await updateShoot(ID, form(ACC_B), form(ACC_A));
  expect(r).toMatchObject({ ok: false });
  expect(calls.some((c) => c.table === 'tracker_video')).toBe(false);
});
