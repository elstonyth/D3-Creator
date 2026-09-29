'use client';

/**
 * Push notifications for this device, on or off: the pop-up's news reaches
 * the phone with the portal closed (lib/team/push.ts sends it, public/sw.js
 * shows it). The browser's say-so is asked for inside the tap — an iPhone
 * allows the question nowhere else — and an iPhone gives push only to a site
 * added to the Home Screen, so there it says how. Where push cannot work, or
 * while it is off on the server (no key), it shows nothing.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell } from 'lucide-react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { Button } from '@gitroom/frontend/components/ui/button';
import { dropPush, savePush } from '@gitroom/frontend/lib/team/push-actions';

type Support = 'push' | 'ios' | 'none';
type Status = 'checking' | 'off' | 'on' | 'blocked';

const SW = '/sw.js';

const never = () => () => undefined;

function support(): Support {
  if (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
    return 'push';
  // An iPad says it is a Mac, but a Mac has no touch screen.
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'none';
}

/** Our public key as the browser takes it: bytes, not base64url. */
function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const { t, locale } = useI18n();
  const env = useSyncExternalStore(never, support, (): Support => 'none');
  const [status, setStatus] = useState<Status>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey || env !== 'push') return;
    let live = true;
    (async () => {
      const reg = await navigator.serviceWorker.register(SW);
      const sub = await reg.pushManager.getSubscription();
      if (!live) return;
      if (Notification.permission === 'denied') return setStatus('blocked');
      if (!sub || Notification.permission !== 'granted')
        return setStatus('off');
      setStatus('on');
      // Filed again on every visit: a shared device follows whoever is
      // signed in on it now, in the language they use.
      await savePush(sub.toJSON(), locale, window.location.pathname);
    })().catch(() => {
      if (live) setStatus('off');
    });
    return () => {
      live = false;
    };
  }, [publicKey, env, locale]);

  if (!publicKey || env === 'none' || status === 'checking') {
    if (publicKey && env === 'ios')
      return (
        <p className="max-w-xs text-caption text-fg-subtle">
          {t(
            'On iPhone: tap Share, then Add to Home Screen. Open D3 from your Home Screen to turn on notifications.',
          )}
        </p>
      );
    return null;
  }

  async function turnOn(key: string) {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      await navigator.serviceWorker.register(SW);
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(key),
        }));
      const r = await savePush(sub.toJSON(), locale, window.location.pathname);
      if (!r.ok) {
        setError(t(r.message ?? 'Could not save. Try again.'));
        return;
      }
      setStatus('on');
    } catch {
      setError(t('Could not turn notifications on. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await dropPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus('off');
    } catch {
      setError(t('Could not save. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 md:justify-end">
      {status === 'blocked' ? (
        <p className="max-w-xs text-caption text-fg-subtle">
          {t(
            'Notifications are blocked. Allow them for this site in your browser settings.',
          )}
        </p>
      ) : status === 'on' ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-caption text-fg-muted">
            <Bell size={14} aria-hidden />
            {t('Notifications on')}
          </span>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            onClick={() => void turnOff()}
          >
            {t('Turn off')}
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() => void turnOn(publicKey)}
        >
          <Bell size={14} aria-hidden />
          {t('Turn on notifications')}
        </Button>
      )}
      {error ? (
        <p role="alert" className="w-full text-caption text-brand-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
