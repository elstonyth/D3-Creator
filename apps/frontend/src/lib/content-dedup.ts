/**
 * Cross-platform content de-duplication for the leaderboard content grids.
 *
 * A creator who cross-posts one reel to IG/TikTok/FB/Douyin produces a separate
 * row per platform (each has its own external_post_id), so the same content
 * would otherwise occupy several leaderboard slots. We identify "same content"
 * by (creator_id, video duration, caption hook) — the duration is identical
 * across platforms to the millisecond and the first caption line (the hook) is
 * copy-pasted, while only the hashtag tail / body diverges per platform and
 * posted_at can straddle midnight. Duration alone over-merges (different videos
 * routinely share an exact-second length); the hook disambiguates them. See
 * migration 20260606130046_post_snapshot_duration_seconds.
 */

import type { TopContentRow } from './metrics-windowed';

/** First caption line, de-hashtagged + whitespace-normalized — the per-video
 *  "hook" used in the content key. Robust to the hashtag tail / body diverging
 *  per platform; '' when there is no usable text. */
function captionKey(caption: string | null): string {
  if (!caption) return '';
  return caption.split('\n')[0].split('#')[0].replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Stable identity for a piece of content across platforms: same creator + same
 * whole-second duration + same caption hook => same video. Both signals are
 * required — duration alone over-merges (different videos share an exact-second
 * length) and the hook alone can merge templated intros. Captionless videos fall
 * back to a per-row key (never merge); posts with no duration (images) key on the
 * hook alone, else a per-row key — so nothing is ever wrongly fused.
 */
export function contentKey(r: TopContentRow): string {
  const hook = captionKey(r.captionExcerpt);
  if (r.durationSeconds != null) {
    return hook
      ? `${r.creatorId}|d${r.durationSeconds}|${hook}`
      : `${r.creatorId}|d${r.durationSeconds}|u${r.profileId}|${r.externalPostId}`;
  }
  return hook ? `${r.creatorId}|c${hook}` : `${r.creatorId}|u${r.profileId}|${r.externalPostId}`;
}

/**
 * Collapse cross-platform duplicates to one row per content group — the copy
 * with the highest `metric` — tagged with the other platforms it ran on
 * (`alsoOn`) for the UI. Metric-aware on purpose: a video's most-viewed and
 * most-engaging copies can live on different platforms, so the by-views and
 * by-interactions grids must each collapse with their own metric.
 */
export function collapseByContent(
  rows: TopContentRow[],
  metric: (r: TopContentRow) => number,
): TopContentRow[] {
  const groups = new Map<string, TopContentRow[]>();
  for (const r of rows) {
    const k = contentKey(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }

  const out: TopContentRow[] = [];
  for (const group of groups.values()) {
    let best = group[0];
    for (const r of group) {
      const delta = metric(r) - metric(best);
      // Tie-break on raw views so the pick is deterministic regardless of input order.
      if (delta > 0 || (delta === 0 && r.currentViews > best.currentViews)) best = r;
    }
    const alsoOn = [
      ...new Set(group.filter((r) => r.platform !== best.platform).map((r) => r.platform)),
    ];
    out.push(alsoOn.length ? { ...best, alsoOn } : best);
  }
  return out;
}
