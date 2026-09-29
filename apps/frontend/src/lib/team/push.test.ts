/**
 * The pop-up's news, pushed to the phones of whoever it is for — never about
 * their own act, never to someone who has left, never at the cost of the
 * save that caused it.
 */

import { getSupabaseAdmin } from '@d3/database';
import { sendNotification } from 'web-push';
import { after } from 'next/server';
import { notify, pushKey, sendPush } from './push';
import type { PushEvent } from './push-words';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('web-push', () => ({ sendNotification: jest.fn() }));
const mockQueued: Promise<unknown>[] = [];
jest.mock('next/server', () => ({
  after: jest.fn((task: () => Promise<unknown>) => {
    mockQueued.push(task());
  }),
}));

const P256DH =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const MEI_PHONE = 'https://fcm.googleapis.com/fcm/send/mei-phone';
const MEI_MAC = 'https://web.push.apple.com/mei-mac';

type Row = Record<string, unknown>;
const TABLES: Record<string, Row[]> = {
  tracker_member: [
    { id: 'kee', name: 'KEE', user_id: 'u-kee', archived_at: null },
    { id: 'mei', name: 'MEI', user_id: 'u-mei', archived_at: null },
    { id: 'gone', name: 'GONE', user_id: 'u-gone', archived_at: '2026-09-01' },
    { id: 'nologin', name: 'NL', user_id: null, archived_at: null },
  ],
  creator: [{ id: 'acc', display_name: '卖烧肉的Lydia' }],
  push_subscription: [
    {
      endpoint: MEI_PHONE,
      user_id: 'u-mei',
      p256dh: P256DH,
      auth: AUTH,
      locale: 'zh',
      path: '/',
    },
    {
      endpoint: MEI_MAC,
      user_id: 'u-mei',
      p256dh: P256DH,
      auth: AUTH,
      locale: 'en',
      path: '/',
    },
    {
      endpoint: 'https://fcm.googleapis.com/fcm/send/gone',
      user_id: 'u-gone',
      p256dh: P256DH,
      auth: AUTH,
      locale: 'en',
      path: '/',
    },
  ],
};

let asked: string[] = [];
let deleted: string[] = [];

/** A database that answers select/in/eq/delete from TABLES. */
function fakeDb(fail = false) {
  const from = (table: string) => {
    asked.push(table);
    let rows = [...(TABLES[table] ?? [])];
    let del = false;
    const q: Record<string, unknown> = {
      select: () => q,
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return q;
      },
      eq: (col: string, val: unknown) => {
        rows = rows.filter((r) => r[col] === val);
        return q;
      },
      delete: () => {
        del = true;
        return q;
      },
      then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => {
            if (fail) return { data: null, error: { message: 'down' } };
            if (del) deleted.push(...rows.map((r) => r.endpoint as string));
            return { data: del ? null : rows, error: null };
          })
          .then(ok, bad),
    };
    return q;
  };
  (getSupabaseAdmin as jest.Mock).mockReturnValue({ from });
}

const toMei: PushEvent = {
  kind: 'edit',
  to: 'mei',
  from: 'kee',
  titles: ['Reel 1'],
  creatorId: 'acc',
  ref: 'v1',
};

const sent = () =>
  (sendNotification as jest.Mock).mock.calls.map(([sub, payload, opts]) => ({
    endpoint: sub.endpoint,
    keys: sub.keys,
    ...JSON.parse(payload),
    opts,
  }));

