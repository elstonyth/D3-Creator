import { accessRoute, hostRoute, roleHome, type Role } from './portal-routing';

const WWW = 'www.d3creator.com';
const ADMIN = 'admin.d3creator.com';
const STAFF = 'staff.d3creator.com';
const DEV = 'localhost:4200';
const DEV_STAFF = 'staff.localhost:4200';
const DEV_ADMIN = 'admin.localhost:4200';
const ROLES = [
  'admin',
  'creator',
  'member',
  'none',
  'staff',
  'staff_pending',
] as const;

describe('hostRoute', () => {
  it.each([
    // Production public host: the portals live on their own hosts.
    [WWW, '/admin', '', { redirect: 'https://admin.d3creator.com/' }],
    [
      WWW,
      '/admin/tracker',
      '?month=2026-09',
      { redirect: 'https://admin.d3creator.com/tracker?month=2026-09' },
    ],
    [WWW, '/staff', '', { redirect: 'https://staff.d3creator.com/' }],
    [
      'd3creator.com',
      '/staff/history',
      '',
      { redirect: 'https://staff.d3creator.com/history' },
    ],
    [WWW, '/administrator', '', { appPath: '/administrator' }],
    [WWW, '/leaderboard', '', { appPath: '/leaderboard' }],
    // Dev public host and preview deployments keep both portals local.
    [DEV, '/admin/tracker', '', { appPath: '/admin/tracker' }],
    [DEV, '/staff', '', { appPath: '/staff' }],
    ['x.vercel.app', '/staff/history', '', { appPath: '/staff/history' }],
    // A portal host serves its tree from the root.
    [ADMIN, '/', '', { appPath: '/admin' }],
    [ADMIN, '/tracker', '', { appPath: '/admin/tracker' }],
    [
      ADMIN,
      '/admin/tracker',
      '?day=1',
      { redirect: 'https://admin.d3creator.com/tracker?day=1' },
    ],
    // Whoever tries to sign up on the console is staff: their form is on the
    // staff site, never the public one (that made member accounts).
    [ADMIN, '/signup', '', { redirect: 'https://staff.d3creator.com/signup' }],
    [
      DEV_ADMIN,
      '/signup',
      '',
      { redirect: 'http://staff.localhost:4200/signup' },
    ],
    [ADMIN, '/login', '', { appPath: '/login' }],
    [ADMIN, '/wrong-account', '', { appPath: '/wrong-account' }],
    [STAFF, '/wrong-account', '', { appPath: '/wrong-account' }],
    [STAFF, '/', '', { appPath: '/staff' }],
    [STAFF, '/history', '?month=2026-08', { appPath: '/staff/history' }],
    [
      STAFF,
      '/staff/history',
      '?month=2026-08',
      { redirect: 'https://staff.d3creator.com/history?month=2026-08' },
    ],
    [STAFF, '/staff', '', { redirect: 'https://staff.d3creator.com/' }],
    // Never a protocol-relative hop off the host.
    [
      STAFF,
      '/staff//evil.com',
      '',
      { redirect: 'https://staff.d3creator.com//evil.com' },
    ],
    [
      DEV_STAFF,
      '/staff/\\evil.com',
      '',
      { redirect: 'http://staff.localhost:4200/\\evil.com' },
    ],
    // Staff DO sign up on their own host.
    [STAFF, '/signup', '', { appPath: '/signup' }],
    [DEV_STAFF, '/pending', '', { appPath: '/staff/pending' }],
    [STAFF, '/api/x', '', { appPath: '/api/x' }],
  ] as const)('%s %s%s', (host, path, search, want) => {
    expect(hostRoute(host, path, search)).toEqual(want);
  });
});

describe('roleHome', () => {
  it.each([
    ['admin', ADMIN, '/'],
    ['admin', WWW, '/admin'],
    ['admin', STAFF, 'https://admin.d3creator.com/'],
    ['admin', DEV_STAFF, 'http://admin.localhost:4200/'],
    ['staff', STAFF, '/'],
    ['staff_pending', STAFF, '/pending'],
    ['staff', WWW, '/staff'],
    ['staff_pending', DEV, '/staff/pending'],
    ['staff', ADMIN, 'https://staff.d3creator.com/'],
    ['creator', WWW, '/me'],
    ['creator', STAFF, 'https://www.d3creator.com/me'],
    ['member', ADMIN, 'https://www.d3creator.com/classes'],
    ['none', WWW, '/classes'],
  ] as const)('%s on %s', (role, host, want) => {
    expect(roleHome(role, host)).toBe(want);
  });
});

