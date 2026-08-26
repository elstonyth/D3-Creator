/**
 * PRD 1 §8.3.5 — the production prompt, verbatim. The §9 harness and the job
 * pipeline both call it; THERE IS NO MEASUREMENT-ONLY VARIANT. Any edit to the
 * text below invalidates the §9 measurement and requires a full fixture re-run
 * (§12 step 8).
 *
 * No `config.ts` import: `parseAnalysisReply` is reached from a jest test
 * through `analysis.ts` (PRD 1 §8.2).
 */

import {
  SCORE_KEYS,
  type AnalysisResult,
  type DimensionScore,
  type EmotionPoint,
  type ReportLanguage,
  type ScoreKey,
  type TranscriptSegment,
} from './contract';
import type { ChatMessage } from '@d3/openrouter';

/**
 * Amendment 1 Part D. The frontend renders the profile block and bounds it, but
 * the field arrives from the BROWSER (the upload route streams its body through
 * and cannot inject one), so it is bounded here too.
 *
 * 3,075 is the measured ceiling of `renderProfileBlock` at every cap, pinned by
 * `apps/frontend/src/lib/chat-prompt.test.ts`. Anything longer is dropped
 * rather than truncated: half a profile is worse guidance than none.
 *
 * It lives in `prompt.ts` and not in `upload.ts` because `upload.ts` imports
 * `config.ts`, which uses `import.meta` and cannot be loaded by jest.
 */
export const MAX_BUSINESS_PROFILE_CHARS = 3075;

export function parseBusinessProfile(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value === '' || value.length > MAX_BUSINESS_PROFILE_CHARS) return null;
  return value;
}


const LANGUAGE_NAMES: Record<ReportLanguage, string> = {
  en: 'English',
  zh: 'Simplified Chinese (简体中文)',
  ms: 'Bahasa Malaysia',
};

/** The human name for each dimension. PRD 1 §8.7.1's Card-label column — the
 *  model must write these in `report_text`, never the machine key. */
const DIMENSION_LABEL: Record<(typeof SCORE_KEYS)[number], string> = {
  opening_hook: 'Opening hook',
  script_structure: 'Script structure',
  emotional_arc: 'Emotional arc',
  engagement_prompts: 'Engagement prompts',
  performance_prediction: 'Performance prediction',
  content_formula: 'Content formula',
};

const DIMENSION_BRIEF: Record<(typeof SCORE_KEYS)[number], string> = {
  opening_hook:
    'The first 3 seconds. Does the viewer learn what they are here for before they can scroll away?',
  script_structure:
    'The spine of the piece. Setup, body, payoff — is there one, is it in the right order, does anything sag?',
  emotional_arc:
    'How the energy moves across the whole clip. A flat clip and a clip that peaks and recovers score differently.',
  engagement_prompts:
    'Anything that asks for a comment, a share, a save or a follow — where it lands and whether it earns the ask.',
  performance_prediction:
    'Your judgement of how this will actually perform, given the hook, the length and the close.',
  content_formula:
    'The repeatable pattern underneath. Could the creator run this same shape again next week with new material?',
};

