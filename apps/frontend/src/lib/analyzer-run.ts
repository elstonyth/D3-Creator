/**
 * apps/frontend/src/lib/analyzer-run.ts — server-only.
 *
 * The four pipeline steps (PRD 1 §6, §8.5, §8.7), running INSIDE the Vercel
 * function that accepted the job. Phase 1 ran this on a laptop behind a queue;
 * here every job is its own invocation, kicked off with Next's `after()` once
 * the 202 is on the wire, and bounded by the route's `maxDuration`.
 *
 * Ported from the phase-1 `pipeline.ts` + `queue.ts`. The step order, the one
 * shared FFmpeg deadline, the single re-encode, "the poster never fails a
 * job", the transcript rules and the parse rules are all unchanged. What
 * changed is where bytes live: scratch files in the OS temp dir (deleted in
 * `finally`, because a warm instance serves many jobs), outputs in Storage.
 *
 * `runJob` NEVER REJECTS. Every outcome is a terminal row, with one exception
 * inherited from phase 1: when the job clock fired, the terminal write is the
 * runner's, not the pipeline's.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  chatCompletion,
  extractJsonObject,
  OpenRouterAbortedError,
  OpenRouterConfigError,
  OpenRouterRequestError,
  OpenRouterTimeoutError,
  requireModelId,
  transcribeAudio,
  type OpenRouterCallUsage,
} from '@d3/openrouter';
import {
  MAX_COMPRESSED_BYTES,
  type JobErrorCode,
  type TranscriptSegment,
} from '@d3/analyzer';
import {
  buildAnalysisResult,
  normaliseTranscript,
} from '@d3/analyzer/analysis';
import { FFMPEG_BUDGET_MS } from '@d3/analyzer/config';
import {
  buildAudioArgs,
  buildCompressArgs,
  buildThumbnailArgs,
  encodeSettingsFor,
  pickLadderRow,
  retryEncodeSettings,
  runFfmpeg,
} from '@d3/analyzer/ffmpeg';
import { buildAnalysisMessages, parseAnalysisReply } from '@d3/analyzer/prompt';

import {
  RUN_BUDGET_MS,
  mediaPath,
  patchJob,
  readJob,
  removeObjects,
  uploadObject,
} from './analyzer-store';

const nowIso = () => new Date().toISOString();

// ───────────────────────── the ffmpeg binary ─────────────────────────

/**
 * FFmpeg ships as `@ffmpeg-installer/<platform>-<arch>` — a static binary in a
 * plain npm tarball, no postinstall (pnpm 10 skips build scripts it was not
 * told about, so `ffmpeg-static` would silently install nothing). Traced into
 * the function by next.config.js `outputFileTracingIncludes`.
 *
 * The lookup walks up from the working directory: the pnpm layout puts the
 * package under the app's node_modules as a symlink into the root `.pnpm`
 * store, and the bundler may keep either. `FFMPEG_PATH` wins when set.
 */
const FFMPEG_PKG = `@ffmpeg-installer/${process.platform}-${process.arch}`;
const FFMPEG_FILE = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

let located: Promise<string> | null = null;

export function ffmpegBinary(): Promise<string> {
  located ??= locateFfmpeg();
  return located;
}

async function locateFfmpeg(): Promise<string> {
  const candidates: string[] = [];
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    candidates.push(path.join(dir, 'node_modules', FFMPEG_PKG, FFMPEG_FILE));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // not there, or there without the execute bit — try the copy below
    }
    try {
      await fs.access(candidate, fs.constants.R_OK);
      // File modes are not guaranteed to survive tracing; a copy we chmod is.
      const copy = path.join(os.tmpdir(), `d3-${FFMPEG_FILE}`);
      await fs.copyFile(candidate, copy);
      await fs.chmod(copy, 0o755);
      return copy;
    } catch {
      // next candidate
    }
  }
  return 'ffmpeg'; // PATH — the laptop case
}

// ───────────────────────────── the runner ─────────────────────────────

class StepFailure extends Error {
  constructor(
    readonly code: JobErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StepFailure';
  }
}

async function fileSize(file: string): Promise<number | null> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return null;
  }
}

/** §8.3.3's error table, by which leg raised it. */
function classifyOpenRouterError(
  cause: unknown,
  legCode: 'transcript_failed' | 'model_failed',
): StepFailure {
  if (cause instanceof OpenRouterConfigError) {
    return new StepFailure('internal', `config: ${cause.message}`);
  }
  if (cause instanceof OpenRouterTimeoutError) {
    return new StepFailure('timeout', cause.message);
  }
  if (cause instanceof OpenRouterAbortedError) {
    return new StepFailure('interrupted', cause.message);
  }
  if (cause instanceof OpenRouterRequestError) {
    // `detail` — the upstream body — goes to the log and nowhere else.
    console.error(
      `[analyzer] ${legCode} status=${cause.status} detail=${cause.detail ?? '(none)'}`,
    );
    return new StepFailure(legCode, cause.message);
  }
  return new StepFailure(
    'internal',
    cause instanceof Error ? cause.message : String(cause),
  );
}

