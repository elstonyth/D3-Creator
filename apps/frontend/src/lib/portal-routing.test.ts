import { accessRoute, hostRoute, roleHome, type Role } from './portal-routing';

const WWW = 'www.d3creator.com';
const ADMIN = 'admin.d3creator.com';
const STAFF = 'staff.d3creator.com';
const DEV = 'localhost:4200';
const DEV_STAFF = 'staff.localhost:4200';

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
    [ADMIN, '/admin/tracker', '?day=1', { redirect: '/tracker?day=1' }],
    [ADMIN, '/signup', '', { redirect: 'https://www.d3creator.com/signup' }],
    [ADMIN, '/login', '', { appPath: '/login' }],
    [STAFF, '/', '', { appPath: '/staff' }],
    [STAFF, '/history', '?month=2026-08', { appPath: '/staff/history' }],
    [
      STAFF,
      '/staff/history',
      '?month=2026-08',
      { redirect: '/history?month=2026-08' },
    ],
    [STAFF, '/staff', '', { redirect: '/' }],
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
    expect(go(STAFF, '/staff', 'admin')).toEqual({
      redirect: 'https://admin.d3creator.com/',
    });
    for (const role of [
      'creator',
      'member',
      'none',
      'staff',
      'staff_pending',
    ] as const)
      expect(go(ADMIN, '/admin', role)).toHaveProperty('redirect');
    expect(go(ADMIN, '/admin', 'staff')).toEqual({
      redirect: 'https://staff.d3creator.com/',
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
    // Everyone else is sent home from the staff host.
    expect(go(STAFF, '/staff', 'member')).toEqual({
      redirect: 'https://www.d3creator.com/classes',
    });
    expect(go(STAFF, '/staff', 'creator')).toEqual({
      redirect: 'https://www.d3creator.com/me',
    });
    expect(go(DEV_STAFF, '/staff', 'none')).toEqual({
      redirect: 'http://localhost:4200/classes',
    });
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
});
