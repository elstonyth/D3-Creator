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

type FakeSub = {
  endpoint: string;
  options?: { applicationServerKey: ArrayBuffer | null };
  toJSON: () => unknown;
  unsubscribe: jest.Mock;
};
let sub: FakeSub | null;
let pushManager: { getSubscription: jest.Mock; subscribe: jest.Mock };
let serviceWorker: {
  register: jest.Mock;
  getRegistration: jest.Mock;
  ready: Promise<unknown>;
};
// A worker exists once the device has turned push on (register()).
let registered: boolean;
let permission: NotificationPermission;
const requestPermission = jest.fn(async () => permission);

/** Our key's bytes (the browser keeps them on the subscription). */
function keyBuffer(b64url: string): ArrayBuffer {
  const raw = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + '=');
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
}

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
    serviceWorker = {
      register: jest.fn(async () => {
        registered = true;
        return reg;
      }),
      getRegistration: jest.fn(async () => (registered ? reg : undefined)),
      ready: Promise.resolve(reg),
    };
    Object.defineProperty(window.navigator, 'serviceWorker', {
      value: serviceWorker,
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
  registered = false;
  permission = 'default';
  browser();
});

it('installs no worker for someone who never turned push on', async () => {
  render(<PushToggle publicKey={KEY} />);
  await settle();
  expect(serviceWorker.register).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Turn on notifications' }),
  ).toBeTruthy();
});

it('moves a device subscribed with another key onto ours', async () => {
  permission = 'granted';
  registered = true;
  const old: FakeSub = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/old',
    options: { applicationServerKey: new Uint8Array(65).fill(7).buffer },
    toJSON: () => ({ endpoint: 'old' }),
    unsubscribe: jest.fn(async () => true),
  };
  sub = old;
  render(<PushToggle publicKey={KEY} />);
  await settle();
  // Every push service refuses the old one: forgotten, then replaced.
  expect(dropPush).toHaveBeenCalledWith(old.endpoint);
  expect(old.unsubscribe).toHaveBeenCalled();
  expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
  expect(savePush).toHaveBeenCalledWith(JSON_SUB, 'en', '/');
  expect(screen.getByText('Notifications on')).toBeTruthy();
});

it('keeps a device subscribed with our key as it is', async () => {
  permission = 'granted';
  registered = true;
  sub = {
    endpoint: JSON_SUB.endpoint,
    options: { applicationServerKey: keyBuffer(KEY) },
    toJSON: () => JSON_SUB,
    unsubscribe: jest.fn(async () => true),
  };
  render(<PushToggle publicKey={KEY} />);
  await settle();
  expect(pushManager.subscribe).not.toHaveBeenCalled();
  expect(dropPush).not.toHaveBeenCalled();
  expect(savePush).toHaveBeenCalledWith(JSON_SUB, 'en', '/');
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
  registered = true;
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
