/**
 * public/sw.js, run against a fake worker scope: a push is shown as sent
 * (lib/team/push.ts), and a tap brings the tracker up on this host only.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(join(__dirname, '../../../public/sw.js'), 'utf8');
const ORIGIN = 'https://staff.d3creator.com';

type Listener = (event: unknown) => void;
type Tab = {
  url: string;
  focus: jest.Mock;
  navigate?: jest.Mock;
};

function worker(tabs: Tab[] = []) {
  const on: Record<string, Listener> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => {
      on[type] = fn;
    },
    skipWaiting: jest.fn(),
    registration: { showNotification: jest.fn(async () => undefined) },
    clients: {
      claim: jest.fn(async () => undefined),
      matchAll: jest.fn(async () => tabs),
      openWindow: jest.fn(async () => null),
    },
  };
  new Function('self', SOURCE)(self);
  /** Fire an event and wait for what it asked the worker to wait for. */
  const fire = async (type: string, event: object) => {
    let waited: Promise<unknown> = Promise.resolve();
    on[type]({
      ...event,
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
    });
    await waited;
  };
  return { self, fire };
}

const push = (data: unknown) => ({
  data: {
    json: () => {
      if (data instanceof Error) throw data;
      return data;
    },
  },
});

const tap = (path: unknown) => ({
  notification: { close: jest.fn(), data: { path } },
});

it('shows a push as it was sent', async () => {
  const { self, fire } = worker();
  await fire(
    'push',
    push({
      title: '剪好了，等你审核',
      body: 'Reel 1 · MEI 剪辑',
      tag: 'verify:v1',
      path: '/tracker',
    }),
  );
  expect(self.registration.showNotification).toHaveBeenCalledWith(
    '剪好了，等你审核',
    {
      body: 'Reel 1 · MEI 剪辑',
      tag: 'verify:v1',
      renotify: true,
      icon: '/icon-192.png',
      data: { path: '/tracker' },
    },
  );
});

it('still says something for a push it cannot read', async () => {
  const { self, fire } = worker();
  await fire('push', push(new SyntaxError('not JSON')));
  expect(self.registration.showNotification).toHaveBeenCalledWith('D3', {
    body: '',
    tag: undefined,
    renotify: false,
    icon: '/icon-192.png',
    data: { path: '/' },
  });
});

it('brings an open tab of this host to the tracker', async () => {
  const tab = {
    url: `${ORIGIN}/history`,
    focus: jest.fn(async () => undefined),
    navigate: jest.fn(async () => null),
  };
  const { self, fire } = worker([tab]);
  await fire('notificationclick', tap('/tracker'));
  expect(tab.focus).toHaveBeenCalled();
  expect(tab.navigate).toHaveBeenCalledWith(`${ORIGIN}/tracker`);
  expect(self.clients.openWindow).not.toHaveBeenCalled();
});

it('keeps the tab where it is when it cannot be sent (not this worker’s)', async () => {
  const tab = {
    url: `${ORIGIN}/history`,
    focus: jest.fn(async () => undefined),
    navigate: jest.fn(async () => {
      throw new TypeError('not controlled');
    }),
  };
  const { fire } = worker([tab]);
  await expect(fire('notificationclick', tap('/'))).resolves.toBeUndefined();
  expect(tab.focus).toHaveBeenCalled();
});

it('opens the tracker when no tab is open, and never another host', async () => {
  for (const [path, opened] of [
    ['/', `${ORIGIN}/`],
    ['//evil.com/x', `${ORIGIN}/`],
    ['https://evil.com/', `${ORIGIN}/`],
    [undefined, `${ORIGIN}/`],
  ]) {
    const { self, fire } = worker();
    await fire('notificationclick', tap(path));
    expect(self.clients.openWindow).toHaveBeenCalledWith(opened);
  }
});
