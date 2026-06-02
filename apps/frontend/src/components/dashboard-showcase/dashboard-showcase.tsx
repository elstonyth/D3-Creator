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
  compactFormatter,
  exactFormatter,
  handleToSlug,
  demoCreatorRows,
  type PlatformFilter,
} from './showcase-data';
import type { LiveCreatorRow } from '@gitroom/frontend/lib/queries';

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
  // xiaohongshu archived — hidden from the platform filter.
];

const BREAKDOWN_PLATFORMS: PlatformKey[] = ['instagram', 'tiktok', 'douyin', 'facebook'];
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
}

export function DashboardShowcase({ creators }: DashboardShowcaseProps = {}) {
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

  // Top creators by followers (dashboard summary — capped).
  const topCreators = useMemo(
    () => [...rows].sort((a, b) => b.followers - a.followers).slice(0, TOP_CREATORS_LIMIT),
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

      {/* Compact stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          label="Total Views"
          value={exactFormatter.format(totalViews)}
          note={`${filterLabel(filter)} · recent posts`}
        />
        <StatTile
          label="Total Followers"
          value={compactFormatter.format(totalFollowers)}
          note={`${exactFormatter.format(totalFollowers)} tracked`}
        />
        <StatTile
          label="Total Engagement"
          value={compactFormatter.format(totalEngagement)}
          note="likes, comments & shares"
        />
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

// --- Stat tile ------------------------------------------------------------

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <GlassCard variant="base" padding="md" radius="2xl" className="flex flex-col gap-1.5">
      <span className="text-label text-fgMuted">{label}</span>
      <div className="text-[clamp(26px,3.2vw,40px)] leading-[1.04] tracking-[-0.025em] font-semibold text-fg tabular-nums">
        {value}
      </div>
      <p className="text-caption text-fgSubtle tabular-nums">{note}</p>
    </GlassCard>
  );
}

// --- Top creators ---------------------------------------------------------

const GRID = 'grid grid-cols-[32px_minmax(0,1fr)_96px_88px] gap-3 items-center';

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
            {filterLabel(filter)} · by followers
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
            <span className="text-right">Followers</span>
            <span className="text-right">Views</span>
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
        <span className="size-8 shrink-0 rounded-full bg-customColor1 border border-borderGlass grid place-items-center text-caption text-fgMuted">
          {initial}
        </span>
        <span className="truncate text-body text-fg font-medium">{row.name}</span>
      </span>
      <span className="text-right font-mono tabular-nums text-body text-fg">
        {compactFormatter.format(row.followers)}
      </span>
      <span className="text-right font-mono tabular-nums text-body-sm text-fgMuted">
        {compactFormatter.format(row.totalViews)}
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
  const max = Math.max(1, ...rows.map((p) => p.followers));
  return (
    <GlassCard variant="base" padding="md" radius="2xl" className="flex flex-col">
      <div className="flex flex-col gap-1 mb-4">
        <span className="text-label text-fg font-medium">Platform Breakdown</span>
        <span className="text-body-sm text-fgMuted">Followers + views by platform</span>
      </div>

      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const Icon = PLATFORM_ICONS[row.platform];
          const widthPct = (row.followers / max) * 100;
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

                <div className="flex items-center justify-end mt-1.5 text-caption text-fgMuted font-mono tabular-nums">
                  <span className="text-fgMuted">
                    {isEmpty ? 'Not yet tracked' : `${compactFormatter.format(row.totalViews)} views`}
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
