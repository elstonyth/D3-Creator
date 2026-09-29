/**
 * Staff work keeps the editor on the admin's account board up to date —
 * never the handler, which is the admin's to set. What is written, and that a
 * failure never reaches the staff member's save.
 */

import { getSupabaseAdmin } from '@d3/database';
import { claimAccount, mainEditor, releaseAccount } from './claim-account';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));

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
  it('writes the editor only, stamped with who did it', async () => {
    await claimAccount('acc', 'ali', 'u1');
    expect(upsert).toHaveBeenLastCalledWith(
      { creator_id: 'acc', editor_id: 'ali', updated_by: 'u1' },
      { onConflict: 'creator_id' },
    );
  });

  it('does nothing without an account or an editor', async () => {
    await claimAccount(null, 'ali', 'u1');
    await claimAccount('acc', null, 'u1');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('never fails the staff member’s save', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    upsert.mockResolvedValueOnce({ error: { message: 'boom' } });
    await expect(claimAccount('acc', 'ali', 'u1')).resolves.toBeUndefined();
    upsert.mockRejectedValueOnce(new Error('network'));
    await expect(claimAccount('acc', 'ali', 'u1')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
    log.mockRestore();
  });
});

describe('releaseAccount', () => {
  type Log = {
    old_value: string | null;
    new_value: string | null;
    changed_by: string | null;
  };

  /** A board where the account's editor is `now`, with `log` newest first. */
  function board(
    now: { editor_id: string | null } | null,
    log: Log[],
    videos: { editor_id: string }[] = [],
  ) {
    const update = jest.fn(() => ({
      eq: jest.fn(async () => ({ error: null })),
    }));
    const reads: Record<string, [string, ...unknown[]][]> = {};
    const read = (table: string, data: unknown) => {
      const steps: [string, ...unknown[]][] = (reads[table] = []);
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order'])
        q[m] = (...args: unknown[]) => {
          steps.push([m, ...args]);
          return q;
        };
      q.maybeSingle = async () => ({ data, error: null });
      q.limit = async () => ({ data, error: null });
      q.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data, error: null }).then(ok);
      return q;
    };
    (getSupabaseAdmin as jest.Mock).mockReturnValue({
      from: (table: string) => {
        if (table === 'tracker_assignment')
          return { ...(read(table, now) as object), update };
        if (table === 'tracker_assignment_log') return read(table, log);
        return read(table, videos);
      },
    });
    return { update, reads };
  }

  const claim = (old_value: string | null, new_value: string): Log => ({
    old_value,
    new_value,
    changed_by: 'u1',
  });

  it('puts back the editor from before a mistaken pick', async () => {
    const { update, reads } = board({ editor_id: 'mei' }, [
      claim('ali', 'mei'),
    ]);
    await releaseAccount('acc', 'u1');
    expect(update).toHaveBeenCalledWith({ editor_id: 'ali', updated_by: 'u1' });
    // Only the editor's history is read: the handler is never taken back.
    expect(reads.tracker_assignment_log).toContainEqual([
      'eq',
      'field',
      'editor',
    ]);
  });

  it('keeps a real handover: more of that editor’s work is on the account', async () => {
    const { update } = board(
      { editor_id: 'mei' },
      [claim(null, 'mei')],
      [{ editor_id: 'mei' }],
    );
    await releaseAccount('acc', 'u1');
    expect(update).not.toHaveBeenCalled();
  });

  it('takes back the claim of the person the admin acts for', async () => {
    const { update } = board({ editor_id: 'mei' }, [claim('ali', 'mei')]);
    await releaseAccount('acc', 'boss', 'u1');
    expect(update).toHaveBeenCalledWith({
      editor_id: 'ali',
      updated_by: 'boss',
    });
  });

  it('never takes back a change no login made', async () => {
    const { update } = board({ editor_id: 'mei' }, [
      { ...claim('ali', 'mei'), changed_by: null },
    ]);
    await releaseAccount('acc', 'boss', null);
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves a claim someone else has made since', async () => {
    const { update } = board({ editor_id: 'sk' }, [
      { ...claim('mei', 'sk'), changed_by: 'u9' },
    ]);
    await releaseAccount('acc', 'u1');
    expect(update).not.toHaveBeenCalled();
  });

  it('does nothing for no account, and never throws', async () => {
    await releaseAccount(null, 'u1');
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    (getSupabaseAdmin as jest.Mock).mockImplementation(() => {
      throw new Error('db down');
    });
    await expect(releaseAccount('acc', 'u1')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
