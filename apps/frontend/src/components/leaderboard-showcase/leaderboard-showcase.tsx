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
  TOP_CREATORS,
  type PlatformFilter,
} from '../dashboard-showcase/showcase-data';
import type {
  CreatorMetricWindowRow,
  TopContentRow,
} from '@gitroom/frontend/lib/metrics-windowed';
import { ViewLeaderboard } from './view-leaderboard';
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

/** Sort union for the follower board — followers vs views gained in window. */
type LbSort = 'followers' | 'viewsGained';

interface SortDef {
  value: LbSort;
  label: string;
}

const SORTS: SortDef[] = [
  { value: 'followers', label: 'Followers' },
  { value: 'viewsGained', label: 'Views 30D' },
];

/** Map a raw platform string (RPC: 'rednote') to a UI PlatformKey. */
function toPlatformKey(platform: string | null): PlatformKey | null {
  if (!platform) return null;
  return platform === 'rednote' ? 'xiaohongshu' : (platform as PlatformKey);
}

function filterLabel(filter: PlatformFilter): string {
  return filter === 'all' ? 'All platforms' : PLATFORM_LABELS[filter];
}

export interface LeaderboardShowcaseProps {
  liveCreators?: CreatorMetricWindowRow[] | null;
  topContent?: TopContentRow[] | null;
}

/** The subset of CreatorMetricWindowRow the follower board renders. */
type LbRow = Pick<
  CreatorMetricWindowRow,
  'creatorId' | 'displayName' | 'primaryPlatform' | 'followers' | 'viewsGained' | 'insufficient'
> & { rank: number };

function applySort(rows: LbRow[], sortBy: LbSort): LbRow[] {
  const sorted = [...rows].sort((a, b) => b[sortBy] - a[sortBy]);
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Demo fallback derived from the existing synthetic TOP_CREATORS. */
function demoRows(): LbRow[] {
  return TOP_CREATORS.map((c) => ({
    creatorId: c.handle,
    displayName: c.handle,
    primaryPlatform: c.primaryPlatform,
    followers: c.followers,
    viewsGained: c.totalViews,
    insufficient: false,
    rank: c.rank,
  }));
}

export function LeaderboardShowcase({
  liveCreators,
  topContent,
}: LeaderboardShowcaseProps = {}) {
  const [filter, setFilter] = useState<PlatformFilter>('all');
  const [sortBy, setSortBy] = useState<LbSort>('followers');
  const isLive = !!(liveCreators && liveCreators.length > 0);

  const baseRows = useMemo<LbRow[]>(() => {
    if (isLive) {
      return liveCreators!.map((r, i) => ({
        creatorId: r.creatorId,
        displayName: r.displayName,
        primaryPlatform: r.primaryPlatform,
        followers: r.followers,
        viewsGained: r.viewsGained,
        insufficient: r.insufficient,
        rank: i + 1,
      }));
    }
    return demoRows();
  }, [isLive, liveCreators]);

  const rows = useMemo(() => {
    const filtered =
      filter === 'all'
        ? baseRows
        : baseRows.filter((r) => toPlatformKey(r.primaryPlatform) === filter);
    return applySort(filtered, sortBy);
  }, [baseRows, filter, sortBy]);

  const stats = useMemo(() => {
    const totalFollowers = rows.reduce((s, r) => s + r.followers, 0);
    const totalViews = rows.reduce((s, r) => s + r.viewsGained, 0);
    return { trackedCreators: rows.length, totalFollowers, totalViews };
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      <PlatformTabBar value={filter} onChange={setFilter} />

      <div className="grid grid-cols-2 gap-4 lg:gap-6">
        <SummaryStat
          label="Total Followers"
          value={compactFormatter.format(stats.totalFollowers)}
          note={`across ${exactFormatter.format(stats.trackedCreators)} creator${stats.trackedCreators === 1 ? '' : 's'}`}
        />
        <SummaryStat
          label="Total Views 30D"
          value={compactFormatter.format(stats.totalViews)}
          note="views gained · last 30 days"
        />
      </div>

      <LeaderboardCard
        rows={rows}
        sortBy={sortBy}
        onSort={setSortBy}
        filter={filter}
      />

      <ViewLeaderboard rows={topContent ?? []} />

      {!isLive && (
        <p className="text-caption text-fgSubtle text-center pt-2 tabular-nums">
          Showcase preview · synthetic data. Live numbers replace this the moment the scraper switches on.
        </p>
      )}
    </div>
  );
}

// --- Tab bar (duplicate of dashboard's — design locked, ok to mirror) ----

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

// --- Summary stat (compact metric tile) -----------------------------------

interface SummaryStatProps {
  label: string;
  value: string;
  note: string;
}

function SummaryStat({ label, value, note }: SummaryStatProps) {
  return (
    <GlassCard variant="base" padding="md" radius="2xl" className="flex flex-col gap-3">
      <span className="text-micro uppercase text-fgSubtle tracking-[0.04em]">
        {label}
      </span>
      <div className="text-[clamp(24px,2.6vw,32px)] leading-[1.05] tracking-[-0.025em] font-semibold text-fg tabular-nums">
        {value}
      </div>
      <p className="text-caption text-fgMuted tabular-nums">{note}</p>
    </GlassCard>
  );
}

// --- Leaderboard card -----------------------------------------------------

interface LeaderboardCardProps {
  rows: LbRow[];
  sortBy: LbSort;
  onSort: (next: LbSort) => void;
  filter: PlatformFilter;
}

function LeaderboardCard({ rows, sortBy, onSort, filter }: LeaderboardCardProps) {
  return (
    <GlassCard variant="base" padding="lg" radius="2xl" className="flex flex-col">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div className="flex flex-col gap-1">
          <span className="text-micro uppercase text-fgSubtle tracking-[0.04em]">
            Follower Leaderboard
          </span>
          <span className="text-caption text-fgMuted">
            {filterLabel(filter)} · ranked by {SORTS.find((s) => s.value === sortBy)?.label.toLowerCase()}
          </span>
        </div>

        <SortSelector value={sortBy} onChange={onSort} />
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center text-body-sm text-fgMuted py-16">
          No creators on this platform yet.
        </div>
      ) : (
        <LeaderTable rows={rows} sortBy={sortBy} />
      )}
    </GlassCard>
  );
}

