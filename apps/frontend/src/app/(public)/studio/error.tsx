'use client';

/**
 * Route-level error boundary for /studio/*. PRD 3 §6.8.
 *
 * The reset control goes through the `children` slot, not the `secondary` prop:
 * `secondary` renders a `<Link href>` and cannot take a callback, and
 * `empty-state.tsx`'s `secondaryCta` string is module-private.
 */

import { useEffect, type ReactElement } from 'react';

import { Button } from '@gitroom/frontend/components/ui/button';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';

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
    <div className="max-w-[1100px] mx-auto py-12">
      <EmptyState
        size="lg"
        title="Something went wrong"
        description="We couldn't load this report. Try again in a moment."
      >
        <Button variant="outline" size="md" onClick={reset}>
          Try again
        </Button>
      </EmptyState>
    </div>
  );
}
