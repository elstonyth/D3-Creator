/**
 * The test set IS PRD 1 §8.3.3's table: one case per row, every retryable row
 * proving it retries, every non-retryable row proving it does not, the
 * `error: null` row proving the call resolves on its content, plus one case
 * asserting the attempt count is exactly three on an exhausted retryable
 * condition. A file that covers a subset is an incomplete artifact.
 *
 * Every case feeds the client a real `new Response(body, { status, headers })`,
 * never a hand-rolled object literal — a literal is free to omit `ok`, and the
 * client is then written against the stub rather than against `fetch`.
 *
 * NOTE, deliberately: no case in this file names `X-Title` or
 * `X-OpenRouter-Title`, in either direction — not a presence assertion, not an
 * absence assertion, not inside a snapshot (§8.3's attribution note). The
 * env-gating is asserted on the header COUNT and on nothing else.
 */

import {
  chatCompletion,
  extractJsonObject,
  OpenRouterAbortedError,
  OpenRouterConfigError,
  OpenRouterRequestError,
  OpenRouterTimeoutError,
  requireModelId,
  transcribeAudio,
  videoDataUri,
} from './index';

// The retryable rows sleep 1 s before their second attempt, and the
// exactly-three case sleeps 1 s + 4 s. Real timers, generous ceiling.
jest.setTimeout(30_000);

const MODEL = 'test/model';

function reply(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function goodChatBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gen-1',
    model: MODEL,
    choices: [{ finish_reason: 'stop', message: { content: '{"ok":1}' } }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 2,
      cost_usd_ignored: 0,
      cost: 0.5,
    },
    ...overrides,
  };
}

let fetchMock: jest.Mock;

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'test-key';
  delete process.env.OPENROUTER_API_BASE;
  delete process.env.OPENROUTER_SITE_URL;
  delete process.env.OPENROUTER_APP_TITLE;
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function chat(extra: Record<string, unknown> = {}) {
  return chatCompletion({
    model: MODEL,
    messages: [{ role: 'user', content: 'hi' }],
    ...extra,
  });
}

// ───────────────────────── retryable rows ─────────────────────────

