/**
 * Link ingest — resolve a platform video URL to downloadable bytes.
 *
 * NOT IN PRD 1 or PRD 3. PRD 1 §7 lists "Paste a TikTok / Instagram link
 * instead of uploading" as a Phase 3 item; this ships it early, alongside the
 * file upload rather than replacing it (owner decision, 2026-08-20).
 *
 * This is step 0 only. It puts bytes on disk and hands them to the EXISTING
 * pipeline: ffprobe, the bitrate ladder, the transcript leg and the vision call
 * are all untouched, and a link job is indistinguishable from an upload job
 * from `createJobFromFile` onward.
 *
 * No new third-party dependency — plain `fetch`, matching
 * `libraries/scrapers/src/tikhub-client.ts`, which is also where the
 * `mcp tool name -> REST path` convention is documented.
 *
 * Every endpoint below was probed live against real roster URLs on 2026-08-20.
 */

import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export const LINK_PLATFORMS = [
  'tiktok',
  'douyin',
  'instagram',
  'rednote',
  'facebook',
] as const;
export type LinkPlatform = (typeof LINK_PLATFORMS)[number];

/**
 * Why an ingest failed, BEFORE a job record exists. These are transport
 * failures on the route, not `JobErrorCode`s: PRD 1 §8.7.9's enum is closed at
 * eleven and `contract.ts` is C0's, so a link failure never invents a twelfth.
 */
export type IngestFailure =
  | 'unsupported_link'
  | 'facebook_unsupported'
  | 'rednote_needs_token'
  | 'not_a_video'
  | 'resolve_failed'
  | 'download_failed'
  | 'too_large';

export class IngestError extends Error {
  constructor(
    readonly failure: IngestFailure,
    message: string,
  ) {
    super(message);
    this.name = 'IngestError';
  }
}

const TIKHUB_BASE = 'https://api.tikhub.io';

function requireTikhubKey(): string {
  const key = process.env.TIKHUB_API_KEY;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new IngestError(
      'resolve_failed',
      'TIKHUB_API_KEY is not set — link ingest cannot resolve any platform.',
    );
  }
  return key.trim();
}

/** Host-based, so a query string or a tracking suffix never changes the answer. */
export function detectPlatform(raw: string): LinkPlatform | null {
  let host: string;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  // Short-link hosts matter: vm./vt.tiktok.com and v.douyin.com are what the
  // share sheet actually produces.
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok';
  if (host === 'douyin.com' || host.endsWith('.douyin.com')) return 'douyin';
  if (host === 'iesdouyin.com' || host.endsWith('.iesdouyin.com'))
    return 'douyin';
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) {
    return 'instagram';
  }
  if (host === 'xiaohongshu.com' || host.endsWith('.xiaohongshu.com')) {
    return 'rednote';
  }
  if (host === 'xhslink.com' || host.endsWith('.xhslink.com')) return 'rednote';
  if (host === 'facebook.com' || host.endsWith('.facebook.com'))
    return 'facebook';
  if (host === 'fb.watch' || host === 'fb.com') return 'facebook';
  return null;
}

