/**
 * Everything the pipeline does to a model reply between `parseAnalysisReply()`
 * and `job.json` — PRD 1 §8.7.2, §8.7.3, §8.7.4 and §8.7.5.
 *
 * No `config.ts` import: `analysis.test.ts` imports this file (PRD 1 §8.2).
 */

import {
  SCORE_KEYS,
  type AnalysisResult,
  type AnalyzerUsage,
  type DimensionScore,
  type EmotionPoint,
  type ScoreKey,
  type TranscriptSegment,
} from './contract';

const round1 = (n: number) => Math.round(n * 10) / 10;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * §8.7.4's six steps, in order and nowhere else.
 *
 * Step 2 DROPS an out-of-domain `t` rather than clamping it: clamping
 * manufactures duplicate `t` values at the edges, which §8.7.4 calls a service
 * bug. The 8-to-20 count is a prompt instruction only — the service never pads
 * and never truncates to reach it.
 */
export function normaliseEmotionCurve(
  raw: unknown,
  durationSeconds: number,
): EmotionPoint[] {
  if (!Array.isArray(raw)) return []; // 1

  const kept: EmotionPoint[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const point = entry as { t?: unknown; value?: unknown };
    const t = point.t;
    const value = point.value;
    if (typeof t !== 'number' || !Number.isFinite(t)) continue; // 1
    if (typeof value !== 'number' || !Number.isFinite(value)) continue; // 1
    if (t < 0 || t > durationSeconds) continue; // 2 — dropped, not clamped
    kept.push({ t: round1(t), value: round1(clamp(value, 0, 10)) }); // 3, 4
  }

  // 5 — Array.prototype.sort is stable, so on a duplicate `t` the point that
  // came first in the model's own array is the one that survives.
  kept.sort((a, b) => a.t - b.t);
  const out: EmotionPoint[] = [];
  for (const point of kept) {
    if (out.length > 0 && out[out.length - 1].t === point.t) continue;
    out.push(point);
  }
  return out; // 6 — an empty array is legal, and never a job failure
}

/**
 * §8.7.5's three steps, applied ON TOP of the client's (§8.3.2). No second
 * rounding, no re-sort, no de-duplication — duplicate `start` values are kept,
 * because two speakers can share a timestamp.
 *
 * THE ARRAY THIS RETURNS IS THE ONLY ARRAY THAT LEAVES THIS STEP: it is what
 * `buildAnalysisMessages()` receives and what is written to `result.transcript`.
 * The prompt never sees the client's raw segments.
 */
export function normaliseTranscript(
  segments: readonly TranscriptSegment[],
  durationSeconds: number,
): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const segment of segments) {
    const { start, end } = segment;
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue; // 1
    if (end < start) continue; // 1
    // 2 — `end` is clamped after `start`, so `end >= start` still holds. The
    // client cannot do this; it has no duration.
    const clampedStart = clamp(start, 0, durationSeconds);
    const clampedEnd = clamp(end, clampedStart, durationSeconds);
    out.push({ start: clampedStart, end: clampedEnd, text: segment.text });
  }
  return out; // 3 — nothing else
}

/**
 * §8.7.2. The model is instructed to emit integers; the pipeline clamps to
 * 0..10 and rounds before writing. A non-finite value never reaches here —
 * `parseAnalysisReply()` treats it as a MISSING dimension and returns null.
 */
export function clampScores(
  scores: Record<ScoreKey, DimensionScore>,
): Record<ScoreKey, DimensionScore> {
  const out = {} as Record<ScoreKey, DimensionScore>;
  for (const key of SCORE_KEYS) {
    const entry = scores[key];
    out[key] = {
      score: Math.round(clamp(entry.score, 0, 10)),
      why: entry.why,
      evidence: entry.evidence,
    };
  }
  return out;
}

/**
 * §8.7.3. Derived by the service and stored, written exactly once. The mean is
 * unweighted — all six dimensions count the same. If weighting is ever wanted it
 * changes here and nowhere else; documents written before the change keep their
 * stored value.
 */
export function deriveOverallScore(
  scores: Record<ScoreKey, DimensionScore>,
): number {
  const sum = SCORE_KEYS.reduce((total, key) => total + scores[key].score, 0);
  return Math.round((sum / SCORE_KEYS.length) * 10) / 10;
}

/** Assembles the one §8.7.9 `AnalysisResult` the pipeline persists. */
export function buildAnalysisResult(input: {
  scores: Record<ScoreKey, DimensionScore>;
  emotionCurveRaw: unknown;
  transcript: TranscriptSegment[];
  reportText: string;
  durationSeconds: number;
  usage: AnalyzerUsage;
}): AnalysisResult {
  const scores = clampScores(input.scores);
  return {
    overall_score: deriveOverallScore(scores),
    scores,
    emotion_curve: normaliseEmotionCurve(
      input.emotionCurveRaw,
      input.durationSeconds,
    ),
    // Already normalised before the prompt was built — normalised once, used
    // twice (§8.7.5 step 4).
    transcript: input.transcript,
    report_text: input.reportText,
    usage: input.usage,
  };
}

/**
 * `result.report_text` on disk becomes `report.txt` (§8.1). One place builds the
 * file body, so the download and the page can never disagree.
 */
export function reportFileBody(result: AnalysisResult): string {
  return result.report_text;
}
