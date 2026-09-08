/**
 * Loading state for /studio/analyzer and /studio/analyzer/[id].
 *
 * Both routes are `force-dynamic` and read Supabase before they can render
 * anything, so without this a navigation sits on the previous page with no
 * feedback for the length of `listJobs` / `getJob`. Structurally neutral on
 * purpose: one boundary covers the list and the report, so it draws a heading,
 * a large block and a stack of rows rather than either page's exact furniture.
 *
 * Flat blocks, no shimmer sweep — DESIGN.md §8 bans the loop.
 */

import type { ReactElement } from 'react';

import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { Skeleton } from '@gitroom/frontend/components/ui/skeleton';

export default function AnalyzerLoading(): ReactElement {
  return (
    <Section space="md">
      {/* The only thing announced: the blocks below are aria-hidden, so without
          this a screen reader is told nothing at all during the wait. */}
      <p role="status" className="sr-only">
        Loading.
      </p>
      <Container className="flex flex-col gap-10">
        <div className="flex max-w-prose flex-col gap-3">
          <Skeleton className="h-10 w-[280px] max-w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <Skeleton className="h-[240px] w-full rounded-2xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-[160px]" />
          <div className="flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center gap-4 bg-surface p-4">
                <Skeleton className="h-9 w-16 shrink-0" />
                <Skeleton className="h-4 w-full max-w-[240px]" />
              </div>
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
