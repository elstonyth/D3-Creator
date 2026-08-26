import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { safeRedirect } from '@gitroom/frontend/lib/redirects';

// Email-confirmation (and future OAuth) callback. Supabase redirects here with
// ?code=… — we exchange the code for a session, then route to redirectTo (or /me).
//
// Security: `redirectTo` is sanitized via safeRedirect() — anything that
// isn't a same-origin absolute path falls back to /me, blocking an attacker
// from crafting /auth/callback?code=…&redirectTo=https://evil.com as a
// post-auth phishing vector. `new URL(absoluteUrl, base)` silently honours
// the absolute input, so without this guard the redirect is open.
//
// THE CROSS-DEVICE CASE, which is common and is not a bug: the browser client
// is PKCE, so the code verifier lives in the storage of the browser that
// STARTED the flow. Sign up on a laptop, open the email on a phone, and the
// exchange here fails because the phone never had the verifier. Supabase has
// still confirmed the address server-side by that point, so the honest outcome
// is "sign in to finish" — not a raw provider error in the query string, which
// is what this route used to emit and what /login then ignored entirely.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = safeRedirect(searchParams.get('redirectTo'), '/me');

  function toLogin(notice: string): NextResponse {
    const url = new URL('/login', origin);
    url.searchParams.set('notice', notice);
    return NextResponse.redirect(url);
  }

  if (!code) {
    // Missing code means the callback was hit without a real auth handshake
    // (manual navigation, broken link, expired magic link).
    return toLogin('link_broken');
  }

  const supabase = await getSupabaseRoute();
  const { error: exchangeErr } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeErr) {
    // A dead reset link and a cross-device confirmation need different advice:
    // one needs a fresh link, the other just needs a sign-in. The destination
    // is the only thing that tells them apart here, and it is our own value.
    return toLogin(
      redirectTo.startsWith('/reset-password')
        ? 'reset_expired'
        : 'signin_needed',
    );
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}
