'use client';

/**
 * Route-level error boundary for the signed-in creator area (/me/*).
 *
 * Without it a failed render fell through to app/global-error.tsx, which
 * paints Next's own unstyled page — the header, the nav and the sign-out
 * control all vanish and it reads as a broken product rather than a bad
 * request. Mirrors app/(public)/error.tsx.
 *
 * Never renders error.message: these pages read Supabase directly, so a thrown
 * error can carry a Postgres string. The diagnostic still reaches the console
 * (and Sentry, via global-error). The second action goes to /me/account rather
 * than /me, because /me is usually the page that just failed.
 */

import { useEffect } from 'react';
import { Button, ButtonLink } from '@gitroom/frontend/components/ui/button';
import { Container, Section } from '@gitroom/frontend/components/ui/section';

export default function CreatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => console.error('[creator] route error', error), [error]);

  return (
    <Container className="pb-16">
      <Section space="sm">
        <div className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">
            Something went wrong
          </p>
          <h1 className="mt-4 text-display-2 text-fg">
            We couldn’t load your numbers
          </h1>
          <p className="mt-4 text-body-lg text-fg-muted">
            This failed on our side, not yours. Nothing you track was lost —
            your figures are read fresh on every request, so trying again
            usually works.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={reset}>
              Try again
            </Button>
            <ButtonLink href="/me/account" variant="secondary" size="lg">
              Go to your account
            </ButtonLink>
          </div>
          {error.digest ? (
            <p className="mt-8 text-caption text-fg-subtle">
              Reference <span className="tnum">{error.digest}</span>
            </p>
          ) : null}
        </div>
      </Section>
    </Container>
  );
}
