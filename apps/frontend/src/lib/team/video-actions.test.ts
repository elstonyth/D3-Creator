/**
 * Giving a video to another editor moves its account's editor on the
 * admin's account board with it; fixing only the title does not.
 */

import { getSupabaseAdmin } from '@d3/database';
import { claimAccount, releaseAccount } from './claim-account';
import { notify } from './push';
import { deleteVideo, finishEdit, updateVideo } from './video-actions';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
// Only an admin's call reads this (staff are found first, below).
jest.mock('@gitroom/frontend/lib/auth', () => ({
  getAuthContext: jest.fn(async () => ({ role: 'staff' })),
}));
jest.mock('./on-board', () => ({ onBoard: jest.fn(async () => true) }));
jest.mock('./push', () => ({ notify: jest.fn() }));
jest.mock('./claim-account', () => ({
  claimAccount: jest.fn(async () => undefined),
  releaseAccount: jest.fn(async () => undefined),
}));
jest.mock('./staff-context', () => ({
  getStaffContext: jest.fn(async () => ({
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
  saved: { editor_id: string; creator_id: string | null; [col: string]: unknown } | null,
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
  expect(claimAccount).toHaveBeenCalledWith(ACC, MEI, 'u1');
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

  it('gives the account’s editor back if that was the last of this work on it', async () => {
    removeDb(ACC, true);
    const r = await deleteVideo(ID);
    expect(r).toMatchObject({ ok: true });
    expect(releaseAccount).toHaveBeenCalledWith(ACC, 'u1');
  });

  it('touches nothing when the video was not the caller’s to take back', async () => {
    removeDb(ACC, false);
    const r = await deleteVideo(ID);
    expect(r).toMatchObject({ ok: false });
    expect(releaseAccount).not.toHaveBeenCalled();
  });
});

describe('telling whoever a video is with now', () => {
  it('tells the new editor of a video given to them', async () => {
    videoDb({ editor_id: MEI, creator_id: ACC });
    await updateVideo(ID, { title: 'Reel 1', editorId: MEI }, before);
    expect(notify).toHaveBeenCalledWith(
      [
        {
          kind: 'edit',
          to: MEI,
          from: KEE,
          titles: ['Reel 1'],
          creatorId: ACC,
          ref: ID,
        },
      ],
      'u1',
    );
  });

  it('tells the handler a cut waits on their check', async () => {
    videoDb({
      editor_id: KEE,
      creator_id: ACC,
      handler_id: ALI,
      edited_at: '2026-09-29T08:00:00Z',
      edited_by: KEE,
    });
    await expect(finishEdit(ID)).resolves.toMatchObject({ ok: true });
    expect(notify).toHaveBeenCalledWith(
      [
        {
          kind: 'verify',
          to: ALI,
          by: KEE,
          title: 'Reel 1',
          creatorId: ACC,
          ref: ID,
        },
      ],
      'u1',
    );
  });

  it('tells nobody of a title fix, or a step that was refused', async () => {
    videoDb({ editor_id: ALI, creator_id: ACC });
    await updateVideo(ID, { title: 'Reel one', editorId: ALI }, before);
    videoDb(null);
    await updateVideo(ID, { title: 'Reel 1', editorId: MEI }, before);
    videoDb(null);
    await finishEdit(ID);
    expect(notify).not.toHaveBeenCalled();
  });
});
