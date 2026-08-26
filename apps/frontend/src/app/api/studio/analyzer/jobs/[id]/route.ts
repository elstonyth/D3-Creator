/**
 * GET /api/studio/analyzer/jobs/{id} — poll one job.
 *
 * PRD 1 §8.8.3 step 2 and §8.8.7's worker-status → browser-status table. The
 * client island polls this every 3 s; the report page does not (§8.8.6).
 */

import { NextResponse } from 'next/server';

import {
  getAuthContext,
  isStudioMember,
  type AuthContext,
} from '../../../../../../lib/auth';
import { isUuid } from '../../../../../../lib/ids';
import { toBrowserJob } from '../../../../../../lib/analyzer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, error: string): Response {
  return NextResponse.json({ ok: false, error }, { status });
}

const FORWARDED = new Set([400, 404, 413, 415]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  // The single order for every handler: 503 → gate → isUuid(id) → fetch. A
  // malformed id on an unconfigured deployment answers 503, never 400; an
  // anonymous caller with a malformed id gets 401, never 400.
  const base = (process.env.ANALYZER_SERVICE_URL ?? '').replace(/\/+$/, '');
  if (base === '') return jsonError(503, 'analyzer not configured');

  let auth: AuthContext | null;
  try {
    auth = await getAuthContext();
  } catch {
    return jsonError(500, 'internal error');
  }
  if (!auth) return jsonError(401, 'unauthorized');
  if (!isStudioMember(auth)) return jsonError(403, 'forbidden');

  const { id } = await context.params;
  if (!isUuid(id)) return jsonError(400, 'invalid job id');

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/api/result/${encodeURIComponent(id)}`, {
      headers: {
        authorization: `Bearer ${process.env.ANALYZER_SERVICE_TOKEN ?? ''}`,
        'x-d3-user-id': auth.userId,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'TimeoutError') {
      return jsonError(504, 'analyzer timed out');
    }
    console.error('[studio/analyzer] poll fetch rejected', cause);
    return jsonError(502, 'analyzer unreachable');
  }

  const raw = await upstream.text();
  if (upstream.ok) {
    let job: unknown;
    try {
      job = JSON.parse(raw);
    } catch (cause) {
      console.error('[studio/analyzer] poll body did not parse', cause);
      return jsonError(500, 'internal error');
    }
    return NextResponse.json(
      {
        ok: true,
        job: toBrowserJob(job as Parameters<typeof toBrowserJob>[0]),
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
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

  console.error(
    `[studio/analyzer] worker answered ${upstream.status}: ${raw.slice(0, 500)}`,
  );
  return jsonError(500, 'internal error');
}
