/**
 * The analyzer's page-facing vocabulary — PRD 3 §5.9.4.
 *
 * CLIENT-SAFE. It must not import `next/headers`, `lib/auth.ts`,
 * `lib/supabase-route.ts` or `lib/analyzer.ts`. Server modules may import types
 * straight from `@d3/analyzer`; anything under `src/components/`, any page, and
 * any `'use client'` file imports from here.
 *
 * Every name `@d3/analyzer` already owns is RE-EXPORTED, never re-declared.
 * The labels, copy and formatters below are declared here because nothing else
 * owns them.
 */

export {
  SCORE_KEYS,
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  MAX_DURATION_SECONDS,
} from '@d3/analyzer';
export type {
  ScoreKey,
  AnalyzerJob,
  AnalyzerJobSummary,
  AnalysisResult,
  DimensionScore,
  EmotionPoint,
  TranscriptSegment,
  JobStatus,
  JobStep,
  JobErrorCode,
} from '@d3/analyzer';

import { SCORE_KEYS, type JobStep, type ScoreKey } from '@d3/analyzer';
import type { AnalysisResult } from '@d3/analyzer';

/** The one source for the visible "/ 10" and for both charts' aria-labels. */
export const SCORE_MAX = 10;

/** PRD 1 §8.7.1, Card-label column. */
export const SCORE_CARD_LABEL: Record<ScoreKey, string> = {
  opening_hook: 'Opening hook',
  script_structure: 'Script structure',
  emotional_arc: 'Emotional arc',
  engagement_prompts: 'Engagement prompts',
  performance_prediction: 'Performance prediction',
  content_formula: 'Content formula',
};

/** PRD 1 §8.7.1, Radar-axis column. */
export const SCORE_AXIS_LABEL: Record<ScoreKey, string> = {
  opening_hook: 'Hook',
  script_structure: 'Structure',
  emotional_arc: 'Emotion',
  engagement_prompts: 'Engagement',
  performance_prediction: 'Prediction',
  content_formula: 'Formula',
};

/**
 * The four pipeline steps → PRD 3 §6.2's English labels.
 *
 * The id is `analyzing`; the label is "Analysing". That is deliberate in both
 * directions and it is not a typo. `'analysing'` is not an id.
 */
export const STEP_LABEL: Record<JobStep, string> = {
  compressing: 'Compressing',
  extracting_audio: 'Extracting audio',
  transcribing: 'Writing transcript',
  analyzing: 'Analysing',
};

/** Pipeline order, §6.2's table top to bottom. Object key order is not a contract. */
export const STEP_ORDER: readonly JobStep[] = [
  'compressing',
  'extracting_audio',
  'transcribing',
  'analyzing',
];

/** The file input's `accept`, listing both MIME types and extensions because
 *  browsers report `.mov` and `.avi` inconsistently. The extension check is the
 *  real gate (PRD 1 §8.5). */
export const FILE_ACCEPT =
  'video/mp4,video/quicktime,video/webm,video/x-msvideo,.mp4,.mov,.webm,.avi';

/** PRD 3 §6.3's table. PRD 1 §C1.3.3's eleven codes are the whole list. */
const ERROR_COPY: Record<string, string> = {
  too_long: 'That video is longer than 5 minutes.',
  too_large: 'That file is larger than 2 GB.',
  unsupported_format:
    "That file format isn't supported. Use MP4, MOV, WebM or AVI.",
  no_video_stream: "We couldn't read any video in that file.",
  compress_failed: "We couldn't process that video. Try re-exporting it.",
  over_size_cap: "That video is too long to compress within the model's limit.",
  transcript_failed: "We couldn't read the timing of the speech in that video.",
  model_failed:
    "The analysis didn't come back. Uploading the video again is the fastest fix.",
  timeout:
    'The job ran out of time. Uploading the video again is the fastest fix.',
  interrupted:
    'The job was interrupted. Uploading the video again is the fastest fix.',
  internal:
    'The job stopped before it produced a report. Uploading the video again is the fastest fix.',
};

/**
 * An unknown, unlisted or null code returns the `internal` copy. Own-property
 * lookup, and the hit must be a string: `errorCopy('constructor')` returns the
 * `internal` sentence, never an inherited `Object.prototype` value.
 *
 * Takes `string`, not `JobErrorCode`, on purpose — "any code not listed" is
 * unimplementable against a closed union.
 */
export function errorCopy(code: string | null | undefined): string {
  if (
    typeof code === 'string' &&
    Object.prototype.hasOwnProperty.call(ERROR_COPY, code)
  ) {
    const hit = ERROR_COPY[code];
    if (typeof hit === 'string') return hit;
  }
  return ERROR_COPY.internal;
}

