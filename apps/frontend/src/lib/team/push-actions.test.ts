/**
 * Turning notifications on files this device under the signed-in login —
 * staff or the admin, nobody else — and never under one the browser names.
 */

import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { dropPush, savePush } from './push-actions';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('@gitroom/frontend/lib/auth', () => ({ getAuthContext: jest.fn() }));

const P256DH =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';
const SUB = {
  endpoint: ENDPOINT,
  expirationTime: null,
  keys: { p256dh: P256DH, auth: AUTH },
  // Whatever else a browser sends is not ours to trust.
  user_id: 'someone-else',
};

type Step = [string, ...unknown[]];
let steps: Step[] = [];

function fakeDb(error: { message: string } | null = null) {
  steps = [];
  const q: Record<string, unknown> = {
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ error }).then(ok),
  };
  for (const m of ['upsert', 'delete', 'eq'])
    q[m] = (...args: unknown[]) => {
      steps.push([m, ...args]);
      return q;
    };
  (getSupabaseAdmin as jest.Mock).mockReturnValue({
    from: (table: string) => {
      steps.push(['from', table]);
      return q;
    },
  });
}

const as = (role: string | null) =>
  (getAuthContext as jest.Mock).mockResolvedValue(
    role ? { userId: 'u1', role } : null,
  );

beforeEach(() => fakeDb());

it('files the device under the staff member’s own login', async () => {
  as('staff');
  await expect(savePush(SUB, 'zh', '/')).resolves.toEqual({ ok: true });
  expect(steps).toEqual([
    ['from', 'push_subscription'],
    [
      'upsert',
      {
        endpoint: ENDPOINT,
        user_id: 'u1',
        p256dh: P256DH,
        auth: AUTH,
        locale: 'zh',
        path: '/',
      },
      { onConflict: 'endpoint' },
    ],
  ]);
});

it('lets the admin turn it on too, for their own pop-ups', async () => {
  as('admin');
  await expect(savePush(SUB, 'en', '/tracker')).resolves.toEqual({ ok: true });
});

it('refuses anyone who has no tracker', async () => {
  for (const role of ['member', 'creator', 'none', 'staff_pending', null]) {
    as(role);
    fakeDb();
    await expect(savePush(SUB, 'en', '/')).resolves.toEqual({
      ok: false,
      message: 'Not authorized.',
    });
    await expect(dropPush(ENDPOINT)).resolves.toEqual({
      ok: false,
      message: 'Not authorized.',
    });
    expect(steps).toEqual([]);
  }
});

it('stores nothing a push service would not have given', async () => {
  as('staff');
  await expect(
    savePush({ ...SUB, endpoint: 'https://evil.com/x' }, 'en', '/'),
  ).resolves.toEqual({
    ok: false,
    message: 'That browser gave a subscription that cannot be used.',
  });
  expect(steps).toEqual([]);
});

it('says so when the save fails', async () => {
  as('staff');
  fakeDb({ message: 'down' });
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  await expect(savePush(SUB, 'en', '/')).resolves.toEqual({
    ok: false,
    message: 'Could not save. Try again.',
  });
  log.mockRestore();
});

it('turns off only this login’s device', async () => {
  as('staff');
  await expect(dropPush(ENDPOINT)).resolves.toEqual({ ok: true });
  expect(steps).toEqual([
    ['from', 'push_subscription'],
    ['delete'],
    ['eq', 'endpoint', ENDPOINT],
    ['eq', 'user_id', 'u1'],
  ]);
  fakeDb();
  await expect(dropPush(42)).resolves.toMatchObject({ ok: false });
  expect(steps).toEqual([]);
});
