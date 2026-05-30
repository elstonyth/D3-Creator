'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { BentoGrid, BentoItem } from '../ui/bento-grid';
import { GlassCard } from '../ui/glass-card';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '../ui/platform-icons';
import { Sparkline } from './sparkline';
import {
  DEMO_VIEWS,
  METRICS,
  PLATFORM_BREAKDOWN,
  compactFormatter,
  exactFormatter,
  getCreatorsForFilter,
  handleToSlug,
  signedPercentFormatter,
  type CreatorRow,
  type PlatformBreakdown,
  type PlatformFilter,
} from './showcase-data';
import type { CreatorMetricWindowRow } from '@gitroom/frontend/lib/metrics-windowed';
import type { LivePlatformBreakdown } from '@gitroom/frontend/lib/queries';
import { formatWindowedValue } from '@gitroom/frontend/lib/format-metric';

interface TabDef {
  value: PlatformFilter;
  label: string;
}

const TABS: TabDef[] = [
  { value: 'all', label: 'All Platforms' },
  { value: 'instagram', label: PLATFORM_LABELS.instagram },
  { value: 'tiktok', label: PLATFORM_LABELS.tiktok },
  { value: 'douyin', label: PLATFORM_LABELS.douyin },
  { value: 'facebook', label: PLATFORM_LABELS.facebook },
  { value: 'xiaohongshu', label: PLATFORM_LABELS.xiaohongshu },
];

function filterLabel(filter: PlatformFilter): string {
  return filter === 'all' ? 'All platforms' : PLATFORM_LABELS[filter];
}

/** Map a raw platform string (RPC: 'rednote') to a UI PlatformKey. */
function toPlatformKey(platform: string | null): PlatformKey | null {
  if (!platform) return null;
  return platform === 'rednote' ? 'xiaohongshu' : (platform as PlatformKey);
}

export interface DashboardShowcaseProps {
  /** Live 30-day windowed creator metrics from Supabase. When non-empty,
   *  drives the views hero, Top Creators (ranked by 30d views), and the
   *  follower tile. */
  metrics30d?: CreatorMetricWindowRow[] | null;
  /** Live lifetime windowed creator metrics — drives the Lifetime Views tile. */
  metricsLifetime?: CreatorMetricWindowRow[] | null;
  /** Live per-platform aggregates from Supabase. When provided, merges with
   *  demo PLATFORM_BREAKDOWN: live wins per-platform, demo fills the rest
   *  so the strip always renders all five rows. */
  livePlatformBreakdown?: LivePlatformBreakdown[] | null;
}

/** Filter live windowed rows by the active platform tab. */
function filterByPlatform(
  rows: CreatorMetricWindowRow[],
  filter: PlatformFilter,
): CreatorMetricWindowRow[] {
  if (filter === 'all') return rows;
  return rows.filter((r) => toPlatformKey(r.primaryPlatform) === filter);
}

