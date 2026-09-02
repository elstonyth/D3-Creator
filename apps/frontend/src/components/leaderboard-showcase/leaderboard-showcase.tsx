'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Button } from '../ui/button';
import { Stat, StatRow } from '../ui/stat';
import { TableWrap, Table, Th, Td, Tr, Rank } from '../ui/table';
import { EmptyState } from '../ui/empty-state';
import { Alert } from '../ui/alert';
import { PLATFORM_ICONS, PLATFORM_LABELS } from '../ui/platform-icons';
import { ImageWithFallback } from '../ui/image-with-fallback';
import {
  exactFormatter,
  formatShowcase,
  handleToSlug,
  demoCreatorRows,
  type PlatformFilter,
} from '../dashboard-showcase/showcase-data';
import { ShowcaseNumber } from '../dashboard-showcase/showcase-number';
import type { LiveCreatorRow } from '@gitroom/frontend/lib/queries';
import type { TopContentRow } from '@gitroom/frontend/lib/metrics-windowed';
import {
  VIEW_PERIODS,
  type ViewPeriod,
} from '@gitroom/frontend/lib/view-periods';
import { ViewLeaderboard } from './view-leaderboard';

interface TabDef {
  value: PlatformFilter;
  label: string;
}

const TABS: TabDef[] = [
  { value: 'all', label: 'All platforms' },
  { value: 'facebook', label: PLATFORM_LABELS.facebook },
  { value: 'instagram', label: PLATFORM_LABELS.instagram },
  { value: 'tiktok', label: PLATFORM_LABELS.tiktok },
  { value: 'douyin', label: PLATFORM_LABELS.douyin },
  // xiaohongshu (RedNote) archived — hidden from the platform filter.
];

/** Human-readable label for the active platform filter ("All platforms" or the platform name). */
function filterLabel(filter: PlatformFilter): string {
  return filter === 'all' ? 'All platforms' : PLATFORM_LABELS[filter];
}

/**
 * Short scope note for the active content window — "last 7 days", "all time".
 * Every content number on this page carries one, because the single biggest
 * confusion on this product is which window a metric covers.
 */
function windowNote(period: ViewPeriod): string {
  if (period === 'lifetime') return 'all time';
  return VIEW_PERIODS.find((p) => p.value === period)?.caption ?? '';
}

/** A creator resolved for the active platform filter (combined totals). */
interface LbRow {
  key: string;
  name: string;
  avatarUrl: string | null;
  slug: string | null;
  followers: number;
  totalViews: number;
  totalEngagement: number;
}

/** Resolve creators for the active filter into ranked rows with combined totals, sorted by views (desc). */
function resolveRows(
  creators: LiveCreatorRow[],
  filter: PlatformFilter,
): LbRow[] {
  const rows: LbRow[] =
    filter === 'all'
      ? creators.map((c) => ({
          key: c.creatorId,
          name: c.displayName,
          avatarUrl: c.avatarUrl,
          slug: c.primaryHandle ? handleToSlug(c.primaryHandle) : null,
          followers: c.followers,
          totalViews: c.totalViews,
          totalEngagement: c.totalEngagement,
        }))
      : creators.flatMap((c) => {
          const slot = c.platforms.find((p) => p.platform === filter);
          if (!slot) return [];
          return [
            {
              key: c.creatorId,
              name: c.displayName,
              avatarUrl: c.avatarUrl, // avatar is creator-level, not per-platform
              slug: slot.handle ? handleToSlug(slot.handle) : null,
              followers: slot.followers,
              totalViews: slot.totalViews,
              totalEngagement: slot.totalEngagement,
            },
          ];
        });
  // Top-views ranking.
  return rows.sort((a, b) => b.totalViews - a.totalViews);
}

/** Top content ranked by views and by interactions, per time window. */
export type TopContentByWindow = Record<
  ViewPeriod,
  { byViews: TopContentRow[]; byInteractions: TopContentRow[] }
>;

export interface LeaderboardShowcaseProps {
  liveCreators?: LiveCreatorRow[] | null;
  topContentByWindow?: TopContentByWindow | null;
}

/**
 * Public leaderboard showcase: summary stats, creators ranked by views, and
 * the top posts by views and by interactions. Falls back to synthetic demo
 * rows until live creator data exists.
 */