describe('accessRoute', () => {
  const go = (
    host: string,
    appPath: string,
    role: Role | null,
    rawPath = appPath,
  ) => accessRoute({ host, appPath, rawPath, role });
  const serve = { serve: true };

  it('sends anonymous visitors of a protected page to sign in, on the same host', () => {
    expect(go(STAFF, '/staff', null, '/')).toEqual({
      redirect: '/login?redirectTo=%2F',
    });
    expect(go(STAFF, '/staff/history', null, '/history')).toEqual({
      redirect: '/login?redirectTo=%2Fhistory',
    });
    expect(go(ADMIN, '/admin/tracker', null, '/tracker')).toEqual({
      redirect: '/login?redirectTo=%2Ftracker',
    });
    for (const p of ['/me', '/onboarding', '/studio/chat', '/admin', '/staff'])
      expect(go(DEV, p, null)).toHaveProperty('redirect');
    for (const p of [
      '/',
      '/leaderboard',
      '/classes',
      '/login',
      '/signup',
      '/reset-password',
      '/administrator',
    ])
      expect(go(DEV, p, null)).toEqual(serve);
  });

  it('lets every role finish a password reset on the host it started on', () => {
    for (const host of [STAFF, ADMIN, DEV])
      for (const role of [
        'member',
        'creator',
        'none',
        'staff',
        'staff_pending',
        'admin',
      ] as const)
        expect(go(host, '/reset-password', role)).toEqual(serve);
  });

  it('keeps the removed /me/profiles pointing at the dashboard', () => {
    expect(go(DEV, '/me/profiles', null)).toEqual({ redirect: '/me' });
    expect(go(DEV, '/me/profiles', 'creator')).toEqual({ redirect: '/me' });
  });

  it('never leaves a signed-in user on a sign-in page', () => {
    expect(go(STAFF, '/login', 'staff')).toEqual({ redirect: '/' });
    expect(go(STAFF, '/signup', 'staff_pending')).toEqual({
      redirect: '/pending',
    });
    expect(go(ADMIN, '/login', 'admin')).toEqual({ redirect: '/' });
    expect(go(WWW, '/forgot-password', 'member')).toEqual({
      redirect: '/classes',
    });
  });

  it('admits only admins to the console host, and only to the console', () => {
    expect(go(ADMIN, '/admin/team', 'admin')).toEqual(serve);
    expect(go(ADMIN, '/reset-password', 'admin')).toEqual(serve);
    // No Studio for the admin account any more, and nothing else public.
    expect(go(ADMIN, '/studio/chat', 'admin')).toEqual({ redirect: '/' });
    expect(go(DEV, '/studio', 'admin')).toEqual({ redirect: '/admin' });
    expect(go(DEV, '/leaderboard', 'admin')).toEqual({ redirect: '/admin' });
    expect(go(DEV, '/staff', 'admin')).toEqual({ redirect: '/admin' });
    // Anyone else is kept on the console host and told why.
    expect(go(STAFF, '/staff', 'admin')).toEqual({
      redirect: '/wrong-account',
    });
    for (const role of [
      'creator',
      'member',
      'none',
      'staff',
      'staff_pending',
    ] as const)
      expect(go(ADMIN, '/admin', role)).toEqual({
        redirect: '/wrong-account',
      });
  });

  it('admits approved staff to the portal and parks pending staff on one page', () => {
    expect(go(STAFF, '/staff', 'staff')).toEqual(serve);
    expect(go(STAFF, '/staff/history', 'staff')).toEqual(serve);
    expect(go(STAFF, '/staff/pending', 'staff')).toEqual({ redirect: '/' });
    expect(go(STAFF, '/staff/pending', 'staff_pending')).toEqual(serve);
    expect(go(STAFF, '/staff', 'staff_pending')).toEqual({
      redirect: '/pending',
    });
    expect(go(STAFF, '/staff/history', 'staff_pending')).toEqual({
      redirect: '/pending',
    });
    expect(go(STAFF, '/reset-password', 'staff')).toEqual(serve);
    // Staff have nothing on www or in the console.
    expect(go(DEV, '/', 'staff')).toEqual({ redirect: '/staff' });
    expect(go(WWW, '/studio', 'staff')).toEqual({ redirect: '/staff' });
    expect(go(DEV, '/admin', 'staff_pending')).toEqual({
      redirect: '/staff/pending',
    });
    // Everyone else is kept on the staff host and told why.
    for (const [host, role] of [
      [STAFF, 'member'],
      [STAFF, 'creator'],
      [DEV_STAFF, 'none'],
    ] as const)
      expect(go(host, '/staff', role)).toEqual({ redirect: '/wrong-account' });
  });

  it('keeps every other account on a portal host, on every path, at /wrong-account', () => {
    const own = { admin: ['admin'], staff: ['staff', 'staff_pending'] };
    for (const [host, area] of [
      [ADMIN, 'admin'],
      [DEV_ADMIN, 'admin'],
      [STAFF, 'staff'],
      [DEV_STAFF, 'staff'],
    ] as const)
      for (const role of ROLES) {
        if ((own[area] as readonly string[]).includes(role)) continue;
        for (const p of [
          `/${area}`,
          '/login',
          '/signup',
          '/forgot-password',
          '/auth/callback',
          '/studio/chat',
          '/me',
        ])
          expect(go(host, p, role)).toEqual({ redirect: '/wrong-account' });
        // The page itself is served, and a reset is still finished here.
        expect(go(host, '/wrong-account', role)).toEqual(serve);
        expect(go(host, '/reset-password', role)).toEqual(serve);
      }
  });

  it('sends the right account and nobody away from /wrong-account', () => {
    expect(go(ADMIN, '/wrong-account', 'admin')).toEqual({ redirect: '/' });
    expect(go(STAFF, '/wrong-account', 'staff')).toEqual({ redirect: '/' });
    expect(go(DEV_STAFF, '/wrong-account', 'staff_pending')).toEqual({
      redirect: '/pending',
    });
    for (const host of [ADMIN, STAFF, WWW, DEV])
      expect(go(host, '/wrong-account', null)).toEqual({ redirect: '/login' });
    // The public site has no wrong accounts: everyone goes home.
    expect(go(WWW, '/wrong-account', 'member')).toEqual({
      redirect: '/classes',
    });
    expect(go(WWW, '/wrong-account', 'admin')).toEqual({ redirect: '/admin' });
    expect(go(DEV, '/wrong-account', 'staff')).toEqual({ redirect: '/staff' });
  });

  it('keeps the public site as it was for creators and members', () => {
    expect(go(WWW, '/me', 'creator')).toEqual(serve);
    expect(go(WWW, '/me', 'member')).toEqual({ redirect: '/classes' });
    expect(go(WWW, '/onboarding', 'none')).toEqual({ redirect: '/classes' });
    expect(go(WWW, '/studio/chat', 'member')).toEqual(serve);
    expect(go(WWW, '/leaderboard', 'creator')).toEqual(serve);
    expect(go(DEV, '/admin', 'creator')).toEqual({ redirect: '/me' });
    expect(go(DEV, '/staff', 'member')).toEqual({ redirect: '/classes' });
  });

  it('keeps the public site as it was on the sign-in pages and the callback', () => {
    expect(go(WWW, '/login', 'member')).toEqual({ redirect: '/classes' });
    expect(go(WWW, '/signup', 'creator')).toEqual({ redirect: '/me' });
    expect(go(WWW, '/login', 'admin')).toEqual({ redirect: '/admin' });
    expect(go(WWW, '/signup', 'staff')).toEqual({ redirect: '/staff' });
    expect(go(DEV, '/forgot-password', 'staff_pending')).toEqual({
      redirect: '/staff/pending',
    });
    expect(go(WWW, '/auth/callback', 'member')).toEqual(serve);
    expect(go(WWW, '/auth/callback', 'creator')).toEqual(serve);
    expect(go(WWW, '/auth/callback', null)).toEqual(serve);
    for (const role of ROLES)
      expect(go(WWW, '/reset-password', role)).toEqual(serve);
  });
});

