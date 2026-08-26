/**
 * Every FFmpeg and ffprobe invocation the worker makes — PRD 1 §8.5.
 *
 * This file deliberately does NOT import `./config`: `ffmpeg.test.ts` imports
 * the ladder from here, and `config.ts` uses `import.meta.url`, which the
 * CommonJS ts-jest transform cannot load (PRD 1 §8.2). Every budget and every
 * deadline therefore arrives as a parameter from the caller, which may import
 * `config.ts` freely.
 */

import { spawn } from 'node:child_process';

import { MAX_COMPRESSED_BYTES } from './contract';

export interface LadderRow {
  /** Inclusive upper bound in seconds. */
  maxSeconds: number;
  maxHeight: number;
  videoKbps: number;
  audioKbps: number;
}

/**
 * §8.5's bitrate ladder. Resolution steps down with bitrate because §2 says the
 * model reads on-screen text and 300 kbps at 720p destroys it. Every row targets
 * under 12 MB — 20% headroom under MAX_COMPRESSED_BYTES — so container overhead
 * never crosses the line.
 *
 * A change to any row must be accompanied by a re-run of `ffmpeg.test.ts`.
 */
export const LADDER: readonly LadderRow[] = [
  { maxSeconds: 30, maxHeight: 720, videoKbps: 1500, audioKbps: 128 },
  { maxSeconds: 60, maxHeight: 720, videoKbps: 1300, audioKbps: 96 },
  { maxSeconds: 90, maxHeight: 540, videoKbps: 900, audioKbps: 96 },
  { maxSeconds: 180, maxHeight: 480, videoKbps: 450, audioKbps: 64 },
  { maxSeconds: 300, maxHeight: 360, videoKbps: 260, audioKbps: 48 },
];

/** Floor on the retry bitrate — below this the picture is unreadable. */
export const MIN_RETRY_VIDEO_KBPS = 150;
/** A retry meant to shrink never rises above this height. */
export const MAX_RETRY_HEIGHT = 480;

/**
 * The first row whose upper bound the video's duration does not exceed. Reads
 * the STORED 1-dp `duration_seconds`, never the raw ffprobe float — one number
 * for the encode and the test, one number for the limit (§8.5).
 */
export function pickLadderRow(durationSeconds: number): LadderRow {
  for (const row of LADDER) {
    if (durationSeconds <= row.maxSeconds) return row;
  }
  return LADDER[LADDER.length - 1];
}

export interface EncodeSettings {
  maxHeight: number;
  videoKbps: number;
  /** The row's audio bitrate, or null on a silent source (`-an`). */
  audioKbps: number | null;
}

export function encodeSettingsFor(
  row: LadderRow,
  hasAudio: boolean,
): EncodeSettings {
  return {
    maxHeight: row.maxHeight,
    videoKbps: row.videoKbps,
    audioKbps: hasAudio ? row.audioKbps : null,
  };
}

/**
 * §8.5's single re-encode. Both terms are `min`-shaped on purpose: the file
 * overshot, so the ratio is below 1 and the retry bitrate is always BELOW the
 * row's, and row 5's 360 px is never upscaled to 480 on a retry meant to shrink.
 *
 * The base is the row's NOMINAL bitrate, not the achieved one — so an encode
 * that undershot its target inflates the retry target by the same ratio and the
 * 0.9 cannot always absorb it. A second overshoot is a normal outcome, not a bug
 * in this formula, and is what `over_size_cap` exists for.
 */
export function retryEncodeSettings(
  row: LadderRow,
  actualBytes: number,
  hasAudio: boolean,
): EncodeSettings {
  const scaled = Math.floor(
    (row.videoKbps * MAX_COMPRESSED_BYTES * 0.9) / actualBytes,
  );
  return {
    maxHeight: Math.min(row.maxHeight, MAX_RETRY_HEIGHT),
    videoKbps: Math.max(MIN_RETRY_VIDEO_KBPS, scaled),
    // The audio bitrate is the row's, unchanged, and there is none at all on an
    // `-an` encode.
    audioKbps: hasAudio ? row.audioKbps : null,
  };
}

/**
 * The full encode argv, identical on every row and on the retry. Only `-vf`,
 * `-b:v`, `-maxrate`, `-bufsize` and `-b:a` change between rows.
 *
 * `libx264`, not `h264_nvenc` — the ladder's size arithmetic was derived against
 * x264. `-preset veryfast` is chosen so a 5-minute source finishes inside the
 * 4-minute FFmpeg budget on a laptop CPU; changing it is a ladder change.
 * `-pix_fmt yuv420p` is required for the <video> element and broad model decode
 * support, and is why the scale filter forces even dimensions.
 */
export function buildCompressArgs(
  source: string,
  output: string,
  settings: EncodeSettings,
): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    source,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '24',
    '-vf',
    // The backslash escapes the comma for ffmpeg's filtergraph parser, which
    // would otherwise read it as a filter separator.
    `scale=-2:trunc(min(ih\\,${settings.maxHeight})/2)*2`,
    '-b:v',
    `${settings.videoKbps}k`,
    '-maxrate',
    `${settings.videoKbps}k`,
    '-bufsize',
    `${settings.videoKbps * 2}k`,
    // `-an` on a silent source, never `-c:a aac`: `-c:a` on a video with no
    // audio stream exits non-zero with "Output file does not contain any
    // stream", which would fail the whole job.
    ...(settings.audioKbps === null
      ? ['-an']
      : ['-c:a', 'aac', '-b:a', `${settings.audioKbps}k`]),
    '-movflags',
    '+faststart',
    output,
  ];
}

