/**
 * The admin's two writes on the Work Tracker. Remove runs the handler's own
 * remove as the video's handler: only before the editor's Done, with the
 * shoot's count kept true, and it never writes to the account board. A drop
 * on the board writes a column's order, and who handles only the card that
 * changed column.
 */

import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin } from '@gitroom/frontend/lib/auth';
import { onBoard } from '@gitroom/frontend/lib/team/on-board';
import { placeAccount, removeVideo } from './actions';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('@gitroom/frontend/lib/auth', () => ({
  requireAdmin: jest.fn(async () => ({ userId: 'admin-1' })),
}));
jest.mock('@gitroom/frontend/lib/team/on-board', () => ({
  onBoard: jest.fn(async () => true),
}));

const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ZUWEI = 'aaaaaaaa-0000-4000-8000-000000000002';
const ID = 'dddddddd-0000-4000-8000-000000000001';
const ACC = 'bbbbbbbb-0000-4000-8000-000000000001';

/** The video's handler as read (null: no such video), and the RPC's answer. */
function db(handler: string | null, removed: boolean) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) q[m] = () => q;
  q.maybeSingle = async () => ({
    data: handler === null ? null : { handler_id: handler },
    error: null,
  });
  const from = jest.fn(() => q);
  const rpc = jest.fn(async () => ({ data: removed, error: null }));
  (getSupabaseAdmin as jest.Mock).mockReturnValue({ from, rpc });
  return { from, rpc };
}

beforeEach(() => jest.clearAllMocks());

it('removes the video as its handler would, and reads nothing else', async () => {
  const { from, rpc } = db(KEE, true);
  await expect(removeVideo(ID)).resolves.toEqual({ ok: true });
  expect(rpc).toHaveBeenCalledWith('tracker_remove_video', {
    p_video_id: ID,
    p_member_id: KEE,
  });
  expect(from.mock.calls).toEqual([['tracker_video']]);
});

it('refuses once the editor is done, or when the video is gone', async () => {
  db(KEE, false);
  await expect(removeVideo(ID)).resolves.toEqual({
    ok: false,
    message: 'That video is already gone, or its editor is done.',
  });
  const { rpc } = db(null, true);
  await expect(removeVideo(ID)).resolves.toMatchObject({ ok: false });
  expect(rpc).not.toHaveBeenCalled();
});

it('refuses anyone but the admin, and a bad id, before reading', async () => {
  const { from } = db(KEE, true);
  (requireAdmin as jest.Mock).mockRejectedValueOnce(
    new Error('Not authorized.'),
  );
  await expect(removeVideo(ID)).resolves.toEqual({
    ok: false,
    message: 'Not authorized.',
  });
  await expect(removeVideo('not-a-video')).resolves.toEqual({
    ok: false,
    message: 'Invalid video.',
  });
  expect(from).not.toHaveBeenCalled();
});

describe('a drop on the account board', () => {
  const ACC2 = 'bbbbbbbb-0000-4000-8000-000000000002';

  function boardDb() {
    const upsert = jest.fn(async () => ({ error: null }));
    const from = jest.fn(() => ({ upsert }));
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ from });
    return { from, upsert };
  }

  it('hands the moved card over, and only places the others', async () => {
    const { from, upsert } = boardDb();
    await expect(
      placeAccount([ACC2, ACC], { creatorId: ACC, handlerId: ZUWEI }),
    ).resolves.toEqual({ ok: true });
    expect(onBoard).toHaveBeenCalledWith([ZUWEI], ['handler', 'both']);
    expect(from).toHaveBeenCalledWith('tracker_assignment');
    expect(upsert).toHaveBeenNthCalledWith(
      1,
      [{ creator_id: ACC2, sort_order: 0 }],
      { onConflict: 'creator_id' },
    );
    expect(upsert).toHaveBeenNthCalledWith(
      2,
      {
        creator_id: ACC,
        handler_id: ZUWEI,
        sort_order: 1,
        updated_by: 'admin-1',
      },
      { onConflict: 'creator_id' },
    );
  });

  it('reorders without writing who handles anything', async () => {
    const { upsert } = boardDb();
    await expect(placeAccount([ACC, ACC2])).resolves.toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      [
        { creator_id: ACC, sort_order: 0 },
        { creator_id: ACC2, sort_order: 1 },
      ],
      { onConflict: 'creator_id' },
    );
  });

  it('puts an account in Unassigned', async () => {
    const { upsert } = boardDb();
    await placeAccount([ACC], { creatorId: ACC, handlerId: null });
    expect(upsert).toHaveBeenCalledWith(
      {
        creator_id: ACC,
        handler_id: null,
        sort_order: 0,
        updated_by: 'admin-1',
      },
      { onConflict: 'creator_id' },
    );
  });

  it('refuses someone who left, or only edits', async () => {
    const { upsert } = boardDb();
    (onBoard as jest.Mock).mockResolvedValueOnce(false);
    await expect(
      placeAccount([ACC], { creatorId: ACC, handlerId: ZUWEI }),
    ).resolves.toEqual({
      ok: false,
      message: 'That person is not on the board, or does not handle accounts.',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses anyone but the admin, and a bad order, before writing', async () => {
    const { from } = boardDb();
    (requireAdmin as jest.Mock).mockRejectedValueOnce(
      new Error('Not authorized.'),
    );
    await expect(placeAccount([ACC])).resolves.toEqual({
      ok: false,
      message: 'Not authorized.',
    });
    for (const [order, move] of [
      [[], null],
      [['nope'], null],
      [[ACC, ACC], null],
      [[ACC], { creatorId: ACC2, handlerId: null }],
      [[ACC], { creatorId: ACC, handlerId: 'nope' }],
      [Array.from({ length: 501 }, () => ACC), null],
    ] as const)
      await expect(
        placeAccount(order as unknown as string[], move),
      ).resolves.toMatchObject({ ok: false });
    expect(from).not.toHaveBeenCalled();
  });
});