// --- Sort selector --------------------------------------------------------

interface SortSelectorProps {
  value: LbSort;
  onChange: (next: LbSort) => void;
}

function SortSelector({ value, onChange }: SortSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Sort by"
      className="inline-flex items-center gap-1 p-1 rounded-xl border border-borderGlass bg-customColor16"
    >
      {SORTS.map((s) => {
        const isActive = s.value === value;
        return (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(s.value)}
            className={clsx(
              'h-8 px-3 rounded-lg text-label whitespace-nowrap transition-colors duration-150 ease-out',
              isActive
                ? 'bg-customColor1 text-fg border border-borderGlassStrong'
                : 'text-fgMuted hover:text-fg'
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Table ----------------------------------------------------------------

interface LeaderTableProps {
  rows: LbRow[];
  sortBy: LbSort;
}

function LeaderTable({ rows, sortBy }: LeaderTableProps) {
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full border-collapse text-body-sm">
        <thead>
          <tr className="text-micro uppercase tracking-[0.04em] text-fgSubtle">
            <Th className="w-[44px] text-left pl-2">#</Th>
            <Th className="text-left">Creator</Th>
            <Th className="w-[72px] text-right">Platform</Th>
            <Th
              className="w-[110px] text-right"
              active={sortBy === 'followers'}
            >
              Followers
            </Th>
            <Th
              className="w-[110px] text-right pr-2"
              active={sortBy === 'viewsGained'}
            >
              Views 30D
            </Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <LeaderRow key={row.creatorId} row={row} sortBy={sortBy} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ThProps {
  className?: string;
  active?: boolean;
  children: React.ReactNode;
}

function Th({ className, active, children }: ThProps) {
  return (
    <th
      className={clsx(
        'h-10 font-medium border-b border-borderGlass',
        active ? 'text-fg' : 'text-fgSubtle',
        className
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

interface LeaderRowProps {
  row: LbRow;
  sortBy: LbSort;
}

function LeaderRow({ row, sortBy }: LeaderRowProps) {
  const name = row.displayName ?? row.creatorId;
  const platformKey = toPlatformKey(row.primaryPlatform);
  const Icon = platformKey ? PLATFORM_ICONS[platformKey] : null;
  const isWinner = row.rank === 1;
  const slug = handleToSlug(name);
  return (
    <tr className="relative border-b border-borderGlass last:border-b-0 transition-colors duration-150 ease-out hover:bg-white/[0.025] focus-within:bg-white/[0.04]">
      <td className="h-12 pl-2 font-mono tabular-nums">
        {/* Overlay anchor: absolute inset-0 inside tr (relative) covers whole row */}
        <Link
          href={`/creators/${slug}`}
          aria-label={`View ${name} profile`}
          className="absolute inset-0 outline-none focus-visible:ring-1 focus-visible:ring-brand-500 rounded-md z-0"
        />
        <span
          className={clsx(
            'relative z-10',
            isWinner ? 'text-brand font-semibold' : 'text-fgSubtle'
          )}
        >
          {String(row.rank).padStart(2, '0')}
        </span>
      </td>
      <td className="h-12 text-fg font-medium truncate max-w-[260px]">
        <span className="relative z-10">{name}</span>
      </td>
      <td className="h-12 text-right">
        <span className="relative z-10 inline-flex items-center justify-end gap-2 text-fgMuted">
          {Icon ? <Icon size={14} /> : null}
          <span className="text-caption hidden sm:inline">
            {platformKey ? PLATFORM_LABELS[platformKey] : '—'}
          </span>
        </span>
      </td>
      <NumCell active={sortBy === 'followers'}>
        {compactFormatter.format(row.followers)}
      </NumCell>
      <NumCell active={sortBy === 'viewsGained'} pr>
        {formatWindowedValue(row.insufficient, row.viewsGained, compactFormatter.format)}
      </NumCell>
    </tr>
  );
}

interface NumCellProps {
  active?: boolean;
  pr?: boolean;
  children: React.ReactNode;
}

function NumCell({ active, pr, children }: NumCellProps) {
  return (
    <td
      className={clsx(
        'h-12 text-right font-mono tabular-nums',
        active ? 'text-fg' : 'text-fgMuted',
        pr && 'pr-2'
      )}
    >
      {children}
    </td>
  );
}
