/**
 * A shoot's videos carry its account from when they were passed on, so a
 * corrected account has to reach them — and only from a shoot that is
 * really the caller's.
 */

import { getSupabaseAdmin } from '@d3/database';
import { claimAccount, releaseAccount } from './claim-account';
import { passVideos, updateShoot } from './shoot-actions';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('./on-board', () => ({ onBoard: jest.fn(async () => true) }));
jest.mock('./claim-account', () => ({
  ...jest.requireActual('./claim-account'),
  claimAccount: jest.fn(async () => undefined),
  releaseAccount: jest.fn(async () => undefined),
}));
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

/**
 * Records every query; the shoot update answers with `shootRows`, a read of
 * the shoot's videos with `videoRows`.
 */
function fakeDb(shootRows: unknown[], videoRows: unknown[] | null = null) {
  const calls: { table: string; steps: Step[] }[] = [];
  const from = (table: string) => {
    const call = { table, steps: [] as Step[] };
    calls.push(call);
    const done = () =>
      Promise.resolve({
        data: table === 'tracker_shoot' ? shootRows : videoRows,
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
    const videos = calls.find(
      (c) => c.table === 'tracker_video' && c.steps[0][0] === 'update',
    );
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

describe('correcting a passed shoot’s account moves the board with it', () => {
  const MEI = 'aaaaaaaa-0000-4000-8000-000000000003';
  const KIM = 'aaaaaaaa-0000-4000-8000-000000000004';
  const onA = (editor_id: string) => ({ creator_id: ACC_A, editor_id });

  it('gives back the account the videos left and claims the new one', async () => {
    fakeDb([row(ACC_B)], [onA(KIM), onA(MEI), onA(MEI)]);
    const r = await updateShoot(ID, form(ACC_B), form(ACC_A));
    expect(r).toMatchObject({ ok: true });
    expect(releaseAccount).toHaveBeenCalledWith(ACC_A, ALI, 'u1');
    expect(claimAccount).toHaveBeenCalledWith(
      ACC_B,
      { handlerId: ALI, editorId: MEI },
      'u1',
    );
  });

  it('only gives back when the account is taken off', async () => {
    fakeDb([row(null)], [onA(MEI)]);
    await updateShoot(ID, form(null), form(ACC_A));
    expect(releaseAccount).toHaveBeenCalledWith(ACC_A, ALI, 'u1');
    // claimAccount ignores a null account.
    expect(claimAccount).toHaveBeenCalledWith(
      null,
      { handlerId: ALI, editorId: MEI },
      'u1',
    );
  });

  it('touches the board for no shoot that has not been passed on yet', async () => {
    fakeDb([row(ACC_B)], []);
    await updateShoot(ID, form(ACC_B), form(ACC_A));
    expect(releaseAccount).not.toHaveBeenCalled();
    expect(claimAccount).not.toHaveBeenCalled();
  });
});

describe('passing videos on keeps the account board up to date', () => {
  const MEI = 'aaaaaaaa-0000-4000-8000-000000000003';
  const KIM = 'aaaaaaaa-0000-4000-8000-000000000004';
  const rows = [
    { title: 'Reel 1', editorId: KIM },
    { title: 'Reel 2', editorId: MEI },
    { title: 'Reel 3', editorId: MEI },
  ];

  function passDb(account: string | null) {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.single = async () => ({ data: row(account), error: null });
    (getSupabaseAdmin as jest.Mock).mockReturnValue({
      rpc: jest.fn(async () => ({ data: [], error: null })),
      from: () => q,
    });
  }

  it('makes the passer the handler and the main editor the editor', async () => {
    passDb(ACC_A);
    const r = await passVideos(ID, rows);
    expect(r).toMatchObject({ ok: true });
    expect(claimAccount).toHaveBeenCalledWith(
      ACC_A,
      { handlerId: ALI, editorId: MEI },
      'u1',
    );
  });

  it('claims nothing when the pass is refused', async () => {
    (getSupabaseAdmin as jest.Mock).mockReturnValue({
      rpc: jest.fn(async () => ({
        data: null,
        error: { message: 'That shoot is already gone.' },
      })),
    });
    const r = await passVideos(ID, rows);
    expect(r).toMatchObject({ ok: false });
    expect(claimAccount).not.toHaveBeenCalled();
  });
});