export function LeaderboardShowcase({
  liveCreators,
  topContentByWindow,
}: LeaderboardShowcaseProps = {}) {
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const [contentPeriod, setContentPeriod] = useState<ViewPeriod>('lifetime');
  // `null` means the creator query threw; `[]`/undefined means nothing is
  // tracked yet. Only the second may fall back to the synthetic preview —
  // publishing invented numbers because a read failed is the worst state this
  // page can be in.
  const creatorsFailed = liveCreators === null;
  const isLive = !!(liveCreators && liveCreators.length > 0);
  const baseCreators = useMemo(
    () => (isLive ? liveCreators! : demoCreatorRows()),
    [isLive, liveCreators],
  );

  const rows = useMemo(
    () => resolveRows(baseCreators, filter),
    [baseCreators, filter],
  );

  const stats = useMemo(() => {
    let followers = 0;
    let views = 0;
    let engagement = 0;
    for (const r of rows) {
      followers += r.followers;
      views += r.totalViews;
      engagement += r.totalEngagement;
    }
    return { creators: rows.length, followers, views, engagement };
  }, [rows]);

  const content = topContentByWindow?.[contentPeriod];
  const scope = filterLabel(filter);
  const note = windowNote(contentPeriod);
  const windowScope =
    contentPeriod === 'lifetime'
      ? 'Every post we track, on every platform'
      : `Posts published in the ${note}`;

  return (
    <div className="flex flex-col gap-12 sm:gap-16">
      {creatorsFailed ? (
        <Alert tone="info" title="Creator rankings are unavailable">
          The creator totals could not be read on this request. Nothing is
          wrong with the underlying numbers — reload to try again.
        </Alert>
      ) : (
        <>
          <div className="flex flex-col gap-6">
            <PlatformTabBar value={filter} onChange={setFilter} />

            <StatRow className="sm:grid-cols-3">
              <Stat
                label="Followers"
                value={formatShowcase(stats.followers)}
                meta={
                  <>
                    <span className="tnum">
                      {exactFormatter.format(stats.creators)}
                    </span>
                    {` creator${stats.creators === 1 ? '' : 's'} · ${scope}`}
                  </>
                }
              />
              <Stat
                label="Views"
                value={formatShowcase(stats.views)}
                meta="Total · every tracked post, all time"
              />
              <Stat
                label="Engagement"
                value={formatShowcase(stats.engagement)}
                meta="Likes, comments and shares · all time"
              />
            </StatRow>
          </div>

          {/* Ranking 1 — creators by total views */}
          <section
            aria-labelledby="lb-creators"
            className="flex flex-col gap-5"
          >
            <RankHeader
              id="lb-creators"
              title="Creators"
              scope={`${scope} · ranked by total views`}
            />
            {rows.length === 0 ? (
              <EmptyState
                size="sm"
                title={`Nothing tracked on ${scope} yet`}
                description="No creator on this platform has a snapshot in the database."
              >
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-10"
                  onClick={() => setFilter('all')}
                >
                  Show all platforms
                </Button>
              </EmptyState>
            ) : (
              <CreatorTable rows={rows} />
            )}
          </section>
        </>
      )}

      {/* Rankings 2 + 3 — content, both governed by one window filter */}
      <section aria-labelledby="lb-content" className="flex flex-col gap-5">
        <RankHeader
          id="lb-content"
          title="Content"
          scope={windowScope}
          action={
            <ContentPeriodBar
              value={contentPeriod}
              onChange={setContentPeriod}
            />
          }
        />

        {topContentByWindow == null ? (
          <Alert tone="info" title="Content rankings are unavailable">
            The post rankings could not be loaded on this request. Reload to
            try again.
          </Alert>
        ) : (
          <div className="flex flex-col gap-6">
            <ViewLeaderboard
              key={`views-${contentPeriod}`}
              rows={content?.byViews ?? []}
              title="Most views"
              subtitle={`By view count · ${note}`}
              metric="views"
              headingLevel={3}
            />
            <ViewLeaderboard
              key={`interactions-${contentPeriod}`}
              rows={content?.byInteractions ?? []}
              title="Most interactions"
              subtitle={`By likes, comments and shares · ${note}`}
              metric="interactions"
              headingLevel={3}
            />
          </div>
        )}
      </section>

      {!isLive && !creatorsFailed && (
        <p className="text-caption text-fg-subtle">
          Showcase preview · synthetic data. Live numbers replace this the
          moment the scraper switches on.
        </p>
      )}
    </div>
  );
}

// --- Section header -------------------------------------------------------

