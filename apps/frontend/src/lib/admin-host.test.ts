import {
  adminOriginFor,
  isAdminHost,
  publicOriginFor,
  stripAdminPrefix,
  toAdminPath,
} from './admin-host';

describe('admin-host', () => {
  it('recognises the admin hosts only', () => {
    expect(isAdminHost('admin.d3creator.com')).toBe(true);
    expect(isAdminHost('admin.localhost:4200')).toBe(true);
    expect(isAdminHost('www.d3creator.com')).toBe(false);
    expect(isAdminHost('localhost:4200')).toBe(false);
    expect(isAdminHost(null)).toBe(false);
    // Prototype keys are not hosts.
    expect(isAdminHost('constructor')).toBe(false);
    expect(publicOriginFor('toString')).toBeUndefined();
    expect(adminOriginFor('hasOwnProperty')).toBeUndefined();
    expect(publicOriginFor('admin.d3creator.com')).toBe('https://www.d3creator.com');
    expect(adminOriginFor('www.d3creator.com')).toBe('https://admin.d3creator.com');
  });

  it('strips the /admin prefix without touching other paths', () => {
    expect(stripAdminPrefix('/admin')).toBe('/');
    expect(stripAdminPrefix('/admin/tracker')).toBe('/tracker');
    expect(stripAdminPrefix('/administrator')).toBe('/administrator');
    expect(stripAdminPrefix('/login')).toBe('/login');
  });

  it('maps admin-host URLs onto the /admin route group', () => {
    expect(toAdminPath('/')).toBe('/admin');
    expect(toAdminPath('/tracker')).toBe('/admin/tracker');
    expect(toAdminPath('/creators/abc')).toBe('/admin/creators/abc');
    // Same meaning on both hosts.
    expect(toAdminPath('/login')).toBe('/login');
    expect(toAdminPath('/api/chat')).toBe('/api/chat');
    expect(toAdminPath('/admin/tracker')).toBe('/admin/tracker');
    expect(toAdminPath('/me')).toBe('/me');
    // File-like paths are never routes in the admin tree.
    expect(toAdminPath('/robots.txt')).toBe('/robots.txt');
    expect(toAdminPath('/manifest.webmanifest')).toBe('/manifest.webmanifest');
  });
});
