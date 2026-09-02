'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@gitroom/frontend/lib/utils';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { Stat, StatRow } from '../ui/stat';
import { Table, TableWrap, Td, Th, Tr, Rank } from '../ui/table';
import { ImageWithFallback } from '../ui/image-with-fallback';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '../ui/platform-icons';
import {
  formatShowcase,
  handleToSlug,
  demoCreatorRows,
  type PlatformFilter,
} from './showcase-data';
import {
  VIEW_PERIODS,
  type ViewPeriod,
} from '@gitroom/frontend/lib/view-periods';
import { ShowcaseNumber } from './showcase-number';
import type { LiveCreatorRow } from '@gitroom/frontend/lib/queries';

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

/** Sort key for the Top Creators list (re-rank by views or by followers). */
type CreatorSort = 'views' | 'followers';

const BREAKDOWN_PLATFORMS: PlatformKey[] = [
  'facebook',
  'instagram',
  'tiktok',
  'douyin',
];
// Dashboard is a summary — show the top slice; the leaderboard has the full list.
const TOP_CREATORS_LIMIT = 10;

/** Human-readable label for the active platform filter ("All platforms" or the platform name). */
function filterLabel(filter: PlatformFilter): string {
  return filter === 'all' ? 'All platforms' : PLATFORM_LABELS[filter];
}

// Windowed-views cell resolution contract (DashboardViewTotals in
// lib/metrics-windowed.ts): the RPC emits no row for a key/window with no
// posts — with live windowed data a missing CELL means 0. The cumulative
// fallback applies ONLY when no windowed data was loaded at all (demo mode, or
// the RPC errored and returned empty maps). Falling back per-cell would render
// lifetime views under a "last 24 hours" caption. NOTE: the resolution is
// inlined at each use site (`live ? cell ?? 0 : cumulative`) rather than
// extracted into a helper — passing prop-derived values to a function makes
// the React Compiler assume the props graph may be mutated, bailing it out of
// the whole component (react-hooks/preserve-manual-memoization). Covered by
// dashboard-showcase.test.tsx instead.

interface DisplayRow {
  key: string;
  name: string;
  avatarUrl: string | null;
  slug: string | null;
  followers: number;
  totalViews: number;
}

/** Resolve creators for the active filter; per-platform slot when filtered. */
function resolveRows(
  creators: LiveCreatorRow[],
  filter: PlatformFilter,
): DisplayRow[] {
  if (filter === 'all') {
    return creators.map((c) => ({
      key: c.creatorId,
      name: c.displayName,
      avatarUrl: c.avatarUrl,
      slug: c.primaryHandle ? handleToSlug(c.primaryHandle) : null,
      followers: c.followers,
      totalViews: c.totalViews,
    }));
  }
  return creators.flatMap((c) => {
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
      },
    ];
  });
}

export interface DashboardShowcaseProps {
  creators?: LiveCreatorRow[] | null;
  /**
   * Σ total views of posts PUBLISHED in each window, per platform-key →
   * window-key, from getDashboardViewTotalsWindowed. OPTIONAL — when omitted or
   * empty (demo mode / RPC error) the hero falls back to the cumulative
   * lifetime total. When populated, a missing cell means "no posts in that
   * window" and renders as 0 — never the cumulative fallback, which would
   * mislabel lifetime views as a short period.
   */
  viewsByWindow?: Record<string, Record<string, number>>;
  /**
   * Per-creator windowed views: creatorId → platform-key | 'all' → window-key →
   * Σ views of that creator's posts published in the window. Drives the Top
   * Creators ranking per period. OPTIONAL — absent/empty ⇒ ranking falls back
   * to lifetime totals; when populated, a creator/window with no posts ranks
   * with 0, never with its lifetime total.
   */
  creatorViewsByWindow?: Record<string, Record<string, Record<string, number>>>;
}

