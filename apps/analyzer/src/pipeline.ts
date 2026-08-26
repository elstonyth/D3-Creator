/**
 * The four pipeline steps — PRD 1 §6, §8.5 and §8.7.
 *
 * `runPipeline` NEVER REJECTS. Every outcome is written to `job.json` as a
 * terminal status, with one deliberate exception: when the job's own signal has
 * already fired, the terminal write belongs to the runner (`queue.ts`), which
 * owns §8.5's "Timeout is an abort" transition. Writing `interrupted` here would
 * make that transition unreachable.
 */

import fs from 'node:fs/promises';

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

import { buildAnalysisResult, normaliseTranscript } from './analysis';
import { FFMPEG_BUDGET_MS } from './config';
import {
  MAX_COMPRESSED_BYTES,
  type JobErrorCode,
  type TranscriptSegment,
} from './contract';
import {
  buildAudioArgs,
  buildCompressArgs,
  buildThumbnailArgs,
  encodeSettingsFor,
  pickLadderRow,
  retryEncodeSettings,
  runFfmpeg,
} from './ffmpeg';
import { buildAnalysisMessages, parseAnalysisReply } from './prompt';
import {
  jobPath,
  mediaUrl,
  patchJob,
  readJob,
  readWorkerRecord,
} from './store';

const nowIso = () => new Date().toISOString();

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

async function unlinkQuietly(file: string): Promise<void> {
  await fs.rm(file, { force: true }).catch(() => undefined);
}

/**
 * §8.3.3's error table. `OpenRouterRequestError` maps by which leg raised it,
 * which is why the two legs call this with different defaults.
 */
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
    // `detail` — the upstream response body — goes to the log and nowhere else,
    // on every path (§8.3.3). It never reaches `error.message`.
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

export async function runPipeline(
  jobId: string,
  signal: AbortSignal,
): Promise<void> {
  try {
    await pipeline(jobId, signal);
  } catch (cause) {
    // The job clock fired: `queue.ts` owns the terminal write (§8.5).
    if (signal.aborted) return;
    const failure =
      cause instanceof StepFailure
        ? cause
        : new StepFailure(
            'internal',
            cause instanceof Error ? cause.message : String(cause),
          );
    await patchJob(jobId, {
      status: 'failed',
      step: null,
      error: { code: failure.code, message: failure.message },
      result: null,
      finished_at: nowIso(),
    });
  }
}

