/**
 * The OpenRouter client. Implementation only — consumers import the barrel
 * `@d3/openrouter` (src/index.ts) and never reach past it (PRD 1 §8.3.1).
 *
 * Everything here is PRD 1 §8.3.1–§8.3.3: the surface, the headers the client
 * always sends, the usage-parsing rules, and the ONE retry policy in the
 * feature. No caller adds a retry, a backoff, a `Retry-After` reader or a
 * second AbortSignal.timeout.
 *
 * Plain `fetch`, matching libraries/scrapers/src/tikhub-client.ts. The `openai`
 * package is deliberately not a dependency.
 */

// ─────────────── errors ───────────────

/** Missing key or model id. Thrown before any network call. Never retried. */
export class OpenRouterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenRouterConfigError';
  }
}

/** Our own deadline fired. Never retried. */
export class OpenRouterTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenRouterTimeoutError';
  }
}

/** The caller's `signal` fired. Never retried. */
export class OpenRouterAbortedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenRouterAbortedError';
  }
}

/** The request reached OpenRouter and came back unusable. */
export class OpenRouterRequestError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  /** Upstream body, first 2,000 characters. LOG ONLY — never into a response. */
  readonly detail: string | null;
  readonly usage: OpenRouterCallUsage | null;

  constructor(
    message: string,
    init: {
      status: number | null;
      retryable: boolean;
      detail: string | null;
      usage: OpenRouterCallUsage | null;
    },
  ) {
    super(message);
    this.name = 'OpenRouterRequestError';
    this.status = init.status;
    this.retryable = init.retryable;
    this.detail = init.detail;
    this.usage = init.usage;
  }
}

// ─────────────── message shapes ───────────────

export interface ChatTextPart {
  type: 'text';
  text: string;
  /** Anthropic prompt-cache marker (PRD 2 §10A.5). Omit the KEY entirely when not caching. */
  cache_control?: { type: 'ephemeral' };
}

export interface ChatVideoPart {
  type: 'video_url';
  video_url: { url: string };
}

export type ChatContentPart = ChatTextPart | ChatVideoPart;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

// ─────────────── usage ───────────────

/**
 * Structurally identical to `CallUsage` in `apps/analyzer/src/contract.ts`
 * (PRD 1 §8.7.9) — eight keys, no more, so the analyzer writes this object into
 * `result.usage` verbatim. The two are never imported into each other;
 * structural typing makes the assignment legal with no cross-package import.
 */
export interface OpenRouterCallUsage {
  model_requested: string;
  model_served: string | null;
  generation_id: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  finish_reason: string | null;
  measured: boolean;
}

// ─────────────── options and results ───────────────

export interface ChatCompletionOptions {
  model: string;
  messages: ChatMessage[];
  /** Omitted from the request body when `undefined`. NEVER serialised as null. */
  temperature?: number;
  /** Omitted from the request body when `undefined`. */
  max_tokens?: number;
  /** Passed through verbatim; omitted when `undefined`. PRD 2 §10A.8's schema object. */
  response_format?: Record<string, unknown>;
  /** Passed through verbatim; omitted when `undefined`. PRD 2 §10A.3. */
  provider?: { require_parameters: true };
  /** Whole-call deadline in ms, covering every attempt. Defaults to CHAT_TIMEOUT_MS. */
  timeoutMs?: number;
  /** The caller's own cancellation, e.g. the PRD 1 §8.5 job signal. */
  signal?: AbortSignal;
}

export interface ChatCompletionResult {
  /**
   * `choices[0].message.content`, already unwrapped. Never null, never '':
   * a 200 carrying no usable content raises OpenRouterRequestError instead
   * (status 200, retryable false).
   */
  content: string;
  usage: OpenRouterCallUsage;
  /** `usage.prompt_tokens_details.cached_tokens`; null when the route omitted it. */
  cached_tokens: number | null;
}