beforeEach(() => {
  process.env.VAPID_PUBLIC_KEY = 'pub-key';
  process.env.VAPID_PRIVATE_KEY = 'priv-key';
  asked = [];
  deleted = [];
  mockQueued.length = 0;
  jest.clearAllMocks();
  (sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
  fakeDb();
});

it('sends each of the person’s devices the news, in that device’s language', async () => {
  await expect(sendPush([toMei], 'u-kee')).resolves.toBe(2);
  expect(sent()).toEqual([
    {
      endpoint: MEI_PHONE,
      keys: { p256dh: P256DH, auth: AUTH },
      title: '新的剪辑任务',
      body: 'Reel 1 · 来自 KEE · 卖烧肉的Lydia',
      tag: 'edit:v1',
      path: '/',
      opts: {
        TTL: 86_400,
        urgency: 'high',
        vapidDetails: {
          subject: 'https://www.d3creator.com',
          publicKey: 'pub-key',
          privateKey: 'priv-key',
        },
      },
    },
    expect.objectContaining({
      endpoint: MEI_MAC,
      title: 'New videos to edit',
      body: 'Reel 1 · From KEE · 卖烧肉的Lydia',
    }),
  ]);
});

it('never tells someone about their own act', async () => {
  await expect(sendPush([toMei], 'u-mei')).resolves.toBe(0);
  expect(sendNotification).not.toHaveBeenCalled();
  expect(asked).not.toContain('push_subscription');
});

it('tells nobody who has left the board or has no login', async () => {
  const shoot = {
    id: 's1',
    memberId: 'gone',
    date: '2026-09-30',
    time: '10:00',
    title: null,
    creatorId: null,
    videosShot: null,
    status: 'planned' as const,
    note: null,
    movedReason: null,
    createdBy: null,
    updatedBy: null,
  };
  await expect(
    sendPush(
      [
        { kind: 'due', to: 'gone', shoot },
        { kind: 'due', to: 'nologin', shoot },
      ],
      null,
    ),
  ).resolves.toBe(0);
  expect(sendNotification).not.toHaveBeenCalled();
});

it('drops a device its push service no longer knows, and keeps one that failed', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (sendNotification as jest.Mock)
    .mockRejectedValueOnce(
      Object.assign(new Error('gone'), { statusCode: 410 }),
    )
    .mockRejectedValueOnce(
      Object.assign(new Error('boom'), { statusCode: 500 }),
    );
  await expect(sendPush([toMei], 'u-kee')).resolves.toBe(0);
  expect(deleted).toEqual([MEI_PHONE]);
  expect(log).toHaveBeenCalledTimes(1);
  log.mockRestore();
});

it('never throws, whatever fails', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  fakeDb(true);
  await expect(sendPush([toMei], 'u-kee')).resolves.toBe(0);
  (getSupabaseAdmin as jest.Mock).mockImplementation(() => {
    throw new Error('no service key');
  });
  await expect(sendPush([toMei], 'u-kee')).resolves.toBe(0);
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});

it('does nothing without the keys', async () => {
  delete process.env.VAPID_PRIVATE_KEY;
  expect(pushKey()).toBeNull();
  await expect(sendPush([toMei], 'u-kee')).resolves.toBe(0);
  notify([toMei], 'u-kee');
  expect(after).not.toHaveBeenCalled();
  expect(asked).toEqual([]);
});

it('tells nobody what the pop-up would not show', async () => {
  const done = {
    id: 's1',
    memberId: 'mei',
    date: '2026-09-30',
    time: '10:00',
    title: null,
    creatorId: null,
    videosShot: 2,
    status: 'done' as const,
    note: null,
    movedReason: 'Wrong account',
    createdBy: null,
    updatedBy: null,
  };
  await expect(
    sendPush([{ kind: 'changed-shoot', to: 'mei', shoot: done }], 'u-kee'),
  ).resolves.toBe(0);
  expect(asked).toEqual([]);
});

it('never fails the save when there is no request to run after', () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (after as jest.Mock).mockImplementationOnce(() => {
    throw new Error('`after` was called outside a request scope');
  });
  expect(() => notify([toMei], 'u-kee')).not.toThrow();
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});

it('sends once the response is out', async () => {
  expect(pushKey()).toBe('pub-key');
  notify([toMei], 'u-kee');
  expect(after).toHaveBeenCalledTimes(1);
  await Promise.all(mockQueued);
  expect(sendNotification).toHaveBeenCalledTimes(2);
  notify([], 'u-kee');
  expect(after).toHaveBeenCalledTimes(1);
});
