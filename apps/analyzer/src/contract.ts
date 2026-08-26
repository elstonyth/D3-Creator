// apps/analyzer/src/contract.ts — the ONLY definition of this shape.
// Reached everywhere else as `@d3/analyzer`, through the tsconfig.base.json
// paths pair (§C1.7). Do not redeclare it. No imports, no side effects.

export const SCORE_KEYS = [
  'opening_hook',
  'script_structure',
  'emotional_arc',
  'engagement_prompts',
  'performance_prediction',
  'content_formula',
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

/** §8.5. Decimal bytes, not GiB. Read by the worker's multer limit AND by the
 *  Next route's Content-Length pre-check — hence it lives here, once. */
export const MAX_UPLOAD_BYTES = 2_000_000_000;
/** §8.5. Seconds. Compared against the RAW ffprobe duration. */
export const MAX_DURATION_SECONDS = 300;
/** §8.5. Decimal bytes of compressed.mp4 on disk, before base64. */
export const MAX_COMPRESSED_BYTES = 15_000_000;
/** §8.5. Extension check, never MIME. */
export const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.webm', '.avi'] as const;

/** Shape-only UUID guard (§8.4). Same expression as apps/frontend/src/lib/ids.ts. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export type ReportLanguage = 'en' | 'zh' | 'ms';
export type JobStatus = 'queued' | 'running' | 'done' | 'failed';
export type JobStep =
  | 'compressing'
  | 'extracting_audio'
  | 'transcribing'
  | 'analyzing';

export type JobErrorCode =
  | 'too_long'
  | 'too_large'
  | 'unsupported_format'
  | 'no_video_stream'
  | 'compress_failed'
  | 'over_size_cap'
  | 'transcript_failed'
  | 'model_failed'
  | 'timeout'
  | 'interrupted'
  | 'internal';

export interface JobError {
  code: JobErrorCode;
  /** Internal detail for the log. NEVER rendered to a user. */
  message: string;
}

export interface DimensionScore {
  /** Integer, 0..10 inclusive. */
  score: number;
  /** One or two sentences, in report_language. */
  why: string;
  /** A quoted transcript line or an on-screen detail, in report_language. */
  evidence: string;
}

export interface EmotionPoint {
  /** Seconds from the start of the video. 0 <= t <= duration_seconds. Max 1 dp. */
  t: number;
  /** 0..10, same scale as the dimension scores. Max 1 dp. */
  value: number;
}

export interface TranscriptSegment {
  /** Seconds from the start of the video. Max 3 dp. */
  start: number;
  /** Seconds. end >= start. */
  end: number;
  /** The video's own language, never translated. */
  text: string;
}

export interface CallUsage {
  model_requested: string;
  model_served: string | null;
  generation_id: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  /** USD actually billed (usage.cost). null = not measured. NEVER 0 as a stand-in. */
  cost_usd: number | null;
  finish_reason: string | null;
  /** cost_usd !== null && (finish_reason === null || finish_reason === 'stop') */
  measured: boolean;
}

export interface AnalyzerUsage {
  analysis: CallUsage;
  /** null only when the video had no audio track. */
  transcript: CallUsage | null;
}

export interface AnalysisResult {
  /** Derived: Math.round(sum(six scores) / 6 * 10) / 10. Written once, by the service. */
  overall_score: number;
  /** All six keys always present. Iterate SCORE_KEYS, never Object.keys(). */
  scores: Record<ScoreKey, DimensionScore>;
  emotion_curve: EmotionPoint[];
  transcript: TranscriptSegment[];
  /** The written breakdown. This is the body of the downloadable .txt (§7). */
  report_text: string;
  usage: AnalyzerUsage;
}

export interface AnalyzerJob {
  /** crypto.randomUUID(). Validate with isUuid() above. */
  id: string;
  status: JobStatus;
  /** Non-null only while status === 'running'. */
  step: JobStep | null;
  /** Non-null only when status === 'failed'. */
  error: JobError | null;
  report_language: ReportLanguage;
  /** The name the user's file arrived with. Display only — never a filesystem path. */
  filename: string;
  /** Seconds, 1 dp. Null only before ffprobe has run. */
  duration_seconds: number | null;
  /** Decimal bytes of the original upload. */
  source_bytes: number;
  /** Decimal bytes of compressed.mp4. Null until the compress step succeeds. */
  compressed_bytes: number | null;
  /** ISO 8601 UTC, e.g. '2026-08-17T02:30:00.000Z'. */
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  report_url: string | null;
  /** Non-null if and only if status === 'done'. */
  result: AnalysisResult | null;
}

/** One row of the history table. GET /api/results returns these, newest first. */
export type AnalyzerJobSummary = Omit<AnalyzerJob, 'result'> & {
  /** result.overall_score, or null when there is no result. */
  overall_score: number | null;
};
