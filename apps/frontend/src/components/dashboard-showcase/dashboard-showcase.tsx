'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { GlassCard } from '../ui/glass-card';
import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '../ui/platform-icons';
import {
  formatShowcase,
  percentFormatter,
  handleToSlug,
  demoCreatorRows,
  placeholderViewsTrend,
  placeholderDeltaPct,
  type PlatformFilter,
} from './showcase-data';
import type { LiveCreatorRow } from '@gitroom/frontend/lib/queries';

interface TabDef {
  value: PlatformFilter;
  label: string;
}

const TABS: TabDef[] = [
  { value: 'all', label: 'All Platforms' },
  { value: 'facebook', label: PLATFORM_LABELS.facebook },
  { value: 'instagram', label: PLATFORM_LABELS.instagram },
  { value: 'tiktok', label: PLATFORM_LABELS.tiktok },
  { value: 'douyin', label: PLATFORM_LABELS.douyin },
  // xiaohongshu (RedNote) archived — hidden from the platform filter.
];

const BREAKDOWN_PLATFORMS: PlatformKey[] = ['facebook', 'instagram', 'tiktok', 'douyin'];
// Dashboard is a summary — show the top slice; the leaderboard has the full list.
const TOP_CREATORS_LIMIT = 10;

function filterLabel(filter: PlatformFilter): string {
  return filter === 'all' ? 'All platforms' : PLATFORM_LABELS[filter];
}

interface DisplayRow {
  key: string;
  name: string;
  slug: string | null;
  followers: number;
  totalViews: number;
}

