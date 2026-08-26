/**
 * POST /api/studio/profile — create one business profile (PRD 2 §10 "The
 * profile endpoint").
 * PATCH /api/studio/profile — edit the caller's ACTIVE row (Amendment 1 §B5).
 *
 * No GET, no PUT, no DELETE handler. The Settings page and the chat page both
 * read `user_profile` directly through RLS in their Server Component; there is
 * no read endpoint and none is needed.
 *
 * `apps/frontend/src/proxy.ts` returns early for any path beginning `/api`, so
 * this handler gates itself.
 */

import { NextResponse } from 'next/server';

import {
  getAuthContext,
  isStudioMember,
  type AuthContext,
} from '../../../../lib/auth';
import {
  parseInlineProfile,
  parseProfileUpdate,
} from '../../../../lib/business-profile';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { getSupabaseRoute } from '../../../../lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The house envelope. Three other route files each define their own copy;
 *  there is no shared export to import (`analyzer/jobs/route.ts:29`). */
function jsonError(status: number, error: string): Response {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * The two "Access gating" checks, in order, before the body is read.
 * `getAuthContext()` re-throws when the `user_role` lookup errors, and
 * `getSupabaseRoute()` throws when the public Supabase variables are missing —
 * an uncaught throw from either returns Next's HTML error page and breaks every
 * `await res.json()` on the client.
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

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined; // both parsers reject it
  }
}

function tooMany(error: string, retryAfter: number): Response {
  return NextResponse.json(
    { ok: false, error },
    {
      status: 429,
      headers: {
        'Cache-Control': 'no-store',
        'Retry-After': String(retryAfter),
      },
    },
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Order of checks, and it is load-bearing: auth → validate → rate limit →
 * insert, so a malformed request never costs a token.
 *
 * A caller who already has an active profile and posts again gets a 201 and a
 * SECOND row, which the trigger makes active. That is §10 "More than one
 * business" and it is intended, not a conflict.
 */
export async function POST(request: Request): Promise<Response> {
  const gated = await gate();
  if (!gated.ok) return gated.response;

  const parsed = parseInlineProfile(await readJson(request));
  if (!parsed.ok) return jsonError(400, 'invalid request');

  const limit = await checkRateLimit({
    prefix: 'studio-profile',
    key: gated.auth.userId,
    tokens: 10,
    window: '1 h',
  });
  if (!limit.ok) return tooMany('too many saves', limit.retryAfter);

  try {
    const supabase = await getSupabaseRoute();
    // No `is_active`: sending it would duplicate the trigger that already
    // stands down the user's other rows. No `.select()` — nothing is read back.
    const { error } = await supabase.from('user_profile').insert({
      user_id: gated.auth.userId,
      what_you_sell: parsed.value.what_you_sell,
      who_buys_it: parsed.value.who_buys_it,
      main_platform: parsed.value.main_platform,
      on_camera: parsed.value.on_camera,
    });
    if (error) {
      console.error('[studio/profile] insert failed', error);
      return jsonError(500, 'internal error');
    }
  } catch (cause) {
    console.error('[studio/profile] insert threw', cause);
    return jsonError(500, 'internal error');
  }

  return NextResponse.json(
    { ok: true },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}

/**
 * Edits the caller's ACTIVE row. The body carries no id — the row is selected
 * by `is_active`, so this handler structurally cannot switch which business is
 * active even if somebody later adds the column to the update list by mistake.
 *
 * `parseProfileUpdate` rejects `is_active` as an unknown key, which is the
 * other half of the same guard: naming that column in an UPDATE fires the
 * `before insert or update of is_active` trigger, and editing a non-active
 * business would switch to it.
 */
export async function PATCH(request: Request): Promise<Response> {
  const gated = await gate();
  if (!gated.ok) return gated.response;

  const parsed = parseProfileUpdate(await readJson(request));
  if (!parsed.ok) return jsonError(400, 'invalid request');

  const limit = await checkRateLimit({
    prefix: 'studio-profile-edit',
    key: gated.auth.userId,
    tokens: 30,
    window: '1 h',
  });
  if (!limit.ok) return tooMany('too many saves', limit.retryAfter);

  try {
    const supabase = await getSupabaseRoute();
    const { data, error } = await supabase
      .from('user_profile')
      .update(parsed.value)
      .eq('user_id', gated.auth.userId)
      .eq('is_active', true)
      .select('id');
    if (error) {
      console.error('[studio/profile] update failed', error);
      return jsonError(500, 'internal error');
    }
    // No active row. Settings should not have rendered a form, so this is a
    // stale tab rather than a state worth its own UI.
    if ((data ?? []).length === 0) {
      return jsonError(404, 'no active profile');
    }
  } catch (cause) {
    console.error('[studio/profile] update threw', cause);
    return jsonError(500, 'internal error');
  }

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
