/**
 * PRD 3 §9.3: each new jest config ships with at least one real test in C0, or
 * CI fails on "no tests found". The two assertions it names are the two below —
 * `SCORE_KEYS` in PRD 1 §8.7.1's fixed order, and `JobErrorCode`'s eleven
 * members.
 *
 * The expectations are written out longhand on purpose. Deriving them from the
 * thing under test would assert nothing; this file is the second copy that
 * catches a silent reorder, which is exactly how dimension 3 once scored 0 on
 * every report.
 */

import {
  ALLOWED_EXTENSIONS,
  isUuid,
  MAX_COMPRESSED_BYTES,
  MAX_DURATION_SECONDS,
  MAX_UPLOAD_BYTES,
  SCORE_KEYS,
  type JobErrorCode,
  type JobStatus,
  type JobStep,
} from './contract';

describe('SCORE_KEYS', () => {
  it('has the six §8.7.1 keys in their fixed order', () => {
    expect(SCORE_KEYS).toEqual([
      'opening_hook',
      'script_structure',
      'emotional_arc',
      'engagement_prompts',
      'performance_prediction',
      'content_formula',
    ]);
    expect(SCORE_KEYS).toHaveLength(6);
  });

  it('spells dimension 3 `emotional_arc`, never `emotion_curve`', () => {
    // The dimension and the time series must never share a string: a JSON
    // schema whose `properties` object lost one to the other is why dimension 3
    // scored 0 on every report.
    expect(SCORE_KEYS).toContain('emotional_arc');
    expect(SCORE_KEYS as readonly string[]).not.toContain('emotion_curve');
  });
});

describe('the three enums (§C1.3)', () => {
  it('JobErrorCode has exactly the eleven §8.7.9 members', () => {
    const codes: JobErrorCode[] = [
      'too_long',
      'too_large',
      'unsupported_format',
      'no_video_stream',
      'compress_failed',
      'over_size_cap',
      'transcript_failed',
      'model_failed',
      'timeout',
      'interrupted',
      'internal',
    ];
    expect(new Set(codes).size).toBe(11);
    // `unreadable`, `transcribe_failed` and `analyse_failed` are not ids: a
    // `@ts-expect-error` fails to compile the day one of them is added back.
    // @ts-expect-error — not a JobErrorCode
    const notACode: JobErrorCode = 'unreadable';
    expect(codes).not.toContain(notACode);
  });

  it('JobStatus has four ids and no `timed_out`', () => {
    const statuses: JobStatus[] = ['queued', 'running', 'done', 'failed'];
    expect(new Set(statuses).size).toBe(4);
    // @ts-expect-error — a timeout is status 'failed' with error.code 'timeout'
    const notAStatus: JobStatus = 'timed_out';
    expect(statuses).not.toContain(notAStatus);
  });

  it('the fourth JobStep id is `analyzing`, never `analysing`', () => {
    const steps: JobStep[] = [
      'compressing',
      'extracting_audio',
      'transcribing',
      'analyzing',
    ];
    expect(steps).toHaveLength(4);
    // @ts-expect-error — 'analysing' is the LABEL, and is not an id anywhere
    const notAStep: JobStep = 'analysing';
    expect(steps).not.toContain(notAStep);
  });
});

describe('the four cross-package limits (§8.5)', () => {
  it('are decimal, not binary', () => {
    expect(MAX_UPLOAD_BYTES).toBe(2_000_000_000);
    expect(MAX_DURATION_SECONDS).toBe(300);
    expect(MAX_COMPRESSED_BYTES).toBe(15_000_000);
  });

  it('checks extensions, lower-cased and dotted, never MIME', () => {
    expect(ALLOWED_EXTENSIONS).toEqual(['.mp4', '.mov', '.webm', '.avi']);
  });
});

describe('isUuid', () => {
  it('accepts a shape-valid UUID in either case and rejects everything else', () => {
    expect(isUuid('8f6c1f0e-3a4b-4d21-9c77-2b5a0e91d4c3')).toBe(true);
    expect(isUuid('8F6C1F0E-3A4B-4D21-9C77-2B5A0E91D4C3')).toBe(true);
    expect(isUuid('8f6c1f0e3a4b4d219c772b5a0e91d4c3')).toBe(false);
    expect(isUuid('../../etc/passwd')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
