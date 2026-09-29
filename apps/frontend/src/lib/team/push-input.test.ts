/**
 * The server later POSTs to whatever endpoint is stored, so only a real push
 * service's https address gets in — never one a browser made up.
 */

import { parsePushSubscription } from './push-input';

const P256DH =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';

const sub = (endpoint: string, keys = { p256dh: P256DH, auth: AUTH }) => ({
  endpoint,
  expirationTime: null,
  keys,
});

const FCM = 'https://fcm.googleapis.com/fcm/send/dXk9abc:APA91bHq-x_1';

it('keeps a subscription from each real push service', () => {
  for (const endpoint of [
    FCM,
    'https://web.push.apple.com/QGuQyavXutnMdAuwIBFcDD',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk',
    'https://wns2-sg2p.notify.windows.com/w/?token=BQYAAAB',
  ]) {
    const r = parsePushSubscription(sub(endpoint), 'zh', '/');
    expect(r).toEqual({
      ok: true,
      value: { endpoint, p256dh: P256DH, auth: AUTH, locale: 'zh', path: '/' },
    });
  }
});

it('refuses an endpoint that is not a push service over https', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/fcm/send/x',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evil.com/fcm.googleapis.com',
    'https://fcm.googleapis.com@evil.com/x',
    'https://fcm.googleapis.com:8443/x',
    'https://push.apple.com.evil.com/x',
    'not a url',
  ])
    expect(parsePushSubscription(sub(endpoint), 'en', '/').ok).toBe(false);
});

it('refuses keys that are not the browser’s', () => {
  const bad = [
    { p256dh: 'short', auth: AUTH },
    { p256dh: `${P256DH.slice(0, 80)}!!!!!!!`, auth: AUTH },
    { p256dh: P256DH, auth: 'x' },
    { p256dh: P256DH, auth: 12 as unknown as string },
  ];
  for (const keys of bad)
    expect(parsePushSubscription(sub(FCM, keys), 'en', '/').ok).toBe(false);
  expect(parsePushSubscription(null, 'en', '/').ok).toBe(false);
  expect(parsePushSubscription({ endpoint: FCM }, 'en', '/').ok).toBe(false);
});

it('keeps only our languages and a path on this host', () => {
  expect(parsePushSubscription(sub(FCM), 'fr', '/').ok).toBe(false);
  for (const path of ['/tracker', '/staff', '/admin/tracker'])
    expect(parsePushSubscription(sub(FCM), 'en', path).ok).toBe(true);
  for (const path of [
    '//evil.com',
    '//evil',
    'https://evil.com',
    'tracker',
    '/a?b',
    '',
  ])
    expect(parsePushSubscription(sub(FCM), 'en', path).ok).toBe(false);
});