/** m:ss, widening to h:mm:ss past an hour. Non-finite or negative → '0:00'. */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const ss = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0
    ? `${hours}:${String(minutes % 60).padStart(2, '0')}:${ss}`
    : `${minutes}:${ss}`;
}

/**
 * The analyzer's one date format, fixed to Asia/Kuala_Lumpur and called from
 * the server so SSR and hydration cannot disagree. Constructed once at module
 * scope, not per call.
 */
const JOB_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "17 Aug 2026, 10:30". An unparseable or missing date returns '—'. */
export function formatJobDate(iso: string | null | undefined): string {
  if (typeof iso !== 'string' || iso === '') return '—';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '—';
  return JOB_DATE.format(when);
}

/**
 * PRD 3 §6.5's five-point completeness check, and this is the whole list.
 *
 * The `status === 'done'` half is the caller's, not this guard's: it is typed
 * `(value: unknown)` and never sees the job. The checks are snake_case-only,
 * which is also what rejects a wholly camelCase payload — `overall_score` is
 * `undefined` at check 2.
 */
export function isCompleteResult(value: unknown): value is AnalysisResult {
  // 1
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const result = value as Record<string, unknown>;

  // 2
  if (
    typeof result.overall_score !== 'number' ||
    !Number.isFinite(result.overall_score)
  ) {
    return false;
  }

  // 3 — all six keys, each an object whose score is an integer in 0…SCORE_MAX.
  const scores = result.scores;
  if (typeof scores !== 'object' || scores === null || Array.isArray(scores)) {
    return false;
  }
  const bag = scores as Record<string, unknown>;
  for (const key of SCORE_KEYS) {
    const entry = bag[key];
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return false;
    }
    const score = (entry as Record<string, unknown>).score;
    if (
      typeof score !== 'number' ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > SCORE_MAX
    ) {
      return false;
    }
  }

  // 4 — an EMPTY array passes; a missing or non-array field does not.
  if (!Array.isArray(result.emotion_curve)) return false;
  if (!Array.isArray(result.transcript)) return false;

  // 5 — may be empty; may not be absent or null. This is the check that stops a
  // Download button pointing at a report body that does not exist.
  if (typeof result.report_text !== 'string') return false;

  return true;
}

/**
 * Link ingest (not in PRD 1 — owner decision 2026-08-20). The worker's
 * `{ ok:false, error }` string is a MACHINE-facing diagnostic: the client
 * switches on it and renders its own copy, never the string itself (§6.3).
 */
const LINK_ERROR_COPY: Record<string, string> = {
  'unsupported link':
    "That link isn't supported. Paste a TikTok, Douyin or Instagram video link.",
  'facebook links are not supported':
    "Facebook links aren't supported yet. Download the video and upload the file instead.",
  'rednote link needs a share token':
    "That RedNote link is missing its share token. Use the app's Share menu and paste the full link.",
  'that link is not a video': "That link isn't a video post.",
  'could not read that link':
    "We couldn't read that link. Check the post is public, then try again.",
  'could not download that video':
    "We found the post but couldn't download the video. Try again in a moment.",
  'file is over the 2 GB limit': 'That video is larger than 2 GB.',
  'no video link': 'Paste a video link first.',
};

/** Falls back to the generic retry sentence for any unlisted diagnostic. */
export function linkErrorCopy(diagnostic: string | null | undefined): string {
  if (
    typeof diagnostic === 'string' &&
    Object.prototype.hasOwnProperty.call(LINK_ERROR_COPY, diagnostic)
  ) {
    const hit = LINK_ERROR_COPY[diagnostic];
    if (typeof hit === 'string') return hit;
  }
  return "We couldn't start that link. Try again in a moment.";
}

/** Which platforms the link box actually accepts today. Verified 2026-08-20. */
export const LINK_HINT = 'TikTok, Douyin or Instagram video link';

/**
 * Split `report_text` into paragraphs for display.
 *
 * The prompt asks for a blank line between paragraphs, but a model can still
 * return one unbroken block — an early run returned 1,372 characters with zero
 * newlines. Falls back through blank lines, then single newlines, then a single
 * paragraph, so the section is never empty and never a wall.
 */
export function splitParagraphs(text: string): string[] {
  if (typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (trimmed === '') return [];
  const clean = (parts: string[]) =>
    parts.map((p) => p.trim()).filter((p) => p !== '');
  const byBlank = clean(trimmed.split(/\r?\n\s*\r?\n/));
  if (byBlank.length > 1) return byBlank;
  const byLine = clean(trimmed.split(/\r?\n/));
  return byLine.length > 1 ? byLine : [trimmed];
}
