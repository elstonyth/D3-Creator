/**
 * Snapshot writes — called by the daily cron and the manual scrape trigger.
 *
 * Uniqueness is enforced by the unique indexes from migration
 * 20260527135229_init_v1_core_tables:
 *   profile_snapshot_unique_day  (profile_id, captured_date)
 *   post_snapshot_unique_day     (profile_id, external_post_id, captured_date)
 *
 * Both writers UPSERT with onConflict so re-running on the same day is
 * idempotent (the latest values win — last write wins, intentional).
 */

import { getSupabaseAdmin } from './supabase-server';
import { avatarUrlFromRaw, persistAvatarForProfile, withPersistedAvatar } from './media';
import type { ProfileRow, ScrapeStatus } from './types';

/** Shape returned by the scraper layer (mirror of @d3/scrapers NormalizedProfileSnapshot). */
export interface ProfileSnapshotInput {
  followers: number | null;
  following: number | null;
  total_posts: number | null;
  total_views: number | null;
  total_likes: number | null;
  raw: unknown;
}

/** Shape returned by the scraper layer (mirror of NormalizedPostSnapshot). */
export interface PostSnapshotInput {
  external_post_id: string;
  posted_at: string | null;
  caption_excerpt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  media_url: string | null;
  content_type: string;
  raw: unknown;
}

/** Profiles the cron should attempt today. */
export async function listScrapeableProfiles(): Promise<ProfileRow[]> {
  const sb = getSupabaseAdmin();
  // Skip statuses that require user action to re-enable. 'private' /
  // 'not_found' / 'handle_changed' all need a human; the rest are fair game.
  const res = await sb
    .from('profile')
    .select('*')
    .not('scrape_status', 'in', '("private","not_found","handle_changed")')
    .order('created_at', { ascending: true });
  if (res.error) {
    throw new Error(`listScrapeableProfiles failed: ${res.error.message}`);
  }
  return (res.data ?? []) as ProfileRow[];
}

/**
 * Idempotent UPSERT keyed on (profile_id, captured_date).
 * Returns the count of rows actually written so callers can report real
 * observability data instead of an assumed 1.
 */
export async function upsertProfileSnapshot(
  profileId: string,
  snap: ProfileSnapshotInput,
): Promise<{ written: number }> {
  const sb = getSupabaseAdmin();

  // Persist the avatar to Storage (best-effort) so it survives CDN signature
  // expiry — same rationale as post media. On success we (a) point the
  // creator's `avatar_url` column at the permanent Storage URL — that column is
  // what the windowed RPC, admin views, and public creator page read, so this
  // is what removes the proxy hop + expired-CDN 502 — and (b) rewrite the
  // avatar field INSIDE `raw` too, so raw-based readers also get the permanent
  // URL. `onlyIfUnpersisted` keeps a daily scrape from clobbering the backfill's
  // best (highest-follower) pick. A failure leaves the original CDN URL (still
  // valid for hours/days; the next daily scrape/backfill re-persists it). The
  // scrape NEVER fails because an avatar couldn't copy.
  let raw = snap.raw;
  const rawAvatar = avatarUrlFromRaw(raw);
  if (rawAvatar) {
    try {
      const { persisted } = await persistAvatarForProfile(profileId, rawAvatar, true);
      if (persisted && persisted !== rawAvatar) raw = withPersistedAvatar(raw, persisted);
    } catch {
      // Keep the original raw (CDN avatar) — healed on the next scrape/backfill.
    }
  }

  const res = await sb
    .from('profile_snapshot')
    .upsert(
      {
        profile_id: profileId,
        followers: snap.followers,
        following: snap.following,
        total_posts: snap.total_posts,
        total_views: snap.total_views,
        total_likes: snap.total_likes,
        raw,
      },
      { onConflict: 'profile_id,captured_date', ignoreDuplicates: false },
    )
    .select('id');
  if (res.error) {
    throw new Error(`upsertProfileSnapshot failed: ${res.error.message}`);
  }
  return { written: res.data?.length ?? 0 };
}

/**
 * Idempotent batch UPSERT of post snapshots. Returns counts for observability.
 * Empty input is a no-op (some platforms may produce 0 posts).
 */
export async function upsertPostSnapshots(
  profileId: string,
  posts: PostSnapshotInput[],
): Promise<{ written: number }> {
  if (posts.length === 0) return { written: 0 };
  const sb = getSupabaseAdmin();
  // De-duplicate by external_post_id before the batch UPSERT. Every row shares
  // the same (profile_id, captured_date), so two rows with the same
  // external_post_id hit the same ON CONFLICT target and Postgres aborts the
  // entire statement with "ON CONFLICT DO UPDATE command cannot affect row a
  // second time" (21000) — losing every post for the profile that day. Feeds
  // routinely repeat a post (a pinned item also appearing in the timeline).
  // Last write wins, matching this writer's documented idempotent intent.
  const byId = new Map<string, PostSnapshotInput>();
  for (const p of posts) byId.set(p.external_post_id, p);
  const rows = [...byId.values()].map((p) => ({
    profile_id: profileId,
    external_post_id: p.external_post_id,
    posted_at: p.posted_at,
    caption_excerpt: p.caption_excerpt,
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    media_url: p.media_url,
    content_type: p.content_type,
    raw: p.raw,
  }));
  const res = await sb
    .from('post_snapshot')
    .upsert(rows, {
      onConflict: 'profile_id,external_post_id,captured_date',
      ignoreDuplicates: false,
    })
    .select('id');
  if (res.error) {
    throw new Error(`upsertPostSnapshots failed: ${res.error.message}`);
  }
  return { written: res.data?.length ?? 0 };
}

/** Update profile.scrape_status + last_scraped_at after a scrape attempt. */
export async function setProfileStatus(
  profileId: string,
  status: ScrapeStatus,
  scrapedAt: Date = new Date(),
): Promise<void> {
  const sb = getSupabaseAdmin();
  const res = await sb
    .from('profile')
    .update({
      scrape_status: status,
      last_scraped_at: scrapedAt.toISOString(),
    })
    .eq('id', profileId);
  if (res.error) {
    throw new Error(`setProfileStatus failed: ${res.error.message}`);
  }
}