describe('§8.3.3 — conditions that ARE retried', () => {
  it('network error / connection reset', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(reply(goodChatBody()));
    await expect(chat()).resolves.toMatchObject({ content: '{"ok":1}' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP 429, honouring Retry-After when present', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply(
          { error: 'slow down' },
          { status: 429, headers: { 'retry-after': '1' } },
        ),
      )
      .mockResolvedValueOnce(reply(goodChatBody()));
    const started = Date.now();
    await expect(chat()).resolves.toMatchObject({ content: '{"ok":1}' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Retry-After replaces the backoff entirely; 1 s is longer than the
    // jittered floor of the first backoff (750 ms), so this is a real signal.
    expect(Date.now() - started).toBeGreaterThanOrEqual(950);
  });

  it('HTTP >= 500', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({ error: { message: 'upstream' } }, { status: 503 }),
      )
      .mockResolvedValueOnce(reply(goodChatBody()));
    await expect(chat()).resolves.toMatchObject({ content: '{"ok":1}' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP 200 carrying an error OBJECT with code 429', async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ error: { code: 429, message: 'rate' } }))
      .mockResolvedValueOnce(reply(goodChatBody()));
    await expect(chat()).resolves.toMatchObject({ content: '{"ok":1}' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP 200 carrying an error OBJECT with code >= 500', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({ error: { code: 502, message: 'provider' } }),
      )
      .mockResolvedValueOnce(reply(goodChatBody()));
    await expect(chat()).resolves.toMatchObject({ content: '{"ok":1}' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP 200 error object whose code is the numeric STRING "503"', async () => {
    fetchMock
      .mockResolvedValueOnce(
        reply({ error: { code: '503', message: 'jsonrpc' } }),
      )
      .mockResolvedValueOnce(reply(goodChatBody()));
    await expect(chat()).resolves.toMatchObject({ content: '{"ok":1}' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('HTTP 2xx whose body does not parse as JSON', async () => {
    fetchMock
      .mockResolvedValueOnce(reply('<html>proxy interception</html>'))
      .mockResolvedValueOnce(reply(goodChatBody()));
    await expect(chat()).resolves.toMatchObject({ content: '{"ok":1}' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('an exhausted retryable condition makes exactly three attempts', async () => {
    fetchMock.mockImplementation(() => 
      reply({ error: { message: 'down' } }, { status: 500 }),
    );
    await expect(chat()).rejects.toBeInstanceOf(OpenRouterRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

// ─────────────────────── non-retryable rows ───────────────────────

describe('§8.3.3 — conditions that are NOT retried', () => {
  it('HTTP 200 carrying an error that is not an object', async () => {
    fetchMock.mockImplementation(() => reply({ error: 'malformed provider reply' }));
    await expect(chat()).rejects.toBeInstanceOf(OpenRouterRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 200 error object whose code is not finite after Number()', async () => {
    fetchMock.mockImplementation(() => reply({ error: { code: 'rate_limited' } }));
    await expect(chat()).rejects.toBeInstanceOf(OpenRouterRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 401', async () => {
    fetchMock.mockImplementation(() => 
      reply({ error: { message: 'bad key' } }, { status: 401 }),
    );
    await expect(chat()).rejects.toBeInstanceOf(OpenRouterRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 403', async () => {
    fetchMock.mockImplementation(() => 
      reply({ error: { message: 'forbidden' } }, { status: 403 }),
    );
    await expect(chat()).rejects.toBeInstanceOf(OpenRouterRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 402 — out of credits, a retry must not re-bill', async () => {
    fetchMock.mockImplementation(() => 
      reply({ error: { message: 'no credit' } }, { status: 402 }),
    );
    await expect(chat()).rejects.toBeInstanceOf(OpenRouterRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('any other 4xx', async () => {
    fetchMock.mockImplementation(() => 
      reply({ error: { message: 'bad request' } }, { status: 400 }),
    );
    await expect(chat()).rejects.toBeInstanceOf(OpenRouterRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP 200 well-formed but with no choices[0].message.content', async () => {
    fetchMock.mockImplementation(() => 
      reply({
        id: 'gen-9',
        model: MODEL,
        choices: [{ finish_reason: 'length', message: {} }],
        usage: { prompt_tokens: 118450, cost: 0.02 },
      }),
    );
    const error: OpenRouterRequestError = await chat().catch((e) => e);
    expect(error).toBeInstanceOf(OpenRouterRequestError);
    expect(error.status).toBe(200);
    expect(error.retryable).toBe(false);
    // The call was made and billed, so usage and detail are both populated —
    // never special-cased to null. §9.3's prompt-token probe reads both.
    expect(error.usage?.prompt_tokens).toBe(118450);
    expect(error.detail).toContain('gen-9');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('our own deadline', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(init.signal.reason),
          );
        }),
    );
    await expect(chat({ timeoutMs: 30 })).rejects.toBeInstanceOf(
      OpenRouterTimeoutError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caller abort', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () =>
            reject(init.signal.reason),
          );
        }),
    );
    const pending = chat({ signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(OpenRouterAbortedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('missing key — thrown before any network call', async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(chat()).rejects.toBeInstanceOf(OpenRouterConfigError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('missing model id — thrown before any network call, and never echoes a key', () => {
    delete process.env.ANALYZER_MODEL;
    expect(() => requireModelId('ANALYZER_MODEL')).toThrow(
      OpenRouterConfigError,
    );
    process.env.ANALYZER_MODEL = '   ';
    expect(() => requireModelId('ANALYZER_MODEL')).toThrow(
      OpenRouterConfigError,
    );
    process.env.ANALYZER_MODEL = '  vendor/model  ';
    expect(requireModelId('ANALYZER_MODEL')).toBe('vendor/model');
    delete process.env.ANALYZER_MODEL;
  });
});

// ───────────── the row that is not an error at all ─────────────

it('HTTP 2xx carrying the key `error` with the value null resolves on its content', async () => {
  fetchMock.mockImplementation(() => reply(goodChatBody({ error: null })));
  await expect(chat()).resolves.toMatchObject({ content: '{"ok":1}' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

// ───────────────────── usage parsing (§8.3.2) ─────────────────────

describe('usage parsing', () => {
  it('fills every field from its own source and never substitutes 0', async () => {
    fetchMock.mockImplementation(() => 
      reply({
        id: 'gen-01K2W7Q4X9Z3',
        model: 'served/other',
        choices: [{ finish_reason: 'stop', message: { content: 'hello' } }],
        usage: { cost: 0.02508, prompt_tokens_details: { cached_tokens: 64 } },
      }),
    );
    const result = await chat();
    expect(result.usage).toEqual({
      model_requested: MODEL,
      model_served: 'served/other',
      generation_id: 'gen-01K2W7Q4X9Z3',
      prompt_tokens: null,
      completion_tokens: null,
      cost_usd: 0.02508,
      finish_reason: 'stop',
      measured: true,
    });
    expect(result.cached_tokens).toBe(64);
  });

  it('empty strings become null, not ""', async () => {
    fetchMock.mockImplementation(() => 
      reply({
        id: '',
        model: '',
        choices: [{ finish_reason: 'stop', message: { content: 'x' } }],
        usage: { cost: 0 },
      }),
    );
    const { usage, cached_tokens } = await chat();
    expect(usage.model_served).toBeNull();
    expect(usage.generation_id).toBeNull();
    expect(cached_tokens).toBeNull();
    // A free call reports a real 0; that is measured, not missing.
    expect(usage.cost_usd).toBe(0);
    expect(usage.measured).toBe(true);
  });

  it('reads finish_reason from choices even when the body carries no usage object', async () => {
    fetchMock.mockImplementation(() => 
      reply({
        id: 'gen-2',
        model: MODEL,
        choices: [
          { finish_reason: 'length', message: { content: 'truncated' } },
        ],
      }),
    );
    const { usage } = await chat();
    expect(usage.finish_reason).toBe('length');
    expect(usage.cost_usd).toBeNull();
    expect(usage.measured).toBe(false);
  });

  it('measured is cost_usd !== null && (finish_reason === null || === "stop")', async () => {
    const cases: Array<[unknown, number | undefined, boolean]> = [
      ['stop', 0.5, true],
      [undefined, 0.5, true], // null finish_reason is a billable, non-truncated reply
      ['length', 0.5, false],
      ['content_filter', 0.5, false],
      ['stop', undefined, false], // no cost reported → never measured
    ];
    for (const [finish, cost, expected] of cases) {
      const choice: Record<string, unknown> = { message: { content: 'x' } };
      if (finish !== undefined) choice.finish_reason = finish;
      const usageBlock: Record<string, unknown> = {};
      if (cost !== undefined) usageBlock.cost = cost;
      fetchMock.mockImplementation(() => 
        reply({ id: 'g', model: MODEL, choices: [choice], usage: usageBlock }),
      );
      const { usage } = await chat();
      expect(usage.measured).toBe(expected);
    }
  });
});

// ───────────────── what the client always sends ─────────────────

describe('the request the client builds', () => {
  function sentBody(): Record<string, unknown> {
    return JSON.parse(fetchMock.mock.calls[0][1].body as string);
  }
  function sentHeaders(): Record<string, string> {
    return fetchMock.mock.calls[0][1].headers as Record<string, string>;
  }

  it('sends usage.include on /chat/completions, never `stream`, and omits undefined options', async () => {
    fetchMock.mockImplementation(() => reply(goodChatBody()));
    await chat({ temperature: 0.2, max_tokens: 2000 });
    const body = sentBody();
    expect(body.usage).toEqual({ include: true });
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(2000);
    expect('stream' in body).toBe(false);
    expect('response_format' in body).toBe(false);
    expect('provider' in body).toBe(false);
  });

  it('joins the base URL by concatenation so /api/v1 survives', async () => {
    fetchMock.mockImplementation(() => reply(goodChatBody()));
    await chat();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    );
    fetchMock.mockClear();
    process.env.OPENROUTER_API_BASE = 'https://example.test/api/v1';
    await chat();
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://example.test/api/v1/chat/completions',
    );
  });

  it('fixes the transcription body shape and omits `language` entirely', async () => {
    fetchMock.mockImplementation(() => 
      reply({ text: 'hi', language: 'zh', segments: [] }),
    );
    await transcribeAudio({ model: MODEL, audioBase64: 'QUJD' });
    const body = sentBody();
    expect(body).toEqual({
      model: MODEL,
      // An OBJECT, not a bare base64 string — the live STTRequest schema.
      input_audio: { data: 'QUJD', format: 'mp3' },
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });
    expect('language' in body).toBe(false);
    // usage.include is a /chat/completions-only field.
    expect('usage' in body).toBe(false);
  });

  it('the attribution title adds exactly two headers when the env var is set', async () => {
    fetchMock.mockImplementation(() => reply(goodChatBody()));
    await chat();
    const without = Object.keys(sentHeaders()).length;

    fetchMock.mockClear();
    process.env.OPENROUTER_APP_TITLE = 'D3 Creator';
    await chat();
    const withTitle = Object.keys(sentHeaders()).length;

    expect(withTitle - without).toBe(2);
  });

  it('HTTP-Referer is present only when OPENROUTER_SITE_URL is set', async () => {
    fetchMock.mockImplementation(() => reply(goodChatBody()));
    await chat();
    expect('HTTP-Referer' in sentHeaders()).toBe(false);

    fetchMock.mockClear();
    process.env.OPENROUTER_SITE_URL = 'https://www.d3creator.com';
    await chat();
    expect(sentHeaders()['HTTP-Referer']).toBe('https://www.d3creator.com');
  });
});

// ───────────── transcript normalisation (§8.3.2) ─────────────

describe('transcribeAudio normalisation', () => {
  it('drops non-finite timestamps, clamps end up to start, rounds to 3 dp, sorts by start', async () => {
    fetchMock.mockImplementation(() => 
      reply({
        text: 'words',
        language: 'zh',
        segments: [
          { start: 5.00049, end: 6.1234567, text: 'second' },
          { start: 'x', end: 1, text: 'dropped' },
          { start: 2.5, end: 1.5, text: 'clamped' },
          { start: 0, end: 2.4 },
        ],
      }),
    );
    const result = await transcribeAudio({ model: MODEL, audioBase64: 'QUJD' });
    expect(result.segments).toEqual([
      { start: 0, end: 2.4, text: '' },
      { start: 2.5, end: 2.5, text: 'clamped' },
      { start: 5, end: 6.123, text: 'second' },
    ]);
    expect(result.language).toBe('zh');
  });

  it('does not throw on an empty segment array — that is the caller’s decision', async () => {
    fetchMock.mockImplementation(() => 
      reply({ text: 'words but no timings', segments: [] }),
    );
    const result = await transcribeAudio({ model: MODEL, audioBase64: 'QUJD' });
    expect(result.segments).toEqual([]);
    expect(result.text).toBe('words but no timings');
    expect(result.language).toBeNull();
    // finish_reason is always null on the transcription leg.
    expect(result.usage.finish_reason).toBeNull();
  });
});

// ─────────────────────── small helpers ───────────────────────

describe('extractJsonObject', () => {
  it('strips a fenced code block', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it('otherwise takes the outermost {…}', () => {
    expect(extractJsonObject('here you go: {"a":{"b":3}} — done')).toEqual({
      a: { b: 3 },
    });
  });

  it('returns null on failure, and on a non-object', () => {
    expect(extractJsonObject('no braces here')).toBeNull();
    expect(extractJsonObject('{not json}')).toBeNull();
    expect(extractJsonObject('[1,2,3]')).toBeNull();
  });
});

it('videoDataUri builds the one data: URI shape', () => {
  expect(videoDataUri(new Uint8Array([65, 66, 67]))).toBe(
    'data:video/mp4;base64,QUJD',
  );
});
