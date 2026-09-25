/**
 * A failed code exchange is usually the cross-device case: PKCE keeps the
 * verifier in the browser that started the flow. The user still has to land
 * where the link promised once they sign in, so the destination goes along to
 * /login — sanitised, and never for a dead reset link.
 */

import { NextRequest } from 'next/server';

import { GET } from './route';

const exchangeCodeForSession = jest.fn();

jest.mock('@gitroom/frontend/lib/supabase-route', () => ({
  getSupabaseRoute: async () => ({ auth: { exchangeCodeForSession } }),
}));

const ORIGIN = 'https://www.d3creator.com';

async function location(query: string): Promise<string> {
  const res = await GET(new NextRequest(`${ORIGIN}/auth/callback?${query}`));
  expect(res.status).toBe(307);
  return res.headers.get('location') ?? '';
}

beforeEach(() => {
  exchangeCodeForSession.mockReset();
  exchangeCodeForSession.mockResolvedValue({
    error: { message: 'bad verifier' },
  });
});

it('keeps the destination when the link is opened on another device', async () => {
  expect(await location('code=c&redirectTo=%2Fstudio%2Fchat')).toBe(
    `${ORIGIN}/login?notice=signin_needed&redirectTo=%2Fstudio%2Fchat`,
  );
  expect(exchangeCodeForSession).toHaveBeenCalledWith('c');
});

it('sends a dead reset link to login without a destination', async () => {
  const url = new URL(await location('code=c&redirectTo=%2Freset-password'));
  expect(url.origin).toBe(ORIGIN);
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('notice')).toBe('reset_expired');
  expect(url.searchParams.has('redirectTo')).toBe(false);
});

it('never passes on an off-site destination', async () => {
  const loc = await location('code=c&redirectTo=https%3A%2F%2Fevil.com');
  expect(loc).not.toContain('evil.com');
  const url = new URL(loc);
  expect(url.origin).toBe(ORIGIN);
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('notice')).toBe('signin_needed');
  expect(url.searchParams.get('redirectTo')).toBe('/me');
});

it('never passes on a destination the URL parser turns off-site', async () => {
  // A tab (like CR or LF) is stripped by the parser, so "/\t/evil.com" would
  // be read as the protocol-relative "//evil.com".
  const loc = await location('code=c&redirectTo=%2F%09%2Fevil.com');
  expect(loc).not.toContain('evil.com');
  const url = new URL(loc);
  expect(url.origin).toBe(ORIGIN);
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('notice')).toBe('signin_needed');
});

it('reports a link without a code as broken, with no destination', async () => {
  const url = new URL(await location('redirectTo=%2Fstudio%2Fchat'));
  expect(url.origin).toBe(ORIGIN);
  expect(url.pathname).toBe('/login');
  expect(url.searchParams.get('notice')).toBe('link_broken');
  expect(url.searchParams.has('redirectTo')).toBe(false);
  expect(exchangeCodeForSession).not.toHaveBeenCalled();
});
