/**
 * Open-redirect guard.
 *
 * `new URL(input, base)` silently ignores the base when `input` is absolute,
 * so passing an unvalidated user-supplied `redirectTo` to NextResponse.redirect
 * (or `router.push`) lets an attacker land the post-auth victim on any
 * external URL. This helper enforces same-origin: the target must be an
 * absolute path that, resolved against a placeholder origin, stays on it.
 *
 * Asking the URL parser is the point. A check on the raw string misses what
 * the parser rewrites first: it strips tab, CR and LF anywhere in the input
 * and reads a backslash as a slash, so "/\t/evil.com" and "/\\evil.com" both
 * become the protocol-relative "//evil.com".
 */

const BASE = 'https://redirect.invalid';

/** True only for safe in-app paths like "/me" or "/dashboard?x=1". */
export function isSafeRedirect(target: string | null | undefined): boolean {
  // Must be an absolute path: rejects absolute URLs ("https://evil.com"),
  // data URIs, javascript: URIs, etc.
  if (!target || !target.startsWith('/')) return false;
  try {
    return new URL(target, BASE).origin === BASE;
  } catch {
    return false;
  }
}

/** Sanitize a redirect target, returning the fallback if unsafe. */
export function safeRedirect(
  target: string | null | undefined,
  fallback: string,
): string {
  if (!isSafeRedirect(target)) return fallback;
  const u = new URL(target!, BASE);
  return u.pathname + u.search + u.hash; // normalised: control characters stripped
}
