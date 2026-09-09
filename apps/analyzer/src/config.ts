/**
 * Pipeline budgets — PRD 1 §8.5 and §8.7.6.
 *
 * Shared by the Vercel runner (apps/frontend/src/lib/analyzer-run.ts), the
 * routes that probe an upload, and scripts/cost-measure.ts. Plain constants,
 * no imports of the environment: where the process runs is not this file's
 * business any more (phase 1's bind, port, token and data root are gone with
 * the worker they configured — PRD 1 §8.2).
 */

import type { ReportLanguage } from './contract';

/** §8.7.6. The only place the default report language changes. */
export const DEFAULT_REPORT_LANGUAGE: ReportLanguage = 'en';

/** §8.5. The ONE shared FFmpeg deadline — compress, retry, audio and poster. */
export const FFMPEG_BUDGET_MS = 240_000;
/** §8.5. SIGKILL on the single validation probe. */
export const FFPROBE_TIMEOUT_MS = 20_000;
/** §8.5. SIGKILL on a `-version` probe (the health route). */
export const HEALTH_PROBE_TIMEOUT_MS = 2_000;

/** Link ingest: one deadline covering resolve + download, before a job exists. */
export const INGEST_BUDGET_MS = 180_000;
