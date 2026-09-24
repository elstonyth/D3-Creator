import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  accessRoute,
  hostRoute,
  type Role,
} from '@gitroom/frontend/lib/portal-routing';

// Signed-in users are redirected off these to their role home. Mirrors the
// rule in portal-routing.ts; needed here only to keep a failing role lookup
// from bouncing /login -> /login forever.
const AUTH_PAGES = new Set(['/login', '/signup', '/forgot-password']);

/**
 * The middleware. It does the I/O — refresh the Supabase session, read the
 * caller's role — and hands every decision to lib/portal-routing.ts, where
 * each host × role × path rule is table-tested:
 *
 * - www.d3creator.com: the public site; /admin/* and /staff/* hop to their
 *   own hosts.
 * - admin.d3creator.com: the console, admins only.
 * - staff.d3creator.com: the staff portal, staff only (pending accounts see
 *   only the waiting page).
 */
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
  const redirect = (to: string) => {
    const r = NextResponse.redirect(new URL(to, request.url));
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  const host = request.headers.get('host');
  const rawPath = request.nextUrl.pathname;
  const search = request.nextUrl.search;

  const routed = hostRoute(host, rawPath, search);
  if ('redirect' in routed) return redirect(routed.redirect);
  const { appPath } = routed;

  // The response that finally serves the page — a rewrite on a portal host.
  const serve = () => {
    if (appPath === rawPath) return response;
    const r = NextResponse.rewrite(new URL(appPath + search, request.url), {
      request,
    });
    for (const c of response.cookies.getAll()) r.cookies.set(c);
    return r;
  };

  // API routes authenticate themselves (handlers call getUser) and must never
  // be redirected — a 3xx would corrupt fetch/JSON callers. Bail after the
  // session refresh above.
  if (appPath.startsWith('/api')) return response;

  let role: Role | null = null;
  if (user) {
    // Only signed-in requests pay for this lookup; anonymous traffic (the bulk
    // of public-page load) never reaches it.
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
      // /login -> /login forever (ERR_TOO_MANY_REDIRECTS) and lock the user
      // out entirely. Serve the auth page instead so they can still see it.
      if (AUTH_PAGES.has(appPath)) return serve();
      return redirect('/login?error=session_lookup_failed');
    }
    // A missing row reads as 'creator' (fail-open for the public site); it
    // grants nothing on either portal.
    role = (roleRow?.role as Role | undefined) ?? 'creator';
  }

  const access = accessRoute({ host, appPath, rawPath, role });
  return 'redirect' in access ? redirect(access.redirect) : serve();
}

export const config = {
  matcher: [
    // Run on all paths except Next internals + static assets.
    '/((?!_next/static|_next/image|favicon.ico|api/cron|api/proxy-image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|map)$).*)',
  ],
};
