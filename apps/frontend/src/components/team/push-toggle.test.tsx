/** @jest-environment jsdom */
/**
 * Turning notifications on for this device: asked for inside the tap,
 * subscribed with our key, filed on the server; off again the same way.
 * Where push cannot work it shows nothing — or, on an iPhone, how to get it.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';

import { dropPush, savePush } from '@gitroom/frontend/lib/team/push-actions';
import { PushToggle } from './push-toggle';

jest.mock('@gitroom/frontend/lib/team/push-actions', () => ({
  savePush: jest.fn(async () => ({ ok: true })),
  dropPush: jest.fn(async () => ({ ok: true })),
}));

// A real P-256 key, base64url, as `web-push generate-vapid-keys` prints one.
const KEY =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const JSON_SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'p', auth: 'a' },
};

let sub: {
  endpoint: string;
  toJSON: () => unknown;
  unsubscribe: jest.Mock;
} | null;
let pushManager: { getSubscription: jest.Mock; subscribe: jest.Mock };
let permission: NotificationPermission;
const requestPermission = jest.fn(async () => permission);

function browser({ push = true, ua = 'Mozilla/5.0 (Windows NT 10.0)' } = {}) {
  const made = {
    endpoint: JSON_SUB.endpoint,
    toJSON: () => JSON_SUB,
    unsubscribe: jest.fn(async () => true),
  };
  pushManager = {
    getSubscription: jest.fn(async () => sub),
    subscribe: jest.fn(async () => {
      sub = made;
      return made;
    }),
  };
  const reg = { pushManager };
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
  if (push) {
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: {
        register: jest.fn(async () => reg),
        ready: Promise.resolve(reg),
      },
      configurable: true,
    });
    Object.assign(window, {
      PushManager: function PushManager() {},
      Notification: {
        get permission() {
          return permission;
        },
        requestPermission,
      },
    });
  } else {
    delete (window.navigator as { serviceWorker?: unknown }).serviceWorker;
    delete (window as { PushManager?: unknown }).PushManager;
    delete (window as { Notification?: unknown }).Notification;
  }
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  sub = null;
  permission = 'default';
  browser();
});

it('shows nothing while push is off on the server', async () => {
  const { container } = render(<PushToggle publicKey={null} />);
  await settle();
  expect(container.innerHTML).toBe('');
});

it('shows nothing where the browser cannot push', async () => {
  browser({ push: false });
  const { container } = render(<PushToggle publicKey={KEY} />);
  await settle();
  expect(container.innerHTML).toBe('');
});

it('tells an iPhone to add the site to the Home Screen first', async () => {
  browser({
    push: false,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
  });
  render(<PushToggle publicKey={KEY} />);
  await settle();
  expect(screen.getByText(/Add to Home Screen/)).toBeTruthy();
});

it('says where to allow them once they are blocked', async () => {
  permission = 'denied';
  render(<PushToggle publicKey={KEY} />);
  await settle();
  expect(screen.getByText(/Notifications are blocked/)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});

it('asks, subscribes with our key, and files the device', async () => {
  render(<PushToggle publicKey={KEY} />);
  await settle();
  permission = 'granted';
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Turn on notifications' }),
    );
  });
  await settle();
  expect(requestPermission).toHaveBeenCalledTimes(1);
  const [{ userVisibleOnly, applicationServerKey }] =
    pushManager.subscribe.mock.calls[0];
  expect(userVisibleOnly).toBe(true);
  // The key as bytes: 65 of them, uncompressed P-256.
  expect(applicationServerKey).toBeInstanceOf(Uint8Array);
  expect(applicationServerKey).toHaveLength(65);
  expect(savePush).toHaveBeenCalledWith(JSON_SUB, 'en', '/');
  expect(screen.getByText('Notifications on')).toBeTruthy();
});

it('stays off when the browser is not allowed to ask', async () => {
  render(<PushToggle publicKey={KEY} />);
  await settle();
  permission = 'denied';
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Turn on notifications' }),
    );
  });
  await settle();
  expect(pushManager.subscribe).not.toHaveBeenCalled();
  expect(savePush).not.toHaveBeenCalled();
  expect(screen.getByText(/Notifications are blocked/)).toBeTruthy();
});

it('files an already-on device again, then turns it off', async () => {
  permission = 'granted';
  sub = {
    endpoint: JSON_SUB.endpoint,
    toJSON: () => JSON_SUB,
    unsubscribe: jest.fn(async () => true),
  };
  const was = sub;
  render(<PushToggle publicKey={KEY} />);
  await settle();
  expect(screen.getByText('Notifications on')).toBeTruthy();
  // Whoever is signed in now gets this device's pushes.
  expect(savePush).toHaveBeenCalledWith(JSON_SUB, 'en', '/');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
  });
  await settle();
  expect(dropPush).toHaveBeenCalledWith(JSON_SUB.endpoint);
  expect(was.unsubscribe).toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Turn on notifications' }),
  ).toBeTruthy();
});
