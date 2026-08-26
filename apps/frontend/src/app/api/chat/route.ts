/**
 * POST /api/chat — one chat turn with the Script Coach.
 *
 * PRD 2 §10 "The chat endpoint" is the authority on the HTTP contract; §10A is
 * the authority on what happens inside it. No GET handler.
 *
 * `apps/frontend/src/proxy.ts` returns early for any path beginning `/api`, so
 * edge gating never covers this route and it gates itself.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  chatCompletion,
  requireModelId,
  OpenRouterConfigError,
  OpenRouterRequestError,
  OpenRouterTimeoutError,
  type ChatCompletionResult,
} from '@d3/openrouter';
import { NextResponse } from 'next/server';

import {
  getAuthContext,
  isStudioMember,
  type AuthContext,
} from '../../../lib/auth';
import type { BusinessProfile } from '../../../lib/business-profile';
import { loadPlaybook } from '../../../lib/chat-playbook';
import {
  buildMessages,
  deriveThreadTitle,
  isPersonaReady,
  isPlaybookReady,
  isProfileComplete,
  usesCacheControl,
  validateReply,
  CHAT_MESSAGE_MODEL_MAX,
  CHAT_QUESTION_MAX,
  HISTORY_MAX_MESSAGES,
  RESPONSE_FORMAT,
  type HistoryRow,
} from '../../../lib/chat-prompt';
import { isUuid } from '../../../lib/ids';
import { checkRateLimit } from '../../../lib/rate-limit';
import { getSupabaseRoute } from '../../../lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** §10A.3. The whole-call deadline; `OpenRouterTimeoutError` maps to 504. */
const CHAT_DEADLINE_MS = 45_000;
/**
 * §10 "Timing and limits" said 3,000, and 3,000 was measured too tight once
 * `reply_language` shipped (owner request 2026-08-24). An English explanation
 * wrapped around a Chinese script is the longest reply this coach can produce —
 * measured at 2,402 / 2,572 / 2,609 / 2,845 completion tokens over four runs,
 * with a fifth hitting the cap and coming back `finish_reason: 'length'`. That
 * is a 502 "model reply unusable" on a reply the model wrote correctly.
 *
 * Raising a cap costs nothing on a short reply — output is billed as produced,
 * so a one-line guardrail answer bills the same at 4,000 as at 3,000. The real
 * bound on a runaway is `CHAT_MESSAGE_CONTENT_MAX`, which 4,000 tokens cannot
 * reach.
 */
const CHAT_MAX_TOKENS = 4000;

/** The house envelope. `jsonError()` sets no headers of its own in the three
 *  routes that already define it, so `Cache-Control` is set here — on every
 *  return path of this route, the 200 included. */
function jsonError(status: number, error: string): Response {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * The two "Access gating" checks, first and in this order. `getAuthContext()`
 * re-throws when the `user_role` lookup errors and `getSupabaseRoute()` throws
 * when the public Supabase variables are missing — an uncaught throw from
 * either returns Next's HTML error page and breaks every `await res.json()`
 * on the client.
 */
async function gate(): Promise<
  { ok: true; auth: AuthContext } | { ok: false; response: Response }
> {
  let auth: AuthContext | null;
  try {
    auth = await getAuthContext();
  } catch {
    return { ok: false, response: jsonError(500, 'internal error') };
  }
  if (!auth) return { ok: false, response: jsonError(401, 'unauthorized') };
  if (!isStudioMember(auth)) {
    return { ok: false, response: jsonError(403, 'forbidden') };
  }
  return { ok: true, auth };
}

interface ChatRequest {
  threadId: string | null;
  message: string;
}

/** 400 on anything malformed. `threadId` is checked with `isUuid` before it can
 *  reach a Postgres `uuid` column. */
async function parseRequest(request: Request): Promise<ChatRequest | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;

  const message =
    typeof record.message === 'string' ? record.message.trim() : '';
  if (message === '' || message.length > CHAT_QUESTION_MAX) return null;

  const rawThread = record.threadId;
  if (rawThread === undefined || rawThread === null) {
    return { threadId: null, message };
  }
  if (!isUuid(rawThread)) return null;
  return { threadId: rawThread, message };
}

/** `null` on any read failure — ENOENT and everything else alike. The persona
 *  is the only file left here; the playbook moved to Postgres, because this
 *  repo is public and that text is the client's (see `lib/chat-playbook.ts`).
 *
 *  Still read on every request with no in-process cache, and deliberately not
 *  changed to match its cached neighbour: one disk read costs microseconds next
 *  to a 15-second model call, and caching it would mean editing the persona
 *  requires a deploy. */
