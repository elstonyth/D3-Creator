/**
 * Giving a video to another editor moves its account's editor on the
 * admin's account board with it; fixing only the title does not.
 */

import { getSupabaseAdmin } from '@d3/database';
import { claimAccount, releaseAccount } from './claim-account';
import { deleteVideo, updateVideo } from './video-actions';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('./on-board', () => ({ onBoard: jest.fn(async () => true) }));
jest.mock('./claim-account', () => ({
  claimAccount: jest.fn(async () => undefined),
  releaseAccount: jest.fn(async () => undefined),
}));
jest.mock('./staff-context', () => ({
  requireStaff: jest.fn(async () => ({
    userId: 'u1',
    memberId: 'aaaaaaaa-0000-4000-8000-000000000001', // KEE
  })),
}));

const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ALI = 'aaaaaaaa-0000-4000-8000-000000000009';
const MEI = 'aaaaaaaa-0000-4000-8000-000000000003';
const ID = 'dddddddd-0000-4000-8000-000000000001';
const ACC = 'bbbbbbbb-0000-4000-8000-000000000001';

/** The update answers with the video as saved, or nothing (not the caller's). */
function videoDb(
  saved: { editor_id: string; creator_id: string | null } | null,
) {
  const q: Record<string, unknown> = {
    then: (ok: (v: unknown) => unknown) =>
      Promise.resolve({
        data: saved
          ? [
              {
                id: ID,
                shoot_id: null,
                title: 'Reel 1',
                handler_id: KEE,
                edited_at: null,
                edited_by: null,
                edit_link: null,
                verified_at: null,
                verified_by: null,
                created_at: '2026-09-20T02:00:00Z',
                ...saved,
              },
            ]
          : [],
        error: null,
      }).then(ok),
  };
  for (const m of ['select', 'update', 'eq', 'is']) q[m] = () => q;
  (getSupabaseAdmin as jest.Mock).mockReturnValue({ from: () => q });
}

const before = { title: 'Reel 1', editorId: ALI };

beforeEach(() => jest.clearAllMocks());

it('moves the account’s editor to the new editor', async () => {
  videoDb({ editor_id: MEI, creator_id: ACC });
  const r = await updateVideo(ID, { title: 'Reel 1', editorId: MEI }, before);
  expect(r).toMatchObject({ ok: true });
  expect(claimAccount).toHaveBeenCalledWith(ACC, { editorId: MEI }, 'u1');
});

it('leaves the board alone for a title fix or a video not the caller’s', async () => {
  videoDb({ editor_id: ALI, creator_id: ACC });
  await updateVideo(ID, { title: 'Reel one', editorId: ALI }, before);
  videoDb(null);
  await updateVideo(ID, { title: 'Reel 1', editorId: MEI }, before);
  expect(claimAccount).not.toHaveBeenCalled();
});

describe('taking a video back', () => {
  function removeDb(account: string | null, removed: boolean) {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq']) q[m] = () => q;
    q.maybeSingle = async () => ({
      data: account === undefined ? null : { creator_id: account },
      error: null,
    });
    (getSupabaseAdmin as jest.Mock).mockReturnValue({
      from: () => q,
      rpc: jest.fn(async () => ({ data: removed, error: null })),
    });
  }

  it('gives the account back if that was the last of this work on it', async () => {
    removeDb(ACC, true);
    const r = await deleteVideo(ID);
    expect(r).toMatchObject({ ok: true });
    expect(releaseAccount).toHaveBeenCalledWith(ACC, KEE, 'u1');
  });

  it('touches nothing when the video was not the caller’s to take back', async () => {
    removeDb(ACC, false);
    const r = await deleteVideo(ID);
    expect(r).toMatchObject({ ok: false });
    expect(releaseAccount).not.toHaveBeenCalled();
  });
});
