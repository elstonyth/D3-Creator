/**
 * The admin's two writes on the Work Tracker. Remove runs the handler's own
 * remove as the video's handler: only before the editor's Done, with the
 * shoot's count kept true, and it never writes to the account board. The
 * handover sets who handles an account and nothing else.
 */

import { getSupabaseAdmin } from '@d3/database';
import { requireAdmin } from '@gitroom/frontend/lib/auth';
import { onBoard } from '@gitroom/frontend/lib/team/on-board';
import { removeVideo, setHandler } from './actions';

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

describe('the handover', () => {
  function boardDb() {
    const upsert = jest.fn(async () => ({ error: null }));
    const from = jest.fn(() => ({ upsert }));
    (getSupabaseAdmin as jest.Mock).mockReturnValue({ from });
    return { from, upsert };
  }

  it('writes only who handles the account, stamped with the admin', async () => {
    const { from, upsert } = boardDb();
    await expect(setHandler(ACC, ZUWEI)).resolves.toEqual({ ok: true });
    expect(onBoard).toHaveBeenCalledWith([ZUWEI], ['handler', 'both']);
    expect(from).toHaveBeenCalledWith('tracker_assignment');
    // No editor, no order: those stay as they are.
    expect(upsert).toHaveBeenCalledWith(
      { creator_id: ACC, handler_id: ZUWEI, updated_by: 'admin-1' },
      { onConflict: 'creator_id' },
    );
  });

  it('puts an account back in Unassigned', async () => {
    const { upsert } = boardDb();
    await expect(setHandler(ACC, null)).resolves.toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      { creator_id: ACC, handler_id: null, updated_by: 'admin-1' },
      { onConflict: 'creator_id' },
    );
  });

  it('refuses someone who left, or only edits', async () => {
    const { upsert } = boardDb();
    (onBoard as jest.Mock).mockResolvedValueOnce(false);
    await expect(setHandler(ACC, ZUWEI)).resolves.toEqual({
      ok: false,
      message: 'That person is not on the board, or does not handle accounts.',
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses anyone but the admin, and bad ids, before writing', async () => {
    const { from } = boardDb();
    (requireAdmin as jest.Mock).mockRejectedValueOnce(
      new Error('Not authorized.'),
    );
    await expect(setHandler(ACC, ZUWEI)).resolves.toEqual({
      ok: false,
      message: 'Not authorized.',
    });
    await expect(setHandler('nope', ZUWEI)).resolves.toMatchObject({
      ok: false,
    });
    await expect(setHandler(ACC, 'nope')).resolves.toMatchObject({
      ok: false,
    });
    expect(from).not.toHaveBeenCalled();
  });
});
