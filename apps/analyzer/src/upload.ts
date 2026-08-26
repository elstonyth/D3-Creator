/**
 * `POST /api/upload` — PRD 1 §8.5's upload-time validation, in order, BEFORE a
 * job record is created. On EVERY rejection branch, including the multer size
 * branch, the received bytes are deleted.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import type { Request, RequestHandler, Response } from 'express';
import multer from 'multer';

import { parseBusinessProfile } from './prompt';

import {
  DEFAULT_REPORT_LANGUAGE,
  FFPROBE_TIMEOUT_MS,
  UPLOADS_DIR,
} from './config';
import {
  ALLOWED_EXTENSIONS,
  MAX_DURATION_SECONDS,
  MAX_UPLOAD_BYTES,
  type ReportLanguage,
} from './contract';
import { probeVideo } from './ffmpeg';
import {
  ensureDataDirs,
  jobDir,
  jobPath,
  newJobId,
  toPublicJob,
  writeJob,
  writeWorkerRecord,
  type StoredJob,
} from './store';

/**
 * multer aborts mid-stream on LIMIT_FILE_SIZE and never populates `req.file`, so
 * `req.file?.path` is a no-op on exactly the branch §8.5 names. The absolute
 * path is recorded here instead, in the `filename` callback.
 */
declare module 'express-serve-static-core' {
  interface Request {
    uploadTempPath?: string;
  }
}

const REPORT_LANGUAGES: readonly ReportLanguage[] = ['en', 'zh', 'ms'];

function parseReportLanguage(raw: unknown): ReportLanguage {
  return REPORT_LANGUAGES.includes(raw as ReportLanguage)
    ? (raw as ReportLanguage)
    : DEFAULT_REPORT_LANGUAGE;
}

const UNSUPPORTED_FORMAT = 'D3_UNSUPPORTED_FORMAT';


const storage = multer.diskStorage({
  destination(_req, _file, done) {
    fs.mkdir(UPLOADS_DIR, { recursive: true })
      .then(() => done(null, UPLOADS_DIR))
      .catch((cause: unknown) => done(cause as Error, ''));
  },
  // Configure this explicitly: multer's default gives a random name with NO
  // extension, and ffprobe then works by content sniffing alone. The user's
  // filename is a display-only job field and never steers a path.
  filename(req, file, done) {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${newJobId()}${ext}`;
    req.uploadTempPath = path.join(UPLOADS_DIR, name);
    done(null, name);
  },
});

export const uploadMiddleware: RequestHandler = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  /**
   * The extension test runs HERE so it really does precede the size limit: an
   * oversize file with a bad extension is 415, never 413. Extension, not MIME —
   * browsers report `.mov`/`.avi` as `video/quicktime`, `video/x-msvideo` or
   * `application/octet-stream` depending on OS.
   */
  fileFilter(_req, file, done) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
      const error = new Error('unsupported format');
      (error as Error & { code?: string }).code = UNSUPPORTED_FORMAT;
      done(error);
      return;
    }
    done(null, true);
  },
}).single('video');

function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ ok: false, error });
}

/**
 * Everything from "bytes are on disk" to "job.json is written" — shared by the
 * multipart upload and the link ingest, so a link job is indistinguishable from
 * an upload job for the whole rest of the pipeline.
 *
 * Returns the created job, or null when it already answered on `res`.
 */
export async function createJobFromFile(
  res: Response,
  input: {
    tempPath: string;
    /** Display-only. Never interpolated into a path. */
    originalName: string;
    sizeBytes: number;
    reportLanguage: ReportLanguage;
    userId: string;
    /** The already-rendered §10A.6 profile block, or null. Opaque here. */
    businessProfile?: string | null;
  },
): Promise<StoredJob | null> {
  const temp = input.tempPath;
  const ext = path.extname(input.originalName).toLowerCase();

  // ONE ffprobe invocation answers all three questions inside one 20,000 ms
  // kill: is there a decodable video stream, how long is it, and is there an
  // audio stream.
  const probe = await probeVideo(temp, FFPROBE_TIMEOUT_MS);
  if (probe === null) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    fail(res, 400, 'unreadable video');
    return null;
  }

  // The 300 s comparison uses the RAW duration; the stored value is rounded.
  if (probe.durationRaw > MAX_DURATION_SECONDS) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    fail(res, 400, 'video is longer than 5 minutes');
    return null;
  }

  const id = newJobId();
  await ensureDataDirs();
  await fs.mkdir(jobDir(id), { recursive: true });

  // source.<ext> FIRST, then worker.json, then job.json LAST.
  await fs.rename(temp, jobPath(id, `source${ext}`));
  await writeWorkerRecord(id, { has_audio: probe.hasAudio, source_ext: ext });

  const job: StoredJob = {
    id,
    status: 'queued',
    step: null,
    error: null,
    report_language: input.reportLanguage,
    filename: input.originalName,
    duration_seconds: Math.round(probe.durationRaw * 10) / 10,
    source_bytes: input.sizeBytes,
    compressed_bytes: null,
    created_at: new Date().toISOString(),
    started_at: null,
    finished_at: null,
    video_url: null,
    thumbnail_url: null,
    report_url: null,
    result: null,
    user_id: input.userId,
    business_profile: input.businessProfile ?? null,
  };
  await writeJob(job);
  return job;
}

/** Runs after `uploadMiddleware` on the success path only. */
export async function handleUpload(
  req: Request,
  res: Response,
  userId: string,
): Promise<void> {
  const file = req.file;
  if (!file) {
    fail(res, 400, 'no video file');
    return;
  }

  const job = await createJobFromFile(res, {
    tempPath: file.path,
    originalName: file.originalname,
    sizeBytes: file.size,
    // multer only populates `req.body` with text fields that PRECEDE the file
    // in the stream (§8.8.3).
    reportLanguage: parseReportLanguage(
      (req.body as Record<string, unknown> | undefined)?.report_language,
    ),
    // Same rule as report_language: multer only populates `req.body` with text
    // fields that PRECEDE the file in the stream (§8.8.3), so the browser must
    // append this one before the video.
    businessProfile: parseBusinessProfile(
      (req.body as Record<string, unknown> | undefined)?.business_profile,
    ),
    userId,
  });
  if (job === null) return;
  res.status(202).json(toPublicJob(job));
}


/**
 * multer's own failures. Every branch deletes the received bytes before it
 * chooses a status — `req.file?.path ?? req.uploadTempPath`, because the size
 * branch has no `req.file`.
 */
export async function handleUploadError(
  error: unknown,
  req: Request,
  res: Response,
): Promise<void> {
  const temp = req.file?.path ?? req.uploadTempPath;
  if (temp) await fs.rm(temp, { force: true }).catch(() => undefined);

  const code = (error as Error & { code?: string }).code;
  if (code === UNSUPPORTED_FORMAT) {
    fail(res, 415, 'unsupported format');
    return;
  }
  if (code === 'LIMIT_FILE_SIZE') {
    fail(res, 413, 'file is over the 2 GB limit');
    return;
  }
  // A file part under any other field name, or more than one file part.
  if (code === 'LIMIT_UNEXPECTED_FILE' || code === 'LIMIT_FILE_COUNT') {
    fail(res, 400, 'no video file');
    return;
  }
  console.error('[analyzer] upload failed', error);
  fail(res, 500, 'internal error');
}