async function tikhubGet(
  path: string,
  query: Record<string, string>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const key = requireTikhubKey();
  const url = new URL(`${TIKHUB_BASE}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
      signal,
    });
  } catch (cause) {
    throw new IngestError(
      'resolve_failed',
      `TikHub request failed: ${cause instanceof Error ? cause.message : cause}`,
    );
  }
  const raw = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new IngestError(
      'resolve_failed',
      `TikHub returned non-JSON (${response.status})`,
    );
  }
  if (typeof body !== 'object' || body === null) {
    throw new IngestError('resolve_failed', 'TikHub returned an unusable body');
  }
  const envelope = body as Record<string, unknown>;
  // TikHub signals a parameter/lookup failure as a `detail` object, not `code`.
  if (envelope.detail !== undefined) {
    throw new IngestError(
      'resolve_failed',
      `TikHub rejected the lookup: ${JSON.stringify(envelope.detail).slice(0, 300)}`,
    );
  }
  return envelope;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** First usable entry of a TikHub `url_list` mirror array. */
function firstUrl(node: unknown): string | null {
  const list = asRecord(node)?.url_list;
  if (!Array.isArray(list)) return null;
  for (const entry of list) {
    if (typeof entry === 'string' && entry.startsWith('http')) return entry;
  }
  return null;
}

export interface ResolvedVideo {
  platform: LinkPlatform;
  /** A direct, time-limited CDN URL. Downloaded immediately — these expire. */
  downloadUrl: string;
  /** Display-only, becomes `job.filename`. Never a filesystem path. */
  filename: string;
  /** Seconds, when the platform reported one. Advisory — ffprobe is the gate. */
  durationSeconds: number | null;
}

/** `data.aweme_detail.video` — the shape TikTok and Douyin share. */
function resolveAweme(
  envelope: Record<string, unknown>,
  platform: 'tiktok' | 'douyin',
): ResolvedVideo {
  const detail = asRecord(asRecord(envelope.data)?.aweme_detail);
  const video = asRecord(detail?.video);
  if (video === null) {
    throw new IngestError(
      'not_a_video',
      `${platform}: no video in the response`,
    );
  }
  // play_addr first, then the h264 variant, then download_addr.
  const downloadUrl =
    firstUrl(video.play_addr) ??
    firstUrl(video.play_addr_h264) ??
    firstUrl(video.download_addr);
  if (downloadUrl === null) {
    throw new IngestError(
      'not_a_video',
      `${platform}: no playable URL on the post`,
    );
  }
  const ms = video.duration;
  const id = typeof detail?.aweme_id === 'string' ? detail.aweme_id : 'video';
  return {
    platform,
    downloadUrl,
    filename: `${platform}-${id}.mp4`,
    durationSeconds:
      typeof ms === 'number' && Number.isFinite(ms) && ms > 0
        ? ms / 1000
        : null,
  };
}

async function resolveInstagram(
  url: string,
  signal: AbortSignal,
): Promise<ResolvedVideo> {
  // The `v1/` segment is load-bearing: /api/v1/instagram/fetch_post_by_url 404s.
  const envelope = await tikhubGet(
    '/api/v1/instagram/v1/fetch_post_by_url',
    { post_url: url },
    signal,
  );
  const data = asRecord(envelope.data);
  if (data?.is_video !== true) {
    throw new IngestError('not_a_video', 'instagram: that post is not a video');
  }
  let downloadUrl = typeof data.video_url === 'string' ? data.video_url : null;
  if (downloadUrl === null && Array.isArray(data.video_versions)) {
    const best = asRecord(data.video_versions[0]);
    if (typeof best?.url === 'string') downloadUrl = best.url;
  }
  if (downloadUrl === null) {
    throw new IngestError('not_a_video', 'instagram: no video URL on the post');
  }
  const code = typeof data.code === 'string' ? data.code : 'post';
  const seconds = data.video_duration;
  return {
    platform: 'instagram',
    downloadUrl,
    filename: `instagram-${code}.mp4`,
    durationSeconds:
      typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
        ? seconds
        : null,
  };
}

/**
 * RedNote needs BOTH the note id and `xsec_token`, a signed value that exists
 * only inside a share link copied from the app. A bare
 * xiaohongshu.com/explore/<id> URL cannot be resolved, and saying so precisely
 * beats a generic failure.
 */
async function resolveRednote(
  url: string,
  signal: AbortSignal,
): Promise<ResolvedVideo> {
  const parsed = new URL(url);
  const noteId = parsed.pathname.split('/').filter(Boolean).pop() ?? '';
  const token = parsed.searchParams.get('xsec_token');
  if (!/^[0-9a-f]{16,32}$/i.test(noteId) || token === null || token === '') {
    throw new IngestError(
      'rednote_needs_token',
      'rednote: the link carries no xsec_token',
    );
  }
  const envelope = await tikhubGet(
    '/api/v1/xiaohongshu/app_v2/get_video_note_detail',
    { note_id: noteId, xsec_token: token },
    signal,
  );
  const data = asRecord(envelope.data);
  const found = findFirstMp4(data);
  if (found === null) {
    throw new IngestError(
      'not_a_video',
      'rednote: no video stream on that note',
    );
  }
  return {
    platform: 'rednote',
    downloadUrl: found,
    filename: `rednote-${noteId}.mp4`,
    durationSeconds: null,
  };
}

/**
 * RedNote's stream block is nested differently per note type and this endpoint
 * has never been exercised against a real share link, so the first http(s) URL
 * that looks like a video stream is taken rather than a pinned path.
 * ponytail: replace with the exact path once one real link has been observed.
 */
function findFirstMp4(node: unknown, depth = 0): string | null {
  if (depth > 8) return null;
  if (typeof node === 'string') {
    return /^https?:\/\/[^\s]+\.(mp4|m3u8)(\?|$)/i.test(node) ? node : null;
  }
  if (Array.isArray(node)) {
    for (const entry of node) {
      const hit = findFirstMp4(entry, depth + 1);
      if (hit !== null) return hit;
    }
    return null;
  }
  const record = asRecord(node);
  if (record === null) return null;
  for (const value of Object.values(record)) {
    const hit = findFirstMp4(value, depth + 1);
    if (hit !== null) return hit;
  }
  return null;
}

/** Resolve any supported link to a direct, downloadable video URL. */
export async function resolveLink(
  rawUrl: string,
  signal: AbortSignal,
): Promise<ResolvedVideo> {
  const url = rawUrl.trim();
  const platform = detectPlatform(url);
  if (platform === null) {
    throw new IngestError('unsupported_link', 'not a recognised platform link');
  }
  if (platform === 'facebook') {
    // Verified 2026-08-20: TikHub documents 994 endpoints and NONE of them are
    // Facebook. The only path would be Bright Data, which needs its own
    // credentials and (per the FB scraper's own history) a real browser for
    // share links.
    throw new IngestError(
      'facebook_unsupported',
      'facebook: no resolver available',
    );
  }
  if (platform === 'rednote') return resolveRednote(url, signal);
  if (platform === 'instagram') return resolveInstagram(url, signal);
  const envelope = await tikhubGet(
    `/api/v1/${platform}/app/v3/fetch_one_video_by_share_url`,
    { share_url: url },
    signal,
  );
  return resolveAweme(envelope, platform);
}

/**
 * Stream the CDN response to disk, aborting the moment it exceeds `maxBytes` —
 * the cap is enforced DURING the download, never after, so a hostile or
 * mislabelled URL cannot fill the disk before anyone checks.
 *
 * A browser-ish User-Agent is sent because several of these CDNs 403 a bare
 * client; this is the same reason `/api/proxy-image` exists in the frontend.
 */
export async function downloadToFile(
  downloadUrl: string,
  destination: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<number> {
  let response: Response;
  try {
    response = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'video/*,*/*' },
      signal,
    });
  } catch (cause) {
    throw new IngestError(
      'download_failed',
      `fetch failed: ${cause instanceof Error ? cause.message : cause}`,
    );
  }
  if (!response.ok || response.body === null) {
    throw new IngestError('download_failed', `CDN answered ${response.status}`);
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new IngestError(
      'too_large',
      `content-length ${declared} over the cap`,
    );
  }

  let written = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      written += chunk.byteLength;
      if (written > maxBytes) {
        throw new IngestError('too_large', `exceeded the cap mid-download`);
      }
      controller.enqueue(chunk);
    },
  });

  try {
    await streamPipeline(
      Readable.fromWeb(
        response.body.pipeThrough(counter) as Parameters<
          typeof Readable.fromWeb
        >[0],
      ),
      createWriteStream(destination),
    );
  } catch (cause) {
    await fs.rm(destination, { force: true }).catch(() => undefined);
    if (cause instanceof IngestError) throw cause;
    throw new IngestError(
      'download_failed',
      cause instanceof Error ? cause.message : String(cause),
    );
  }

  if (written === 0) {
    await fs.rm(destination, { force: true }).catch(() => undefined);
    throw new IngestError('download_failed', 'the CDN returned an empty body');
  }
  return written;
}