/** `[m:ss-m:ss] text`, ASCII hyphen, whole seconds. */
function line(s: TranscriptSegment): string {
  const t = (n: number) =>
    `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
  return `[${t(s.start)}-${t(s.end)}] ${s.text}`;
}

export function buildAnalysisPrompt(input: {
  reportLanguage: ReportLanguage;
  durationSeconds: number; // the STORED 1-dp duration (§8.5)
  transcript: TranscriptSegment[]; // the NORMALISED array (§8.7.5 step 4), never the client's raw segments
  /**
   * The already-rendered §10A.6 profile block, or null. Amendment 1 Part D.
   *
   * An OPAQUE STRING. This service never reads Supabase, never learns the
   * column set, and never gets a profile-to-text function of its own — the
   * frontend calls the one serialiser in `lib/chat-prompt.ts`.
   */
  businessProfile?: string | null;
}): string {
  const language = LANGUAGE_NAMES[input.reportLanguage];
  const duration = input.durationSeconds;
  const hasAudio = input.transcript.length > 0;
  const dimensions = SCORE_KEYS.map(
    (k, i) =>
      `${i + 1}. "${k}" — write its name as "${DIMENSION_LABEL[k]}" — ${DIMENSION_BRIEF[k]}`,
  ).join('\n');

  // Rendered by the frontend and bounded there; absent leaves the prompt
  // byte-identical to the pre-Amendment-1 one, which is what makes the "null
  // produces the same prompt" test meaningful.
  const profile = (input.businessProfile ?? '').trim();

  return `You are a short-video analyst. You are given a video and, below, the verbatim transcript of what is said in it. Watch the video: judge the cuts, the pacing, the framing, the faces and the on-screen text, not only the words.

The clip is ${duration} seconds long.${
    profile === ''
      ? ''
      : `

This video belongs to the following business. Judge it against what this business is trying to sell and who it is trying to reach, and let their stated voice and boundaries steer "What to change first". Do not restate the profile back to them.

${profile}`
  }

${
  hasAudio
    ? `Transcript (the video's own language, with timestamps):\n${input.transcript.map(line).join('\n')}`
    : 'This video has NO audio track and therefore no transcript. Score "script_structure" from the on-screen text, the captions and the visual structure of the piece rather than from dialogue, and say so in its "why". Do not guess at words that were never spoken.'
}

Score these six dimensions, each an INTEGER from 0 to 10 inclusive. No decimals. Do not add score anchors of your own.

For each dimension write "why" as two or three sentences that name the specific moment, line or choice you are judging. A sentence that could be pasted into a review of any other video is not an answer.

For each dimension write "evidence" as a timestamp followed by " — " and then either a short quoted line from the transcript or a concrete description of what is on screen at that second. For example: 0:03 — on-screen text reads "RM198, free delivery". Never leave "evidence" empty, never write "N/A", and never invent a quote that is not in the transcript or visibly on screen.

${dimensions}

Then plot how the emotional energy moves across the clip, as "emotion_curve": between 8 and 20 points, strictly ascending by "t", where "t" is seconds from the start of the video (0 to ${duration}, at most one decimal) and "value" is 0 to 10 on the same scale as the six scores. Spread the points across the whole clip, not only the opening. No duplicate "t".

Then write "report_text": the full written breakdown a creator would read. Plain text only — no markdown, no "#", no "*", no bullet characters. Separate EVERY paragraph with a blank line; a single unbroken block of text is unusable. Structure it exactly like this:

First paragraph: the overall verdict, two or three sentences — what this video is trying to do, and whether it does it.
Then one paragraph per dimension, in the order above. Open each with the dimension's NAME exactly as given above — "${SCORE_KEYS.map((k) => DIMENSION_LABEL[k]).join('", "')}" — never the machine key like "opening_hook". Follow it with " — ", then two or three sentences that judge a specific moment rather than the clip in general.
Final paragraph: begin with "What to change first:" and name one concrete change, specific enough to act on this week.

Write "why", "evidence" and "report_text" in ${language}. Leave the video's own language alone anywhere you quote it. Every other instruction above stays in English whatever the report language is — translating the instructions changes the prompt token count per language and makes §9's rows incomparable.

Return ONE JSON object and nothing else — no prose before it, no code fence around it. Exactly this shape, with exactly these keys:

{
  "scores": {
${SCORE_KEYS.map((k) => `    "${k}": { "score": 0, "why": "two or three specific sentences", "evidence": "0:00 — a quoted line or an on-screen detail" }`).join(',\n')}
  },
  "emotion_curve": [{ "t": 0, "value": 0 }],
  "report_text": "..."
}

Rules that make a reply unusable if broken:
- All six score keys must be present. A missing key is worse than a low score.
- "score" is an integer 0-10. Never a decimal, never a string, never null.
- Do not add an overall score. It is derived from the six and yours is discarded.
- "emotional_arc" is a dimension. "emotion_curve" is the time series. They are different keys and neither may be spelled as the other.
- "evidence" must point at something really in the clip — a line that was said or something visible on screen — and must start with a timestamp. Do not invent a quote.
- "report_text" must contain blank lines between its paragraphs. One long block is a broken reply.
- "report_text" uses the human dimension names, never the machine keys.`;
}

/** One message. No system message. Text part first, video part second. */
export function buildAnalysisMessages(
  input: Parameters<typeof buildAnalysisPrompt>[0] & { videoBase64: string },
): ChatMessage[] {
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: buildAnalysisPrompt(input) },
        {
          type: 'video_url',
          video_url: { url: `data:video/mp4;base64,${input.videoBase64}` },
        },
      ],
    },
  ];
}

/**
 * The ONLY function that decides whether a reply parsed — §9.5's validity check
 * and the pipeline's `model_failed` branch both call it, so they cannot
 * disagree. It does no clamping, no rounding and no normalisation; §8.7.2,
 * §8.7.4 and §8.7.5 are the pipeline's, applied after.
 *
 * ONLY the six scores can make it return `null`. `emotion_curve` absent or not
 * an array yields `[]`; `report_text` absent or not a string yields `''`; a
 * non-string `why` or `evidence` yields `''`. None of those four is a parse
 * failure, because §9.5 uses this one function to decide "reply did not parse as
 * the six-dimension object", and that reason must mean the six scores and
 * nothing else. Never throws.
 */
export function parseAnalysisReply(
  obj: Record<string, unknown> | null,
): Pick<AnalysisResult, 'scores' | 'emotion_curve' | 'report_text'> | null {
  if (obj === null) return null;

  const rawScores = obj.scores;
  if (
    typeof rawScores !== 'object' ||
    rawScores === null ||
    Array.isArray(rawScores)
  ) {
    return null;
  }
  const source = rawScores as Record<string, unknown>;

  const scores = {} as Record<ScoreKey, DimensionScore>;
  for (const key of SCORE_KEYS) {
    const entry = source[key];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return null;
    }
    const row = entry as Record<string, unknown>;
    // A present-but-unreadable score is a MISSING dimension (§8.7.2), never a 0.
    if (typeof row.score !== 'number' || !Number.isFinite(row.score)) {
      return null;
    }
    scores[key] = {
      score: row.score,
      why: typeof row.why === 'string' ? row.why : '',
      evidence: typeof row.evidence === 'string' ? row.evidence : '',
    };
  }

  const emotion_curve: EmotionPoint[] = Array.isArray(obj.emotion_curve)
    ? (obj.emotion_curve as EmotionPoint[])
    : [];

  return {
    scores,
    emotion_curve,
    report_text: typeof obj.report_text === 'string' ? obj.report_text : '',
  };
}
