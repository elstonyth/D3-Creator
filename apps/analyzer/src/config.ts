/**
 * Worker-only configuration. PRD 1 §8.1 (data root), §8.5 (the four process
 * budgets), §8.7.6 (the report-language default) and §8.8.1 (bind + token).
 *
 * NOTHING A JEST TEST IMPORTS MAY IMPORT THIS FILE, directly or transitively
 * (PRD 1 §8.2): `import.meta.url` below is unreachable under the CommonJS
 * ts-jest transform in jest.config.cjs. Values a test needs live in
 * `contract.ts`, which has no imports at all.
 *
 * Nothing here belongs in `contract.ts` either — that file is browser-bundled.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ReportLanguage } from './contract';

/**
 * One data root, resolved MODULE-relative — never cwd-relative, and never the
 * repo-root `/uploads`, which the next.config.js rewrite already claims. A
 * cwd-relative root writes user videos wherever the worker happened to start.
 */
export const DATA_DIR = path.resolve(
  process.env.ANALYZER_DATA_DIR ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'var'),
);

/** The in-flight multipart file. */
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
/** Alias used by the link-ingest route; same directory, one name per caller. */
export const ANALYZER_DATA_DIR_UPLOADS = UPLOADS_DIR;
/** `jobs/<job-id>/` for everything else. */
export const JOBS_DIR = path.join(DATA_DIR, 'jobs');

/** §8.7.6. The only place the default report language changes. */
export const DEFAULT_REPORT_LANGUAGE: ReportLanguage = 'en';

/** §8.5. The 15-minute job clock, from when the worker starts the job. */
export const JOB_TIMEOUT_MS = 900_000;
/** §8.5. The ONE shared FFmpeg deadline — compress, retry, audio and poster. */
export const FFMPEG_BUDGET_MS = 240_000;
/** §8.5. SIGKILL on the single upload-validation ffprobe. */
export const FFPROBE_TIMEOUT_MS = 20_000;
/** §8.5. SIGKILL on each `-version` probe in GET /api/health (§8.4). */
export const HEALTH_PROBE_TIMEOUT_MS = 2_000;

/**
 * §8.8.1. `ANALYZER_PORT` and `ANALYZER_HOST` are real code defaults on the
 * worker — a missing port must not refuse boot. The literal IPv4, never
 * `localhost`: on Windows `localhost` resolves to `::1` first and
 * connect-refuses against a `127.0.0.1` bind.
 */
const DEFAULT_PORT = 4310;
const parsedPort = Number(process.env.ANALYZER_PORT);
export const ANALYZER_PORT =
  Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536
    ? parsedPort
    : DEFAULT_PORT;

export const ANALYZER_HOST = process.env.ANALYZER_HOST || '127.0.0.1';

/** May be empty only while ANALYZER_HOST is 127.0.0.1 — see requireSafeBind(). */
export const ANALYZER_SERVICE_TOKEN = process.env.ANALYZER_SERVICE_TOKEN ?? '';

/**
 * §C1.2.5. The worker builds the media base from its OWN two variables, never
 * from `ANALYZER_SERVICE_URL`, which is the Next side's and which the worker
 * does not read.
 */
export const MEDIA_BASE_URL = `http://${ANALYZER_HOST}:${ANALYZER_PORT}`;

/**
 * §8.8.1. The worker REFUSES TO BOOT on a non-loopback bind with an empty
 * token. A comment in `.env.example` is not a control.
 */
export function requireSafeBind(): void {
  if (ANALYZER_HOST !== '127.0.0.1' && ANALYZER_SERVICE_TOKEN === '') {
    console.error(
      `[analyzer] refusing to bind ${ANALYZER_HOST} with an empty ANALYZER_SERVICE_TOKEN. Set the token, or bind 127.0.0.1.`,
    );
    process.exit(1);
  }
}

/** Link ingest (not in PRD 1): one deadline covering resolve + download.
 *  Sits inside the 15-minute job clock, which only starts once the job is
 *  queued — this runs before a job record exists. */
export const INGEST_BUDGET_MS = 180_000;
