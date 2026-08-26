/**
 * PRD 1 §8.7.4 and §8.7.5 — the two normalisation tables, step by step, plus
 * §8.7.2's clamp and §8.7.3's derivation. The parse rule in `prompt.ts` is
 * exercised here too: it is the ONE function that decides whether a reply
 * parsed, so §9.5 and the pipeline's `model_failed` branch cannot disagree.
 */

import {
  buildAnalysisResult,
  clampScores,
  deriveOverallScore,
  normaliseEmotionCurve,
  normaliseTranscript,
} from './analysis';
import { SCORE_KEYS, type DimensionScore, type ScoreKey } from './contract';
import { buildAnalysisPrompt, parseAnalysisReply } from './prompt';

function scoreSet(values: number[]): Record<ScoreKey, DimensionScore> {
  const out = {} as Record<ScoreKey, DimensionScore>;
  SCORE_KEYS.forEach((key, i) => {
    out[key] = { score: values[i], why: 'w', evidence: 'e' };
  });
  return out;
}

describe('emotion_curve normalisation (§8.7.4)', () => {
  it('1 — drops a non-array, and any point with a non-finite t or value', () => {
    expect(normaliseEmotionCurve(null, 47)).toEqual([]);
    expect(normaliseEmotionCurve({ t: 1, value: 1 }, 47)).toEqual([]);
    expect(
      normaliseEmotionCurve(
        [
          { t: 1, value: 5 },
          { t: 'x', value: 5 },
          { t: 2, value: NaN },
          { t: Infinity, value: 5 },
          null,
        ],
        47,
      ),
    ).toEqual([{ t: 1, value: 5 }]);
  });

  it('2 — DROPS a t outside 0…duration_seconds rather than clamping it', () => {
    // Clamping would manufacture duplicate `t` values at the edges, which
    // §8.7.4 calls a service bug.
    expect(
      normaliseEmotionCurve(
        [
          { t: -1, value: 5 },
          { t: 0, value: 5 },
          { t: 47, value: 5 },
          { t: 47.1, value: 5 },
          { t: 900, value: 5 },
        ],
        47,
      ),
    ).toEqual([
      { t: 0, value: 5 },
      { t: 47, value: 5 },
    ]);
  });

  it('3 — CLAMPS value into 0…10 (the opposite of the t rule)', () => {
    expect(
      normaliseEmotionCurve(
        [
          { t: 1, value: -4 },
          { t: 2, value: 99 },
        ],
        47,
      ),
    ).toEqual([
      { t: 1, value: 0 },
      { t: 2, value: 10 },
    ]);
  });

  it('4 — rounds both t and value to ONE decimal', () => {
    expect(normaliseEmotionCurve([{ t: 3.456, value: 7.89 }], 47)).toEqual([
      { t: 3.5, value: 7.9 },
    ]);
  });

  it('5 — sorts ascending by t; on a duplicate the FIRST point survives', () => {
    expect(
      normaliseEmotionCurve(
        [
          { t: 8, value: 3 },
          { t: 2.51, value: 1 }, // rounds to 2.5 — first, so it wins
          { t: 2.54, value: 9 },
          { t: 0, value: 4 },
        ],
        47,
      ),
    ).toEqual([
      { t: 0, value: 4 },
      { t: 2.5, value: 1 },
      { t: 8, value: 3 },
    ]);
  });

  it('6 — an empty array after all of that is written as [], never a failure', () => {
    expect(normaliseEmotionCurve([{ t: 900, value: 5 }], 47)).toEqual([]);
  });

  it('never pads or truncates to reach the 8-to-20 count', () => {
    const three = [
      { t: 1, value: 1 },
      { t: 2, value: 2 },
      { t: 3, value: 3 },
    ];
    expect(normaliseEmotionCurve(three, 47)).toHaveLength(3);
  });
});

describe('transcript normalisation (§8.7.5)', () => {
  it('1 — drops a non-finite timestamp, and a segment where end < start', () => {
    expect(
      normaliseTranscript(
        [
          { start: 0, end: 2.4, text: 'kept' },
          { start: NaN, end: 3, text: 'dropped' },
          { start: 5, end: Infinity, text: 'dropped' },
          { start: 9, end: 8, text: 'dropped' },
        ],
        47,
      ),
    ).toEqual([{ start: 0, end: 2.4, text: 'kept' }]);
  });

  it('2 — CLAMPS into 0…duration_seconds, end after start so end >= start holds', () => {
    expect(
      normaliseTranscript(
        [
          { start: -3, end: 2, text: 'a' },
          { start: 45, end: 60, text: 'b' },
          { start: 55, end: 70, text: 'c' },
        ],
        47,
      ),
    ).toEqual([
      { start: 0, end: 2, text: 'a' },
      { start: 45, end: 47, text: 'b' },
      { start: 47, end: 47, text: 'c' },
    ]);
  });

  it('3 — nothing else: no second rounding, no re-sort, no de-duplication', () => {
    const input = [
      { start: 2.345, end: 3.456, text: 'b' },
      { start: 0.5, end: 1, text: 'a' },
      { start: 0.5, end: 1.2, text: 'second speaker' },
    ];
    // Order is preserved exactly; the client already sorted, and duplicate
    // `start` values are kept because two speakers can share a timestamp.
    expect(normaliseTranscript(input, 47)).toEqual(input);
  });

  it('[] is legal and means no speech', () => {
    expect(normaliseTranscript([], 47)).toEqual([]);
  });
});