/**
 * Public dashboard showcase: platform filter, headline totals for the selected
 * window, top-creators table and per-platform breakdown. Falls back to
 * synthetic demo rows until live creator data exists.
 *
 * Every figure here is measured. There is deliberately no trend chip and no
 * sparkline: the backend does not aggregate snapshot history yet, and the
 * previous build filled that gap with invented growth percentages next to real
 * counts — on a page whose whole claim is that the numbers are not invented.
 */
export function DashboardShowcase({
  creators,
  viewsByWindow,
  creatorViewsByWindow,
}: DashboardShowcaseProps = {}) {
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const [activeViewFilter, setActiveViewFilter] =
    useState<ViewPeriod>('lifetime');
  const [creatorSort, setCreatorSort] = useState<CreatorSort>('views');
  const isLive = !!(creators && creators.length > 0);
  const baseCreators = useMemo(
    () => (isLive ? creators! : demoCreatorRows()),
    [isLive, creators],
  );

  const rows = useMemo(
    () => resolveRows(baseCreators, filter),
    [baseCreators, filter],
  );
  const totalFollowers = useMemo(
    () => rows.reduce((s, r) => s + r.followers, 0),
    [rows],
  );
  const totalViews = useMemo(
    () => rows.reduce((s, r) => s + r.totalViews, 0),
    [rows],
  );
  const totalEngagement = useMemo(
    () =>
      filter === 'all'
        ? baseCreators.reduce((s, c) => s + c.totalEngagement, 0)
        : baseCreators.reduce(
            (s, c) =>
              s +
              (c.platforms.find((p) => p.platform === filter)
                ?.totalEngagement ?? 0),
            0,
          ),
    [baseCreators, filter],
  );

  // Windowed view matrices: live (populated) vs absent/empty (demo mode or RPC
  // error). When live, a MISSING cell means "no posts in that window" → 0; the
  // cumulative fallback applies only when the whole matrix is absent. Inlined
  // (not isWindowedLive()) so the React Compiler doesn't have to assume the
  // call mutates the prop, which would bail it out of the whole component.
  const winLive = !!viewsByWindow && Object.keys(viewsByWindow).length > 0;
  const creatorWinLive =
    !!creatorViewsByWindow && Object.keys(creatorViewsByWindow).length > 0;

  // Top creators by views for the active period (dashboard summary — capped).
  // Each row's views are overridden with its windowed value (per creator, for
  // the active platform filter) and re-ranked, so the list tracks the period
  // pill. A creator with no posts in the window ranks with 0 — falling back to
  // lifetime would let them outrank real in-window activity. Followers are
  // left untouched (current count, no period analog).
  const topCreators = useMemo(
    () =>
      rows
        .map((r) => ({
          ...r,
          totalViews: creatorWinLive
            ? (creatorViewsByWindow?.[r.key]?.[filter]?.[activeViewFilter] ?? 0)
            : r.totalViews,
        }))
        .sort((a, b) =>
          creatorSort === 'followers'
            ? b.followers - a.followers
            : b.totalViews - a.totalViews,
        )
        .slice(0, TOP_CREATORS_LIMIT),
    [
      rows,
      creatorWinLive,
      creatorViewsByWindow,
      filter,
      activeViewFilter,
      creatorSort,
    ],
  );

  const breakdown = useMemo(() => {
    const map = new Map<
      PlatformKey,
      { followers: number; totalViews: number }
    >();
    for (const c of baseCreators) {
      for (const slot of c.platforms) {
        const b = map.get(slot.platform) ?? { followers: 0, totalViews: 0 };
        b.followers += slot.followers;
        b.totalViews += slot.totalViews;
        map.set(slot.platform, b);
      }
    }
    return BREAKDOWN_PLATFORMS.map((platform) => ({
      platform,
      followers: map.get(platform)?.followers ?? 0,
      totalViews: map.get(platform)?.totalViews ?? 0,
    }));
  }, [baseCreators]);

  const activeViewCaption =
    VIEW_PERIODS.find((p) => p.value === activeViewFilter)?.caption ??
    'all-time, across tracked posts';

  // Real Σ views for the active platform + period. Cumulative fallback ONLY
  // when no windowed data was loaded (demo mode / RPC error); with live data a
  // missing cell is a real 0 ("nothing posted in this window") — the old `??
  // cumulative` here rendered lifetime views under a "last 24 hours" caption.
  // `lifetime` from the matrix equals the cumulative total, so they reconcile.
  const heroViews = winLive
    ? (viewsByWindow?.[filter]?.[activeViewFilter] ?? 0)
    : totalViews;

  // Per-platform views for the active period (followers stay current — a
  // follower count has no post-publish-date analog). Falls back to lifetime
  // per-platform views only when no windowed data is supplied; a platform with
  // no posts in the window shows 0.
  const breakdownWindowed = useMemo(
    () =>
      breakdown.map((b) => ({
        ...b,
        totalViews: winLive
          ? (viewsByWindow?.[b.platform]?.[activeViewFilter] ?? 0)
          : b.totalViews,
      })),
    [breakdown, winLive, viewsByWindow, activeViewFilter],
  );

  return (
    <div className="flex flex-col gap-10">
      <PlatformTabBar value={filter} onChange={setFilter} />

      {/* Headline totals. Every number states its scope on the line below it —
          which platform, and over what window. */}
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-6 border-b border-line-subtle pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-micro uppercase text-fg-subtle">Total views</p>
            <p className="tnum mt-3 text-metric-lg text-fg">
              {formatShowcase(heroViews)}
            </p>
            <p className="mt-2 text-caption text-fg-subtle">
              {`${filterLabel(filter)} · ${activeViewCaption}`}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Total views time period"
            className="flex flex-wrap items-center gap-1"
          >
            {VIEW_PERIODS.map((period) => {
              const isActive = period.value === activeViewFilter;
              return (
                <button
                  key={period.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveViewFilter(period.value)}
                  className={cn(
                    'h-10 min-w-10 rounded-lg border px-3 text-caption whitespace-nowrap',
                    'transition-colors duration-150 ease-out',
                    isActive
                      ? 'border-line-strong bg-surface-subtle text-fg'
                      : 'border-transparent text-fg-muted hover:bg-white/[0.04] hover:text-fg',
                  )}
                >
                  {period.label}
                </button>
              );
            })}
          </div>
        </div>

        <StatRow>
          <Stat
            label="Total followers"
            value={formatShowcase(totalFollowers)}
            meta={`${filterLabel(filter)} · latest scraped count`}
          />
          <Stat
            label="Total engagement"
            value={formatShowcase(totalEngagement)}
            meta={`${filterLabel(filter)} · likes, comments and shares · all tracked posts`}
          />
          <Stat
            label="Creators"
            value={rows.length}
            meta={`${filterLabel(filter)} · with a tracked profile`}
          />
        </StatRow>
      </div>

      {/* Content row — top creators + platform breakdown */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <TopCreatorsTable
          rows={topCreators}
          filter={filter}
          totalRows={rows.length}
          scope={activeViewCaption}
          sort={creatorSort}
          onSortChange={setCreatorSort}
          onClearFilter={setFilter}
        />
        <PlatformBreakdownCard
          activeFilter={filter}
          onSelect={setFilter}
          rows={breakdownWindowed}
          scope={activeViewCaption}
        />
      </div>

      {!isLive && (
        <p className="text-caption text-fg-subtle">
          Showcase preview · synthetic data. Live numbers replace this the
          moment the scraper switches on.
        </p>
      )}
    </div>
  );
}

// --- Tab bar --------------------------------------------------------------

/**
 * Platform filter (All + one tab per platform). The active tab is marked by a
 * yellow rule under it — DESIGN.md's "active nav indicator", and the only
 * yellow on this screen besides the selected platform's bar.
 */
function PlatformTabBar({
  value,
  onChange,
}: {
  value: PlatformFilter;
  onChange: (next: PlatformFilter) => void;
}) {
  return (
    // The strip scrolls sideways on a phone; the hairline lives on the OUTER
    // box so the active indicator can sit flush on it without overflowing the
    // scroll container (which would raise a stray vertical scrollbar).
    <div className="border-b border-line">
      <div
        role="tablist"
        aria-label="Platform filter"
        className="flex items-center gap-1 overflow-x-auto"
      >
      {TABS.map((tab) => {
        const isActive = tab.value === value;
        const Icon = tab.value === 'all' ? null : PLATFORM_ICONS[tab.value];
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative inline-flex h-11 items-center gap-2 whitespace-nowrap px-3 text-label',
              'transition-colors duration-150 ease-out',
              isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {Icon ? <Icon size={14} /> : null}
            <span>{tab.label}</span>
            {isActive ? (
              <span
                aria-hidden
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand"
              />
            ) : null}
          </button>
        );
        })}
      </div>
    </div>
  );
}