export function DashboardShowcase({
  metrics30d,
  metricsLifetime,
  livePlatformBreakdown,
}: DashboardShowcaseProps = {}) {
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const isLive = !!(metrics30d && metrics30d.length > 0);

  // --- 30d views (hero) -----------------------------------------------------
  const filtered30d = useMemo(
    () => (metrics30d ? filterByPlatform(metrics30d, filter) : []),
    [metrics30d, filter],
  );
  const totalViews30d = useMemo(
    () => filtered30d.reduce((s, r) => s + r.viewsGained, 0),
    [filtered30d],
  );
  const allInsufficient30d =
    filtered30d.length > 0 && filtered30d.every((r) => r.insufficient);

  // --- Lifetime views (tile) ------------------------------------------------
  const filteredLifetime = useMemo(
    () => (metricsLifetime ? filterByPlatform(metricsLifetime, filter) : []),
    [metricsLifetime, filter],
  );
  const totalViewsLifetime = useMemo(
    () => filteredLifetime.reduce((s, r) => s + r.viewsGained, 0),
    [filteredLifetime],
  );
  const allInsufficientLife =
    filteredLifetime.length > 0 && filteredLifetime.every((r) => r.insufficient);

  // --- Followers tile -------------------------------------------------------
  const totalFollowers = useMemo(
    () =>
      isLive
        ? filtered30d.reduce((s, r) => s + r.followers, 0)
        : METRICS[filter].totalFollowers,
    [isLive, filtered30d, filter],
  );
  const followersDelta = useMemo(
    () => filtered30d.reduce((s, r) => s + r.followersDelta, 0),
    [filtered30d],
  );
  const followersDeltaPct = useMemo(() => {
    if (!isLive) return METRICS[filter].totalFollowersDeltaPct;
    const prior = totalFollowers - followersDelta;
    return prior > 0 ? followersDelta / prior : 0;
  }, [isLive, totalFollowers, followersDelta, filter]);

  const activeCreators = isLive ? filtered30d.length : METRICS[filter].activeCreators;

  // --- Top Creators (ranked by 30d views desc) ------------------------------
  const topCreators = useMemo<TopCreatorRow[]>(() => {
    if (isLive) {
      return [...filtered30d]
        .sort((a, b) => b.viewsGained - a.viewsGained)
        .map((r, i) => ({
          key: r.creatorId,
          name: r.displayName ?? r.creatorId,
          slug: handleToSlug(r.displayName ?? r.creatorId),
          platform: toPlatformKey(r.primaryPlatform),
          followers: r.followers,
          viewsGained: r.viewsGained,
          insufficient: r.insufficient,
          rank: i + 1,
        }));
    }
    return getCreatorsForFilter(filter)
      .slice()
      .sort((a, b) => b.totalViews - a.totalViews)
      .map((c, i) => ({
        key: c.handle,
        name: c.handle,
        slug: handleToSlug(c.handle),
        platform: c.primaryPlatform,
        followers: c.followers,
        viewsGained: c.totalViews,
        insufficient: false,
        rank: i + 1,
      }));
  }, [isLive, filtered30d, filter]);

  // --- Hero / tile display values -------------------------------------------
  const heroViews = isLive
    ? formatWindowedValue(allInsufficient30d, totalViews30d, compactFormatter.format)
    : compactFormatter.format(DEMO_VIEWS[filter].views30d);

  const lifetimeViews = isLive
    ? formatWindowedValue(
        allInsufficientLife,
        totalViewsLifetime,
        compactFormatter.format,
      )
    : compactFormatter.format(DEMO_VIEWS[filter].viewsLifetime);

  // Breakdown card rows.
  //   - No live data at all → demo (full demo mode).
  //   - At least one live platform → live-only: every row uses the live
  //     followers/growth (0 if that platform has no profile yet).
  const breakdownRows = useMemo<PlatformBreakdown[]>(() => {
    if (!livePlatformBreakdown || livePlatformBreakdown.length === 0) {
      return PLATFORM_BREAKDOWN;
    }
    const liveMap = new Map<PlatformKey, LivePlatformBreakdown>();
    for (const p of livePlatformBreakdown) liveMap.set(p.platform, p);
    return PLATFORM_BREAKDOWN.map((demo) => {
      const live = liveMap.get(demo.platform);
      return {
        platform: demo.platform,
        followers: live?.followers ?? 0,
        growth30d: live?.growth30d ?? 0,
        engagementRate: NaN, // unused by the card now; kept to satisfy the type
      };
    });
  }, [livePlatformBreakdown]);

  return (
    <div className="flex flex-col gap-6">
      <PlatformTabBar value={filter} onChange={setFilter} />

      <BentoGrid gap="md">
        <BentoItem colSpan={8} rowSpan={2} tabletColSpan={6}>
          <HeroViewsCard filter={filter} value={heroViews} />
        </BentoItem>

        <BentoItem colSpan={4} rowSpan={1} tabletColSpan={3}>
          <MetricCard
            label="Total Followers"
            value={compactFormatter.format(totalFollowers)}
            delta={signedPercentFormatter.format(followersDeltaPct)}
            note={`${exactFormatter.format(totalFollowers)} tracked`}
            deltaPositive={followersDeltaPct >= 0}
          />
        </BentoItem>

        <BentoItem colSpan={4} rowSpan={1} tabletColSpan={3}>
          <MetricCard
            label="Lifetime Total Views"
            value={lifetimeViews}
            note={`${activeCreators} creator${activeCreators === 1 ? '' : 's'}`}
          />
        </BentoItem>

        <BentoItem colSpan={7} rowSpan={2} tabletColSpan={6}>
          <LeaderboardCard rows={topCreators} filter={filter} />
        </BentoItem>

        <BentoItem colSpan={5} rowSpan={2} tabletColSpan={6}>
          <PlatformBreakdownCard
            activeFilter={filter}
            onSelect={setFilter}
            rows={breakdownRows}
          />
        </BentoItem>
      </BentoGrid>

      {!isLive && (
        <p className="text-caption text-fgSubtle text-center pt-2 tabular-nums">
          Showcase preview · synthetic data. Live numbers replace this the moment the scraper switches on.
        </p>
      )}
    </div>
  );
}

