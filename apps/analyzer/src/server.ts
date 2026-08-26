/**
 * The worker's Express app — PRD 1 §8.4, §8.8.1 and §8.8.13.
 *
 * The base code's four route names are kept unchanged. THE BROWSER NEVER CALLS
 * THEM: it calls the Next routes in §8.8.2, which talk to this process
 * server-side. There is no CORS middleware here and none is to be added — every
 * browser request in this feature is same-origin to the Next app, so no
 * preflight is ever issued (§8.8.8).
 *
 * Loopback only. §8.8.1's bind refusal is `requireSafeBind()`.
 */

import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';

import {
  ANALYZER_DATA_DIR_UPLOADS,
  ANALYZER_HOST,
  ANALYZER_PORT,
  ANALYZER_SERVICE_TOKEN,
  HEALTH_PROBE_TIMEOUT_MS,
  INGEST_BUDGET_MS,
  requireSafeBind,
} from './config';
import { MAX_UPLOAD_BYTES, isUuid, type ReportLanguage } from './contract';
import { probeBinary } from './ffmpeg';
import { recoverInterruptedJobs, wake } from './queue';
import {
  countQueued,
  ensureDataDirs,
  jobPath,
  listSummaries,
  parseHistoryLimit,
  readJob,
  toPublicJob,
} from './store';
import {
  createJobFromFile,
  handleUpload,
  handleUploadError,
  uploadMiddleware,
} from './upload';
import { parseBusinessProfile } from './prompt';
import {
  IngestError,
  downloadToFile,
  resolveLink,
  type IngestFailure,
} from './ingest';

const app = express();
app.disable('x-powered-by');

function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ ok: false, error });
}

/** §8.4. Every JSON response carries it — including /api/health, which is the
 *  one route exempt from the token gate below. */
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/**
 * §8.4. Booleans only — never a model id, never whether a key is set, because
 * this is the ONE route exempt from the token gate.
 */
app.get('/api/health', async (_req: Request, res: Response) => {
  const [ffmpeg, ffprobe, jobsQueued] = await Promise.all([
    probeBinary('ffmpeg', HEALTH_PROBE_TIMEOUT_MS),
    probeBinary('ffprobe', HEALTH_PROBE_TIMEOUT_MS),
    countQueued(),
  ]);
  const modelsConfigured =
    Boolean(process.env.ANALYZER_MODEL) &&
    Boolean(process.env.TRANSCRIBE_MODEL);
  const ok = ffmpeg && ffprobe && modelsConfigured;
  res.status(ok ? 200 : 503).json({
    ok,
    ffmpeg,
    ffprobe,
    models_configured: modelsConfigured,
    jobs_queued: jobsQueued,
  });
});

/**
 * The token gate. It runs BEFORE the catch-all, so an unauthenticated request to
 * an unrouted path is 401, not 404 — route shape is not something an
 * unauthenticated caller gets to probe.
 *
 * The bearer comparison is exact, case-sensitive and whole, never a prefix. The
 * `trimEnd` on BOTH sides is load-bearing on the configuration phase 1 ships
 * with: with `ANALYZER_SERVICE_TOKEN` empty, the Next side sends `Bearer `, and
 * RFC 9110 §5.5 trailing-OWS stripping delivers the seven characters `Bearer` —
 * so a literal `Bearer `-prefix test would 401 every request.
 */
const EXPECTED_AUTHORIZATION = `Bearer ${ANALYZER_SERVICE_TOKEN}`.trimEnd();

declare module 'express-serve-static-core' {
  interface Request {
    d3UserId?: string;
  }
}

app.use((req: Request, res: Response, next: NextFunction) => {
  if (
    String(req.headers.authorization ?? '').trimEnd() !== EXPECTED_AUTHORIZATION
  ) {
    fail(res, 401, 'unauthorized');
    return;
  }
  // Absent, empty, repeated (an array), or not a UUID is 401 — never "some
  // other user", and `GET /api/results` must never fall back to listing
  // every job.
  const header = req.headers['x-d3-user-id'];
  if (!isUuid(header)) {
    fail(res, 401, 'unauthorized');
    return;
  }
  req.d3UserId = header;
  next();
});

app.post(
  '/api/upload',
  (req: Request, res: Response, next: NextFunction) => {
    uploadMiddleware(req, res, (error: unknown) => {
      if (error) {
        void handleUploadError(error, req, res);
        return;
      }
      next();
    });
  },
  (req: Request, res: Response) => {
    handleUpload(req, res, req.d3UserId as string)
      .then(() => wake())
      .catch((cause: unknown) => {
        console.error('[analyzer] upload handler failed', cause);
        if (!res.headersSent) fail(res, 500, 'internal error');
      });
  },
);

/**
 * POST /api/ingest — the link path. JSON body `{ url, report_language? }`.
 *
 * NOT IN PRD 1. Step 0 only: it resolves the link, downloads the bytes, and
 * hands them to `createJobFromFile`, the SAME function the multipart upload
 * uses. Everything downstream is untouched.
 */
const INGEST_STATUS: Record<IngestFailure, [number, string]> = {
  unsupported_link: [400, 'unsupported link'],
  facebook_unsupported: [400, 'facebook links are not supported'],
  rednote_needs_token: [400, 'rednote link needs a share token'],
  not_a_video: [400, 'that link is not a video'],
  resolve_failed: [502, 'could not read that link'],
  download_failed: [502, 'could not download that video'],
  too_large: [413, 'file is over the 2 GB limit'],
};

