/**
 * POST /api/studio/analyzer/jobs — upload a video and create a job.
 *
 * PRD 1 §8.8.3. The browser never talks to the analyzer service: this handler
 * streams the multipart body through to the worker's `POST /api/upload`,
 * server-side, and wraps its reply ONCE.
 *
 * Phase 1 is an explicit, scoped exemption from §8.2's "never through an API
 * function": there is no object storage in the loop yet and the Next server is a
 * long-lived local process, not a serverless function. The exemption ends the
 * moment the analyzer is hosted, and this route is DELETED, not shrunk (§8.8.10).
 */

import { NextResponse } from 'next/server';

import { MAX_UPLOAD_BYTES } from '@d3/analyzer';

import {
  getAuthContext,
  isStudioMember,
  type AuthContext,
} from '../../../../../lib/auth';
import { checkRateLimit } from '../../../../../lib/rate-limit';
import { toBrowserJob } from '../../../../../lib/analyzer';

export const runtime = 'nodejs'; // duplex request streaming needs the Node runtime
export const dynamic = 'force-dynamic'; // auth-dependent, never cached

function jsonError(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

/** §8.8.7. Only these four are forwarded verbatim — the worker is the only side
 *  that can produce their diagnostic (ffprobe, duration, multer size, extension). */
const FORWARDED = new Set([400, 404, 413, 415]);
/** The link path adds 502: "could not read that link" is the worker's to say. */
const LINK_FORWARDED = new Set([400, 413, 502]);

export async function POST(request: Request): Promise<Response> {
  // The 503 is FIRST because an unconfigured deployment has no upload to
  // throttle: with the variable unset, the eleventh upload in an hour is 503,
  // not 429.
  const base = (process.env.ANALYZER_SERVICE_URL ?? '').replace(/\/+$/, '');
  if (base === '') return jsonError(503, 'analyzer not configured');

  let auth: AuthContext | null;
  try {
    auth = await getAuthContext();
  } catch {
    return jsonError(500, 'internal error'); // getAuthContext() re-throws by design
  }
  if (!auth) return jsonError(401, 'unauthorized');
  if (!isStudioMember(auth)) return jsonError(403, 'forbidden');

  // The limiter is what stops a 3 GB body being streamed at all, so a throttled
  // caller gets 429, not 413.
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  for (const [prefix, key] of [
    ['analyzer-upload-user', auth.userId],
    ['analyzer-upload-ip', ip],
  ] as const) {
    const limit = await checkRateLimit({
      prefix,
      key,
      tokens: 10,
      window: '1 h',
    });
    if (!limit.ok) {
      return NextResponse.json(
        { ok: false, error: 'too many uploads' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
      );
    }
  }

  const contentType = request.headers.get('content-type') ?? '';
  const isMultipart = contentType
    .toLowerCase()
    .startsWith('multipart/form-data');
  const isJson = contentType.toLowerCase().startsWith('application/json');
  if (!isMultipart && !isJson) {
    return jsonError(400, 'no video file');
  }

  // The link path (not in PRD 1; owner decision 2026-08-20). A JSON body is
  // forwarded to the worker's /api/ingest, which resolves the URL, downloads
  // the bytes and then joins the SAME job-creation path as an upload.
  if (isJson) {
    const raw = await request.text();
    let upstreamLink: Response;
    try {
      upstreamLink = await fetch(`${base}/api/ingest`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${process.env.ANALYZER_SERVICE_TOKEN ?? ''}`,
          'x-d3-user-id': auth.userId,
        },
        body: raw,
        // Resolve + download of a 5-minute video takes as long as it takes;
        // the worker arms its own INGEST_BUDGET_MS deadline.
        cache: 'no-store',
      });
    } catch (cause) {
      console.error('[studio/analyzer] ingest fetch rejected', cause);
      return jsonError(502, 'analyzer unreachable');
    }
    const linkBody = await upstreamLink.text();
    if (upstreamLink.ok) {
      let job: unknown;
      try {
        job = JSON.parse(linkBody);
      } catch (cause) {
        console.error('[studio/analyzer] ingest body did not parse', cause);
        return jsonError(500, 'internal error');
      }
      return NextResponse.json(
        {
          ok: true,
          job: toBrowserJob(job as Parameters<typeof toBrowserJob>[0]),
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    // 400 / 413 / 502 carry a diagnostic only the worker can produce (which
    // platform, missing token, CDN refusal), so they forward verbatim. The
    // client switches on the string; it never renders it (§6.3).
    if (LINK_FORWARDED.has(upstreamLink.status)) {
      return new Response(linkBody, {
        status: upstreamLink.status,
        headers: {
          'content-type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }
    console.error(
      `[studio/analyzer] worker ingest answered ${upstreamLink.status}: ${linkBody.slice(0, 500)}`,
    );
    return jsonError(500, 'internal error');
  }

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return jsonError(413, 'file is over the 2 GB limit');
  }

  let upstream: Response;
  try {
    // No timeout on this fetch, deliberately: a 2 GB local stream takes minutes.
    upstream = await fetch(`${base}/api/upload`, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        authorization: `Bearer ${process.env.ANALYZER_SERVICE_TOKEN ?? ''}`,
        'x-d3-user-id': auth.userId,
      },
      body: request.body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
  } catch (cause) {
    console.error('[studio/analyzer] upload fetch rejected', cause);
    return jsonError(502, 'analyzer unreachable');
  }

  const raw = await upstream.text();
  if (upstream.ok) {
    let job: unknown;
    try {
      job = JSON.parse(raw);
    } catch (cause) {
      // NOT 502 — the 502 row requires the fetch itself to have rejected.
      console.error('[studio/analyzer] upload body did not parse', cause);
      return jsonError(500, 'internal error');
    }
    return NextResponse.json(
      {
        ok: true,
        job: toBrowserJob(job as Parameters<typeof toBrowserJob>[0]),
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (FORWARDED.has(upstream.status)) {
    return new Response(raw, {
      status: upstream.status,
      headers: {
        'content-type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  // A worker 401 is a misconfigured ANALYZER_SERVICE_TOKEN; forwarding it would
  // tell a signed-in user to sign in again for a server-side config fault.
  console.error(
    `[studio/analyzer] worker answered ${upstream.status}: ${raw.slice(0, 500)}`,
  );
  return jsonError(500, 'internal error');
}
