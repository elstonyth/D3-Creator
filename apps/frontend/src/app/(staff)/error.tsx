'use client';

/**
 * Route-level error boundary for the staff portal (staff.d3creator.com).
 *
 * The portal's loaders throw on any database error. Without this boundary a
 * failed read fell through to app/global-error.tsx, Next's bare unstyled page:
 * the header, the nav and the sign-out control all vanished. This renders
 * inside the portal's own layout, so they stay. Mirrors app/(creator)/error.tsx.
 * Errors thrown by the layout itself still reach global-error.
 *
 * Never renders the thrown error's own message: these pages read Supabase
 * directly, so it can carry a Postgres string. The diagnostic still reaches
 * the browser console, and Sentry: client errors are reported here, server
 * errors (which carry a digest) by onRequestError in instrumentation.ts.
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { Button, ButtonLink } from '@gitroom/frontend/components/ui/button';
import { Container, Section } from '@gitroom/frontend/components/ui/section';

export default function StaffError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    console.error('[staff] route error', error);
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <Container className="pb-16">
      <Section space="sm">
        <div className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">
            {t('Something went wrong')}
          </p>
          <h1 className="mt-4 text-display-2 text-fg">
            {t('This page didn’t load')}
          </h1>
          <p className="mt-4 text-body-lg text-fg-muted">
            {t(
              'It failed on our side, not yours. Nothing you saved was lost — try again, and if it keeps happening, reload the page.',
            )}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={retry}>
              {t('Try again')}
            </Button>
            <ButtonLink href="/" variant="secondary" size="lg">
              {t('Back to the start')}
            </ButtonLink>
          </div>
          {error.digest ? (
            <p className="mt-8 text-caption text-fg-subtle">
              {t('Reference')} <span className="tnum">{error.digest}</span>
            </p>
          ) : null}
        </div>
      </Section>
    </Container>
  );
}
