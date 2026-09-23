/**
 * The site's hosts.
 *
 * www.d3creator.com is the public product (creators, members, classes,
 * Studio). Two portals live on hosts of their own: admin.d3creator.com (the
 * console) and staff.d3creator.com (the team's schedule and records). Each
 * portal is a route group under a prefix in the app tree — /admin, /staff —
 * and on its host the middleware (proxy.ts, via portal-routing.ts) serves it
 * from the root: `staff.d3creator.com/history` is `/staff/history`.
 *
 * Shared by the middleware and the layouts/pages so they agree on which host
 * is which; the navs build their hrefs from the same answer.
 */

export type Area = 'public' | 'admin' | 'staff';
export type PortalArea = Exclude<Area, 'public'>;

/** The three origins of one deployment. */
export interface Site {
  public: string;
  admin: string;
  staff: string;
}

const PROD: Site = {
  public: 'https://www.d3creator.com',
  admin: 'https://admin.d3creator.com',
  staff: 'https://staff.d3creator.com',
};

// Chrome resolves *.localhost to loopback, so both portals are testable in
// dev without touching the hosts file.
const DEV: Site = {
  public: 'http://localhost:4200',
  admin: 'http://admin.localhost:4200',
  staff: 'http://staff.localhost:4200',
};

// The dev public host (localhost:4200) is deliberately absent, like every
// preview deployment: /admin and /staff stay local there.
const HOSTS: Readonly<Record<string, { area: Area; site: Site }>> = {
  'www.d3creator.com': { area: 'public', site: PROD },
  'd3creator.com': { area: 'public', site: PROD },
  'admin.d3creator.com': { area: 'admin', site: PROD },
  'staff.d3creator.com': { area: 'staff', site: PROD },
  'admin.localhost:4200': { area: 'admin', site: DEV },
  'staff.localhost:4200': { area: 'staff', site: DEV },
};

export const PORTAL_PREFIX = { admin: '/admin', staff: '/staff' } as const;

/** Which area a host serves, and the deployment's origins when known. */
export function hostInfo(host: string | null | undefined): {
  area: Area;
  site: Site | null;
} {
  // Own-property lookups only: a `Host: constructor` header must not walk up
  // to Object.prototype and come back as a function.
  if (host != null && Object.prototype.hasOwnProperty.call(HOSTS, host))
    return HOSTS[host];
  return { area: 'public', site: null };
}

export function isAdminHost(host: string | null | undefined): boolean {
  return hostInfo(host).area === 'admin';
}

export function isStaffHost(host: string | null | undefined): boolean {
  return hostInfo(host).area === 'staff';
}

/** Which sign-in look a host gets (components/auth/auth-shell.tsx). */
export function authVariant(
  host: string | null | undefined,
): 'default' | 'admin' | 'staff' {
  const { area } = hostInfo(host);
  return area === 'public' ? 'default' : area;
}

/** `path` is `prefix` or sits below it — `/admin/x` yes, `/administrator` no. */
export function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** `/staff` -> `/`, `/staff/history` -> `/history`. Other paths unchanged. */
export function stripPrefix(path: string, prefix: string): string {
  if (path === prefix) return '/';
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length);
  return path;
}

/**
 * Paths that mean the same thing on every host and are never prefixed on a
 * portal host: the auth pages, the API, the dev previews, and the signed-in
 * routes whose owners the role gate sends home.
 */
const PASSTHROUGH = [
  '/admin',
  '/staff',
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

/**
 * The app-tree path a portal-host URL resolves to: `/` -> `/staff`,
 * `/history` -> `/staff/history`. Passthrough prefixes and file-like paths
 * (`/robots.txt`, `/manifest.webmanifest`) are returned untouched.
 */
export function toAppPath(path: string, area: PortalArea): string {
  const prefix = PORTAL_PREFIX[area];
  if (path === '/') return prefix;
  if (PASSTHROUGH.some((p) => under(path, p))) return path;
  const last = path.slice(path.lastIndexOf('/') + 1);
  if (last.includes('.')) return path;
  return `${prefix}${path}`;
}
