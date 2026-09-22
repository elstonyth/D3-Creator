/**
 * admin.d3creator.com — the console on its own host.
 *
 * The (admin) route group still lives under /admin/* in the app tree. On the
 * admin host the middleware (proxy.ts) serves it from the root instead:
 * `admin.d3creator.com/tracker` is rewritten to `/admin/tracker`, and a
 * browser that lands on `/admin/tracker` there is redirected to `/tracker` so
 * every in-page `/admin/...` link keeps working and the URL stays clean. On the
 * public host, `/admin/*` redirects across to the admin host.
 *
 * Shared by the middleware and the (admin) layout so the two agree on which
 * hosts are the console — the nav builds its hrefs from the same answer.
 */

/** Admin host -> the public site its non-admin visitors are sent back to. */
export const ADMIN_HOST_TO_PUBLIC: Readonly<Record<string, string>> = {
  'admin.d3creator.com': 'https://www.d3creator.com',
  // Chrome resolves *.localhost to loopback, so the host mode is testable in
  // dev without touching the hosts file.
  'admin.localhost:4200': 'http://localhost:4200',
};

/** Public host -> where its /admin/* traffic now lives. Dev keeps /admin local. */
export const PUBLIC_HOST_TO_ADMIN: Readonly<Record<string, string>> = {
  'www.d3creator.com': 'https://admin.d3creator.com',
  'd3creator.com': 'https://admin.d3creator.com',
};

/**
 * Paths that mean the same thing on both hosts and must NOT be prefixed with
 * /admin on the admin host: the auth pages, the API, and the signed-in routes
 * the role gate already handles (an admin on /me is bounced to the console;
 * a creator on the admin host is sent to the public site).
 */
const PASSTHROUGH = [
  '/admin',
  '/api',
  '/auth',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/studio',
  '/me',
  '/onboarding',
  '/dev',
];

// Own-property lookups only: a `Host: constructor` header must not walk up
// to Object.prototype and come back as a function.
function lookup(
  map: Readonly<Record<string, string>>,
  host: string | null | undefined,
): string | undefined {
  return host != null && Object.prototype.hasOwnProperty.call(map, host)
    ? map[host]
    : undefined;
}

/** The public site a non-admin on this admin host is sent to, or undefined. */
export function publicOriginFor(host: string | null | undefined) {
  return lookup(ADMIN_HOST_TO_PUBLIC, host);
}

/** The admin host this public host's /admin/* belongs on, or undefined. */
export function adminOriginFor(host: string | null | undefined) {
  return lookup(PUBLIC_HOST_TO_ADMIN, host);
}

export function isAdminHost(host: string | null | undefined): boolean {
  return publicOriginFor(host) !== undefined;
}

/** `/admin` -> `/`, `/admin/tracker` -> `/tracker`. Other paths unchanged. */
export function stripAdminPrefix(path: string): string {
  if (path === '/admin') return '/';
  if (path.startsWith('/admin/')) return path.slice('/admin'.length);
  return path;
}

/**
 * The app-tree path an admin-host URL resolves to: `/` -> `/admin`,
 * `/tracker` -> `/admin/tracker`. Passthrough prefixes and file-like paths
 * (`/robots.txt`, `/manifest.webmanifest`) are returned untouched.
 */
export function toAdminPath(path: string): string {
  if (path === '/') return '/admin';
  if (PASSTHROUGH.some((p) => path === p || path.startsWith(`${p}/`))) {
    return path;
  }
  const last = path.slice(path.lastIndexOf('/') + 1);
  if (last.includes('.')) return path;
  return `/admin${path}`;
}
