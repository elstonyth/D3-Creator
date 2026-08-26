/**
 * PRD 1 §9 — the cost measurement harness. RUN IT BY HAND; IT NEVER RUNS IN CI,
 * BECAUSE IT SPENDS REAL MONEY:
 *
 *   pnpm exec dotenv -e .env -- pnpm exec tsx apps/analyzer/scripts/cost-measure.ts
 *   pnpm exec dotenv -e .env -- pnpm exec tsx apps/analyzer/scripts/cost-measure.ts --models=qwen/qwen3.7-flash
 *
 * It calls the client directly against the §9.1 fixtures; it is not wired into
 * the job pipeline. The prompt is `buildAnalysisPrompt()` verbatim, fed the
 * transcript AFTER §8.7.5's normalisation, so the harness and production send
 * byte-identical prompts.
 *
 * Exit codes: 0 measured, 1 a gate or preflight failed, 2 the ceiling was
 * breached. EVERY exit — including both failures — writes
 * `reports/openrouter-cost-measure.json`: a gate that leaves nothing on disk
 * hides which check fired.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  chatCompletion,
  OpenRouterRequestError,
  requireApiKey,
  requireModelId,
  transcribeAudio,
  type ChatMessage,
  type OpenRouterCallUsage,
} from '@d3/openrouter';

import { normaliseTranscript } from '../src/analysis';
import { DEFAULT_REPORT_LANGUAGE, FFPROBE_TIMEOUT_MS } from '../src/config';
import type { TranscriptSegment } from '../src/contract';
import { probeDuration } from '../src/ffmpeg';
import {
  FIXTURES,
  invalidReasons,
  MODELS,
  parseUsdMyrRate,
  SPEND_CEILING_USD,
  tableGapPct,
  usdAnalysisFromTable,
  type MeasuredModel,
  type RunNote,
} from '../src/cost-rows';
import { buildAnalysisMessages, parseAnalysisReply } from '../src/prompt';
import { extractJsonObject } from '@d3/openrouter';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);
const FIXTURE_DIR = path.join(REPO_ROOT, 'fixtures', 'cost-measure');
const ARTIFACT = path.join(
  REPO_ROOT,
  'reports',
  'openrouter-cost-measure.json',
);
/** §9.1. A fixture over this is a raw upload, not ladder output. */
const LADDER_OUTPUT_MAX_BYTES = 15_000_000;

/** Captured ONCE, before the first preflight check — never at write time. */
const RUN_AT = new Date().toISOString();

interface ClipRecord {
  clip: string;
  nominal_seconds: number;
  duration_seconds: number | null;
  video_bytes: number | null;
  audio_bytes: number | null;
  transcript_segments: number | null;
  transcript_usage: OpenRouterCallUsage | null;
  prompt_tokens_text_only: number | null;
  /** The same probe WITH a business profile block. Production has sent one on
   *  every profiled job since Amendment 1, so a single figure under-reports. */
  prompt_tokens_text_only_with_profile: number | null;
}

interface RowRecord {
  model_requested: string;
  clip: string;
  duration_seconds: number | null;
  valid: boolean;
  invalid_reasons: string[];
  analysis: OpenRouterCallUsage | null;
  transcript: OpenRouterCallUsage | null;
  parsed_six_keys: boolean;
  scores: Record<string, number> | null;
  usd_analysis: number | null;
  usd_transcript: number | null;
  usd_total: number | null;
  usd_analysis_from_table: number | null;
  table_gap_pct: number | null;
  myr_total: number | null;
  myr_per_min: number | null;
}

/** `clips` always carries all five records, seeded before preflight check 1. */
const clips: ClipRecord[] = FIXTURES.map((f) => ({
  clip: f.clip,
  nominal_seconds: f.nominal_seconds,
  duration_seconds: null,
  video_bytes: null,
  audio_bytes: null,
  transcript_segments: null,
  transcript_usage: null,
  prompt_tokens_text_only: null,
  prompt_tokens_text_only_with_profile: null,
}));
const rows: RowRecord[] = [];

let usdMyrRate = parseUsdMyrRate(process.env.USD_MYR_RATE) ?? 0;
let spendUsdTotal = 0;
let selectedModels: readonly string[] = MODELS;