async function readContent(name: string): Promise<string | null> {
  try {
    return await readFile(join(process.cwd(), 'src', 'content', name), 'utf8');
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */

export async function POST(request: Request): Promise<Response> {
  // 1. Auth.
  const gated = await gate();
  if (!gated.ok) return gated.response;
  const { auth } = gated;

  // 2. Body.
  const parsed = await parseRequest(request);
  if (parsed === null) return jsonError(400, 'invalid request');

  // 3. The two knowledge sources — the playbook from Postgres, the persona from
  //    the bundle. A 503 that logs nothing is invisible in production, which is
  //    the whole failure mode these lines exist for. `loadPlaybook()` returns
  //    '' rather than throwing, so the not-ready test below is unchanged.
  const [playbook, persona] = await Promise.all([
    loadPlaybook(),
    readContent('chatbot-persona.md'),
  ]);
  if (!isPlaybookReady(playbook)) {
    console.error('[chat] playbook not ready');
    return jsonError(503, 'coach not ready');
  }
  if (persona === null || !isPersonaReady(persona)) {
    console.error('[chat] persona missing');
    return jsonError(503, 'coach not ready');
  }

  // 4. The model id: unset or blank, then `openrouter/auto`, then over the
  //    `chat_message.model` cap. Three distinct assertions, one logged 500 —
  //    a misconfigured deploy that answers normally silently pays full price
  //    on every message, and an over-long id becomes a Postgres 23514 after
  //    the call is already billed.
  let model: string;
  try {
    model = requireModelId('CHAT_MODEL');
  } catch (cause) {
    console.error('[chat] CHAT_MODEL is not configured', cause);
    return jsonError(500, 'internal error');
  }
  if (model === 'openrouter/auto') {
    console.error(
      '[chat] CHAT_MODEL must be a pinned model id, not openrouter/auto',
    );
    return jsonError(500, 'internal error');
  }
  if (model.length > CHAT_MESSAGE_MODEL_MAX) {
    console.error(
      '[chat] CHAT_MODEL is longer than the chat_message.model cap',
    );
    return jsonError(500, 'internal error');
  }

  // 5. Rate limit — AFTER the 503 and both 500s on purpose: a 503 or a 500
  //    must not burn one of the user's ten tokens, and a misconfigured deploy
  //    must not rate-limit users out of its own error message.
  const limit = await checkRateLimit({
    prefix: 'chat',
    key: auth.userId,
    tokens: 10,
    window: '1 m',
  });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'too many messages' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(limit.retryAfter),
        },
      },
    );
  }

  // 6. The thread and the profile.
  let supabase: Awaited<ReturnType<typeof getSupabaseRoute>>;
  try {
    supabase = await getSupabaseRoute();
  } catch (cause) {
    console.error('[chat] supabase client unavailable', cause);
    return jsonError(500, 'internal error');
  }

  let profile: BusinessProfile | null;
  let history: HistoryRow[] = [];
  try {
    const profileRes = await supabase
      .from('user_profile')
      .select('*')
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .maybeSingle();
    if (profileRes.error) throw profileRes.error;
    profile = (profileRes.data as BusinessProfile | null) ?? null;

    if (parsed.threadId !== null) {
      // The thread is resolved against the caller's OWN rows first. A
      // `chat_message` read scoped by `thread_id` alone lets any signed-in
      // member read another member's conversation by supplying their uuid.
      const threadRes = await supabase
        .from('chat_thread')
        .select('id')
        .eq('id', parsed.threadId)
        .eq('user_id', auth.userId)
        .maybeSingle();
      if (threadRes.error) throw threadRes.error;
      // 404, never 403 — a 403 would confirm the id exists.
      if (threadRes.data === null) {
        return jsonError(404, 'thread not found');
      }

      // Newest N by id descending, then reversed. Never
      // `.order('id', { ascending: true }).limit(N)`: that is the OLDEST N and
      // it hides the turn the user just sent.
      const messageRes = await supabase
        .from('chat_message')
        .select('role, content, script')
        .eq('thread_id', parsed.threadId)
        .order('id', { ascending: false })
        .limit(HISTORY_MAX_MESSAGES);
      if (messageRes.error) throw messageRes.error;
      history = ((messageRes.data ?? []) as HistoryRow[]).slice().reverse();
    }
  } catch (cause) {
    console.error('[chat] thread or profile read failed', cause);
    return jsonError(500, 'internal error');
  }

  // 7. The call.
  const messages = buildMessages({
    persona,
    playbook,
    profile,
    history,
    question: parsed.message,
    cacheControl: usesCacheControl(model),
  });

  let result: ChatCompletionResult;
  try {
    result = await chatCompletion({
      model,
      messages,
      max_tokens: CHAT_MAX_TOKENS,
      response_format: RESPONSE_FORMAT,
      // Without this OpenRouter routes to a provider that treats the schema as
      // a hint, producing intermittent unusable replies that reproduce for
      // nobody.
      provider: { require_parameters: true },
      timeoutMs: CHAT_DEADLINE_MS,
    });
  } catch (cause) {
    if (cause instanceof OpenRouterTimeoutError) {
      console.error('[chat] model timed out', { model });
      return jsonError(504, 'model timed out');
    }
    if (cause instanceof OpenRouterRequestError) {
      console.error('[chat] model request failed', {
        model,
        status: cause.status,
      });
      return jsonError(502, 'model reply unusable');
    }
    if (cause instanceof OpenRouterConfigError) {
      console.error('[chat] openrouter is not configured', cause.message);
      return jsonError(500, 'internal error');
    }
    console.error('[chat] chatCompletion threw', cause);
    return jsonError(500, 'internal error');
  }

  const validation = validateReply(result.content, result.usage.finish_reason);
  if (!validation.ok) {
    // The reply body is NEVER logged: it is a script written for a named
    // business and carries the profile the user supplied.
    console.error('[chat] unusable model reply', {
      model,
      finishReason: result.usage.finish_reason,
      contentLength: result.content.length,
      reason: validation.reason,
    });
    return jsonError(
      502,
      validation.reason === 'truncated'
        ? 'model reply truncated'
        : 'model reply unusable',
    );
  }
  const reply = validation.value;

  // 8. The write, and it cleans up after itself. Nothing is written until the
  //    reply has validated, and a `threadId` on a 200 is always a real,
  //    persisted thread — the next message would otherwise replay a history
  //    missing the turn the model is being asked to edit.
  let threadId = parsed.threadId;
  let createdThread = false;
  try {
    if (threadId === null) {
      // The title comes from the question that opened the thread. This route
      // used to leave the `'New chat'` column default standing and defer
      // naming to a rename control — which phase 1 never shipped, so every
      // row in the rail read `New chat` and the rail was unusable.
      const created = await supabase
        .from('chat_thread')
        .insert({
          user_id: auth.userId,
          user_profile_id: profile?.id ?? null,
          title: deriveThreadTitle(parsed.message),
        })
        .select('id')
        .single();
      if (created.error || created.data === null) {
        console.error('[chat] thread insert failed', created.error);
        return jsonError(500, 'internal error');
      }
      threadId = created.data.id as string;
      createdThread = true;
    }

    // ONE statement, so the turn lands whole or not at all. `id` is identity,
    // so the insert order is the replay order.
    const written = await supabase.from('chat_message').insert([
      { thread_id: threadId, role: 'user', content: parsed.message },
      {
        thread_id: threadId,
        role: 'assistant',
        content: reply.message,
        script: reply.script,
        model,
        prompt_tokens: result.usage.prompt_tokens,
        completion_tokens: result.usage.completion_tokens,
        cached_tokens: result.cached_tokens,
      },
    ]);
    if (written.error) {
      console.error('[chat] message insert failed', written.error);
      // Only a thread THIS request created. An empty thread the user never
      // sees content in sits in the left rail forever, and phase 1 ships no
      // way to remove it. Best effort: the 500 stands either way.
      if (createdThread) {
        const { error: cleanupError } = await supabase
          .from('chat_thread')
          .delete()
          .eq('id', threadId)
          .eq('user_id', auth.userId);
        if (cleanupError) {
          console.error('[chat] orphan thread cleanup failed', cleanupError);
        }
      }
      return jsonError(500, 'internal error');
    }
  } catch (cause) {
    console.error('[chat] write threw', cause);
    return jsonError(500, 'internal error');
  }

  return NextResponse.json(
    {
      ok: true,
      threadId,
      reply,
      meta: {
        model,
        // Straight from the client's usage record: `null`, never `0`, when the
        // response did not carry them.
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
        cachedTokens: result.cached_tokens,
        finishReason: result.usage.finish_reason,
        // What the model actually RECEIVED, not whether a row exists: a row
        // that exists but is incomplete reports false, which is what tells the
        // page to show the inline form.
        hasProfile: isProfileComplete(profile),
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
