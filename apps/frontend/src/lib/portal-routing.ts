/**
 * Every routing decision the middleware (proxy.ts) makes, as pure functions
 * so each host × role × path rule is table-tested (portal-routing.test.ts).
 * The middleware keeps only the I/O: refreshing the session and reading the
 * role.
 *
 * Two steps. `hostRoute` normalises the URL for its host (portal prefixes,
 * cross-host hops) and names the app-tree path to serve. `accessRoute`
 * decides whether this visitor may have that path, or where they belong.
 */

import {
  hostInfo,
  PORTAL_PREFIX,
  stripPrefix,
  toAppPath,
  under,
  type Area,
} from './portal-host';

export type Role =
  | 'admin'
  | 'creator'
  | 'member'
  | 'none'
  | 'staff'
  | 'staff_pending';

/** A redirect is an absolute URL or a path on the requested host. */
export type HostRoute = { redirect: string } | { appPath: string };
export type AccessRoute = { serve: true } | { redirect: string };

export function hostRoute(
  host: string | null | undefined,
  path: string,
  search: string,
): HostRoute {
  const { area, site } = hostInfo(host);
  if (area === 'public') {
    // Production public host: each portal lives on its own host.
    if (site) {
      for (const portal of ['admin', 'staff'] as const) {
        const prefix = PORTAL_PREFIX[portal];
        if (under(path, prefix))
          return {
            redirect: site[portal] + stripPrefix(path, prefix) + search,
          };
      }
    }
    return { appPath: path };
  }
  // A link that still spells the prefix lands on the clean URL.
  const prefix = PORTAL_PREFIX[area];
  if (under(path, prefix))
    return { redirect: stripPrefix(path, prefix) + search };
  // Nobody signs up on the console host; that form belongs to the public
  // site. (Staff do sign up on theirs.)
  if (area === 'admin' && path === '/signup' && site)
    return { redirect: `${site.public}/signup` };
  return { appPath: toAppPath(path, area) };
}

/** Where a signed-in role belongs, spelled for the host it is on now. */
export function roleHome(role: Role, host: string | null | undefined): string {
  const { area, site } = hostInfo(host);
  const at = (target: Area, path: string): string => {
    if (target === area) return path;
    // From a portal host everything else is another origin; portal hosts
    // always have a site.
    if (area !== 'public') return site![target] + path;
    // From the public host a portal is its local prefix; in production the
    // next request hops across (hostRoute).
    return (
      PORTAL_PREFIX[target as keyof typeof PORTAL_PREFIX] +
      (path === '/' ? '' : path)
    );
  };
  switch (role) {
    case 'admin':
      return at('admin', '/');
    case 'staff':
      return at('staff', '/');
    case 'staff_pending':
      return at('staff', '/pending');
    case 'creator':
      return at('public', '/me');
    default:
      return at('public', '/classes');
  }
}

const AUTH_PAGES = new Set(['/login', '/signup', '/forgot-password']);
// NOT an auth page: /reset-password is reached WITH a session, because
// /auth/callback exchanges the emailed code before redirecting here. Every
// role may finish a reset wherever it started.
const RESET_PATH = '/reset-password';

/**
 * `role` is null for an anonymous visitor. A signed-in account without a
 * `user_role` row arrives as 'creator' (the public site's fail-open default,
 * which grants nothing on either portal).
 */
export function accessRoute({
  host,
  appPath,
  rawPath,
  role,
}: {
  host: string | null | undefined;
  appPath: string;
  rawPath: string;
  role: Role | null;
}): AccessRoute {
  const serve = { serve: true } as const;
  const { area } = hostInfo(host);
  const isAdminRoute = under(appPath, '/admin');
  const isStaffRoute = under(appPath, '/staff');
  const isCreatorRoute = under(appPath, '/me') || under(appPath, '/onboarding');
  const isStudioRoute = under(appPath, '/studio');

  // /me/profiles was removed in Phase 3 — creators no longer self-manage
  // accounts. Stale links go to the dashboard (anonymous visitors then fall
  // through to the sign-in redirect on /me).
  if (appPath === '/me/profiles') return { redirect: '/me' };

  if (role === null) {
    if (isAdminRoute || isStaffRoute || isCreatorRoute || isStudioRoute)
      return { redirect: `/login?redirectTo=${encodeURIComponent(rawPath)}` };
    return serve;
  }

  const home = { redirect: roleHome(role, host) };
  const isStaff = role === 'staff' || role === 'staff_pending';

  // Signed-in users do not sit on (or re-submit) sign-in / sign-up.
  if (AUTH_PAGES.has(appPath)) return home;

  // Each portal host is for its own people only.
  if (area === 'admin' && role !== 'admin') return home;
  if (area === 'staff' && !isStaff) return home;

  // Admins are managers: the console and nothing else — not the Studio, not
  // the public pages.
  if (role === 'admin')
    return isAdminRoute || appPath === RESET_PATH ? serve : home;

  // Staff accounts are internal: the staff portal and nothing else. A
  // pending account sees only the waiting page; an approved one never does.
  if (isStaff) {
    if (appPath === RESET_PATH) return serve;
    if (!isStaffRoute) return home;
    const onPending = appPath === `${PORTAL_PREFIX.staff}/pending`;
    return (role === 'staff_pending') === onPending ? serve : home;
  }

  if (isAdminRoute || isStaffRoute) return home;

  // The creator dashboard is for creators; members and revoked accounts have
  // no creator data and go to the class library.
  if (isCreatorRoute && role !== 'creator')
    return { redirect: roleHome('member', host) };

  return serve;
}
