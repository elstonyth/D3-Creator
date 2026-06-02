-- Avatar persistence (mirror of post_snapshot.media_url).
--
-- Social-CDN avatar URLs are signed with short-lived tokens and 403/expire,
-- so avatars served via /api/proxy-image break once the signature lapses. We
-- now copy each profile's avatar into the public `post-media` Storage bucket
-- (key avatars/<profileId>.<ext>) AT SCRAPE TIME and store the resulting
-- permanent URL here. /api/admin/backfill-avatars heals pre-existing rows.
--
-- Additive + nullable → safe on live data per CLAUDE.md deploy rules. No new
-- bucket: reuses the existing public `post-media` bucket.
alter table public.profile_snapshot
  add column if not exists avatar_url text;