export interface JobSource {
  /** A local file (the link path downloaded it) or an https URL ffmpeg reads directly. */
  source: string;
  /** The Storage object to delete when the job is terminal, or null. */
  sourceObject: string | null;
}

/** Scratch directory for one job. Deleted in `runJob`'s finally. */
export function workDirFor(jobId: string): string {
  return path.join(os.tmpdir(), 'd3-analyzer', jobId);
}

export async function runJob(jobId: string, input: JobSource): Promise<void> {
  const workDir = workDirFor(jobId);
  const controller = new AbortController();
  const clock = setTimeout(() => controller.abort(), RUN_BUDGET_MS);
  try {
    await fs.mkdir(workDir, { recursive: true });
    await patchJob(jobId, {
      status: 'running',
      step: 'compressing',
      started_at: nowIso(),
    });
    await pipeline(jobId, input.source, workDir, controller.signal);
  } catch (cause) {
    const failure = controller.signal.aborted
      ? new StepFailure('timeout', 'the processing budget was exhausted')
      : cause instanceof StepFailure
        ? cause
        : new StepFailure(
            'internal',
            cause instanceof Error ? cause.message : String(cause),
          );
    console.error(
      `[analyzer] ${jobId} failed: ${failure.code} — ${failure.message}`,
    );
    try {
      // A completed compressed.mp4 keeps its `video_path`: only status changes.
      await patchJob(jobId, {
        status: 'failed',
        step: null,
        error: { code: failure.code, message: failure.message },
        result: null,
        finished_at: nowIso(),
      });
    } catch (writeCause) {
      console.error(`[analyzer] ${jobId} terminal write failed`, writeCause);
    }
  } finally {
    clearTimeout(clock);
    await fs
      .rm(workDir, { recursive: true, force: true })
      .catch(() => undefined);
    // The full-quality source is never kept: the compressed copy is what plays,
    // and a retry is a re-upload.
    if (input.sourceObject !== null) await removeObjects([input.sourceObject]);
  }
}

