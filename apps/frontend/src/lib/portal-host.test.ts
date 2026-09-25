import {
  hostInfo,
  isAdminHost,
  isStaffHost,
  stripPrefix,
  toAppPath,
} from './portal-host';

describe('portal-host', () => {
  it('knows which area and site a host belongs to', () => {
    expect(hostInfo('admin.d3creator.com')).toEqual({
      area: 'admin',
      site: {
        public: 'https://www.d3creator.com',
        admin: 'https://admin.d3creator.com',
        staff: 'https://staff.d3creator.com',
      },
    });
    expect(hostInfo('staff.localhost:4200').area).toBe('staff');
    expect(hostInfo('staff.localhost:4200').site?.public).toBe(
      'http://localhost:4200',
    );
    expect(hostInfo('www.d3creator.com').area).toBe('public');
    expect(hostInfo('d3creator.com').site?.staff).toBe(
      'https://staff.d3creator.com',
    );
    // The dev public host and preview deployments keep /admin and /staff
    // local: public, with no site to hop to.
    expect(hostInfo('localhost:4200')).toEqual({ area: 'public', site: null });
    expect(hostInfo('d3-creator-git-x.vercel.app').site).toBeNull();
    expect(hostInfo(null)).toEqual({ area: 'public', site: null });
  });

  it('never treats prototype keys as hosts', () => {
    expect(hostInfo('constructor')).toEqual({ area: 'public', site: null });
    expect(hostInfo('__proto__').site).toBeNull();
    expect(isAdminHost('toString')).toBe(false);
    expect(isStaffHost('hasOwnProperty')).toBe(false);
  });

  it('answers the two host questions the pages ask', () => {
    expect(isAdminHost('admin.d3creator.com')).toBe(true);
    expect(isAdminHost('staff.d3creator.com')).toBe(false);
    expect(isStaffHost('staff.d3creator.com')).toBe(true);
    expect(isStaffHost('www.d3creator.com')).toBe(false);
  });

  it('strips a prefix only at a segment boundary', () => {
    expect(stripPrefix('/admin', '/admin')).toBe('/');
    expect(stripPrefix('/admin/tracker', '/admin')).toBe('/tracker');
    expect(stripPrefix('/administrator', '/admin')).toBe('/administrator');
    expect(stripPrefix('/staff/history', '/staff')).toBe('/history');
    expect(stripPrefix('/login', '/staff')).toBe('/login');
  });

  it('maps portal-host URLs onto the route groups', () => {
    expect(toAppPath('/', 'admin')).toBe('/admin');
    expect(toAppPath('/tracker', 'admin')).toBe('/admin/tracker');
    expect(toAppPath('/creators/abc', 'admin')).toBe('/admin/creators/abc');
    expect(toAppPath('/', 'staff')).toBe('/staff');
    expect(toAppPath('/history', 'staff')).toBe('/staff/history');
    expect(toAppPath('/pending', 'staff')).toBe('/staff/pending');
    // Same meaning on every host.
    for (const p of [
      '/login',
      '/signup',
      '/forgot-password',
      '/reset-password',
      '/wrong-account',
      '/auth/callback',
      '/api/chat',
      '/me',
      '/studio/chat',
      '/dev/staff-preview',
      '/admin/tracker',
      '/staff/history',
    ])
      expect(toAppPath(p, 'staff')).toBe(p);
    // File-like paths are never routes in a portal tree.
    expect(toAppPath('/robots.txt', 'staff')).toBe('/robots.txt');
    expect(toAppPath('/manifest.webmanifest', 'admin')).toBe(
      '/manifest.webmanifest',
    );
  });
});