describe('scores and the derived overall (§8.7.2, §8.7.3)', () => {
  it('clamps into 0…10 and rounds to an integer', () => {
    const clamped = clampScores(scoreSet([-2, 11, 7.4, 7.5, 0, 10]));
    expect(SCORE_KEYS.map((k) => clamped[k].score)).toEqual([
      0, 10, 7, 8, 0, 10,
    ]);
  });

  it('overall_score is the unweighted mean to exactly one decimal', () => {
    // §8.7.11's worked example: six scores summing to 47 → 7.8333… → 7.8
    expect(deriveOverallScore(scoreSet([9, 8, 7, 6, 8, 9]))).toBe(7.8);
    expect(deriveOverallScore(scoreSet([10, 10, 10, 10, 10, 10]))).toBe(10);
    expect(deriveOverallScore(scoreSet([0, 0, 0, 0, 0, 0]))).toBe(0);
  });

  it('buildAnalysisResult derives from the CLAMPED scores, not the raw ones', () => {
    const usage = {
      analysis: {
        model_requested: 'm',
        model_served: 'm',
        generation_id: 'g',
        prompt_tokens: 1,
        completion_tokens: 1,
        cost_usd: 0.1,
        finish_reason: 'stop',
        measured: true,
      },
      transcript: null,
    };
    const result = buildAnalysisResult({
      scores: scoreSet([99, 8, 7, 6, 8, 9]),
      emotionCurveRaw: [{ t: 1, value: 5 }],
      transcript: [],
      reportText: 'body',
      durationSeconds: 47,
      usage,
    });
    // 99 clamps to 10, so the mean is (10+8+7+6+8+9)/6 = 8.0, never 22.8.
    expect(result.scores.opening_hook.score).toBe(10);
    expect(result.overall_score).toBe(8);
    expect(result.usage.transcript).toBeNull();
  });
});

describe('parseAnalysisReply (§8.3.5) — only the six scores can return null', () => {
  const sixGoodScores = Object.fromEntries(
    SCORE_KEYS.map((k) => [k, { score: 7, why: 'w', evidence: 'e' }]),
  );

  it('returns null when a score key is missing', () => {
    const { opening_hook: _dropped, ...five } = sixGoodScores;
    expect(parseAnalysisReply({ scores: five })).toBeNull();
  });

  it('returns null when a score is present but unreadable — never a 0', () => {
    for (const bad of [null, 'seven', NaN, undefined]) {
      const scores = { ...sixGoodScores, emotional_arc: { score: bad } };
      expect(parseAnalysisReply({ scores })).toBeNull();
    }
  });

  it('returns null on a missing or non-object `scores`', () => {
    expect(parseAnalysisReply(null)).toBeNull();
    expect(parseAnalysisReply({})).toBeNull();
    expect(parseAnalysisReply({ scores: [] })).toBeNull();
  });

  it('a missing emotion_curve / report_text / why / evidence is NOT a parse failure', () => {
    const parsed = parseAnalysisReply({
      scores: {
        ...sixGoodScores,
        content_formula: { score: 5, why: 42, evidence: null },
      },
      emotion_curve: 'not an array',
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.emotion_curve).toEqual([]);
    expect(parsed!.report_text).toBe('');
    expect(parsed!.scores.content_formula).toEqual({
      score: 5,
      why: '',
      evidence: '',
    });
  });

  it('does no clamping or rounding — that is the pipeline’s, applied after', () => {
    const parsed = parseAnalysisReply({
      scores: { ...sixGoodScores, opening_hook: { score: 42.7 } },
    });
    expect(parsed!.scores.opening_hook.score).toBe(42.7);
  });
});

describe('the prompt (§8.3.5)', () => {
  it('renders timestamps as whole seconds with an ASCII hyphen', () => {
    const text = buildAnalysisPrompt({
      reportLanguage: 'en',
      durationSeconds: 47,
      transcript: [{ start: 3.4, end: 7.9, text: 'hello' }],
    });
    expect(text).toContain('[0:03-0:07] hello');
    // An en dash changes the token count on CJK-adjacent text.
    expect(text).not.toContain('–');
  });

  it('switches to the no-audio instruction when the transcript is empty', () => {
    const silent = buildAnalysisPrompt({
      reportLanguage: 'en',
      durationSeconds: 47,
      transcript: [],
    });
    expect(silent).toContain('NO audio track');
    expect(silent).not.toContain('Transcript (the');
  });

  it('names the report language, and keeps every instruction in English', () => {
    const zh = buildAnalysisPrompt({
      reportLanguage: 'zh',
      durationSeconds: 47,
      transcript: [],
    });
    expect(zh).toContain('Simplified Chinese (简体中文)');
    expect(zh).toContain('You are a short-video analyst.');
  });

  it('lists all six keys, in SCORE_KEYS order, and never spells one as the other', () => {
    // With a transcript, so the no-audio sentence — which names
    // "script_structure" ahead of the numbered list — is not in the way.
    const text = buildAnalysisPrompt({
      reportLanguage: 'en',
      durationSeconds: 47,
      transcript: [{ start: 0, end: 1, text: 'hi' }],
    });
    const positions = SCORE_KEYS.map((k) => text.indexOf(`"${k}"`));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text).toContain('"emotional_arc"');
    expect(text).toContain('"emotion_curve"');
  });
});
