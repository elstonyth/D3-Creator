/**
 * A shoot's videos carry its account from when they were passed on, so a
 * corrected account has to reach them — and only from a shoot that is
 * really the caller's.
 */

import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { claimAccount, releaseAccount } from './claim-account';
import { getStaffContext } from './staff-context';
import { addShoot, passVideos, updateShoot } from './shoot-actions';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
// Only an admin's call reads this (staff are found first, below).
jest.mock('@gitroom/frontend/lib/auth', () => ({
  getAuthContext: jest.fn(async () => ({ role: 'staff' })),
}));
jest.mock('./on-board', () => ({ onBoard: jest.fn(async () => true) }));
jest.mock('./claim-account', () => ({
  ...jest.requireActual('./claim-account'),
  claimAccount: jest.fn(async () => undefined),
  releaseAccount: jest.fn(async () => undefined),
}));
jest.mock('./staff-context', () => ({
  getStaffContext: jest.fn(async () => ({
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
      single: () => {
        call.steps.push(['single']);
        return Promise.resolve({ data: shootRows[0] ?? null, error: null });
      },
      // The shoot's person's login (ALI's), for giving back their claim.
      maybeSingle: () =>
        Promise.resolve({
          data: table === 'tracker_member' ? { user_id: 'u1' } : null,
          error: null,
        }),
    };
    for (const m of ['select', 'insert', 'update', 'eq', 'gte'])
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
  creatorId,
  reason: 'Wrong account',
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
  moved_reason: null,
});

beforeEach(() => jest.clearAllMocks());

it('moves the videos to the corrected account, or off one', async () => {
  for (const next of [ACC_B, null]) {
    const calls = fakeDb([row(next)]);
    const r = await updateShoot(ID, form(next), form(ACC_A));
    expect(r).toMatchObject({ ok: true, shoot: { creatorId: next } });
    // An account-only change says why too.
    expect(calls[0].steps.find((s) => s[0] === 'update')?.[1]).toMatchObject({
      creator_id: next,
      moved_reason: 'Wrong account',
    });
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
    { ...form(ACC_A), time: '10:00' },
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

it('adds a shoot without a title or note, even when an old page sends them', async () => {
  const calls = fakeDb([{ ...row(ACC_A), title: null }]);
  const r = await addShoot({ ...form(ACC_A), title: 'Hotpot shop', note: 'x' });
  expect(r).toMatchObject({ ok: true, shoot: { title: null } });
  const insert = calls[0].steps.find((s) => s[0] === 'insert');
  expect(insert?.[1]).not.toHaveProperty('title');
  expect(insert?.[1]).not.toHaveProperty('note');
  expect(insert?.[1]).toMatchObject({
    member_id: ALI,
    shoot_date: '2099-01-05',
    creator_id: ACC_A,
  });
});

it('adds the admin’s shoot for the person named, stamped with the admin', async () => {
  const SK = 'aaaaaaaa-0000-4000-8000-000000000004';
  (getStaffContext as jest.Mock).mockResolvedValueOnce(null);
  (getAuthContext as jest.Mock).mockResolvedValueOnce({
    userId: 'boss',
    role: 'admin',
  });
  const calls = fakeDb([row(ACC_A)]);
  await expect(addShoot(form(ACC_A), SK)).resolves.toMatchObject({ ok: true });
  const insert = calls[0].steps.find((s) => s[0] === 'insert');
  expect(insert?.[1]).toMatchObject({ member_id: SK, created_by: 'boss' });
});

it('never writes over an old shoot’s title or note', async () => {
  const calls = fakeDb([row(ACC_A)]);
  await updateShoot(
    ID,
    { ...form(ACC_A), time: '10:00', note: 'x', title: 'Changed' },
    form(ACC_A),
  );
  const update = calls[0].steps.find((s) => s[0] === 'update');
  // Stamped with who changed it: a change by someone else pops up.
  expect(update?.[1]).toMatchObject({ start_time: '10:00', updated_by: 'u1' });
  expect(update?.[1]).not.toHaveProperty('title');
  expect(update?.[1]).not.toHaveProperty('note');
});

describe('correcting a passed shoot’s account moves the board’s editor with it', () => {
  const MEI = 'aaaaaaaa-0000-4000-8000-000000000003';
  const KIM = 'aaaaaaaa-0000-4000-8000-000000000004';
  const onA = (editor_id: string) => ({ creator_id: ACC_A, editor_id });

  it('gives back the account the videos left and claims the new one’s editor', async () => {
    fakeDb([row(ACC_B)], [onA(KIM), onA(MEI), onA(MEI)]);
    const r = await updateShoot(ID, form(ACC_B), form(ACC_A));
    expect(r).toMatchObject({ ok: true });
    expect(releaseAccount).toHaveBeenCalledWith(ACC_A, 'u1', 'u1');
    // The editor only: who handles an account is the admin's to set.
    expect(claimAccount).toHaveBeenCalledWith(ACC_B, MEI, 'u1');
  });

  it('gives back the shoot’s person’s claim when the admin fixes the account', async () => {
    (getStaffContext as jest.Mock).mockResolvedValueOnce(null);
    (getAuthContext as jest.Mock).mockResolvedValueOnce({
      userId: 'boss',
      role: 'admin',
    });
    fakeDb([row(ACC_B)], [onA(MEI)]);
    await updateShoot(
      ID,
      { ...form(ACC_B), reason: 'Wrong account' },
      form(ACC_A),
      ALI,
    );
    // Stamped with the admin; ALI's own claim (u1) is what goes back.
    expect(releaseAccount).toHaveBeenCalledWith(ACC_A, 'boss', 'u1');
  });

  it('only gives back when the account is taken off', async () => {
    fakeDb([row(null)], [onA(MEI)]);
    await updateShoot(ID, form(null), form(ACC_A));
    expect(releaseAccount).toHaveBeenCalledWith(ACC_A, 'u1', 'u1');
    // claimAccount ignores a null account.
    expect(claimAccount).toHaveBeenCalledWith(null, MEI, 'u1');
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

  it('makes the main editor the editor, and never moves the handler', async () => {
    passDb(ACC_A);
    const r = await passVideos(ID, rows);
    expect(r).toMatchObject({ ok: true });
    expect(claimAccount).toHaveBeenCalledWith(ACC_A, MEI, 'u1');
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

describe('changing a shoot', () => {
  const at = { date: '2099-01-05', time: '17:00', creatorId: ACC_A };

  it('refuses any change that does not say why, before writing', async () => {
    const calls = fakeDb([row(ACC_A)]);
    for (const [next, before] of [
      [{ ...at, time: '19:00' }, at],
      [{ ...at, creatorId: ACC_B }, at],
      // Not told what the form started with: still refused.
      [{ ...at, date: '2099-01-06' }, undefined],
    ])
      expect(await updateShoot(ID, next, before)).toEqual({
        ok: false,
        message: 'Say why the shoot is changing.',
      });
    expect(calls).toHaveLength(0);
  });

  it('writes the move with why, and hands the reason back', async () => {
    const calls = fakeDb([
      { ...row(ACC_A), start_time: '19:00:00', moved_reason: 'Client asked' },
    ]);
    const r = await updateShoot(
      ID,
      { ...at, time: '19:00', reason: 'Client asked' },
      at,
    );
    expect(r).toMatchObject({
      ok: true,
      shoot: { time: '19:00', movedReason: 'Client asked' },
    });
    const update = calls[0].steps.find((s) => s[0] === 'update');
    expect(update?.[1]).toEqual({
      start_time: '19:00',
      moved_reason: 'Client asked',
      updated_by: 'u1',
    });
  });
});