/** Run exactly once, only when worker.json's `has_audio` is true (§8.5). */
export function buildAudioArgs(source: string, output: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    source,
    '-vn',
    '-c:a',
    'libmp3lame',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-b:a',
    '48k',
    output,
  ];
}

/**
 * Half a second into a 1-second clip, one second into anything longer.
 * `min(1, duration * 0.1)` reads like it avoids a black opening frame but is
 * 1.0 s for every clip over 10 s and goes EARLIER than 1 s for short ones,
 * which is the opposite of the stated intent.
 */
export function thumbnailSeekSeconds(durationSeconds: number): number {
  return Math.min(1.0, durationSeconds * 0.5);
}

/** Taken from compressed.mp4, not the source, so the tile matches the player. */
export function buildThumbnailArgs(
  compressed: string,
  output: string,
  durationSeconds: number,
): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-ss',
    String(thumbnailSeekSeconds(durationSeconds)),
    '-i',
    compressed,
    '-frames:v',
    '1',
    '-q:v',
    '3',
    output,
  ];
}

// ─────────────────────────── process helpers ───────────────────────────

export interface RunResult {
  ok: boolean;
  code: number | null;
  /** The deadline (or the caller) fired and the child was SIGKILLed. */
  killed: boolean;
  /** Tail of stderr, for `error.message` on the log. Never rendered. */
  stderr: string;
}

const STDERR_TAIL = 2000;

function run(
  bin: string,
  args: string[],
  opts: { signal?: AbortSignal; timeoutMs?: number },
): Promise<RunResult & { stdout: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;
    let settled = false;

    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const kill = () => {
      killed = true;
      child.kill('SIGKILL');
    };

    const timer =
      opts.timeoutMs === undefined ? null : setTimeout(kill, opts.timeoutMs);
    const onAbort = () => kill();
    if (opts.signal) {
      if (opts.signal.aborted) kill();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    const finish = (result: RunResult & { stdout: string }) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      resolve(result);
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    // ENOENT — the binary is not on PATH. Reported, never thrown: GET
    // /api/health is what tells an operator, and a job fails cleanly.
    child.on('error', (cause: Error) => {
      finish({
        ok: false,
        code: null,
        killed,
        stderr: `${stderr}${cause.message}`.slice(-STDERR_TAIL),
        stdout,
      });
    });

    child.on('close', (code) => {
      finish({
        ok: code === 0 && !killed,
        code,
        killed,
        stderr: stderr.slice(-STDERR_TAIL),
        stdout,
      });
    });
  });
}

/** One FFmpeg pass under the caller's deadline. Never throws. */
export async function runFfmpeg(
  args: string[],
  signal: AbortSignal,
): Promise<RunResult> {
  const { stdout: _stdout, ...result } = await run('ffmpeg', args, { signal });
  return result;
}

/** `<bin> -version` exits 0. SIGKILL and `false` after `timeoutMs` (§8.4). */
export async function probeBinary(
  bin: 'ffmpeg' | 'ffprobe',
  timeoutMs: number,
): Promise<boolean> {
  const result = await run(bin, ['-version'], { timeoutMs });
  return result.ok;
}

export interface ProbeResult {
  /** The RAW, unrounded ffprobe duration. Only the 300 s gate reads this. */
  durationRaw: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

/**
 * ONE ffprobe invocation answers all three of §8.5's questions: is there a
 * decodable video stream, how long is it, and is there an audio stream. Do not
 * issue a second, and do not use the duration-only form — it succeeds on an MP3
 * and can therefore never raise `no_video_stream`.
 *
 * Returns null when ffprobe exits non-zero, when the JSON does not parse, when
 * no stream has `codec_type == "video"`, or when `format.duration` is not a
 * finite number > 0. All four are `no_video_stream`.
 */
export async function probeVideo(
  file: string,
  timeoutMs: number,
): Promise<ProbeResult | null> {
  const result = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration:stream=codec_type',
      '-of',
      'json',
      file,
    ],
    { timeoutMs },
  );
  if (!result.ok) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const body = parsed as {
    format?: { duration?: unknown };
    streams?: unknown;
  };
  const streams = Array.isArray(body.streams) ? body.streams : [];
  const codecTypes = streams.map((s) =>
    typeof s === 'object' && s !== null
      ? (s as { codec_type?: unknown }).codec_type
      : undefined,
  );
  if (!codecTypes.includes('video')) return null;

  const durationRaw = Number(body.format?.duration);
  if (!Number.isFinite(durationRaw) || durationRaw <= 0) return null;

  return {
    durationRaw,
    hasVideo: true,
    hasAudio: codecTypes.includes('audio'),
  };
}

/** §9.1's fixture duration reading — duration only, on a file already known good. */
export async function probeDuration(
  file: string,
  timeoutMs: number,
): Promise<number | null> {
  const result = await run(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      file,
    ],
    { timeoutMs },
  );
  if (!result.ok) return null;
  const seconds = Number(result.stdout.trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