// 8kb was too small once the profile block rides along: the block is capped at
// 3,075 UTF-16 code units, and an all-Chinese one is ~3 bytes per unit in UTF-8,
// so it alone can reach ~9 kB before JSON escaping.
app.post('/api/ingest', express.json({ limit: '32kb' }), (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (url === '') {
    fail(res, 400, 'no video link');
    return;
  }
  const language = body.report_language;
  const reportLanguage: ReportLanguage =
    language === 'zh' || language === 'ms' ? language : 'en';

  void (async () => {
    // The whole ingest shares one deadline: resolve plus download.
    const signal = AbortSignal.timeout(INGEST_BUDGET_MS);
    let temp: string | null = null;
    try {
      const resolved = await resolveLink(url, signal);
      await fsp.mkdir(ANALYZER_DATA_DIR_UPLOADS, { recursive: true });
      temp = path.join(
        ANALYZER_DATA_DIR_UPLOADS,
        `${randomUUID()}${path.extname(resolved.filename) || '.mp4'}`,
      );
      const bytes = await downloadToFile(
        resolved.downloadUrl,
        temp,
        MAX_UPLOAD_BYTES,
        signal,
      );
      const job = await createJobFromFile(res, {
        tempPath: temp,
        originalName: resolved.filename,
        sizeBytes: bytes,
        reportLanguage,
        businessProfile: parseBusinessProfile(body.business_profile),
        userId: req.d3UserId as string,
      });
      if (job === null) return; // createJobFromFile already answered
      res.status(202).json(toPublicJob(job));
      wake();
    } catch (cause) {
      if (temp !== null) await fsp.rm(temp, { force: true }).catch(() => undefined);
      if (cause instanceof IngestError) {
        console.error(`[analyzer] ingest ${cause.failure}: ${cause.message}`);
        const [status, message] = INGEST_STATUS[cause.failure];
        if (!res.headersSent) fail(res, status, message);
        return;
      }
      console.error('[analyzer] ingest failed', cause);
      if (!res.headersSent) fail(res, 500, 'internal error');
    }
  })();
});

app.get('/api/result/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!isUuid(id)) {
    fail(res, 400, 'invalid job id');
    return;
  }
  readJob(id)
    .then((job) => {
      // The worker compares X-D3-User-Id against the job's stored `user_id` and
      // answers 404 on any mismatch — never 403, because a 403 confirms the id
      // exists.
      if (job === null || job.user_id !== req.d3UserId) {
        fail(res, 404, 'job not found');
        return;
      }
      res.status(200).json(toPublicJob(job));
    })
    .catch((cause: unknown) => {
      console.error('[analyzer] result read failed', cause);
      fail(res, 500, 'internal error');
    });
});

/** §8.8.13. A BARE JSON array — no envelope, no wrapper object. */
app.get('/api/results', (req: Request, res: Response) => {
  listSummaries(req.d3UserId as string, parseHistoryLimit(req.query.limit))
    .then((rows) => res.status(200).json(rows))
    .catch((cause: unknown) => {
      console.error('[analyzer] results read failed', cause);
      fail(res, 500, 'internal error');
    });
});

/**
 * §8.4. ONLY these three filenames are served, by explicit route. Never mount a
 * static file server on the job directory — that also exposes `source.<ext>`
 * (the user's private full-quality upload, up to 2 GB) and `job.json`.
 *
 * Gated exactly like `GET /api/result/:id`: bearer token plus X-D3-User-Id, 404
 * on a mismatch. `res.sendFile` supplies `Accept-Ranges: bytes` and turns a
 * `Range` request into a 206 with `Content-Range`. No `Content-Disposition`
 * here — the Next report route adds it, so the filename is set in one place.
 */
const MEDIA_FILES: Record<string, string> = {
  'compressed.mp4': 'video/mp4',
  'thumbnail.jpg': 'image/jpeg',
  'report.txt': 'text/plain; charset=utf-8',
};

app.get('/media/:id/:filename', (req: Request, res: Response) => {
  const { id } = req.params;
  // Express 5 types a route param as `string | string[]`; only `id` is narrowed
  // by isUuid, so the filename is coerced before it indexes anything.
  const filename = String(req.params.filename);
  if (!isUuid(id)) {
    fail(res, 400, 'invalid job id');
    return;
  }
  const contentType = MEDIA_FILES[filename];
  if (contentType === undefined) {
    fail(res, 404, 'job not found');
    return;
  }
  readJob(id)
    .then((job) => {
      if (job === null || job.user_id !== req.d3UserId) {
        fail(res, 404, 'job not found');
        return;
      }
      res.sendFile(
        jobPath(id, filename),
        { headers: { 'Content-Type': contentType }, acceptRanges: true },
        (cause?: Error) => {
          if (cause && !res.headersSent) fail(res, 404, 'job not found');
        },
      );
    })
    .catch((cause: unknown) => {
      console.error('[analyzer] media read failed', cause);
      fail(res, 500, 'internal error');
    });
});

/** Terminal catch-all, so Express's HTML 404 never leaves the worker. */
app.use((_req: Request, res: Response) => {
  fail(res, 404, 'job not found');
});

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    console.error('[analyzer] unhandled route error', error);
    if (!res.headersSent) fail(res, 500, 'internal error');
  },
);

async function main(): Promise<void> {
  requireSafeBind();
  await ensureDataDirs();
  const recovered = await recoverInterruptedJobs();
  if (recovered > 0) {
    console.log(`[analyzer] marked ${recovered} interrupted job(s) failed`);
  }
  app.listen(ANALYZER_PORT, ANALYZER_HOST, () => {
    console.log(
      `[analyzer] listening on http://${ANALYZER_HOST}:${ANALYZER_PORT}`,
    );
    wake();
  });
}

void main();
