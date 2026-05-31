/**
 * Post-media persistence.
 *
 * Social-CDN cover-image URLs (cdninstagram / fbcdn / tiktokcdn) are signed
 * with short-lived tokens — TikTok ~24h, Meta ~3 days — and return 403 once
 * the signature expires. Storing those raw URLs in post_snapshot.media_url
 * therefore guarantees broken thumbnails as soon as the window lapses.
 *
 * Fix: copy each post's cover image into our own PUBLIC Storage bucket AT
 * SCRAPE TIME, while the signature is still valid, and store that permanent
 * Supabase URL instead of the ephemeral CDN URL.
 *
 * Best-effort + time-bounded by design:
 *   - A fetch/upload failure leaves that post's media_url as the original CDN
 *     URL (still valid for hours/days; healed later by the media backfill).
 *   - A per-profile wall-clock deadline stops new fetches so a batch of slow
 *     or dead images can never blow the cron's function budget.
 *   - The scrape itself NEVER fails because an image couldn't be copied.
 */

import { getSupabaseAdmin } from './supabase-server';

export const POST_MEDIA_BUCKET = 'post-media';

/** Per-image header-receipt timeout (mirrors the image proxy's 8s ceiling, tightened). */
const FETCH_TIMEOUT_MS = 6000;
/** Concurrent image copies per profile. */
const CONCURRENCY = 8;
/**
 * Default per-profile wall-clock ceiling for the whole persist step. Past this
 * we stop STARTING new fetches and leave the remaining posts on their
 * (still-valid) CDN URLs — the backfill picks them up. Exported so the daily
 * cron can cap it further against the function's remaining 300s budget.
 */
export const POST_MEDIA_DEADLINE_MS = 30_000;

/**
 * Hard cap on a single image we'll buffer in memory before upload. Thumbnails
 * are tens of KB; this guards against a hostile/oversized upstream response
 * OOMing the function. Enforced via content-length AND a streaming byte count
 * (a lying or absent content-length can't bypass it).
 */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * SSRF allowlist. media_url comes from third-party scraper responses (TikHub /
 * BrightData), so it's NOT fully trusted — a compromised/crafted upstream could
 * inject an internal URL. Only fetch from the known social-CDN suffixes (the
 * same set the image proxy permits). Anything else is left on its original URL.
 */
const ALLOWED_IMAGE_HOST_SUFFIXES = [
  '.cdninstagram.com',
  '.fbcdn.net',
  '.tiktokcdn.com',
  '.tiktokcdn-us.com',
  '.muscdn.com',
  '.xhscdn.com',
  '.rednotecdn.com',
  '.douyinpic.com',
];

function isAllowedImageHost(host: string): boolean {
  const lower = host.toLowerCase();
  return ALLOWED_IMAGE_HOST_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

const PROXY_UA =
  'Mozilla/5.0 (compatible; D3CreatorImageProxy/0.1; +https://d3-creator.vercel.app)';

/** Map an image content-type to a file extension (cosmetic — the stored
 *  content-type is what governs serving). Defaults to jpg. */
function extFromContentType(contentType: string): string {
  const t = contentType.toLowerCase();
  if (t.includes('png')) return 'png';
  if (t.includes('webp')) return 'webp';
  if (t.includes('gif')) return 'gif';
  return 'jpg';
}

/** Keep Storage object keys to a safe charset (post ids are normally
 *  alphanumeric, but never trust upstream). */
function sanitizeKeySegment(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);
}

/** True when the URL already points at our own Storage (nothing to copy). */
function isAlreadyPersisted(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith('.supabase.co');
  } catch {
    return false;
  }
}

/**
 * Read a response body into memory, aborting if it exceeds maxBytes. Rejects
 * up front on an oversized content-length, then counts streamed bytes so a
 * missing or dishonest content-length can't smuggle past the cap.
 */
async function readBodyCapped(
  res: Response,
  maxBytes: number,
): Promise<ArrayBuffer | null> {
  const lenHeader = res.headers.get('content-length');
  if (lenHeader) {
    const len = Number(lenHeader);
    if (Number.isFinite(len) && len > maxBytes) return null;
  }
  if (!res.body) {
    const buf = await res.arrayBuffer();
    return buf.byteLength > maxBytes ? null : buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/**
 * Fetch image bytes server-side (no Referer — the same trick the image proxy
 * uses to dodge CDN Referer gates). Returns null on any failure / non-image.
 * Validates the host against the SSRF allowlist and caps the body size.
 */
async function fetchImage(
  url: string,
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (!isAllowedImageHost(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': PROXY_UA, Accept: 'image/*,*/*;q=0.8' },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) return null;
    const body = await readBodyCapped(res, MAX_IMAGE_BYTES);
    if (!body || body.byteLength === 0) return null;
    return { body, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Copy one post image into Storage and return its permanent public URL.
 * Returns the source URL unchanged if it's already a Storage URL, or null if
 * the bytes couldn't be fetched/uploaded.
 */
export async function persistPostMedia(
  profileId: string,
  externalPostId: string,
  sourceUrl: string,
): Promise<string | null> {
  if (isAlreadyPersisted(sourceUrl)) return sourceUrl;

  const img = await fetchImage(sourceUrl);
  if (!img) return null;

  const sb = getSupabaseAdmin();
  const key = `${sanitizeKeySegment(profileId)}/${sanitizeKeySegment(
    externalPostId,
  )}.${extFromContentType(img.contentType)}`;

  const up = await sb.storage.from(POST_MEDIA_BUCKET).upload(key, img.body, {
    contentType: img.contentType,
    upsert: true, // re-scrape overwrites with fresh bytes — idempotent
  });
  if (up.error) {
    console.error('[media] upload failed', key, up.error.message);
    return null;
  }

  const pub = sb.storage.from(POST_MEDIA_BUCKET).getPublicUrl(key);
  return pub.data.publicUrl ?? null;
}

/**
 * Rewrite each post's media_url to a permanent Storage URL — best-effort and
 * time-bounded. Posts without media, already-persisted media, or whose copy
 * fails / times out keep their original media_url. Returns NEW post objects
 * (does not mutate the input).
 */
export async function persistMediaForPosts<
  T extends { external_post_id: string; media_url: string | null },
>(profileId: string, posts: T[], deadlineMs: number = POST_MEDIA_DEADLINE_MS): Promise<T[]> {
  const out = posts.slice();
  const startedAt = Date.now();
  let next = 0;

  async function worker(): Promise<void> {
    while (next < out.length) {
      const idx = next++;
      // Budget spent (or zero) — leave this and the rest on their (still-valid)
      // CDN URLs. >= so a deadline of 0 short-circuits immediately.
      if (Date.now() - startedAt >= deadlineMs) return;
      const post = out[idx];
      const src = post.media_url;
      if (!src || !src.startsWith('http')) continue;
      const permanent = await persistPostMedia(profileId, post.external_post_id, src);
      if (permanent && permanent !== src) {
        out[idx] = { ...post, media_url: permanent };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(CONCURRENCY, out.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}
