'use client';

/**
 * The inline profile form — PRD 3 §7.4, which owns this file's layout, classes,
 * placeholders and copy verbatim.
 *
 * Shown when the caller has NO ACTIVE `user_profile` row — not "no row at all"
 * (PRD 2 §10 "More than one business"). It is a form, not a redirect: a
 * redirect on first visit loses people.
 *
 * It builds no request handler. `POST /api/studio/profile` is C6's and owns the
 * body, the validation, the rate limit and every status code.
 */

import { ChevronDownIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, type FormEvent, type ReactElement } from 'react';

import { Button } from '@gitroom/frontend/components/ui/button';
import {
  MAIN_PLATFORMS,
  ON_CAMERA,
  parseInlineProfile,
} from '@gitroom/frontend/lib/business-profile';

/**
 * Written inline with NO focus classes — `global.scss:174` supplies the ring.
 * `components/ui/input.tsx` is deliberately unused: it ships
 * `focus-visible:outline-none focus-visible:shadow-focus` (the double-ring
 * bug, §0.4) and its `cn()` mixes `text-body` with `text-fg`, which `twMerge`
 * collapses to `text-fg` and drops the 15px size (§0.5 trap 1).
 */
const fieldBox =
  'h-10 w-full rounded-md bg-surface-subtle border border-line px-3 ' +
  'text-body text-fg placeholder:text-fg-subtle ' +
  'transition-colors duration-150 ease-out ' +
  'disabled:opacity-50 disabled:pointer-events-none';
const selectBox = `${fieldBox} appearance-none pr-9`;

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

/** `pointer-events-none` is required — without it the glyph swallows the click
 *  most users aim at the select (the repo pairs them at sign-up-form.tsx:56). */
function Chevron(): ReactElement {
  return (
    <ChevronDownIcon
      aria-hidden
      className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-fg-muted pointer-events-none"
    />
  );
}

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
      className="bg-surface border border-line rounded-2xl p-6"
    >
      <h2 className="text-heading text-fg">
        Tell the coach about your business.
      </h2>
      <p className="mt-2 mb-4 text-body-sm text-fg-muted">
        Four questions, and the scripts stop being generic. Everything else is
        edited later in{' '}
        <Link href="/studio/settings" className="text-fg underline">
          Settings
        </Link>
        .
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block space-y-1.5">
          <span className="text-label text-fg-muted">What you sell</span>
          <input
            type="text"
            required
            maxLength={200}
            disabled={pending}
            placeholder="e.g. second-hand phones"
            value={whatYouSell}
            onChange={(e) => setWhatYouSell(e.target.value)}
            className={fieldBox}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-label text-fg-muted">Who buys it</span>
          <input
            type="text"
            required
            maxLength={200}
            disabled={pending}
            placeholder="e.g. students and young workers"
            value={whoBuysIt}
            onChange={(e) => setWhoBuysIt(e.target.value)}
            className={fieldBox}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-label text-fg-muted">Main platform</span>
          <div className="relative">
            <select
              required
              disabled={pending}
              value={mainPlatform}
              onChange={(e) => setMainPlatform(e.target.value)}
              className={selectBox}
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
            </select>
            <Chevron />
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-label text-fg-muted">
            Do you appear on camera?
          </span>
          <div className="relative">
            {/* Never defaults to Yes: that hands a talking-head script to
                someone who never appears on camera (§9's hard guardrail). */}
            <select
              required
              disabled={pending}
              value={onCamera}
              onChange={(e) => setOnCamera(e.target.value)}
              className={selectBox}
            >
              <option value="" disabled>
                Choose one
              </option>
              {ON_CAMERA.map((slug) => (
                <option key={slug} value={slug}>
                  {ON_CAMERA_LABELS[slug]}
                </option>
              ))}
            </select>
            <Chevron />
          </div>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" variant="secondary" size="md" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <p role="alert" className="text-body-sm text-fg-muted">
          {error}
        </p>
      </div>
    </form>
  );
}
