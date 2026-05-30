/**
 * Phase 0 — typed access to the windowed-metrics SQL functions.
 *
 * All metric math lives in the Postgres functions creator_metrics_windowed /
 * top_content_windowed (migration 20260530000000_windowed_metrics_rpcs.sql).
 * This module is a thin pass-through: call the RPC, return typed rows, and
 * route post thumbnails through /api/proxy-image. No business logic here.
 *
 * Consumers inject a SupabaseClient so the right key is used:
 *   - public pages  -> getSupabaseRead() (anon, public-RLS)
 *   - admin / /me   -> their cookie-aware or service-role client
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseRead } from './supabase-server';

/** Time window for every windowed metric. */
export type MetricWindow = '7d' | '30d' | '90d' | 'lifetime';

/** One row from creator_metrics_windowed. */
export interface CreatorMetricWindowRow {
  creatorId: string;
  displayName: string | null;
  avatarUrl: string | null;
  primaryPlatform: string | null;
  followers: number;
  followersDelta: number;
  viewsGained: number;
  /** Ratio (e.g. 0.0643 = 6.43%). null when no qualifying posts. */
  engagement: number | null;
  postCount: number;
  /** True when there is no follower baseline in the window yet (no delta).
   *  Drives the "Building history…" UI state in later phases. */
  insufficient: boolean;
}

/** One row from top_content_windowed. */
export interface TopContentRow {
  externalPostId: string;
  profileId: string;
  creatorId: string;
  creatorName: string | null;
  platform: string;
  handle: string | null;
  captionExcerpt: string | null;
  /** Already routed through /api/proxy-image; null when no media. */
  thumbnailUrl: string | null;
  postedAt: string | null;
  viewsGained: number;
  currentViews: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface WindowedMetricsOpts {
  /** Defaults to the anon read client. Inject a different client for admin/me. */
  client?: SupabaseClient;
  creatorIds?: string[];
  profileIds?: string[];
}

export interface TopContentOpts extends WindowedMetricsOpts {
  /** Max rows to return. Defaults to 20. */
  limit?: number;
}

/** Route a social-CDN URL through our same-origin proxy. Null passes through. */
function viaProxy(url: string | null): string | null {
  if (!url || !url.startsWith('http')) return null;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  // Guard against a malformed RPC value (e.g. a non-numeric string) yielding
  // NaN, which would otherwise silently corrupt every downstream sum/sort.
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Per-creator windowed metrics. Returns [] on error (logged) so Server
 * Components can fall back to an empty state instead of throwing.
 */
export async function getCreatorMetricsWindowed(
  window: MetricWindow,
  opts: WindowedMetricsOpts = {},
): Promise<CreatorMetricWindowRow[]> {
  const sb = opts.client ?? getSupabaseRead();
  const { data, error } = await sb.rpc('creator_metrics_windowed', {
    p_window: window,
    p_creator_ids: opts.creatorIds ?? null,
    p_profile_ids: opts.profileIds ?? null,
  });
  if (error) {
    console.error('[metrics-windowed] creator_metrics_windowed', error);
    return [];
  }
  return (data ?? []).map(
    (r: Record<string, unknown>): CreatorMetricWindowRow => ({
      creatorId: r.creator_id as string,
      displayName: (r.display_name as string | null) ?? null,
      avatarUrl: (r.avatar_url as string | null) ?? null,
      primaryPlatform: (r.primary_platform as string | null) ?? null,
      followers: toNum(r.followers),
      followersDelta: toNum(r.followers_delta),
      viewsGained: toNum(r.views_gained),
      engagement: r.engagement == null ? null : toNum(r.engagement),
      postCount: toNum(r.post_count),
      insufficient: Boolean(r.insufficient),
    }),
  );
}

/**
 * Top posts by views_gained in the window. Returns [] on error (logged).
 */
export async function getTopContentWindowed(
  window: MetricWindow,
  opts: TopContentOpts = {},
): Promise<TopContentRow[]> {
  const sb = opts.client ?? getSupabaseRead();
  const { data, error } = await sb.rpc('top_content_windowed', {
    p_window: window,
    p_limit: opts.limit ?? 20,
    p_creator_ids: opts.creatorIds ?? null,
    p_profile_ids: opts.profileIds ?? null,
  });
  if (error) {
    console.error('[metrics-windowed] top_content_windowed', error);
    return [];
  }
  return (data ?? []).map(
    (r: Record<string, unknown>): TopContentRow => ({
      externalPostId: r.external_post_id as string,
      profileId: r.profile_id as string,
      creatorId: r.creator_id as string,
      creatorName: (r.creator_name as string | null) ?? null,
      platform: r.platform as string,
      handle: (r.handle as string | null) ?? null,
      captionExcerpt: (r.caption_excerpt as string | null) ?? null,
      thumbnailUrl: viaProxy((r.media_url as string | null) ?? null),
      postedAt: (r.posted_at as string | null) ?? null,
      viewsGained: toNum(r.views_gained),
      currentViews: toNum(r.current_views),
      likes: toNum(r.likes),
      comments: toNum(r.comments),
      shares: toNum(r.shares),
    }),
  );
}