/** Ranking section heading: name on the left, scope caption under it, controls right. */
function RankHeader({
  id,
  title,
  scope,
  action,
}: {
  id: string;
  title: string;
  scope: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-line-subtle pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 id={id} className="text-subsection text-fg">
          {title}
        </h2>
        <p className="mt-1 text-body-sm text-fg-muted">{scope}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// --- Tab bar --------------------------------------------------------------

interface PlatformTabBarProps {
  value: PlatformFilter;
  onChange: (next: PlatformFilter) => void;
}

/** Platform filter tab bar (All + one tab per platform) for the leaderboard showcase. */
function PlatformTabBar({ value, onChange }: PlatformTabBarProps) {
  return (
    <div
      role="group"
      aria-label="Filter creators by platform"
      className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 py-1"
    >
      {TABS.map((tab) => {
        const isActive = tab.value === value;
        const Icon = tab.value === 'all' ? null : PLATFORM_ICONS[tab.value];
        return (
          <button
            key={tab.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(tab.value)}
            className={clsx(
              'inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border px-3.5 text-label',
              'transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:shadow-focus',
              isActive
                ? 'border-line-strong bg-surface text-fg'
                : 'border-transparent text-fg-muted hover:bg-white/[0.04] hover:text-fg',
            )}
          >
            {Icon ? <Icon size={14} aria-hidden /> : null}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// --- Content time-period bar ----------------------------------------------

/** Shared time filter for both content rankings. Window = posts PUBLISHED in it. */
function ContentPeriodBar({
  value,
  onChange,
}: {
  value: ViewPeriod;
  onChange: (next: ViewPeriod) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter posts by time window"
      className="-mx-1 flex flex-wrap items-center gap-1 px-1"
    >
      {VIEW_PERIODS.map((period) => {
        const isActive = period.value === value;
        return (
          <button
            key={period.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(period.value)}
            className={clsx(
              'inline-flex h-10 min-w-[44px] items-center justify-center whitespace-nowrap rounded-lg border px-3 text-caption',
              'transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:shadow-focus',
              isActive
                ? 'border-line-strong bg-surface text-fg'
                : 'border-transparent text-fg-muted hover:bg-white/[0.04] hover:text-fg',
            )}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Creator table --------------------------------------------------------

/**
 * Creators ranked by views. Followers is the secondary column and drops below
 * `sm` so the creator name is never truncated on a phone; the table scrolls
 * inside its own box rather than widening the page.
 */
function CreatorTable({ rows }: { rows: LbRow[] }) {
  return (
    <TableWrap>
      <Table>
        <caption className="sr-only">
          Creators ranked by total views across their tracked posts.
        </caption>
        <thead>
          <tr>
            <Th className="w-14 pr-0">Rank</Th>
            <Th>Creator</Th>
            <Th numeric>Views</Th>
            <Th numeric className="hidden sm:table-cell">
              Followers
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <CreatorRow key={row.key} row={row} rank={i + 1} />
          ))}
        </tbody>
      </Table>
    </TableWrap>
  );
}

/**
 * One ranked creator row. The top three read heavier by weight only — no hue.
 * Yellow marks exactly one thing on this page: the #1 rank.
 */
function CreatorRow({ row, rank }: { row: LbRow; rank: number }) {
  const isWinner = rank === 1;
  const isPodium = rank <= 3;
  const initial = row.name.trim().charAt(0).toUpperCase() || '?';

  const identity = (
    <>
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-subtle text-caption text-fg-muted">
        <ImageWithFallback
          src={row.avatarUrl}
          alt=""
          className="size-full object-cover"
          fallback={initial}
        />
      </span>
      <span
        className={clsx(
          'truncate text-body text-fg',
          isPodium ? 'font-medium' : 'font-normal',
        )}
      >
        {row.name}
      </span>
    </>
  );

  return (
    // The stretched link is anchored to the name cell, not the row: a `<tr>`
    // does not reliably establish a containing block and `TableWrap` is not
    // positioned, so an escaped `after:inset-0` would blanket the page.
    <Tr className={row.slug ? undefined : 'hover:bg-transparent'}>
      <Td className="pr-0">
        {isWinner ? (
          <span className="tnum inline-block w-6 text-caption font-semibold text-brand">
            01
          </span>
        ) : (
          <Rank n={rank} />
        )}
      </Td>
      <Td className="relative w-full max-w-0">
        {row.slug ? (
          <Link
            href={`/creators/${row.slug}`}
            className="-mx-1 flex min-w-0 items-center gap-3 rounded-lg px-1 py-1.5 decoration-line-strong underline-offset-4 after:absolute after:inset-0 hover:underline"
          >
            {identity}
          </Link>
        ) : (
          <span className="flex min-w-0 items-center gap-3 py-1.5">
            {identity}
          </span>
        )}
      </Td>
      <Td numeric className={isPodium ? 'font-medium' : undefined}>
        <ShowcaseNumber value={row.totalViews} exact />
      </Td>
      <Td numeric className="hidden text-fg-muted sm:table-cell">
        <ShowcaseNumber value={row.followers} />
      </Td>
    </Tr>
  );
}
