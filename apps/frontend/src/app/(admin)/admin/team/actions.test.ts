/**
 * Removing someone always shuts them out, whatever work is still waiting on
 * them: nobody else can finish a video they passed on, so a remove that
 * waited for it would leave a leaver's login working for good.
 */

import { getSupabaseAdmin } from '@d3/database';
import { removePerson } from './actions';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('@gitroom/frontend/lib/auth', () => ({
  requireAdmin: jest.fn(async () => undefined),
}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';

type Step = [string, ...unknown[]];

/** Records every query; each answers with what `answer` gives its table. */
function fakeDb(answer: (table: string, steps: Step[]) => unknown) {
  const calls: { table: string; steps: Step[] }[] = [];
  const from = (table: string) => {
    const call = { table, steps: [] as Step[] };
    calls.push(call);
    const done = () =>
      Promise.resolve({ data: answer(table, call.steps), error: null });
    const q: Record<string, unknown> = {
      maybeSingle: done,
      then: (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
        done().then(ok, fail),
    };
    for (const m of ['select', 'update', 'eq', 'is', 'in', 'or', 'limit'])
      q[m] = (...args: unknown[]) => {
        call.steps.push([m, ...args]);
        return q;
      };
    return q;
  };
  (getSupabaseAdmin as jest.Mock).mockReturnValue({ from });
  return calls;
}

it('removes someone with videos still waiting on them', async () => {
  const calls = fakeDb((table, steps) => {
    if (table === 'tracker_video') return [{ id: 'v1' }];
    if (table === 'tracker_member')
      return steps.some(([m]) => m === 'update')
        ? [{ id: KEE }]
        : { user_id: 'u9' };
    return null;
  });

  await expect(removePerson(KEE)).resolves.toEqual({ ok: true });

  expect(calls.some((c) => c.table === 'tracker_video')).toBe(false);
  const role = calls.find((c) => c.table === 'user_role');
  expect(role?.steps).toContainEqual(['update', { role: 'none' }]);
  expect(role?.steps).toContainEqual(['eq', 'user_id', 'u9']);
  const archive = calls.find(
    (c) =>
      c.table === 'tracker_member' && c.steps.some(([m]) => m === 'update'),
  );
  expect(archive?.steps).toContainEqual([
    'update',
    expect.objectContaining({ user_id: null, archived_at: expect.any(String) }),
  ]);
});
