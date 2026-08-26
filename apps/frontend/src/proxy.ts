import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const ADMIN_PREFIXES = ['/admin'];
const CREATOR_PREFIXES = ['/me', '/onboarding'];
const STUDIO_PREFIXES = ['/studio'];
// Logged-in users are redirected off these to their role home — keeps an
// authenticated user from sitting on (or re-submitting) login/signup.
const AUTH_PAGES = new Set(['/login', '/signup', '/forgot-password']);
// NOT an auth page: /reset-password is reached WITH a session, because
// /auth/callback exchanges the emailed code before redirecting here. Putting it
// in AUTH_PAGES would bounce every user off the page the link exists to reach.
const RESET_PATH = '/reset-password';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Canonical Supabase SSR pattern: write to both request and response
        // cookies so Server Components in the same request see the refreshed
        // session, and the browser receives the new cookies on the way out.
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refreshes the session and writes new cookies on response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirects must carry any refreshed session cookies from `response`, or the
  // browser keeps the old (already-rotated, now-dead) refresh token and the
  // user is logged out on their next request.
  const redirect = (url: URL) => {
    const r = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  const pathname = request.nextUrl.pathname;

  // API routes authenticate themselves (handlers call getUser) and must never
  // be redirected — a 3xx would corrupt fetch/JSON callers. Bail after the
  // session refresh above.
  if (pathname.startsWith('/api')) return response;

  // /me/profiles is removed in Phase 3 — creators no longer self-manage
  // accounts. Send stale links to the dashboard (authed creators; anon falls
  // through to the creator-route -> /login rule below).
  if (pathname === '/me/profiles') {
    return redirect(new URL('/me', request.url));
  }

  const isAuthPage = AUTH_PAGES.has(pathname);
  const isAdminRoute = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));
  const isCreatorRoute = CREATOR_PREFIXES.some((p) => pathname.startsWith(p));
  const isStudioRoute = STUDIO_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user) {
    if (isAdminRoute || isCreatorRoute || isStudioRoute) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return redirect(loginUrl);
    }
    return response;
  }

  // A logged-in user always needs their role resolved now: admins are confined
  // to /admin/* and bounced off every public + auth route, so the old "public
  // routes skip the lookup" shortcut no longer holds for authenticated
  // requests. Anonymous traffic — the bulk of public-page load — already
  // returned above, so this DB roundtrip is paid only by signed-in users.
  // Only the role is needed for routing now — there is no onboarding gate.
  // Creators self-provision on first profile-add, so a signed-in creator goes
  // straight to /me. Anonymous traffic (the bulk of public-page load) already
  // returned above, so this DB roundtrip is paid only by signed-in users.
  const { data: roleRow, error: roleErr } = await supabase
    .from('user_role')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  // Distinguish "no row" (legitimate — fresh user) from "DB/network error".
  // On a real error we fail closed: kick to /login with a generic flag rather
  // than silently treating the user as a default-role creator.
  if (roleErr) {
    console.error('[proxy] role lookup failed', {
      roleErr: roleErr.message,
      userId: user.id,
    });
    // Don't redirect to /login when we're already on it: /login re-runs this
    // same lookup, so redirecting on a persistent error would bounce
    // /login -> /login forever (ERR_TOO_MANY_REDIRECTS) and lock the user out
    // entirely. Serve the auth page instead so they can still see the error.
    if (isAuthPage) return response;
    const failUrl = new URL('/login', request.url);
    failUrl.searchParams.set('error', 'session_lookup_failed');
    return redirect(failUrl);
  }
  const role =
    (roleRow?.role as 'admin' | 'creator' | 'member' | 'none' | undefined) ??
    'creator';
  const home =
    role === 'admin' ? '/admin' : role === 'creator' ? '/me' : '/classes';

  // Logged-in users shouldn't sit on login/signup.
  if (isAuthPage) {
    return redirect(new URL(home, request.url));
  }

  // Confine admins to the admin surface: ANY non-admin route — public (home,
  // showcase) AND creator routes (/me, /onboarding) — bounces to /admin.
  // Admins are managers; they never go through the creator flow.
  // (auth pages + /api were handled above.)
  // Studio is the one exemption: admins reach /studio/* (PRD 3 §5.5).
  // /reset-password joins Studio as an exemption: an admin following their own
  // reset link would otherwise be bounced to /admin with the password unchanged
  // and no way to finish.
  if (
    role === 'admin' &&
    !isAdminRoute &&
    !isStudioRoute &&
    pathname !== RESET_PATH
  ) {
    return redirect(new URL('/admin', request.url));
  }

  // Admin-only routes for non-admins — members and creators go to their home.
  if (isAdminRoute && role !== 'admin') {
    return redirect(new URL(home, request.url));
  }

  // Creator dashboard is for creators (+ admins, handled above). Members/none
  // have no creator data — send them to the classes library instead.
  if (isCreatorRoute && role !== 'creator') {
    return redirect(new URL('/classes', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except Next internals + static assets.
    '/((?!_next/static|_next/image|favicon.ico|api/cron|api/proxy-image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)',
  ],
};
