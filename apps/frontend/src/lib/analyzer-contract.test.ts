/**
 * PRD 3 §6.9 criterion 7, C4's half: every failing branch of
 * `isCompleteResult`, `errorCopy` falling through to the `internal` copy, and
 * `formatJobDate` on an unparseable date.
 */

import {
  SCORE_KEYS,
  SCORE_MAX,
  STEP_LABEL,
  STEP_ORDER,
  errorCopy,
  formatJobDate,
  formatTimecode,
  isCompleteResult,
  splitParagraphs,
} from './analyzer-contract';

const INTERNAL_COPY =
  'The job stopped before it produced a report. Uploading the video again is the fastest fix.';

function completeResult(overrides: Record<string, unknown> = {}) {
  return {
    overall_score: 7.8,
    scores: Object.fromEntries(
      SCORE_KEYS.map((k) => [k, { score: 7, why: 'w', evidence: 'e' }]),
    ),
    emotion_curve: [],
    transcript: [],
    report_text: 'body',
    usage: { analysis: null, transcript: null },
    ...overrides,
  };
}

describe('isCompleteResult (§6.5)', () => {
  it('accepts a complete result, including empty arrays and an empty report', () => {
    expect(isCompleteResult(completeResult())).toBe(true);
    expect(isCompleteResult(completeResult({ report_text: '' }))).toBe(true);
    expect(
      isCompleteResult(completeResult({ emotion_curve: [{ t: 1, value: 5 }] })),
    ).toBe(true);
  });

  it('rejects a missing result', () => {
    expect(isCompleteResult(null)).toBe(false);
    expect(isCompleteResult(undefined)).toBe(false);
    expect(isCompleteResult('done')).toBe(false);
    expect(isCompleteResult([])).toBe(false);
  });

  it('rejects a non-finite or missing overall_score — never recomputes it', () => {
    expect(isCompleteResult(completeResult({ overall_score: undefined }))).toBe(
      false,
    );
    expect(isCompleteResult(completeResult({ overall_score: NaN }))).toBe(
      false,
    );
    expect(isCompleteResult(completeResult({ overall_score: '7.8' }))).toBe(
      false,
    );
  });

  it('rejects partial scores — never a five-sided radar', () => {
    const partial = completeResult();
    delete (partial.scores as Record<string, unknown>).content_formula;
    expect(isCompleteResult(partial)).toBe(false);
    expect(isCompleteResult(completeResult({ scores: {} }))).toBe(false);
    expect(isCompleteResult(completeResult({ scores: null }))).toBe(false);
  });

  it('rejects a FRACTIONAL score — dimension scores are integers', () => {
    const fractional = completeResult();
    (fractional.scores as Record<string, { score: number }>).opening_hook = {
      score: 7.5,
    };
    expect(isCompleteResult(fractional)).toBe(false);
  });

  it('rejects a score outside 0…SCORE_MAX', () => {
    for (const bad of [-1, SCORE_MAX + 1]) {
      const out = completeResult();
      (out.scores as Record<string, { score: number }>).emotional_arc = {
        score: bad,
      };
      expect(isCompleteResult(out)).toBe(false);
    }
  });

  it('rejects a missing or non-array emotion_curve / transcript', () => {
    expect(isCompleteResult(completeResult({ emotion_curve: undefined }))).toBe(
      false,
    );
    expect(isCompleteResult(completeResult({ transcript: null }))).toBe(false);
    expect(isCompleteResult(completeResult({ transcript: {} }))).toBe(false);
  });

  it('rejects a missing report_text — this is the check that gates Download', () => {
    expect(isCompleteResult(completeResult({ report_text: undefined }))).toBe(
      false,
    );
    expect(isCompleteResult(completeResult({ report_text: null }))).toBe(false);
  });

  it('rejects a wholly camelCase payload', () => {
    expect(
      isCompleteResult({
        overallScore: 7.8,
        scores: Object.fromEntries(SCORE_KEYS.map((k) => [k, { score: 7 }])),
        emotionCurve: [],
        transcript: [],
        reportText: 'body',
      }),
    ).toBe(false);
  });
});

