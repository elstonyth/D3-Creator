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

// The 4 active platforms shown in the breakdown strip (rednote archived).
const BREAKDOWN_PLATFORMS: PlatformKey[] = ['instagram', 'tiktok', 'douyin', 'facebook'];

function filterLabel(filter: PlatformFilter): string {
  return filter === 'all' ? 'All platforms' : PLATFORM_LABELS[filter];
}

/** A single creator row resolved for the active filter (combined totals). */
interface DisplayRow {
  key: string;
  name: string;
  slug: string | null;
  platform: PlatformKey | null;
  followers: number;
  totalViews: number;
  totalEngagement: number;
}

/**
 * Resolve creators for a platform filter. For "all" we use the creator-level
 * combined totals; for a specific platform we use that creator's matching
 * per-platform slot (so a multi-platform creator contributes only that
 * platform's followers/views — never its whole audience).
 */
function resolveRows(creators: LiveCreatorRow[], filter: PlatformFilter): DisplayRow[] {
  if (filter === 'all') {
    return creators.map((c) => ({
      key: c.creatorId,
      name: c.displayName,
      slug: c.primaryHandle ? handleToSlug(c.primaryHandle) : null,
      platform: c.primaryPlatform,
      followers: c.followers,
      totalViews: c.totalViews,
      totalEngagement: c.totalEngagement,
    }));
  }
  const out: DisplayRow[] = [];
  for (const c of creators) {
    const slot = c.platforms.find((p) => p.platform === filter);
    if (!slot) continue;
    out.push({
      key: c.creatorId,
      name: c.displayName,
      slug: slot.handle ? handleToSlug(slot.handle) : null,
      platform: filter,
      followers: slot.followers,
      totalViews: slot.totalViews,
      totalEngagement: slot.totalEngagement,
    });
  }
  return out;
}

export interface DashboardShowcaseProps {
  /** Live combined-total creator rows (with per-platform slots). */
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
    () => rows.reduce((s, r) => s + r.totalEngagement, 0),
    [rows],
  );

  // Top creators for the active filter, ranked by combined views.
  const topCreators = useMemo<DisplayRow[]>(
    () => [...rows].sort((a, b) => b.totalViews - a.totalViews),
    [rows],
  );

  // Per-platform breakdown derived from each creator's platform slots.
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
    <div className="flex flex-col gap-6">
      <PlatformTabBar value={filter} onChange={setFilter} />

      <BentoGrid gap="md">
        <BentoItem colSpan={8} rowSpan={2} tabletColSpan={6}>
          <HeroViewsCard
            filter={filter}
            value={compactFormatter.format(totalViews)}
          />
        </BentoItem>

        <BentoItem colSpan={4} rowSpan={1} tabletColSpan={3}>
          <MetricCard
            label="Total Followers"
            value={compactFormatter.format(totalFollowers)}
            note={`${exactFormatter.format(totalFollowers)} tracked`}
          />
        </BentoItem>

        <BentoItem colSpan={4} rowSpan={1} tabletColSpan={3}>
          <MetricCard
            label="Total Engagement"
            value={compactFormatter.format(totalEngagement)}
            note="likes, comments & shares"
          />
        </BentoItem>

        <BentoItem colSpan={7} rowSpan={2} tabletColSpan={6}>
          <LeaderboardCard rows={topCreators} filter={filter} />
        </BentoItem>

        <BentoItem colSpan={5} rowSpan={2} tabletColSpan={6}>
          <PlatformBreakdownCard
            activeFilter={filter}
            onSelect={setFilter}
            rows={breakdown}
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
  return (
    <GlassCard variant="base" padding="lg" radius="2xl" className="h-full flex flex-col">
      <div className="flex items-start justify-between mb-6">
        <div className="flex flex-col gap-1">
          <span className="text-micro uppercase text-fgSubtle tracking-[0.04em]">
            Total Views
          </span>
          <span className="text-caption text-fgMuted">{filterLabel(filter)}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <div className="text-[clamp(48px,7vw,92px)] leading-[0.98] tracking-[-0.035em] font-semibold text-fg tabular-nums">
          {value}
        </div>
        <div className="text-caption text-fgMuted mt-3 tabular-nums">
          views across tracked recent posts
        </div>
      </div>
    </GlassCard>
  );
}

// --- Metric card ----------------------------------------------------------

interface MetricCardProps {
  label: string;
  value: string;
  note: string;
}

function MetricCard({ label, value, note }: MetricCardProps) {
  return (
    <GlassCard variant="base" padding="lg" radius="2xl" className="h-full flex flex-col">
      <span className="text-micro uppercase text-fgSubtle tracking-[0.04em] mb-5">
        {label}
      </span>
      <div className="flex items-baseline gap-3 mb-2">
        <div className="text-[clamp(28px,3vw,38px)] leading-[1.02] tracking-[-0.025em] font-semibold text-fg tabular-nums">
          {value}
        </div>
      </div>
      <p className="text-caption text-fgMuted mt-auto tabular-nums">{note}</p>
    </GlassCard>
  );
}

// --- Leaderboard (dense text list) ----------------------------------------

interface LeaderboardCardProps {
  rows: DisplayRow[];
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
            Ranked by views · {filterLabel(filter)}
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
            className="grid grid-cols-[28px_minmax(0,1fr)_92px_82px] gap-3 px-1 py-2 text-micro uppercase tracking-[0.04em] text-fgSubtle border-b border-borderGlass"
          >
            <span>#</span>
            <span>Creator</span>
            <span className="text-right">Followers</span>
            <span className="text-right">Views</span>
          </li>

          {rows.map((row, i) => {
            const cellClass =
              'grid grid-cols-[28px_minmax(0,1fr)_92px_82px] gap-3 px-1 py-3 items-center text-body-sm transition-colors duration-150 ease-out rounded-md';
            const cells = (
              <>
                <span className="font-mono tabular-nums text-fgSubtle">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="text-fg truncate font-medium">{row.name}</span>
                <span className="text-right font-mono tabular-nums text-fg">
                  {compactFormatter.format(row.followers)}
                </span>
                <span className="text-right font-mono tabular-nums text-fg">
                  {compactFormatter.format(row.totalViews)}
                </span>
              </>
            );
            return (
              <li
                key={row.key}
                className="border-b border-borderGlass last:border-b-0"
              >
                {row.slug ? (
                  <Link
                    href={`/creators/${row.slug}`}
                    className={`${cellClass} hover:bg-white/[0.025] focus-visible:bg-white/[0.04] outline-none`}
                  >
                    {cells}
                  </Link>
                ) : (
                  <div className={cellClass}>{cells}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}

// --- Platform breakdown ---------------------------------------------------

interface BreakdownRow {
  platform: PlatformKey;
  followers: number;
  totalViews: number;
}

interface PlatformBreakdownCardProps {
  activeFilter: PlatformFilter;
  onSelect: (filter: PlatformFilter) => void;
  rows: BreakdownRow[];
}

function PlatformBreakdownCard({
  activeFilter,
  onSelect,
  rows,
}: PlatformBreakdownCardProps) {
  const max = Math.max(1, ...rows.map((p) => p.followers));
  return (
    <GlassCard variant="base" padding="lg" radius="2xl" className="h-full flex flex-col">
      <div className="flex flex-col gap-1 mb-5">
        <span className="text-micro uppercase text-fgSubtle tracking-[0.04em]">
          Platform Breakdown
        </span>
        <span className="text-caption text-fgMuted">
          Followers + total views by platform
        </span>
      </div>

      <ul className="flex-1 flex flex-col gap-3">
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
                      : `${compactFormatter.format(row.totalViews)} views`}
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