export interface TranscribeOptions {
  model: string;
  /** Base64 of the mono 16 kHz MP3. NO `data:` prefix. */
  audioBase64: string;
  /** Whole-call deadline in ms. Defaults to TRANSCRIBE_TIMEOUT_MS. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface TranscriptionSegment {
  /** Seconds from the start of the audio, rounded to 3 dp by this client. */
  start: number;
  /** Seconds, rounded to 3 dp. Guaranteed `end >= start`. */
  end: number;
  /** The audio's own language, never translated. `''` when the provider omitted it. */
  text: string;
}

export interface TranscriptionResult {
  text: string;
  /** The provider's detected language code, or null when it omitted one. */
  language: string | null;
  /** Ascending by `start`. `[]` is a legal, non-throwing result. */
  segments: TranscriptionSegment[];
  usage: OpenRouterCallUsage;
}

// ─────────────── constants ───────────────

/** 7 minutes — PRD 1 §8.3's chat stage budget. */
export const CHAT_TIMEOUT_MS = 420000;
/** 3 minutes — PRD 1 §8.3's transcript stage budget. */
export const TRANSCRIBE_TIMEOUT_MS = 180000;
/** The compress step always emits H.264 MP4, whatever went in. */
export const VIDEO_MIME = 'video/mp4';

const DEFAULT_API_BASE = 'https://openrouter.ai/api/v1';
/** Two retries after the first attempt — three calls in total (§8.3.3). */
const MAX_ATTEMPTS = 3;
/** 1 s then 4 s, jittered ±25% at use. */
const BACKOFF_MS = [1000, 4000];
const DETAIL_LIMIT = 2000;

// ─────────────── config ───────────────

/** Reads OPENROUTER_API_KEY. Throws OpenRouterConfigError. Never echoes the value. */
export function requireApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (typeof key !== 'string' || key.trim() === '') {
    throw new OpenRouterConfigError(
      'OPENROUTER_API_KEY is not set. Add it to the repo-root .env — see .env.example.',
    );
  }
  return key;
}

/**
 * Reads one model-id env var and returns it trimmed. Throws OpenRouterConfigError
 * when unset, or blank after trimming. The trimmed value is what is sent as
 * `model` and what `usage.model_requested` records.
 */
export function requireModelId(
  envVar: 'ANALYZER_MODEL' | 'TRANSCRIBE_MODEL' | 'CHAT_MODEL',
): string {
  const raw = process.env[envVar];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value === '') {
    throw new OpenRouterConfigError(
      `${envVar} is not set. Add it to the repo-root .env — see .env.example.`,
    );
  }
  return value;
}

