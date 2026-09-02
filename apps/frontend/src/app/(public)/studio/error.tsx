'use client';

/**
 * Route-level error boundary for /studio/*. PRD 3 §6.8.
 *
 * Both controls go through the `children` slot: `action`/`secondary` render
 * `<Link href>` and cannot take the `reset` callback, and `children` renders
 * above them, so mixing the two slots would put Try again out of reading order.
 */

import Link from 'next/link';
import { useEffect, type ReactElement } from 'react';

import { Button } from '@gitroom/frontend/components/ui/button';
import {
  EmptyState,
  secondaryCta,
} from '@gitroom/frontend/components/ui/empty-state';
import { Container, Section } from '@gitroom/frontend/components/ui/section';

export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  // Never render error.message; the diagnostic still reaches the console.
  useEffect(() => console.error('[studio] route error', error), [error]);

  return (
    <Section space="md">
      <Container className="max-w-prose">
        {/* EmptyState's title is an <h3>, so without this the page has no
            <h1> at all and its heading order opens at level 3. Visually hidden
            because the card below already says it on screen. */}
        <h1 className="sr-only">Something went wrong</h1>
        <EmptyState
          size="lg"
          title="Something went wrong"
          description="We couldn't load this page. Nothing you saved is lost — try again, or go back to the analyzer."
        >
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" size="md" onClick={reset}>
              Try again
            </Button>
            <Link href="/studio/analyzer" className={secondaryCta}>
              Video Analyzer
            </Link>
          </div>
        </EmptyState>
      </Container>
    </Section>
  );
}
