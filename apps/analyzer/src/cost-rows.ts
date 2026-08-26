/**
 * The money rules of PRD 1 §9 — split out of `scripts/cost-measure.ts` so they
 * can be unit-tested: the runner itself uses `import.meta.url` and is therefore
 * unreachable from a test (PRD 1 §8.2).
 *
 * NOTHING HERE MAY IMPORT `./config` — including `DEFAULT_REPORT_LANGUAGE`,
 * which §9.3 says is read in `scripts/cost-measure.ts` only.
 */

/** §9. Fixed rate, set 17 August 2026, held constant so runs weeks apart compare. */
export const DEFAULT_USD_MYR_RATE = 4.25;

/** §9.2. Enforced as a hard ceiling on accumulated `usage.cost`. */
export const SPEND_CEILING_USD = 2;

/** §9.2's run order. Fixed, not a suggestion. Model 1 is free. */
export const MODELS = [
  'google/gemma-4-31b-it:free',
  'qwen/qwen3.7-flash',
  'stepfun/step-3.7-flash',
] as const;
export type MeasuredModel = (typeof MODELS)[number];

/** §9.1's five clips. `clip` is the fixture BASENAME, never the filename. */
export const FIXTURES = [
  { clip: '30s', nominal_seconds: 30 },
  { clip: '60s', nominal_seconds: 60 },
  { clip: '90s', nominal_seconds: 90 },
  { clip: '180s', nominal_seconds: 180 },
  { clip: '300s', nominal_seconds: 300 },
] as const;

/**
 * §9.6, cross-check only and never the source of truth. USD per MILLION tokens.
 *
 * `openai/whisper-large-v3` is deliberately absent: speech-to-text is billed per
 * minute of audio, has no per-token entry, and inventing one would poison the
 * only number §9 exists to produce.
 */
export const REFERENCE_PRICES: Record<
  string,
  { inputPerMillion: number; outputPerMillion: number }
> = {
  'google/gemma-4-31b-it:free': { inputPerMillion: 0, outputPerMillion: 0 },
  'qwen/qwen3.7-flash': { inputPerMillion: 0.03, outputPerMillion: 0.13 },
  'stepfun/step-3.7-flash': { inputPerMillion: 0.2, outputPerMillion: 1.15 },
};

/** The eight-key record §8.7.7 defines. Structural — no cross-package import. */
export interface CostCallUsage {
  model_requested: string;
  model_served: string | null;
  generation_id: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  finish_reason: string | null;
  measured: boolean;
}

/**
 * §9.5. A measurement is valid only when all five hold. Anything else is
 * recorded as INVALID with the reason, excluded from the median, and NEVER
 * coerced to zero.
 *
 * A row whose analysis call threw is emitted with that ONE reason and the five
 * checks are not run on it, because there is no reply to check — pass
 * `analysisError` and nothing else.
 */
export function invalidReasons(input: {
  analysisError?: string;
  analysis: CostCallUsage | null;
  transcript: CostCallUsage | null;
  parsedSixKeys: boolean;
  transcriptSegments: number;
}): string[] {
  if (input.analysisError !== undefined) {
    return [`analysis call failed: ${input.analysisError}`];
  }
  const reasons: string[] = [];
  const analysis = input.analysis;
  if (analysis === null || analysis.cost_usd === null) {
    reasons.push('usage.cost absent');
  }
  if (!input.parsedSixKeys) {
    reasons.push('reply did not parse as the six-dimension object');
  }
  if (analysis !== null) {
    // The failing predicate, spelled the same in every section. `null` is VALID:
    // some providers omit it, and §8.7.7's `measured` already treats null as
    // non-truncating.
    const finish = analysis.finish_reason;
    if (finish !== null && finish !== 'stop') {
      reasons.push(`finish_reason=${finish}`);
    }
    if (analysis.model_served === null) {
      reasons.push(
        'model identity unconfirmed — the response carried no model field',
      );
    } else if (analysis.model_served !== analysis.model_requested) {
      reasons.push(`model substituted — served ${analysis.model_served}`);
    }
  }
  if (input.transcriptSegments === 0) {
    reasons.push('no transcript in the prompt');
  }
  if (input.transcript === null || input.transcript.cost_usd === null) {
    reasons.push('transcript leg not measured');
  }
  return reasons;
}