/** Resolve creators for the active filter; per-platform slot when filtered. */
function resolveRows(creators: LiveCreatorRow[], filter: PlatformFilter): DisplayRow[] {
  if (filter === 'all') {
    return creators.map((c) => ({
      key: c.creatorId,
      name: c.displayName,
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
   * Real "Total Views" history (oldest→newest) for the sparkline. OPTIONAL —
   * when omitted, a realistic deterministic placeholder is shown.
   * TODO(backend): pass from the page once snapshot aggregation lands.
   */
  viewsTrend?: number[];
  /**
   * Real period-over-period deltas (fractions, e.g. 0.063 = +6.3%). OPTIONAL —
   * placeholders fill in per-metric when omitted. See showcase-data.ts.
   */
  deltas?: { views?: number; followers?: number; engagement?: number };
}

export function DashboardShowcase({
  creators,
  viewsTrend: propViewsTrend,
  deltas: propDeltas,
}: DashboardShowcaseProps = {}) {
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const isLive = !!(creators && creators.length > 0);
  const baseCreators = useMemo(
    () => (isLive ? creators! : demoCreatorRows()),
    [isLive, creators],
  );

  const rows = useMemo(() => resolveRows(baseCreators, filter), [baseCreators, filter]);
  const totalFollowers = useMemo(() => rows.reduce((s, r) => s + r.followers, 0), [rows]);
  const totalViews = useMemo(() => rows.reduce((s, r) => s + r.totalViews, 0), [rows]);
  const totalEngagement = useMemo(
    () =>
      filter === 'all'
        ? baseCreators.reduce((s, c) => s + c.totalEngagement, 0)
        : baseCreators.reduce(
            (s, c) => s + (c.platforms.find((p) => p.platform === filter)?.totalEngagement ?? 0),
            0,
          ),
    [baseCreators, filter],
  );

  // Sparkline series + per-metric deltas. Real values arrive via props; until the
  // backend aggregates snapshot history we fall back to realistic placeholders.
  const viewsTrend = useMemo(
    () =>
      propViewsTrend && propViewsTrend.length > 1
        ? propViewsTrend
        : placeholderViewsTrend(totalViews),
    [propViewsTrend, totalViews],
  );
  const viewsDelta = useMemo(() => {
    if (typeof propDeltas?.views === 'number') return propDeltas.views;
    const first = viewsTrend[0] || 1;
    return (viewsTrend[viewsTrend.length - 1] - first) / first;
  }, [propDeltas, viewsTrend]);
  const followersDelta = propDeltas?.followers ?? placeholderDeltaPct(totalFollowers);
  const engagementDelta = propDeltas?.engagement ?? placeholderDeltaPct(totalEngagement);

  // Top creators by views (dashboard summary — capped).
  const topCreators = useMemo(
    () => [...rows].sort((a, b) => b.totalViews - a.totalViews).slice(0, TOP_CREATORS_LIMIT),
    [rows],
  );
  const hasMore = rows.length > TOP_CREATORS_LIMIT;

  const breakdown = useMemo(() => {
    const map = new Map<PlatformKey, { followers: number; totalViews: number }>();
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

  return (
    <div className="flex flex-col gap-5">
      <PlatformTabBar value={filter} onChange={setFilter} />

      {/* Stats — frameless bento: Total Views hero (left) with a sparkline filling the
          open space; Followers + Engagement stacked right. Each carries a trend chip. */}
      <div className="grid grid-cols-1 gap-8 py-2 sm:grid-cols-12 sm:gap-x-10 sm:gap-y-7">
        <div className="flex flex-col justify-center gap-3 sm:col-span-8 sm:row-span-2">
          <div className="flex items-center gap-3">
            <span className="text-label text-fgMuted">Total Views</span>
            <DeltaChip value={viewsDelta} />
          </div>
          <div className="flex items-center gap-6">
            <div className="text-[clamp(48px,6.5vw,84px)] leading-[0.98] tracking-[-0.035em] font-semibold text-fg tabular-nums">
              {formatShowcase(totalViews)}
            </div>
            <Sparkline
              data={viewsTrend}
              className="hidden h-16 flex-1 self-center text-white/30 sm:block"
            />
          </div>
          <p className="text-caption text-fgSubtle tabular-nums">
            {`${filterLabel(filter)} · all-time, across tracked posts`}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-4 sm:items-end sm:text-right">
          <span className="text-label text-fgMuted">Total Followers</span>
          <div className="flex items-baseline gap-2.5">
            <div className="text-[clamp(28px,3vw,38px)] leading-none tracking-[-0.025em] font-semibold text-fg tabular-nums">
              {formatShowcase(totalFollowers)}
            </div>
            <DeltaChip value={followersDelta} />
          </div>
          <p className="text-caption text-fgSubtle tabular-nums">
            {`${filterLabel(filter)} · tracked`}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-4 sm:items-end sm:text-right">
          <span className="text-label text-fgMuted">Total Engagement</span>
          <div className="flex items-baseline gap-2.5">
            <div className="text-[clamp(28px,3vw,38px)] leading-none tracking-[-0.025em] font-semibold text-fg tabular-nums">
              {formatShowcase(totalEngagement)}
            </div>
            <DeltaChip value={engagementDelta} />
          </div>
          <p className="text-caption text-fgSubtle">{'likes, comments & shares'}</p>
        </div>
      </div>

      {/* Content row — top creators + platform breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        <TopCreatorsCard rows={topCreators} filter={filter} hasMore={hasMore} />
        <PlatformBreakdownCard activeFilter={filter} onSelect={setFilter} rows={breakdown} />
      </div>

      {!isLive && (
        <p className="text-caption text-fgSubtle text-center pt-2 tabular-nums">
          Showcase preview · synthetic data. Live numbers replace this the moment the scraper switches on.
        </p>
      )}
    </div>
  );
}

// --- Tab bar --------------------------------------------------------------

function PlatformTabBar({
  value,
  onChange,
}: {
  value: PlatformFilter;
  onChange: (next: PlatformFilter) => void;
}) {
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

// --- Sparkline + trend chip -----------------------------------------------

/** Axis-less SVG sparkline; stretches to fill its box. Color via `currentColor`. */
function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (!data || data.length < 2) return null;
  const w = 120;
  const h = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - 1 - ((v - min) / range) * (h - 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = `M${points.join(' L')}`;
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Period-over-period change. Direction via caret, not color (DESIGN.md: no red/green). */
function DeltaChip({ value, period = 'recent' }: { value: number; period?: string }) {
  const up = value >= 0;
  const pct = percentFormatter.format(Math.abs(value));
  return (
    <span
      className="inline-flex items-center gap-1 text-caption tabular-nums"
      title={`${up ? 'Up' : 'Down'} ${pct} · ${period} trend`}
    >
      <svg
        width="8"
        height="8"
        viewBox="0 0 10 10"
        aria-hidden="true"
        className={clsx('text-fg', !up && 'rotate-180')}
      >
        <path d="M5 1 L9.33 8.5 L0.67 8.5 Z" fill="currentColor" />
      </svg>
      <span className="text-fg">{pct}</span>
      <span className="text-fgSubtle">· {period}</span>
    </span>
  );
}

// --- Top creators ---------------------------------------------------------

// On ultra-narrow phones (≤374px, e.g. old iPhone SE/5) the full-digit Views
// column would starve the name to nothing, so the `tiny:` variant drops the
// secondary Followers column (and the avatar, below) — rank + name + the primary
// Views metric always stay legible.
const GRID =
  'grid grid-cols-[32px_minmax(0,1fr)_auto_auto] tiny:grid-cols-[32px_minmax(0,1fr)_auto] gap-3 items-center';

function TopCreatorsCard({
  rows,
  filter,
  hasMore,
}: {
  rows: DisplayRow[];
  filter: PlatformFilter;
  hasMore: boolean;
}) {
  return (
    <GlassCard variant="base" padding="md" radius="2xl" className="flex flex-col">
      <div className="flex items-end justify-between mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-label text-fg font-medium">Top Creators</span>
          <span className="text-body-sm text-fgMuted">
            {filterLabel(filter)} · by views
          </span>
        </div>
        <Link
          href="/leaderboard"
          className="text-caption text-fgMuted hover:text-fg transition-colors"
        >
          See all →
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center text-body-sm text-fgMuted py-12">
          No creators on this platform yet.
        </div>
      ) : (
        <>
          <div
            aria-hidden
            className={`${GRID} px-2 pb-2 text-micro uppercase tracking-[0.04em] text-fgSubtle border-b border-borderGlass`}
          >
            <span>#</span>
            <span>Creator</span>
            <span className="text-right">Views</span>
            <span className="tiny:hidden text-right">Followers</span>
          </div>
          <ul>
            {rows.map((row, i) => (
              <CreatorRow key={row.key} row={row} rank={i + 1} />
            ))}
          </ul>
          {hasMore && (
            <Link
              href="/leaderboard"
              className="mt-3 text-center text-caption text-fgMuted hover:text-fg transition-colors"
            >
              View the full leaderboard →
            </Link>
          )}
        </>
      )}
    </GlassCard>
  );
}

function CreatorRow({ row, rank }: { row: DisplayRow; rank: number }) {
  const isWinner = rank === 1;
  const initial = row.name.trim().charAt(0).toUpperCase() || '?';
  const cells = (
    <>
      <span
        className={clsx(
          'font-mono tabular-nums text-body-sm',
          isWinner ? 'text-brand font-semibold' : 'text-fgSubtle',
        )}
      >
        {String(rank).padStart(2, '0')}
      </span>
      <span className="flex items-center gap-3 min-w-0">
        <span className="size-8 shrink-0 rounded-full bg-customColor1 border border-borderGlass grid tiny:hidden place-items-center text-caption text-fgMuted">
          {initial}
        </span>
        <span className="truncate text-body text-fg font-medium">{row.name}</span>
      </span>
      <span className="text-right font-mono tabular-nums text-body text-fg">
        {formatShowcase(row.totalViews)}
      </span>
      <span className="tiny:hidden text-right font-mono tabular-nums text-body-sm text-fgMuted">
        {formatShowcase(row.followers)}
      </span>
    </>
  );
  const rowClass = clsx(
    GRID,
    'px-2 min-h-[52px] rounded-lg transition-colors duration-150 ease-out border-b border-borderGlass last:border-b-0',
    isWinner && 'bg-brand/[0.06]',
  );
  return (
    <li>
      {row.slug ? (
        <Link
          href={`/creators/${row.slug}`}
          className={`${rowClass} hover:bg-white/[0.03] focus-visible:bg-white/[0.05] outline-none`}
        >
          {cells}
        </Link>
      ) : (
        <div className={rowClass}>{cells}</div>
      )}
    </li>
  );
}

// --- Platform breakdown ---------------------------------------------------

interface BreakdownRow {
  platform: PlatformKey;
  followers: number;
  totalViews: number;
}

function PlatformBreakdownCard({
  activeFilter,
  onSelect,
  rows,
}: {
  activeFilter: PlatformFilter;
  onSelect: (filter: PlatformFilter) => void;
  rows: BreakdownRow[];
}) {
  const max = Math.max(1, ...rows.map((p) => p.totalViews));
  return (
    <GlassCard variant="base" padding="md" radius="2xl" className="flex flex-col">
      <div className="flex flex-col gap-1 mb-4">
        <span className="text-label text-fg font-medium">Platform Breakdown</span>
        <span className="text-body-sm text-fgMuted">Views + followers by platform</span>
      </div>

      <ul className="flex flex-col gap-2.5">
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
                className={clsx(
                  'w-full text-left rounded-xl border px-3 py-2.5 transition-colors duration-150 ease-out',
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
                    {isEmpty ? '—' : `${formatShowcase(row.totalViews)} views`}
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

                <div className="flex items-center justify-end mt-1.5 text-caption text-fgMuted font-mono tabular-nums">
                  <span className="text-fgMuted">
                    {isEmpty ? 'Not yet tracked' : `${formatShowcase(row.followers)} followers`}
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