// --- Top creators ---------------------------------------------------------

/** Sortable numeric column header. Direction reads from the caret and aria-sort. */
function SortHeader({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Th
      numeric
      aria-sort={active ? 'descending' : 'none'}
      className={cn('p-0', className)}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex h-11 w-full items-center justify-end gap-1.5 px-4',
          'transition-colors duration-150 ease-out hover:text-fg',
          active && 'text-fg',
        )}
      >
        {label}
        <svg
          viewBox="0 0 10 10"
          width="7"
          height="7"
          aria-hidden="true"
          className={active ? 'opacity-100' : 'opacity-0'}
        >
          <path d="M5 9 L9.33 1.5 L0.67 1.5 Z" fill="currentColor" />
        </svg>
      </button>
    </Th>
  );
}

/** Ranked creators for the active filter and window, sortable by views or followers. */
function TopCreatorsTable({
  rows,
  filter,
  totalRows,
  scope,
  sort,
  onSortChange,
  onClearFilter,
}: {
  rows: DisplayRow[];
  filter: PlatformFilter;
  totalRows: number;
  scope: string;
  sort: CreatorSort;
  onSortChange: (next: CreatorSort) => void;
  onClearFilter: (next: PlatformFilter) => void;
}) {
  return (
    <section aria-labelledby="top-creators-heading" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="top-creators-heading" className="text-heading text-fg">
            Top creators
          </h2>
          <p className="mt-1 text-caption text-fg-subtle">
            {`${filterLabel(filter)} · views ${scope}`}
          </p>
        </div>
        <Link
          href="/leaderboard"
          className="text-caption text-fg-muted transition-colors duration-150 ease-out hover:text-fg"
        >
          Full leaderboard →
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing tracked on this platform yet"
          description={`No creator we track has a ${filterLabel(filter)} profile. Every other platform still has numbers.`}
        >
          <Button variant="secondary" onClick={() => onClearFilter('all')}>
            Show all platforms
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* The list is capped at TOP_CREATORS_LIMIT rows, so it always fits
              vertically and the header never needs to stick. The wrapper still
              owns the horizontal axis, so the page never scrolls sideways. */}
          <TableWrap>
            <Table>
              <caption className="sr-only">
                {`Top creators on ${filterLabel(filter)}, views ${scope}, sorted by ${
                  sort === 'followers' ? 'followers' : 'views'
                }`}
              </caption>
              <thead>
                <tr>
                  <Th className="w-14">
                    <span className="sr-only">Rank</span>
                    <span aria-hidden="true">#</span>
                  </Th>
                  <Th className="w-full">Creator</Th>
                  <SortHeader
                    label="Views"
                    active={sort === 'views'}
                    onClick={() => onSortChange('views')}
                  />
                  <SortHeader
                    label="Followers"
                    active={sort === 'followers'}
                    onClick={() => onSortChange('followers')}
                    className="hidden sm:table-cell"
                  />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <CreatorRow key={row.key} row={row} rank={i + 1} />
                ))}
              </tbody>
            </Table>
          </TableWrap>

          <p className="mt-3 text-caption text-fg-subtle">
            {totalRows > rows.length ? (
              <>
                <span className="tnum">{rows.length}</span> of{' '}
                <span className="tnum">{totalRows}</span> creators.{' '}
                <Link
                  href="/leaderboard"
                  className="text-fg-muted underline underline-offset-4 transition-colors duration-150 ease-out hover:text-fg"
                >
                  See the rest
                </Link>
              </>
            ) : (
              <>
                All <span className="tnum">{totalRows}</span> tracked creator
                {totalRows === 1 ? '' : 's'}.
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}

/** One ranked creator row; the name links to the creator page when a slug exists. */
function CreatorRow({ row, rank }: { row: DisplayRow; rank: number }) {
  const initial = row.name.trim().charAt(0).toUpperCase() || '?';
  return (
    <Tr>
      <Td>
        <Rank n={rank} />
      </Td>
      {/* w-full + max-w-0 makes this the flexible column: the name truncates
          instead of pushing Views past the wrapper's edge on a phone. */}
      <Td className="w-full max-w-0">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-subtle text-caption text-fg-muted">
            <ImageWithFallback
              src={row.avatarUrl}
              alt=""
              className="size-full object-cover"
              fallback={initial}
            />
          </span>
          {row.slug ? (
            <Link
              href={`/creators/${row.slug}`}
              className="truncate text-body text-fg underline-offset-4 hover:underline"
            >
              {row.name}
            </Link>
          ) : (
            <span className="truncate text-body text-fg">{row.name}</span>
          )}
        </span>
      </Td>
      <Td numeric>
        <ShowcaseNumber value={row.totalViews} />
      </Td>
      <Td numeric className="hidden sm:table-cell">
        <span className="text-fg-muted">
          <ShowcaseNumber value={row.followers} />
        </span>
      </Td>
    </Tr>
  );
}

// --- Platform breakdown ---------------------------------------------------

interface BreakdownRow {
  platform: PlatformKey;
  followers: number;
  totalViews: number;
}

/** Per-platform views with a proportional bar; selecting one sets the active filter. */
function PlatformBreakdownCard({
  activeFilter,
  onSelect,
  rows,
  scope,
}: {
  activeFilter: PlatformFilter;
  onSelect: (filter: PlatformFilter) => void;
  rows: BreakdownRow[];
  scope: string;
}) {
  const max = Math.max(1, ...rows.map((p) => p.totalViews));
  return (
    <Card padding="md" className="flex flex-col">
      <h2 className="text-heading text-fg">By platform</h2>
      <p className="mt-1 text-caption text-fg-subtle">{`Views ${scope}`}</p>

      <ul className="mt-4 flex flex-col gap-2">
        {rows.map((row) => {
          const Icon = PLATFORM_ICONS[row.platform];
          const widthPct = (row.totalViews / max) * 100;
          const isFocused = activeFilter === row.platform;
          const isEmpty = row.followers === 0 && row.totalViews === 0;
          return (
            <li key={row.platform}>
              <button
                type="button"
                onClick={() => onSelect(row.platform)}
                aria-pressed={isFocused}
                className={cn(
                  'w-full rounded-xl border px-3 py-3 text-left',
                  'transition-colors duration-150 ease-out',
                  isFocused
                    ? 'border-line-strong bg-surface-subtle'
                    : 'border-line bg-transparent hover:border-line-strong hover:bg-white/[0.025]',
                  isEmpty && 'opacity-60',
                )}
              >
                <span className="mb-2 flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-subtle text-fg">
                      <Icon size={14} />
                    </span>
                    <span className="truncate text-body-sm text-fg">
                      {PLATFORM_LABELS[row.platform]}
                    </span>
                  </span>
                  <span className="tnum text-body-sm text-fg">
                    {isEmpty ? '—' : formatShowcase(row.totalViews)}
                  </span>
                </span>

                <span className="block h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
                  <span
                    className={cn(
                      'block h-full transition-colors duration-150 ease-out',
                      isFocused ? 'bg-brand' : 'bg-white/30',
                    )}
                    style={{ width: `${widthPct.toFixed(2)}%` }}
                  />
                </span>

                <span className="mt-2 flex items-center justify-between text-caption text-fg-subtle">
                  <span>{isEmpty ? 'Not yet tracked' : 'followers'}</span>
                  <span className="tnum">
                    {isEmpty ? '' : formatShowcase(row.followers)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