describe('errorCopy (§6.3)', () => {
  it('returns the listed sentence for a known code', () => {
    expect(errorCopy('too_long')).toBe('That video is longer than 5 minutes.');
    expect(errorCopy('over_size_cap')).toBe(
      "That video is too long to compress within the model's limit.",
    );
  });

  it('returns the internal copy for an unknown code, null and undefined', () => {
    expect(errorCopy('analyse_failed')).toBe(INTERNAL_COPY);
    expect(errorCopy('unreadable')).toBe(INTERNAL_COPY);
    expect(errorCopy(null)).toBe(INTERNAL_COPY);
    expect(errorCopy(undefined)).toBe(INTERNAL_COPY);
    expect(errorCopy('')).toBe(INTERNAL_COPY);
  });

  it('is an own-property lookup — never an inherited Object.prototype value', () => {
    expect(errorCopy('constructor')).toBe(INTERNAL_COPY);
    expect(errorCopy('toString')).toBe(INTERNAL_COPY);
    expect(errorCopy('__proto__')).toBe(INTERNAL_COPY);
  });
});

describe('formatJobDate (§6.4)', () => {
  it('formats in Asia/Kuala_Lumpur, 24-hour', () => {
    expect(formatJobDate('2026-08-17T02:30:00.000Z')).toBe(
      '17 Aug 2026, 10:30',
    );
  });

  it('returns an em dash for an unparseable or missing date', () => {
    expect(formatJobDate('not a date')).toBe('—');
    expect(formatJobDate('')).toBe('—');
    expect(formatJobDate(null)).toBe('—');
    expect(formatJobDate(undefined)).toBe('—');
  });
});

describe('formatTimecode', () => {
  it('is m:ss, widening to h:mm:ss past an hour', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(7)).toBe('0:07');
    expect(formatTimecode(47)).toBe('0:47');
    expect(formatTimecode(90)).toBe('1:30');
    expect(formatTimecode(600)).toBe('10:00');
    expect(formatTimecode(3600)).toBe('1:00:00');
    expect(formatTimecode(3725)).toBe('1:02:05');
  });

  it('is 0:00 on a non-finite or negative input', () => {
    expect(formatTimecode(NaN)).toBe('0:00');
    expect(formatTimecode(Infinity)).toBe('0:00');
    expect(formatTimecode(-5)).toBe('0:00');
  });
});

describe('the step vocabulary (§6.2)', () => {
  it('is the four ids in pipeline order, and the id is `analyzing`', () => {
    expect(STEP_ORDER).toEqual([
      'compressing',
      'extracting_audio',
      'transcribing',
      'analyzing',
    ]);
    // The id is `analyzing`; the LABEL is "Analysing". Both spellings are
    // deliberate. `'analysing'` is not an id anywhere.
    expect(STEP_LABEL.analyzing).toBe('Analysing');
    expect(Object.keys(STEP_LABEL)).not.toContain('analysing');
  });
});

describe('splitParagraphs', () => {
  it('splits on blank lines', () => {
    expect(splitParagraphs('Verdict.\n\nHook — good.\n\nWhat to change first: x')).toEqual([
      'Verdict.',
      'Hook — good.',
      'What to change first: x',
    ]);
  });

  it('falls back to single newlines when there are no blank lines', () => {
    expect(splitParagraphs('one\ntwo\nthree')).toEqual(['one', 'two', 'three']);
  });

  it('returns ONE paragraph for an unbroken block — the real failure mode', () => {
    // An early live run returned 1,372 characters with zero newlines.
    const wall = 'a'.repeat(1372);
    expect(splitParagraphs(wall)).toEqual([wall]);
  });

  it('handles CRLF, padding and empty input', () => {
    expect(splitParagraphs('a\r\n\r\nb')).toEqual(['a', 'b']);
    expect(splitParagraphs('  \n\n  ')).toEqual([]);
    expect(splitParagraphs('')).toEqual([]);
  });
});
