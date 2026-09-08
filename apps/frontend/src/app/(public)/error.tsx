'use client';

/**
 * Route-level error boundary for the public site. Without it a failed render
 * fell through to app/global-error.tsx, which paints Next's own unstyled error
 * page — the site's chrome disappears and it reads as a dead domain.
 *
 * Never renders error.message: it can carry a Postgres string. The diagnostic
 * still reaches the console (and Sentry, via global-error).
 */

import { useEffect } from 'react';
import { Button, ButtonLink } from '@gitroom/frontend/components/ui/button';
import { Container, Section } from '@gitroom/frontend/components/ui/section';

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => console.error('[public] route error', error), [error]);

  return (
    <Section space="lg">
      <Container>
        <div className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">
            Something went wrong
          </p>
          <h1 className="mt-4 text-display-2 text-fg">
            We couldn’t load those numbers
          </h1>
          <p className="mt-4 text-body-lg text-fg-muted">
            The page failed on our side, not yours. Nothing was lost — the
            figures are read fresh on every request, so trying again usually
            works.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={reset}>
              Try again
            </Button>
            <ButtonLink href="/" variant="secondary" size="lg">
              Back to home
            </ButtonLink>
          </div>
          {error.digest ? (
            <p className="mt-8 text-caption text-fg-subtle">
              Reference <span className="tnum">{error.digest}</span>
            </p>
          ) : null}
        </div>
      </Container>
    </Section>
  );
}
