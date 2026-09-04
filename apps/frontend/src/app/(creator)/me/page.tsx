import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import {
  getCreatorMetricsWindowed,
  getTopContentWindowed,
} from '@gitroom/frontend/lib/metrics-windowed';
import { parseWindowParam } from '@gitroom/frontend/lib/me-window';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import { Badge } from '@gitroom/frontend/components/ui/badge';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { ViewLeaderboard } from '@gitroom/frontend/components/leaderboard-showcase/view-leaderboard';
import { getCreatorPlatformBreakdown } from '@gitroom/frontend/lib/creator-platform-breakdown';
import { PlatformCards } from '@gitroom/frontend/components/insights/platform-cards';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';

import { WindowTabs } from './window-tabs';
import { CreatorStats, WINDOW_SCOPE } from './creator-stats';

const SUPPORTED_PLATFORMS: PlatformKey[] = [
  'facebook',
  'instagram',
  'tiktok',
  'douyin',
];

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'My dashboard — D3 Creator',
};

function NoAccountsState() {
  return (
    <EmptyState
      icon={
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 3v18h18" />
          <path d="M7 15l3-3 3 2 4-5" />
        </svg>
      }
      title="Your accounts are being set up"
      description="Your agency adds and manages the accounts we track. Followers, views and engagement appear here within a day of the first one going live."
      action={{ href: '/me/account', label: 'View your account' }}
    >
      <div className="mt-1 flex items-center gap-2.5">
        {SUPPORTED_PLATFORMS.map((p) => {
          const Icon = PLATFORM_ICONS[p];
          return (
            <span
              key={p}
              role="img"
              aria-label={PLATFORM_LABELS[p]}
              title={PLATFORM_LABELS[p]}
              className="flex size-9 items-center justify-center rounded-full border border-line bg-surface text-fg-muted"
            >
              <Icon size={16} />
            </span>
          );
        })}
      </div>
    </EmptyState>
  );
}

export default async function CreatorMePage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  // Admins manage from /admin.
  if (auth.role === 'admin') redirect('/admin');

  const creatorId = auth.creatorLink?.creator_id ?? null;
  const metricWindow = parseWindowParam(await searchParams);
  const scope = WINDOW_SCOPE[metricWindow];

  // Split in two so the header and the numbers it introduces share ONE
  // <Section>: a bare div between two Sections collapses to zero padding and
  // the next `divided` Section's hairline lands flush on the stat panel.
  let lede: ReactNode;
  let sections: ReactNode = null;
  if (!creatorId) {
    lede = <NoAccountsState />;
  } else {
    // Cookie-aware client (NOT service-role). The windowed RPCs read public-RLS
    // tables; creatorIds scopes the aggregation to this creator.
    const sb = await getSupabaseRoute();
    const [rows, topContent, platformCards] = await Promise.all([
      getCreatorMetricsWindowed(metricWindow, {
        client: sb,
        creatorIds: [creatorId],
      }),
      getTopContentWindowed(metricWindow, {
        client: sb,
        creatorIds: [creatorId],
        limit: 12,
      }),
      getCreatorPlatformBreakdown(metricWindow, { client: sb, creatorId }),
    ]);
    const row = rows[0];
    if (!row) {
      lede = <NoAccountsState />;
    } else {
      // The window switcher sits directly above the numbers it scopes — it is
      // the control for everything below it, not a filter chip.
      lede = (
        <div className="flex flex-col gap-6">
          <WindowTabs current={metricWindow} />
          <CreatorStats row={row} metricWindow={metricWindow} />
        </div>
      );
      sections = (
        <>
          <Section space="sm" divided>
            <ViewLeaderboard
              rows={topContent}
              title="Top content"
              subtitle={`Ranked by views · ${scope}`}
            />
          </Section>

          {platformCards.length > 0 ? (
            <Section space="sm" divided>
              <PlatformCards cards={platformCards} scope={scope} />
            </Section>
          ) : null}
        </>
      );
    }
  }

  return (
    <Container className="pb-16">
      <Section space="sm" className="flex flex-col gap-10 sm:gap-12">
        <header className="max-w-prose">
          <Badge tone="muted" className="mb-5 uppercase tracking-[0.08em]">
            Refreshed daily
          </Badge>
          <h1 className="text-display-2 text-fg">Your numbers.</h1>
          <p className="mt-4 text-body-lg text-fg-muted">
            Followers, views and engagement across every account your agency
            tracks for you — scraped straight from the platforms, unedited.
          </p>
          <p className="mt-2 break-words text-body-sm text-fg-subtle">
            Signed in as {auth.email}
          </p>
        </header>

        {lede}
      </Section>

      {sections}
    </Container>
  );
}
