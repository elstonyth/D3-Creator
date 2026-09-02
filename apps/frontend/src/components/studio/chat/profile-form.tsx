'use client';

/**
 * The inline profile form — PRD 3 §7.4.
 *
 * Shown when the caller has NO ACTIVE `user_profile` row — not "no row at all"
 * (PRD 2 §10 "More than one business"). It is a form, not a redirect: a
 * redirect on first visit loses people.
 *
 * It builds no request handler. `POST /api/studio/profile` is C6's and owns the
 * body, the validation, the rate limit and every status code.
 *
 * The controls are the shared `ui/input` primitives. Save stays SECONDARY: the
 * composer's Send is this screen's one yellow control.
 */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import {
  MAIN_PLATFORMS,
  ON_CAMERA,
  parseInlineProfile,
} from '@gitroom/frontend/lib/business-profile';

/** §6 "Every field"'s Label column, typed in by hand as §7.4 instructs. */
const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  reels: 'Instagram Reels',
  douyin: 'Douyin',
  rednote: 'RedNote',
  facebook: 'Facebook',
};
const ON_CAMERA_LABELS: Record<string, string> = {
  yes: 'Yes',
  no: 'No',
  sometimes: 'Sometimes',
};

const FAILURE = 'Could not save that. Try again.';

export function ProfileForm(): ReactElement {
  const router = useRouter();
  const [whatYouSell, setWhatYouSell] = useState('');
  const [whoBuysIt, setWhoBuysIt] = useState('');
  const [mainPlatform, setMainPlatform] = useState('');
  const [onCamera, setOnCamera] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setError('');

    // The one parser the route also runs, so the two cannot drift. It builds
    // the request body: we POST `value`, never the raw state.
    const parsed = parseInlineProfile({
      what_you_sell: whatYouSell,
      who_buys_it: whoBuysIt,
      main_platform: mainPlatform,
      on_camera: onCamera,
    });
    if (!parsed.ok) {
      setError(FAILURE); // no fetch, and no `Saving…`
      return;
    }

    setPending(true);
    try {
      const res = await fetch('/api/studio/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.value),
      });
      if (res.status === 201) {
        // `pending` is deliberately NOT cleared: the form unmounts when the
        // refreshed server read finds the row, and the double-click window is
        // what would write a second row.
        router.refresh();
        return;
      }
      // The client never branches on the status and never reads `error`.
      setError(FAILURE);
    } catch {
      setError(FAILURE);
    }
    setPending(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-line bg-surface p-5 sm:p-6 flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-heading text-fg">
          Tell the coach about your business.
        </h2>
        <p className="max-w-prose text-body-sm text-fg-muted">
          Four questions, and the scripts stop being generic. Everything else —
          tone, content pillars, what to avoid — is edited later in{' '}
          <Link
            href="/studio/settings"
            className="text-fg underline underline-offset-4"
          >
            Settings
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="What you sell" htmlFor="profile-what-you-sell">
          <Input
            id="profile-what-you-sell"
            required
            maxLength={200}
            disabled={pending}
            placeholder="e.g. second-hand phones"
            value={whatYouSell}
            onChange={(e) => setWhatYouSell(e.target.value)}
          />
        </Field>

        <Field label="Who buys it" htmlFor="profile-who-buys-it">
          <Input
            id="profile-who-buys-it"
            required
            maxLength={200}
            disabled={pending}
            placeholder="e.g. students and young workers"
            value={whoBuysIt}
            onChange={(e) => setWhoBuysIt(e.target.value)}
          />
        </Field>

        <Field label="Main platform" htmlFor="profile-main-platform">
          <Select
            id="profile-main-platform"
            required
            disabled={pending}
            value={mainPlatform}
            onChange={(e) => setMainPlatform(e.target.value)}
          >
            {/* A pre-selected first option is an answer the user never gave. */}
            <option value="" disabled>
              Choose one
            </option>
            {MAIN_PLATFORMS.map((slug) => (
              <option key={slug} value={slug}>
                {PLATFORM_LABELS[slug]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Do you appear on camera?"
          htmlFor="profile-on-camera"
          hint="A script never puts you on camera if you say no."
        >
          {/* Never defaults to Yes: that hands a talking-head script to
              someone who never appears on camera (§9's hard guardrail). */}
          <Select
            id="profile-on-camera"
            required
            disabled={pending}
            value={onCamera}
            onChange={(e) => setOnCamera(e.target.value)}
          >
            <option value="" disabled>
              Choose one
            </option>
            {ON_CAMERA.map((slug) => (
              <option key={slug} value={slug}>
                {ON_CAMERA_LABELS[slug]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {error !== '' && <Alert tone="danger">{error}</Alert>}

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="secondary"
          size="md"
          loading={pending}
          disabled={pending}
        >
          Save and continue
        </Button>
        <p className="text-caption text-fg-subtle">
          You can change any of this later.
        </p>
      </div>
    </form>
  );
}
