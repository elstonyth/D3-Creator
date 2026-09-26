/**
 * Staff work keeps the admin's account board up to date. What is written,
 * and that a failure never reaches the staff member's save.
 */

import { getSupabaseAdmin } from '@d3/database';
import { claimAccount, mainEditor, releaseAccount } from './claim-account';
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

describe('releaseAccount', () => {
  const ME = 'kee';
  type Log = {
    field: string;
    old_value: string | null;
    new_value: string | null;
    changed_by: string | null;
  };

  /** A board where the account is held as `now`, with `log` newest first. */
  function board(
    now: { handler_id: string | null; editor_id: string | null } | null,
    log: Log[],
    videos: { handler_id: string; editor_id: string }[] = [],
  ) {
    const update = jest.fn(() => ({
      eq: jest.fn(async () => ({ error: null })),
    }));
    const read = (data: unknown) => {
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order']) q[m] = () => q;
      q.maybeSingle = async () => ({ data, error: null });
      q.limit = async () => ({ data, error: null });
      q.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(ok);
      return q;
    };
    (getSupabaseAdmin as jest.Mock).mockReturnValue({
      from: (table: string) => {
        if (table === 'tracker_assignment')
          return { ...(read(now) as object), update };
        if (table === 'tracker_assignment_log') return read(log);
        return read(videos);
      },
    });
    return update;
  }

  const claim = (
    field: string,
    old_value: string | null,
    new_value: string,
  ) => ({
    field,
    old_value,
    new_value,
    changed_by: 'u1',
  });

  it('puts back who held the account before a mistaken pick', async () => {
    const update = board({ handler_id: ME, editor_id: 'mei' }, [
      claim('editor', null, 'mei'),
      claim('handler', 'zuwei', ME),
    ]);
    await releaseAccount('acc', ME, 'u1');
    expect(update).toHaveBeenCalledWith({
      handler_id: 'zuwei',
      editor_id: null,
      updated_by: 'u1',
    });
  });

  it('keeps a real handover: more of this person’s work is on the account', async () => {
    const update = board(
      { handler_id: ME, editor_id: 'mei' },
      [claim('editor', null, 'mei'), claim('handler', 'zuwei', ME)],
      [{ handler_id: ME, editor_id: 'mei' }],
    );
    await releaseAccount('acc', ME, 'u1');
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves a claim someone else has made since', async () => {
    const update = board({ handler_id: 'sk', editor_id: null }, [
      { ...claim('handler', ME, 'sk'), changed_by: 'u9' },
      claim('handler', 'zuwei', ME),
    ]);
    await releaseAccount('acc', ME, 'u1');
    expect(update).not.toHaveBeenCalled();
  });

  it('does nothing for no account, and never throws', async () => {
    await releaseAccount(null, ME, 'u1');
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    (getSupabaseAdmin as jest.Mock).mockImplementation(() => {
      throw new Error('db down');
    });
    await expect(releaseAccount('acc', ME, 'u1')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