/** `data:video/mp4;base64,<…>` from raw MP4 bytes. */
export function videoDataUri(bytes: Uint8Array): string {
  return `data:${VIDEO_MIME};base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Tolerant model-reply parse: strips a fenced code block, else takes the outermost {…}. */
export function extractJsonObject(
  text: string,
): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  const fenced = /```(?:[A-Za-z0-9_-]+)?\s*\n?([\s\S]*?)```/.exec(text);
  const source = fenced ? fenced[1] : text;
  const open = source.indexOf('{');
  const close = source.lastIndexOf('}');
  if (open === -1 || close <= open) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(open, close + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  return parsed as Record<string, unknown>;
}

// ─────────────── internals ───────────────

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonEmptyStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * PRD 1 §8.3.2's "who fills in each usage field" table, and the ONLY place
 * `measured` is derived. `finish_reason` is read from `choices`, never gated on
 * `body.usage`: a 2xx that carries content but no usage object still reports the
 * real value, or nulling it lets a truncated reply reach the pipeline as success.
 */
function parseCallUsage(
  modelRequested: string,
  body: Record<string, unknown> | null,
): OpenRouterCallUsage {
  const usage = asRecord(body?.usage);
  const choices = Array.isArray(body?.choices) ? body!.choices : [];
  const firstChoice = asRecord(choices[0]);

  const cost_usd = finiteOrNull(usage?.cost);
  const finish_reason = nonEmptyStringOrNull(firstChoice?.finish_reason);

  return {
    model_requested: modelRequested,
    model_served: nonEmptyStringOrNull(body?.model),
    generation_id: nonEmptyStringOrNull(body?.id),
    prompt_tokens: finiteOrNull(usage?.prompt_tokens),
    completion_tokens: finiteOrNull(usage?.completion_tokens),
    cost_usd,
    finish_reason,
    // The truncation predicate's exact complement (§8.3.3, §8.7.7, §9.5).
    measured:
      cost_usd !== null && (finish_reason === null || finish_reason === 'stop'),
  };
}

/**
 * Tell the two aborts apart by the error's own `name` — `TimeoutError` from
 * AbortSignal.timeout, `AbortError` from the caller — never by polling
 * `.aborted` or reading `signal.reason` afterwards, either of which is a coin
 * toss when both fire.
 */
function abortNameOf(err: unknown): 'TimeoutError' | 'AbortError' | null {
  const seen = new Set<unknown>();
  let cursor: unknown = err;
  while (cursor && typeof cursor === 'object' && !seen.has(cursor)) {
    seen.add(cursor);
    const name = (cursor as { name?: unknown }).name;
    if (name === 'TimeoutError') return 'TimeoutError';
    if (name === 'AbortError') return 'AbortError';
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return null;
}

function rethrowAbort(err: unknown, path: string): never {
  const kind = abortNameOf(err);
  if (kind === 'TimeoutError') {
    throw new OpenRouterTimeoutError(`${path} exceeded its deadline`);
  }
  throw new OpenRouterAbortedError(`${path} was cancelled by the caller`);
}

function isAbort(err: unknown): boolean {
  return abortNameOf(err) !== null;
}

/** ±25% uniform jitter, unseeded (§8.3.3). */
function jitter(ms: number): number {
  return Math.round(ms * (0.75 + Math.random() * 0.5));
}

/** Integer seconds, then an HTTP date. Not capped — the deadline bounds it. */
function retryAfterMs(header: string | null): number | null {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const when = Date.parse(trimmed);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - Date.now());
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      done();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      done();
      resolve();
    }, ms);
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  const referer = process.env.OPENROUTER_SITE_URL;
  if (typeof referer === 'string' && referer !== '') {
    headers['HTTP-Referer'] = referer;
  }
  // Both attribution spellings ship until PRD 1 §13 task 5 records the real one.
  // They are optional and duplicating them costs nothing. No test names either.
  const title = process.env.OPENROUTER_APP_TITLE;
  if (typeof title === 'string' && title !== '') {
    headers['X-Title'] = title;
    headers['X-OpenRouter-Title'] = title;
  }
  return headers;
}

/** Join by string concatenation — `new URL(path, base)` drops `/api/v1` (§8.3.2). */
function endpoint(path: string): string {
  const base = process.env.OPENROUTER_API_BASE;
  return `${typeof base === 'string' && base !== '' ? base : DEFAULT_API_BASE}${path}`;
}

interface Attempt {
  status: number;
  raw: string;
  body: Record<string, unknown> | null;
  parseFailed: boolean;
  retryAfter: string | null;
}

/** The one retry loop. §8.3.3's table is implemented here and nowhere else. */
async function post(
  path: string,
  payload: Record<string, unknown>,
  modelRequested: string,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
): Promise<Attempt> {
  // Outside the try that wraps fetch: a missing key must never be caught by the
  // network handler and retried for five seconds before it says the wrong thing.
  const apiKey = requireApiKey();
  const headers = buildHeaders(apiKey);
  const url = endpoint(path);
  const body = JSON.stringify(payload);

  // One deadline, armed once, covering every attempt, every backoff sleep and
  // the response-body read.
  const signal = AbortSignal.any(
    callerSignal
      ? [callerSignal, AbortSignal.timeout(timeoutMs)]
      : [AbortSignal.timeout(timeoutMs)],
  );

  let lastError: OpenRouterRequestError | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers, body, signal });
    } catch (cause) {
      if (isAbort(cause)) rethrowAbort(cause, path);
      lastError = new OpenRouterRequestError(`${path} transport failure`, {
        status: null,
        retryable: true,
        detail: null,
        usage: null,
      });
      if (await backoff(attempt, null, signal, path)) continue;
      throw lastError;
    }

    let raw: string;
    try {
      raw = await response.text();
    } catch (cause) {
      // The abort stays armed until the body is fully read: a stalled read must
      // not outlive the deadline, and an abort during the read is a timeout,
      // not a malformed response.
      if (isAbort(cause)) rethrowAbort(cause, path);
      lastError = new OpenRouterRequestError(`${path} body read failed`, {
        status: response.status,
        retryable: true,
        detail: null,
        usage: null,
      });
      if (await backoff(attempt, null, signal, path)) continue;
      throw lastError;
    }

    const detail = raw.slice(0, DETAIL_LIMIT);
    const status = response.status;
    const retryAfter = response.headers.get('retry-after');

    let parsed: Record<string, unknown> | null = null;
    let parseFailed = false;
    try {
      const value: unknown = JSON.parse(raw);
      parsed = asRecord(value);
      if (parsed === null) parseFailed = true;
    } catch {
      parseFailed = true;
    }

    const verdict = classify(status, parsed, parseFailed);
    if (verdict === 'ok') {
      return { status, raw, body: parsed, parseFailed, retryAfter };
    }

    lastError = new OpenRouterRequestError(
      `${path} failed with status ${status}`,
      {
        status,
        retryable: verdict === 'retry',
        detail,
        usage: parsed ? parseCallUsage(modelRequested, parsed) : null,
      },
    );
    if (verdict === 'fail') throw lastError;
    // `Retry-After` is read on the HTTP 429 row only.
    if (
      await backoff(attempt, status === 429 ? retryAfter : null, signal, path)
    )
      continue;
    throw lastError;
  }

  /* istanbul ignore next — the loop always returns or throws. */
  throw lastError ?? new Error(`${path} exhausted with no error recorded`);
}

/** True when another attempt should be made; false when the retries are spent. */
async function backoff(
  attempt: number,
  retryAfterHeader: string | null,
  signal: AbortSignal,
  path: string,
): Promise<boolean> {
  if (attempt >= MAX_ATTEMPTS - 1) return false;
  const explicit = retryAfterMs(retryAfterHeader);
  const delay = explicit ?? jitter(BACKOFF_MS[attempt]);
  try {
    await sleep(delay, signal);
  } catch (cause) {
    rethrowAbort(cause, path);
  }
  return true;
}

type Verdict = 'ok' | 'retry' | 'fail';

/** PRD 1 §8.3.3's table, one branch per row. */
function classify(
  status: number,
  body: Record<string, unknown> | null,
  parseFailed: boolean,
): Verdict {
  if (status === 429) return 'retry';
  if (status >= 500) return 'retry';
  if (status >= 400) return 'fail'; // 401 / 403 / 402 and any other 4xx
  if (status < 200 || status > 299) return 'fail';

  // HTTP 2xx whose body does not parse as JSON: truncated response or a proxy.
  if (parseFailed || body === null) return 'retry';

  // The `error` row fires on an error being PRESENT, not on the key existing:
  // several gateways emit `error: null` on success.
  if (body.error !== undefined && body.error !== null) {
    const errorObject = asRecord(body.error);
    if (errorObject === null) return 'fail'; // malformed provider reply
    const code = Number(errorObject.code);
    if (!Number.isFinite(code)) return 'fail';
    if (code === 429 || code >= 500) return 'retry';
    return 'fail';
  }
  return 'ok';
}

// ─────────────── chat + vision ───────────────

/** One POST /chat/completions. Sends `usage.include`, parses usage, applies §8.3.3. */
export async function chatCompletion(
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const payload: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    usage: { include: true },
  };
  if (opts.temperature !== undefined) payload.temperature = opts.temperature;
  if (opts.max_tokens !== undefined) payload.max_tokens = opts.max_tokens;
  if (opts.response_format !== undefined)
    payload.response_format = opts.response_format;
  if (opts.provider !== undefined) payload.provider = opts.provider;
  // `stream` is never sent, in any form (PRD 2 §10A.10).

  const attempt = await post(
    '/chat/completions',
    payload,
    opts.model,
    opts.timeoutMs ?? CHAT_TIMEOUT_MS,
    opts.signal,
  );

  const usage = parseCallUsage(opts.model, attempt.body);
  const choices = Array.isArray(attempt.body?.choices)
    ? attempt.body!.choices
    : [];
  const message = asRecord(asRecord(choices[0])?.message);
  const content = message?.content;

  if (typeof content !== 'string' || content === '') {
    // The call completed and was billed. `detail` is filled exactly as on every
    // other throw — §9.3's prompt-token probe hits this path and it is the only
    // diagnostic it has.
    throw new OpenRouterRequestError(
      '/chat/completions returned no usable content',
      {
        status: attempt.status,
        retryable: false,
        detail: attempt.raw.slice(0, DETAIL_LIMIT),
        usage,
      },
    );
  }

  const details = asRecord(
    asRecord(attempt.body?.usage)?.prompt_tokens_details,
  );
  return {
    content,
    usage,
    cached_tokens: finiteOrNull(details?.cached_tokens),
  };
}

// ─────────────── speech to text ───────────────

/**
 * The six normalisation steps of PRD 1 §8.3.2, in order. Step 6 is a
 * non-action: the client does not clamp against the video's duration because it
 * has no duration — that clamp is the pipeline's (§8.7.5).
 */
function normaliseSegments(value: unknown): TranscriptionSegment[] {
  if (!Array.isArray(value)) return [];
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  const out: TranscriptionSegment[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (row === null) continue;
    const start = finiteOrNull(row.start);
    const end = finiteOrNull(row.end);
    if (start === null || end === null) continue; // 1
    const clamped = end < start ? start : end; // 2
    out.push({
      start: round3(start), // 3
      end: round3(clamped),
      text: typeof row.text === 'string' ? row.text : '', // 4
    });
  }
  out.sort((a, b) => a.start - b.start); // 5 — duplicate starts are kept
  return out;
}

/** One POST /audio/transcriptions. The client fixes the body shape. */
export async function transcribeAudio(
  opts: TranscribeOptions,
): Promise<TranscriptionResult> {
  const attempt = await post(
    '/audio/transcriptions',
    {
      model: opts.model,
      // PRD 1 §8.3 specifies `input_audio` as a BARE base64 string. That is a
      // spec error: OpenRouter's live STTRequest schema types it as an object,
      // and a bare string 400s every call. Verified against
      // https://openrouter.ai/openapi.json on 2026-08-20.
      // The caller surface (§8.3.2's `audioBase64`) is unchanged — the client
      // fixes the body shape, which is exactly what §8.3 says it does.
      input_audio: { data: opts.audioBase64, format: 'mp3' },
      // Fixed inside the client; none of the three is a caller parameter, and
      // `language` is omitted entirely so the provider auto-detects.
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    },
    opts.model,
    opts.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS,
    opts.signal,
  );

  const body = attempt.body;
  return {
    text: typeof body?.text === 'string' ? body.text : '',
    language: nonEmptyStringOrNull(body?.language),
    // Never throws because `segments` is empty — it reports what came back.
    // Whether an empty transcript fails a job is the caller's decision (§8.3).
    segments: normaliseSegments(body?.segments),
    usage: parseCallUsage(opts.model, body),
  };
}
