/** The one gate every cron route shares. */

import { assertCronAuth } from './cron-auth';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), init),
  },
}));

const call = (auth?: string) =>
  assertCronAuth(
    new Request('https://www.d3creator.com/api/cron/x', {
      headers: auth ? { authorization: auth } : {},
    }),
  );

const saved = process.env.CRON_SECRET;
afterAll(() => {
  process.env.CRON_SECRET = saved;
});

it('lets the holder of the secret through', () => {
  process.env.CRON_SECRET = 's3cret';
  expect(call('Bearer s3cret')).toBeNull();
});

it('turns everyone else away, whatever the length', () => {
  process.env.CRON_SECRET = 's3cret';
  for (const auth of [undefined, 'Bearer s3creX', 'Bearer s3', 's3cret'])
    expect(call(auth)?.status).toBe(401);
});

it('refuses everything, loudly, when no secret is set', async () => {
  delete process.env.CRON_SECRET;
  const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const res = call('Bearer anything');
  expect(res?.status).toBe(500);
  expect(await res?.json()).toEqual({
    error:
      'CRON_SECRET not configured on the server — add it to Vercel project env vars',
  });
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});