// --- Tab bar --------------------------------------------------------------

interface PlatformTabBarProps {
  value: PlatformFilter;
  onChange: (next: PlatformFilter) => void;
}

function PlatformTabBar({ value, onChange }: PlatformTabBarProps) {
  return (
    <div
      role="tablist"
      aria-label="Platform filter"
      className="border border-borderGlass rounded-2xl bg-customColor1 p-1.5 flex items-center gap-1 overflow-x-auto"
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
            className={clsx(
              'inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-label whitespace-nowrap',
              'transition-colors duration-150 ease-out',
              isActive
                ? 'bg-customColor16 text-fg border border-borderGlassStrong'
                : 'border border-transparent text-fgMuted hover:text-fg hover:bg-white/[0.04]'
            )}
          >
            {Icon ? <Icon size={14} /> : null}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// --- Hero card ------------------------------------------------------------

interface HeroViewsCardProps {
  filter: PlatformFilter;
  value: string;
}

function HeroViewsCard({ filter, value }: HeroViewsCardProps) {
  // Sparkline stays the demo series — it's labeled "Preview" for that reason.
  const series = METRICS[filter].growthSeries;
  return (
    <GlassCard variant="base" padding="lg" radius="2xl" className="h-full flex flex-col">
      <div className="flex items-start justify-between mb-6">
        <div className="flex flex-col gap-1">
          <span className="text-micro uppercase text-fgSubtle tracking-[0.04em]">
            Total Views · 30D
          </span>
          <span className="text-caption text-fgMuted">{filterLabel(filter)}</span>
        </div>
        <span className="text-caption px-2.5 py-1 rounded-md border border-borderGlass text-fgMuted font-mono">
          Preview
        </span>
      </div>

      <div className="flex items-baseline gap-4 mb-1">
        <div className="text-[clamp(44px,5.5vw,68px)] leading-[0.98] tracking-[-0.035em] font-semibold text-fg tabular-nums">
          {value}
        </div>
      </div>
      <div className="text-caption text-fgMuted mb-6 tabular-nums">
        views gained · last 30 days
      </div>

      <div className="flex-1 min-h-[160px]">
        <Sparkline
          values={series}
          ariaLabel="Preview of daily activity over the last 30 days"
        />
      </div>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-borderGlass text-caption text-fgSubtle font-mono tabular-nums">
        <span>30d ago</span>
        <span>15d</span>
        <span>Today</span>
      </div>
    </GlassCard>
  );
}

// --- Metric card ----------------------------------------------------------

interface MetricCardProps {
  label: string;
  value: string;
  note: string;
  delta?: string;
  deltaPositive?: boolean;
}

function MetricCard({ label, value, note, delta, deltaPositive }: MetricCardProps) {
  return (
    <GlassCard variant="base" padding="lg" radius="2xl" className="h-full flex flex-col">
      <span className="text-micro uppercase text-fgSubtle tracking-[0.04em] mb-5">
        {label}
      </span>
      <div className="flex items-baseline gap-3 mb-2">
        <div className="text-[clamp(28px,3vw,38px)] leading-[1.02] tracking-[-0.025em] font-semibold text-fg tabular-nums">
          {value}
        </div>
        {delta != null && (
          <div
            className={clsx(
              'text-body-sm font-mono tabular-nums',
              deltaPositive ? 'text-fg' : 'text-fgSubtle'
            )}
          >
            {delta}
          </div>
        )}
      </div>
      <p className="text-caption text-fgMuted mt-auto tabular-nums">{note}</p>
    </GlassCard>
  );
}

// --- Leaderboard (dense text list) ----------------------------------------

interface TopCreatorRow {
  key: string;
  name: string;
  slug: string;
  platform: PlatformKey | null;
  followers: number;
  viewsGained: number;
  insufficient: boolean;
  rank: number;
}

interface LeaderboardCardProps {
  rows: TopCreatorRow[];
  filter: PlatformFilter;
}

function LeaderboardCard({ rows, filter }: LeaderboardCardProps) {
  return (
    <GlassCard variant="base" padding="lg" radius="2xl" className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div className="flex flex-col gap-1">
          <span className="text-micro uppercase text-fgSubtle tracking-[0.04em]">
            Top Creators
          </span>
          <span className="text-caption text-fgMuted">
            Ranked by 30D views · {filterLabel(filter)}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="flex-1 grid place-items-center text-body-sm text-fgMuted py-12">
          No creators on this platform yet.
        </div>
      ) : (
        <ul className="flex-1 flex flex-col">
          <li
            aria-hidden
            className="grid grid-cols-[28px_minmax(0,1fr)_44px_92px_82px] gap-3 px-1 py-2 text-micro uppercase tracking-[0.04em] text-fgSubtle border-b border-borderGlass"
          >
            <span>#</span>
            <span>Creator</span>
            <span className="text-right">Plat</span>
            <span className="text-right">Followers</span>
            <span className="text-right">30D Views</span>
          </li>

          {rows.map((row) => {
            const Icon = row.platform ? PLATFORM_ICONS[row.platform] : null;
            return (
              <li
                key={row.key}
                className="border-b border-borderGlass last:border-b-0"
              >
                <Link
                  href={`/creators/${row.slug}`}
                  className="grid grid-cols-[28px_minmax(0,1fr)_44px_92px_82px] gap-3 px-1 py-3 items-center text-body-sm transition-colors duration-150 ease-out hover:bg-white/[0.025] focus-visible:bg-white/[0.04] outline-none rounded-md"
                >
                  <span className="font-mono tabular-nums text-fgSubtle">
                    {String(row.rank).padStart(2, '0')}
                  </span>
                  <span className="text-fg truncate font-medium">{row.name}</span>
                  <span className="flex justify-end items-center text-fgMuted">
                    {Icon ? <Icon size={14} /> : null}
                  </span>
                  <span className="text-right font-mono tabular-nums text-fg">
                    {compactFormatter.format(row.followers)}
                  </span>
                  <span className="text-right font-mono tabular-nums text-fg">
                    {formatWindowedValue(row.insufficient, row.viewsGained, compactFormatter.format)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}

// --- Platform breakdown ---------------------------------------------------

interface PlatformBreakdownCardProps {
  activeFilter: PlatformFilter;
  onSelect: (filter: PlatformFilter) => void;
  rows: PlatformBreakdown[];
}

function PlatformBreakdownCard({
  activeFilter,
  onSelect,
  rows,
}: PlatformBreakdownCardProps) {
  // Avoid divide-by-zero when every platform is empty; the bar widths will
  // just collapse to 0% which renders fine.
  const max = Math.max(1, ...rows.map((p) => p.followers));
  return (
    <GlassCard variant="base" padding="lg" radius="2xl" className="h-full flex flex-col">
      <div className="flex flex-col gap-1 mb-5">
        <span className="text-micro uppercase text-fgSubtle tracking-[0.04em]">
          Platform Breakdown
        </span>
        <span className="text-caption text-fgMuted">
          Followers + 30d growth by platform
        </span>
      </div>

      <ul className="flex-1 flex flex-col gap-3">
        {rows.map((row) => {
          const Icon = PLATFORM_ICONS[row.platform];
          const widthPct = (row.followers / max) * 100;
          const isFocused = activeFilter === row.platform;
          const isEmpty = row.followers === 0;
          return (
            <li key={row.platform}>
              <button
                type="button"
                onClick={() => onSelect(row.platform)}
                className={clsx(
                  'w-full text-left rounded-xl border px-3 py-3 transition-colors duration-150 ease-out',
                  isFocused
                    ? 'bg-customColor16 border-borderGlassStrong'
                    : 'bg-transparent border-borderGlass hover:border-borderGlassStrong hover:bg-white/[0.025]',
                  isEmpty && 'opacity-50'
                )}
                aria-pressed={isFocused}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex items-center justify-center size-7 rounded-md bg-customColor16 border border-borderGlass text-fg shrink-0">
                      <Icon size={14} />
                    </span>
                    <span className="text-body-sm text-fg truncate">
                      {PLATFORM_LABELS[row.platform]}
                    </span>
                  </div>
                  <span className="text-body-sm font-mono tabular-nums text-fg">
                    {isEmpty ? '—' : compactFormatter.format(row.followers)}
                  </span>
                </div>

                <div className="h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      'h-full transition-[width] duration-200 ease-out',
                      isFocused ? 'bg-brand' : 'bg-white/30'
                    )}
                    style={{ width: `${widthPct.toFixed(2)}%` }}
                  />
                </div>

                <div className="flex items-center justify-end mt-2 text-caption text-fgMuted font-mono tabular-nums">
                  <span className="text-fg">
                    {isEmpty
                      ? 'Not yet tracked'
                      : `+${compactFormatter.format(row.growth30d)} · 30d`}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
