/**
 * GET /api/studio/analyzer/health — is this deployment able to run a job?
 *
 * PRD 1 §8.4, phase 2. Admin-only (it names a filesystem path), never cached.
 * Booleans and the ffmpeg version line; never a model id, never a key.
 * `https` is the one that matters on Vercel: the upload path hands ffmpeg a
 * signed Storage URL, and a build without TLS support fails every upload as
 * `no_video_stream`.
 */

import { NextResponse } from 'next/server';

import { HEALTH_PROBE_TIMEOUT_MS } from '@d3/analyzer/config';
import { describeBinary } from '@d3/analyzer/ffmpeg';

import { ffmpegBinary } from '../../../../../lib/analyzer-run';
import { getAuthContext } from '../../../../../lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const auth = await getAuthContext().catch(() => null);
  if (!auth || auth.role !== 'admin') {
    return NextResponse.json(
      { ok: false, error: 'forbidden' },
      { status: 403 },
    );
  }

  const bin = await ffmpegBinary();
  const ffmpeg = await describeBinary(bin, HEALTH_PROBE_TIMEOUT_MS);
  const modelsConfigured =
    Boolean(process.env.ANALYZER_MODEL) &&
    Boolean(process.env.TRANSCRIBE_MODEL);
  const ok = ffmpeg.ok && ffmpeg.https && modelsConfigured;
  return NextResponse.json(
    {
      ok,
      ffmpeg: { path: bin, ...ffmpeg },
      models_configured: modelsConfigured,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