async function pipeline(
  jobId: string,
  source: string,
  workDir: string,
  signal: AbortSignal,
): Promise<void> {
  // Once, at the top, BEFORE the compress step — never inside the per-leg
  // functions, which would bill a transcription before discovering
  // ANALYZER_MODEL is unset (§8.3.3).
  let analyzerModel: string;
  let transcribeModel: string;
  try {
    analyzerModel = requireModelId('ANALYZER_MODEL');
    transcribeModel = requireModelId('TRANSCRIBE_MODEL');
  } catch (cause) {
    throw classifyOpenRouterError(cause, 'model_failed');
  }

  const job = await readJob(jobId);
  if (job === null) throw new StepFailure('internal', 'the job row is missing');
  const durationSeconds = job.duration_seconds;
  if (durationSeconds === null || job.has_audio === null) {
    throw new StepFailure('internal', 'the row has no probe result');
  }
  const hasAudio = job.has_audio;

  const bin = await ffmpegBinary();
  const compressed = path.join(workDir, 'compressed.mp4');
  const thumbnail = path.join(workDir, 'thumbnail.jpg');
  const audio = path.join(workDir, 'audio.mp3');

  // ── step 2: compress ──────────────────────────────────────────────────
  // ONE deadline covering the compress pass, the retry, the audio extract and
  // the poster frame together — not four separate clocks (§8.5).
  const ffmpegSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(FFMPEG_BUDGET_MS),
  ]);

  const row = pickLadderRow(Number(durationSeconds));
  const first = await runFfmpeg(
    bin,
    buildCompressArgs(source, compressed, encodeSettingsFor(row, hasAudio)),
    ffmpegSignal,
  );
  if (!first.ok) {
    throw new StepFailure('compress_failed', `compress: ${first.stderr}`);
  }

  let compressedBytes = await fileSize(compressed);
  if (compressedBytes === null) {
    throw new StepFailure('compress_failed', 'compress produced no output');
  }

  if (compressedBytes > MAX_COMPRESSED_BYTES) {
    const retry = await runFfmpeg(
      bin,
      buildCompressArgs(
        source,
        compressed,
        retryEncodeSettings(row, compressedBytes, hasAudio),
      ),
      ffmpegSignal,
    );
    if (!retry.ok) {
      throw new StepFailure('compress_failed', `re-encode: ${retry.stderr}`);
    }
    compressedBytes = await fileSize(compressed);
    if (compressedBytes === null) {
      throw new StepFailure('compress_failed', 're-encode produced no output');
    }
    // Do not attempt a third encode and never send an oversize payload.
    if (compressedBytes > MAX_COMPRESSED_BYTES) {
      throw new StepFailure(
        'over_size_cap',
        `${compressedBytes} bytes after the second encode`,
      );
    }
  }

  // §C1.2.5: `video_url` becomes non-null in the SAME write that sets
  // `compressed_bytes` — after the bytes are in Storage, never before.
  const videoBytes = await fs.readFile(compressed);
  const videoPath = mediaPath(jobId, 'compressed.mp4');
  await uploadObject(videoPath, videoBytes, 'video/mp4');
  await patchJob(jobId, {
    compressed_bytes: compressedBytes,
    video_path: videoPath,
  });

  // The poster frame runs at the END of the compressing step. It has no
  // JobStep of its own and it is the one FFmpeg step that never fails a job.
  const poster = await runFfmpeg(
    bin,
    buildThumbnailArgs(compressed, thumbnail, Number(durationSeconds)),
    ffmpegSignal,
  );
  if (poster.ok) {
    const thumbnailPath = mediaPath(jobId, 'thumbnail.jpg');
    try {
      await uploadObject(
        thumbnailPath,
        await fs.readFile(thumbnail),
        'image/jpeg',
      );
      await patchJob(jobId, { thumbnail_path: thumbnailPath });
    } catch (cause) {
      console.error(`[analyzer] ${jobId} poster upload failed`, cause);
    }
  } else {
    console.error(`[analyzer] ${jobId} poster frame failed: ${poster.stderr}`);
  }

  // ── steps 3 and 4: audio + transcript ─────────────────────────────────
  let transcript: TranscriptSegment[] = [];
  let transcriptUsage: OpenRouterCallUsage | null = null;

  if (hasAudio) {
    await patchJob(jobId, { status: 'running', step: 'extracting_audio' });
    const extract = await runFfmpeg(
      bin,
      buildAudioArgs(source, audio),
      ffmpegSignal,
    );
    if (!extract.ok) {
      throw new StepFailure('compress_failed', `audio: ${extract.stderr}`);
    }

    await patchJob(jobId, { status: 'running', step: 'transcribing' });
    let reply;
    try {
      reply = await transcribeAudio({
        model: transcribeModel,
        audioBase64: (await fs.readFile(audio)).toString('base64'),
        signal,
      });
    } catch (cause) {
      throw classifyOpenRouterError(cause, 'transcript_failed');
    } finally {
      await fs.rm(audio, { force: true }).catch(() => undefined);
    }

    transcriptUsage = reply.usage;
    if (reply.segments.length === 0 && reply.text.trim() !== '') {
      // Words with no timestamps is a job failure, not a quiet degradation.
      console.error(
        `[analyzer] ${jobId} transcript has words but no segments; model=${transcribeModel}`,
      );
      throw new StepFailure(
        'transcript_failed',
        'the granularity encoding was rejected: words with no segment timestamps',
      );
    }
    // No segments AND no text is not a failure: the track carried no speech.
    transcript = normaliseTranscript(reply.segments, Number(durationSeconds));
  }

  // ── step 5: the vision call ───────────────────────────────────────────
  await patchJob(jobId, { status: 'running', step: 'analyzing' });

  let analysis;
  try {
    analysis = await chatCompletion({
      model: analyzerModel,
      messages: buildAnalysisMessages({
        reportLanguage: job.report_language,
        durationSeconds: Number(durationSeconds),
        transcript,
        videoBase64: videoBytes.toString('base64'),
        businessProfile: job.business_profile,
      }),
      temperature: 0.2,
      max_tokens: 3000,
      signal,
    });
  } catch (cause) {
    throw classifyOpenRouterError(cause, 'model_failed');
  }

  // NEVER a bare inequality against 'stop': a null is a non-truncating success.
  const finishReason = analysis.usage.finish_reason;
  if (finishReason !== null && finishReason !== 'stop') {
    throw new StepFailure(
      'model_failed',
      `reply truncated: finish_reason=${finishReason}`,
    );
  }

  const parsed = parseAnalysisReply(extractJsonObject(analysis.content));
  if (parsed === null) {
    console.error(
      `[analyzer] ${jobId} reply did not parse: finish_reason=${finishReason} content_chars=${analysis.content.length} completion_tokens=${analysis.usage.completion_tokens}
--- head ---
${analysis.content.slice(0, 400)}
--- tail ---
${analysis.content.slice(-300)}`,
    );
    throw new StepFailure(
      'model_failed',
      'reply did not parse as the six-dimension object',
    );
  }

  const result = buildAnalysisResult({
    scores: parsed.scores,
    emotionCurveRaw: parsed.emotion_curve,
    transcript,
    reportText: parsed.report_text,
    durationSeconds: Number(durationSeconds),
    usage: { analysis: analysis.usage, transcript: transcriptUsage },
  });

  const reportPath = mediaPath(jobId, 'report.txt');
  await uploadObject(
    reportPath,
    Buffer.from(result.report_text, 'utf8'),
    'text/plain; charset=utf-8',
  );

  if (signal.aborted) return; // the runner owns the terminal write
  await patchJob(jobId, {
    status: 'done',
    step: null,
    error: null,
    result,
    report_path: reportPath,
    finished_at: nowIso(),
  });
}