async function pipeline(jobId: string, signal: AbortSignal): Promise<void> {
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
  if (job === null) throw new StepFailure('internal', 'job.json is missing');

  const worker = await readWorkerRecord(jobId);
  if (worker === null) {
    throw new StepFailure('internal', 'worker.json is missing or unparseable');
  }

  const durationSeconds = job.duration_seconds;
  if (durationSeconds === null) {
    throw new StepFailure('internal', 'duration_seconds is null after upload');
  }

  const source = jobPath(jobId, `source${worker.source_ext}`);
  const compressed = jobPath(jobId, 'compressed.mp4');
  const thumbnail = jobPath(jobId, 'thumbnail.jpg');
  const audio = jobPath(jobId, 'audio.mp3');

  // ── step 2: compress ──────────────────────────────────────────────────
  // ONE AbortSignal.timeout, armed when the compress step starts, covering the
  // compress pass, the retry, the audio extract and the poster frame together —
  // not four separate clocks (§8.5).
  const ffmpegSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(FFMPEG_BUDGET_MS),
  ]);

  await patchJob(jobId, { status: 'running', step: 'compressing' });

  const row = pickLadderRow(durationSeconds);
  const first = await runFfmpeg(
    buildCompressArgs(
      source,
      compressed,
      encodeSettingsFor(row, worker.has_audio),
    ),
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
      buildCompressArgs(
        source,
        compressed,
        retryEncodeSettings(row, compressedBytes, worker.has_audio),
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
  // `compressed_bytes` — never eagerly, never held back to the terminal write.
  await patchJob(jobId, {
    compressed_bytes: compressedBytes,
    video_url: mediaUrl(jobId, 'compressed.mp4'),
  });

  // The poster frame runs at the END of the compressing step, immediately after
  // the compress output is written and BEFORE the audio extract. It has no
  // JobStep id of its own and never advances `step`. It is the one FFmpeg step
  // that never fails a job.
  const poster = await runFfmpeg(
    buildThumbnailArgs(compressed, thumbnail, durationSeconds),
    ffmpegSignal,
  );
  if (poster.ok) {
    await patchJob(jobId, { thumbnail_url: mediaUrl(jobId, 'thumbnail.jpg') });
  } else {
    console.error(`[analyzer] ${jobId} poster frame failed: ${poster.stderr}`);
  }

  // ── steps 3 and 4: audio + transcript ─────────────────────────────────
  let transcript: TranscriptSegment[] = [];
  let transcriptUsage: OpenRouterCallUsage | null = null;

  if (worker.has_audio) {
    await patchJob(jobId, { status: 'running', step: 'extracting_audio' });
    const extract = await runFfmpeg(
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
      // Deleted as soon as the transcript returns (§8.5's disk policy).
      await unlinkQuietly(audio);
    }

    transcriptUsage = reply.usage;
    if (reply.segments.length === 0 && reply.text.trim() !== '') {
      // Words with no timestamps is a job failure, not a quiet degradation: a
      // video scored without its words looks like a working job returning wrong
      // scores (§8.3).
      console.error(
        `[analyzer] ${jobId} transcript has words but no segments; model=${transcribeModel}`,
      );
      throw new StepFailure(
        'transcript_failed',
        'the granularity encoding was rejected: words with no segment timestamps',
      );
    }
    // segments.length === 0 with empty text is NOT a failure: the audio track
    // carried no speech. `usage.transcript` stays the real usage record — a call
    // was made and billed — and the vision pass runs alone.
    transcript = normaliseTranscript(reply.segments, durationSeconds);
  }
  // A video with no audio track never reaches that table: the extract and the
  // transcript call are skipped entirely and `usage.transcript` stays null,
  // which means "no call was made" and nothing else (§8.7.7).

  // ── step 5: the vision call ───────────────────────────────────────────
  await patchJob(jobId, { status: 'running', step: 'analyzing' });

  const videoBase64 = (await fs.readFile(compressed)).toString('base64');
  let analysis;
  try {
    analysis = await chatCompletion({
      model: analyzerModel,
      messages: buildAnalysisMessages({
        reportLanguage: job.report_language,
        durationSeconds,
        transcript,
        videoBase64,
        businessProfile: job.business_profile ?? null,
      }),
      // The production analysis call and the §9 measurement call are the same
      // call: these two are sent in production too (§8.3.2).
      temperature: 0.2,
      // PRD 1 §9.3 pins 2000. Raised because §8.3.5's richer prompt (timestamped
      // evidence + a paragraph per dimension) overran it on an 80 s clip and the
      // truncated reply came back unparseable. §9's measurement was already
      // invalidated by the prompt edit; both need a re-run together.
      max_tokens: 3000,
      signal,
    });
  } catch (cause) {
    throw classifyOpenRouterError(cause, 'model_failed');
  }

  // The truncation predicate, spelled the same in every section. NEVER a bare
  // inequality against 'stop': a null is a billable, non-truncating success.
  const finishReason = analysis.usage.finish_reason;
  if (finishReason !== null && finishReason !== 'stop') {
    throw new StepFailure(
      'model_failed',
      `reply truncated: finish_reason=${finishReason}`,
    );
  }

  const parsed = parseAnalysisReply(extractJsonObject(analysis.content));
  if (parsed === null) {
    // Log-only diagnostic (§8.3.3): without it a parse failure is a dead end,
    // because it is not an OpenRouterRequestError and carries no `detail`.
    // Never rendered, never in error.message.
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
    durationSeconds,
    usage: { analysis: analysis.usage, transcript: transcriptUsage },
  });

  await fs.writeFile(jobPath(jobId, 'report.txt'), result.report_text, 'utf8');

  if (signal.aborted) return; // the runner owns the terminal write
  await patchJob(jobId, {
    status: 'done',
    step: null,
    error: null,
    result,
    report_url: mediaUrl(jobId, 'report.txt'),
    finished_at: nowIso(),
  });
}