async function writeArtifact(note: RunNote): Promise<void> {
  await fs.mkdir(path.dirname(ARTIFACT), { recursive: true });
  await fs.writeFile(
    ARTIFACT,
    `${JSON.stringify(
      {
        run_at: RUN_AT,
        usd_myr_rate: usdMyrRate,
        temperature: 0.2,
        max_tokens: 2000,
        response_format: null,
        report_language: DEFAULT_REPORT_LANGUAGE,
        models: selectedModels,
        spend_usd_total: spendUsdTotal,
        spend_ceiling_usd: SPEND_CEILING_USD,
        note,
        clips,
        rows,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`[cost-measure] wrote ${ARTIFACT}`);
}

async function stop(note: RunNote, code: 1 | 2): Promise<never> {
  console.error(`[cost-measure] ${note}`);
  await writeArtifact(note);
  process.exit(code);
}

function fixturePath(clip: string, ext: 'mp4' | 'mp3'): string {
  return path.join(FIXTURE_DIR, `${clip}.${ext}`);
}

async function sizeOf(file: string): Promise<number | null> {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return null;
  }
}

function gitCheckIgnore(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['check-ignore', '-q', target],
      { cwd: REPO_ROOT },
      (error) => resolve(!error),
    );
  });
}

// ─────────────────────────── §9.1 preflight ───────────────────────────

async function preflight(): Promise<void> {
  // 1 — Fixtures ignored. This repo is public and the fixtures are real
  // customer-shaped video. Free to run, so it runs first.
  if (!(await gitCheckIgnore('fixtures/cost-measure'))) {
    await stop('Fixtures ignored', 1);
  }

  // 2 — FX rate usable. A garbage override must never be swallowed into 4.25:
  // the run's one output is a money figure.
  const rate = parseUsdMyrRate(process.env.USD_MYR_RATE);
  if (rate === null) await stop('FX rate usable', 1);
  usdMyrRate = rate as number;

  // 3 — Config must fail before any network call (§8.3.3).
  try {
    requireApiKey();
    requireModelId('TRANSCRIBE_MODEL');
    requireModelId('ANALYZER_MODEL');
  } catch {
    await stop('Config', 1);
  }

  // 4 — FFmpeg present. The duration reading below needs it.
  const probeOk = await new Promise<boolean>((resolve) => {
    const child = execFile('ffprobe', ['-version'], (error) => resolve(!error));
    setTimeout(() => child.kill('SIGKILL'), FFPROBE_TIMEOUT_MS);
  });
  if (!probeOk) await stop('FFmpeg present', 1);

  // 5 — Both files per clip.
  for (const record of clips) {
    record.video_bytes = await sizeOf(fixturePath(record.clip, 'mp4'));
    record.audio_bytes = await sizeOf(fixturePath(record.clip, 'mp3'));
  }
  if (clips.some((c) => c.video_bytes === null || c.audio_bytes === null)) {
    await stop('Both files per clip', 1);
  }

  // 6 — Fixture is ladder output. A raw upload measures a video the pipeline
  // would never send.
  if (clips.some((c) => (c.video_bytes as number) > LADDER_OUTPUT_MAX_BYTES)) {
    await stop('Fixture is ladder output', 1);
  }

  // 7 — Duration readable. Every RM/min figure divides by THIS number; the
  // filename is a label, never a measurement.
  for (const record of clips) {
    const seconds = await probeDuration(
      fixturePath(record.clip, 'mp4'),
      FFPROBE_TIMEOUT_MS,
    );
    record.duration_seconds =
      seconds === null ? null : Math.round(seconds * 10) / 10;
  }
  if (clips.some((c) => c.duration_seconds === null)) {
    await stop('Duration readable', 1);
  }

  for (const record of clips) {
    if (record.duration_seconds !== record.nominal_seconds) {
      console.warn(
        `[cost-measure] ${record.clip}: ffprobe says ${record.duration_seconds}s, filename says ${record.nominal_seconds}s`,
      );
    }
  }
}

async function chargeAndCheckCeiling(
  usage: OpenRouterCallUsage,
): Promise<void> {
  // The ceiling can only count what OpenRouter reported: a paid call whose
  // `usage.cost` is absent bills us and adds nothing. Those rows are already
  // INVALID under §9.5, so the run is void and the correct response is to fix
  // the leg, never to substitute a guessed cost.
  if (usage.cost_usd !== null) spendUsdTotal += usage.cost_usd;
  if (spendUsdTotal > SPEND_CEILING_USD) {
    await stop('spend ceiling USD 2 exceeded', 2);
  }
}

// ────────────────────── the transcript leg (once) ──────────────────────

const transcripts = new Map<string, TranscriptSegment[]>();

async function runTranscriptLeg(): Promise<void> {
  const transcribeModel = requireModelId('TRANSCRIBE_MODEL');
  for (const record of clips) {
    const audioBase64 = (
      await fs.readFile(fixturePath(record.clip, 'mp3'))
    ).toString('base64');
    try {
      const reply = await transcribeAudio({
        model: transcribeModel,
        audioBase64,
      });
      const normalised = normaliseTranscript(
        reply.segments,
        record.duration_seconds as number,
      );
      transcripts.set(record.clip, normalised);
      record.transcript_segments = normalised.length;
      record.transcript_usage = reply.usage;
      await chargeAndCheckCeiling(reply.usage);
      if (reply.segments.length === 0 && reply.text.trim() !== '') {
        // In the harness there is no job to fail: log the model id, run the
        // analysis call anyway, and let §9.5's `no transcript in the prompt`
        // mark that row INVALID. The harness never exits on this row.
        console.error(
          `[cost-measure] ${record.clip}: words with no segment timestamps; model=${transcribeModel}`,
        );
      }
    } catch (cause) {
      // A transcript call that threw but was billed still counts.
      transcripts.set(record.clip, []);
      record.transcript_segments = 0;
      record.transcript_usage =
        cause instanceof OpenRouterRequestError ? cause.usage : null;
      if (record.transcript_usage !== null) {
        await chargeAndCheckCeiling(record.transcript_usage);
      }
      console.error(
        `[cost-measure] ${record.clip}: transcript call failed`,
        cause instanceof Error ? cause.message : cause,
      );
    }
  }

  // Run all five FIRST, collect the failures, then gate — an artifact naming
  // one broken clip out of five sends the operator back for a second run.
  const unmeasured = clips.filter(
    (c) => c.transcript_usage === null || c.transcript_usage.cost_usd === null,
  );
  if (unmeasured.length > 0) {
    console.error(
      `[cost-measure] no cost reported for: ${unmeasured.map((c) => c.clip).join(', ')}`,
    );
    await stop('transcript leg not measured', 1);
  }
}

// ───────────────────── §9.3 prompt-token probe ─────────────────────

/**
 * A §10A.6 profile block at its WORST CASE — every capped field at its cap and
 * every vocabulary field at its longest-rendering slug, which is what
 * `renderProfileBlock` can emit and what
 * `apps/frontend/src/lib/chat-prompt.test.ts` pins at 3,075 characters.
 *
 * The measurement takes the ceiling deliberately: a typical profile is far
 * shorter, and a cost figure that is a floor is the one that gets quoted.
 */
const PROFILE_FIXTURE = [
  'BUSINESS PROFILE',
  `Business name: ${'x'.repeat(120)}`,
  `Business type: ${'x'.repeat(60)}`,
  'Their role: Content creator',
  `What they sell: ${'x'.repeat(200)}`,
  `Who buys it: ${'x'.repeat(200)}`,
  'Audience size: 10,000–100,000',
  `Where they are: ${'x'.repeat(120)}`,
  'Content language: Chinese',
  'Main platform: Instagram Reels',
  'Appears on camera: Sometimes',
  'Tone: Friendly',
  `Content pillars: ${'x'.repeat(500)}`,
  `Voice notes: ${'x'.repeat(500)}`,
  'Typical video length: 90s',
  `Already tried: ${'x'.repeat(500)}`,
  `Things to avoid: ${'x'.repeat(500)}`,
].join('\n');

function analysisMessages(
  clip: ClipRecord,
  videoBase64: string,
  businessProfile: string | null = null,
): ChatMessage[] {
  return buildAnalysisMessages({
    reportLanguage: DEFAULT_REPORT_LANGUAGE,
    durationSeconds: clip.duration_seconds as number,
    transcript: transcripts.get(clip.clip) ?? [],
    videoBase64,
    businessProfile,
  });
}

/**
 * One probe. The same content-part array the analysis call sends with the
 * `video_url` part removed — not a bare string, because the chat template wraps
 * a string and a single-element part array differently and the token counts
 * differ.
 */
async function probePromptTokens(
  record: ClipRecord,
  businessProfile: string | null,
): Promise<number | null> {
  const full = analysisMessages(record, '', businessProfile);
  const parts = Array.isArray(full[0].content) ? full[0].content : [];
  const messages: ChatMessage[] = [
    { role: 'user', content: parts.filter((p) => p.type !== 'video_url') },
  ];
  try {
    // At max_tokens: 1 the EXPECTED outcome is a throw — the reply carries no
    // content — so a resolve here is the surprising branch, not the failure.
    const result = await chatCompletion({
      model: MODELS[0],
      messages,
      temperature: 0.2,
      max_tokens: 1,
    });
    return result.usage.prompt_tokens;
  } catch (cause) {
    if (cause instanceof OpenRouterRequestError && cause.status === 200) {
      return cause.usage?.prompt_tokens ?? null;
    }
    console.warn(
      `[cost-measure] ${record.clip}: prompt-token probe failed`,
      cause instanceof Error ? cause.message : cause,
    );
    return null;
  }
}

/**
 * Runs on MODEL 1 on EVERY run, including a `--models=` subset that omits it. It
 * is unbilled, so there is nothing to save by skipping it, and both
 * `clips[].prompt_tokens_text_only` and
 * `clips[].prompt_tokens_text_only_with_profile` are populated on every artifact.
 */
async function runPromptTokenProbe(): Promise<void> {
  for (const record of clips) {
    record.prompt_tokens_text_only = await probePromptTokens(record, null);
    // BOTH counts, because production has sent a profile block on every
    // profiled job since Amendment 1 while this harness measured only the
    // bare prompt — so the artifact's single figure was a floor, quoted as a
    // measurement. Unbilled at max_tokens: 1, so the second probe is free.
    record.prompt_tokens_text_only_with_profile = await probePromptTokens(
      record,
      PROFILE_FIXTURE,
    );
  }
}

// ───────────────────────── the analysis legs ─────────────────────────

async function runModel(model: string): Promise<void> {
  for (const record of clips) {
    const videoBase64 = (
      await fs.readFile(fixturePath(record.clip, 'mp4'))
    ).toString('base64');

    let analysis: OpenRouterCallUsage | null = null;
    let analysisError: string | undefined;
    let parsedSixKeys = false;
    let scores: Record<string, number> | null = null;

    try {
      const reply = await chatCompletion({
        model,
        messages: analysisMessages(record, videoBase64),
        temperature: 0.2,
        max_tokens: 2000,
      });
      analysis = reply.usage;
      await chargeAndCheckCeiling(reply.usage);
      const parsed = parseAnalysisReply(extractJsonObject(reply.content));
      parsedSixKeys = parsed !== null;
      // `scores` is null, never {}, on a row whose reply did not parse.
      scores =
        parsed === null
          ? null
          : Object.fromEntries(
              Object.entries(parsed.scores).map(([k, v]) => [k, v.score]),
            );
    } catch (cause) {
      analysisError = cause instanceof Error ? cause.message : String(cause);
      if (cause instanceof OpenRouterRequestError) {
        analysis = cause.usage;
        if (cause.usage !== null) await chargeAndCheckCeiling(cause.usage);
      }
    }

    const transcriptUsage = record.transcript_usage;
    const reasons = invalidReasons({
      analysisError,
      analysis,
      transcript: transcriptUsage,
      parsedSixKeys,
      transcriptSegments: record.transcript_segments ?? 0,
    });

    const usdAnalysis = analysis?.cost_usd ?? null;
    const usdTranscript = transcriptUsage?.cost_usd ?? null;
    const total =
      usdAnalysis === null || usdTranscript === null
        ? null
        : usdAnalysis + usdTranscript;
    const fromTable = usdAnalysisFromTable(
      model,
      analysis?.prompt_tokens ?? null,
      analysis?.completion_tokens ?? null,
    );
    const myr = total === null ? null : total * usdMyrRate;

    rows.push({
      model_requested: model,
      clip: record.clip,
      duration_seconds: record.duration_seconds,
      valid: reasons.length === 0,
      invalid_reasons: reasons,
      analysis,
      transcript: transcriptUsage,
      parsed_six_keys: parsedSixKeys,
      scores,
      usd_analysis: usdAnalysis,
      usd_transcript: usdTranscript,
      usd_total: total,
      usd_analysis_from_table: fromTable,
      table_gap_pct: tableGapPct(usdAnalysis, fromTable),
      myr_total: myr,
      myr_per_min:
        myr === null || record.duration_seconds === null
          ? null
          : myr / (record.duration_seconds / 60),
    });

    console.log(
      `[cost-measure] ${model} ${record.clip}: ${reasons.length === 0 ? 'VALID' : `INVALID — ${reasons.join('; ')}`}`,
    );
  }
}

// ──────────────────────────────── main ────────────────────────────────

async function main(): Promise<void> {
  const modelsArg = process.argv
    .slice(2)
    .find((a) => a.startsWith('--models='));
  if (modelsArg !== undefined) {
    const requested = modelsArg
      .slice('--models='.length)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    if (requested.some((id) => !MODELS.includes(id as MeasuredModel))) {
      await stop('unknown model id in --models', 1);
    }
    // Runs a subset in §9.2's order.
    selectedModels = MODELS.filter((id) => requested.includes(id));
  }

  await preflight();
  await runTranscriptLeg();
  await runPromptTokenProbe();

  for (const model of selectedModels) {
    await runModel(model);
    // §9.2 step 1: do not proceed until all five come back with a parseable
    // six-dimension object.
    if (model === MODELS[0]) {
      const freeRows = rows.filter((r) => r.model_requested === MODELS[0]);
      if (freeRows.some((r) => !r.parsed_six_keys)) {
        await stop('free-model gate failed', 1);
      }
    }
  }

  await writeArtifact(null);
  process.exit(0);
}

main().catch(async (cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  await stop(`unexpected failure: ${message}`, 1);
});
