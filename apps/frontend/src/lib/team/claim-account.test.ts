/**
 * Staff work keeps the admin's account board up to date. What is written,
 * and that a failure never reaches the staff member's save.
 */

import { getSupabaseAdmin } from '@d3/database';
import { claimAccount, mainEditor } from './claim-account';
import { onBoard } from './on-board';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('./on-board', () => ({ onBoard: jest.fn(async () => true) }));

const upsert = jest.fn(async () => ({ error: null as unknown }));
beforeEach(() => {
  jest.clearAllMocks();
  (getSupabaseAdmin as jest.Mock).mockReturnValue({
    from: (table: string) => {
      expect(table).toBe('tracker_assignment');
      return { upsert };
    },
  });
});

describe('mainEditor', () => {
  it('picks the editor given most videos; a tie goes to the first listed', () => {
    expect(mainEditor(['a', 'b', 'b'])).toBe('b');
    expect(mainEditor(['a', 'b'])).toBe('a');
    expect(mainEditor(['b', 'a', 'a', 'b'])).toBe('b');
    expect(mainEditor([])).toBeNull();
  });
});

describe('claimAccount', () => {
  it('writes only what was claimed, stamped with who did it', async () => {
    await claimAccount('acc', { handlerId: 'kee', editorId: 'ali' }, 'u1');
    expect(upsert).toHaveBeenLastCalledWith(
      {
        creator_id: 'acc',
        handler_id: 'kee',
        editor_id: 'ali',
        updated_by: 'u1',
      },
      { onConflict: 'creator_id' },
    );
    // An editor change leaves the handler alone.
    await claimAccount('acc', { editorId: 'mei' }, 'u2');
    expect(upsert).toHaveBeenLastCalledWith(
      { creator_id: 'acc', editor_id: 'mei', updated_by: 'u2' },
      { onConflict: 'creator_id' },
    );
  });

  it('never makes someone who only edits the handler', async () => {
    (onBoard as jest.Mock).mockResolvedValueOnce(false);
    await claimAccount('acc', { handlerId: 'ali', editorId: 'mei' }, 'u1');
    expect(onBoard).toHaveBeenCalledWith(['ali'], ['handler', 'both']);
    expect(upsert).toHaveBeenLastCalledWith(
      { creator_id: 'acc', editor_id: 'mei', updated_by: 'u1' },
      { onConflict: 'creator_id' },
    );
    // Nothing left to write: no write at all.
    (onBoard as jest.Mock).mockResolvedValueOnce(false);
    upsert.mockClear();
    await claimAccount('acc', { handlerId: 'ali' }, 'u1');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does nothing without an account or a claim', async () => {
    await claimAccount(null, { handlerId: 'kee' }, 'u1');
    await claimAccount('acc', {}, 'u1');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('never fails the staff member’s save', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    upsert.mockResolvedValueOnce({ error: { message: 'boom' } });
    await expect(
      claimAccount('acc', { editorId: 'ali' }, 'u1'),
    ).resolves.toBeUndefined();
    upsert.mockRejectedValueOnce(new Error('network'));
    await expect(
      claimAccount('acc', { editorId: 'ali' }, 'u1'),
    ).resolves.toBeUndefined();
    // The "runs accounts?" lookup failing is swallowed too.
    (onBoard as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(
      claimAccount('acc', { handlerId: 'kee' }, 'u1'),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(3);
    log.mockRestore();
  });
});