/**
 * §9.7. Summed BEFORE the single division — grouping it the other way moves the
 * last bits of an unrounded field in a file whose stated purpose is diffability.
 * `null` when the model has no reference entry or either token count is absent.
 */
export function usdAnalysisFromTable(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  const prices = REFERENCE_PRICES[model];
  if (prices === undefined) return null;
  if (promptTokens === null || completionTokens === null) return null;
  return (
    (promptTokens * prices.inputPerMillion +
      completionTokens * prices.outputPerMillion) /
    1e6
  );
}

/**
 * §9.4. `(|billed − table| ÷ billed) × 100`, in percent. `null` — rendered `—` —
 * when `billed` is 0 (the free model) or either token count is absent. A gap over
 * 10% means the §9.6 table is stale.
 */
export function tableGapPct(
  billedUsd: number | null,
  fromTableUsd: number | null,
): number | null {
  if (billedUsd === null || billedUsd === 0 || fromTableUsd === null) {
    return null;
  }
  return (Math.abs(billedUsd - fromTableUsd) / billedUsd) * 100;
}

/** `USD total` is `—` (never 0) if either leg is unmeasured. */
export function usdTotal(
  analysisUsd: number | null,
  transcriptUsd: number | null,
): number | null {
  if (analysisUsd === null || transcriptUsd === null) return null;
  return analysisUsd + transcriptUsd;
}

export function myrTotal(
  usd: number | null,
  usdMyrRate: number,
): number | null {
  return usd === null ? null : usd * usdMyrRate;
}

export function myrPerMinute(
  myr: number | null,
  durationSeconds: number | null,
): number | null {
  if (myr === null || durationSeconds === null || durationSeconds <= 0) {
    return null;
  }
  return myr / (durationSeconds / 60);
}

export interface MedianReport {
  /** The single middle value, or null on an even count (§9.5). */
  median: number | null;
  /** Both middle values on an even count — never averaged. */
  middlePair: [number, number] | null;
  min: number | null;
  max: number | null;
  count: number;
  /** §9.5: fewer than 4 valid rows out of 5 has NOT been measured. */
  measured: boolean;
}

/**
 * §9.5. On an EVEN number of valid rows, report the range and both middle values
 * rather than averaging them — and report the multiple against the RM0.12 guess
 * as `n/a` rather than computing it from a chosen middle.
 */
export function medianReport(values: readonly number[]): MedianReport {
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) {
    return {
      median: null,
      middlePair: null,
      min: null,
      max: null,
      count: 0,
      measured: false,
    };
  }
  const measured = count >= 4;
  const min = sorted[0];
  const max = sorted[count - 1];
  if (count % 2 === 1) {
    return {
      median: sorted[(count - 1) / 2],
      middlePair: null,
      min,
      max,
      count,
      measured,
    };
  }
  return {
    median: null,
    middlePair: [sorted[count / 2 - 1], sorted[count / 2]],
    min,
    max,
    count,
    measured,
  };
}

/**
 * §9.2's closed list of `note` values. A path that reaches the artifact writer
 * with a note outside it is a bug.
 */
export type RunNote =
  | null
  | 'spend ceiling USD 2 exceeded'
  | 'transcript leg not measured'
  | 'free-model gate failed'
  | 'unknown model id in --models'
  /** One of §9.1's preflight check names. */
  | 'Fixtures ignored'
  | 'FX rate usable'
  | 'Config'
  | 'FFmpeg present'
  | 'Both files per clip'
  | 'Fixture is ladder output'
  | 'Duration readable'
  /** `unexpected failure: <message>` from the top-level catch-all. */
  | `unexpected failure: ${string}`;

/**
 * §9. Overrides the fixed rate for a single run. A value that is not a finite
 * number > 0 is a §9.1 preflight failure — exit 1 before any call, NEVER a
 * silent fall back to 4.25.
 */
export function parseUsdMyrRate(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return DEFAULT_USD_MYR_RATE;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