describe('hostRoute + accessRoute together', () => {
  /**
   * Follows the middleware's redirects the way a browser would — across
   * hosts, query split off — and returns where the chain is served. Throws on
   * a loop. The role is held constant across hosts, the worst case: sessions
   * are per host, so in life a hop usually lands anonymous. (The proxy's
   * role-lookup-failure branch is not modelled; it lands on /login, which that
   * branch always serves.)
   */
  function follow(host: string, url: string, role: Role | null): string {
    for (let hop = 0; hop < 6; hop++) {
      const [path, query] = url.split('?');
      const search = query === undefined ? '' : `?${query}`;
      const routed = hostRoute(host, path, search);
      let to: string;
      if ('redirect' in routed) to = routed.redirect;
      else {
        const access = accessRoute({
          host,
          appPath: routed.appPath,
          rawPath: path,
          role,
        });
        if (!('redirect' in access)) return `${host}${routed.appPath}`;
        to = access.redirect;
      }
      if (/^https?:\/\//.test(to)) {
        const next = new URL(to);
        host = next.host;
        url = next.pathname + next.search;
      } else url = to;
    }
    throw new Error(`redirect loop: ${host}${url} as ${role}`);
  }

  it('never loops, for any host, role or path', () => {
    for (const host of [
      WWW,
      'd3creator.com',
      DEV,
      ADMIN,
      STAFF,
      DEV_ADMIN,
      DEV_STAFF,
    ])
      for (const role of [...ROLES, null])
        for (const path of [
          '/',
          '/login',
          '/signup',
          '/forgot-password',
          '/auth/callback',
          '/reset-password',
          '/wrong-account',
          '/me/profiles',
          '/studio/chat',
          '/pending',
        ])
          expect(() => follow(host, path, role)).not.toThrow();
  });

  it('lands the owner’s two cases on the right page', () => {
    // A member signing up on the console gets the staff form.
    expect(follow(ADMIN, '/signup', null)).toBe(`${STAFF}/signup`);
    // A member signed in on a portal host stays there, able to sign out.
    expect(follow(ADMIN, '/login', 'member')).toBe(`${ADMIN}/wrong-account`);
    expect(follow(STAFF, '/', 'creator')).toBe(`${STAFF}/wrong-account`);
    expect(follow(DEV_STAFF, '/signup', 'none')).toBe(
      `${DEV_STAFF}/wrong-account`,
    );
  });
});
