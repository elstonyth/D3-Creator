/**
 * Loading state for the staff portal (staff.d3creator.com).
 *
 * Every portal page is `force-dynamic` and reads Supabase before it can
 * render anything, so without this the wait shows nothing at all. Structurally
 * neutral on purpose: one boundary covers every page, so it draws a heading
 * and a stack of rows rather than any one page's furniture.
 *
 * It sits in staff/, not beside the (staff) layout, on purpose: the Suspense
 * boundary a loading.tsx creates is keyed by the child segment below it. At
 * the route-group level that child is always `staff`, the same on every page,
 * so a tap between pages would keep the old page on screen. Here the child
 * changes with the page (`__PAGE__`, `schedule`, `history`, …), so the
 * skeleton shows on every tap.
 *
 * Flat blocks, no shimmer sweep — DESIGN.md §8 bans the loop.
 */

import type { ReactElement } from 'react';

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { Skeleton } from '@gitroom/frontend/components/ui/skeleton';

export default async function StaffLoading(): Promise<ReactElement> {
  const { t } = await getI18n();
  return (
    <Section space="md">
      {/* The only thing announced: the blocks below are aria-hidden. */}
      <p role="status" className="sr-only">
        {t('Loading.')}
      </p>
      <Container className="flex flex-col gap-10">
        <div className="flex max-w-prose flex-col gap-3">
          <Skeleton className="h-10 w-[280px] max-w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <div className="flex flex-col gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="flex items-center gap-4 bg-surface p-4">
              <Skeleton className="h-9 w-16 shrink-0" />
              <Skeleton className="h-4 w-full max-w-[240px]" />
            </div>
          ))}
        </div>
      </Container>
    </Section>
  );
}
