/** @jest-environment node */
import { createHmac } from 'node:crypto';
import { verifySignedRequest, listPagesAndIg } from './meta';

const SECRET = 'app-secret-xyz';

function makeSigned(payloadObj: object, secret = SECRET): string {
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString(
    'base64url',
  );
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${sig}.${payload}`;
}

describe('verifySignedRequest', () => {
  it('accepts a correctly signed request', () => {
    const signed = makeSigned({ user_id: '42', algorithm: 'HMAC-SHA256' });
    expect(verifySignedRequest(signed, SECRET)?.user_id).toBe('42');
  });

  it('rejects a bad signature', () => {
    const signed = makeSigned({ user_id: '42' }, 'wrong-secret');
    expect(verifySignedRequest(signed, SECRET)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifySignedRequest('garbage', SECRET)).toBeNull();
  });
});

type FetchResult = { ok: boolean; status?: number; json?: unknown; text?: string };
function mockFetch(routes: (url: string) => FetchResult) {
  return jest.fn(async (input: string | URL) => {
    const r = routes(String(input));
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.json ?? {},
      text: async () => r.text ?? '',
    } as unknown as Response;
  });
}
const page = (
  id: string,
  name: string,
  ig?: { id: string; username: string },
) => ({
  id,
  name,
  access_token: `tok-${id}`,
  ...(ig ? { instagram_business_account: ig } : {}),
});

describe('listPagesAndIg', () => {
  const realFetch = global.fetch;
  const origFlag = process.env.META_INCLUDE_BUSINESS_PAGES;
  afterEach(() => {
    global.fetch = realFetch;
    if (origFlag === undefined) delete process.env.META_INCLUDE_BUSINESS_PAGES;
    else process.env.META_INCLUDE_BUSINESS_PAGES = origFlag;
  });

  it('returns direct /me/accounts pages and skips the business edge when the flag is off', async () => {
    delete process.env.META_INCLUDE_BUSINESS_PAGES;
    const fetchMock = mockFetch((url) => {
      if (url.includes('/me/accounts'))
        return {
          ok: true,
          json: { data: [page('1', 'A', { id: 'ig1', username: 'a' })] },
        };
      throw new Error(`unexpected url ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const out = await listPagesAndIg('user-token');
    expect(out).toEqual([
      {
        pageId: '1',
        pageName: 'A',
        pageAccessToken: 'tok-1',
        igId: 'ig1',
        igUsername: 'a',
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no business edge call
  });

  it('falls back to business-portfolio pages when /me/accounts is empty', async () => {
    process.env.META_INCLUDE_BUSINESS_PAGES = 'true';
    global.fetch = mockFetch((url) => {
      if (url.includes('/me/accounts')) return { ok: true, json: { data: [] } };
      if (url.includes('/me/businesses'))
        return {
          ok: true,
          json: {
            data: [
              {
                owned_pages: {
                  data: [page('9', 'Biz', { id: 'ig9', username: 'biz' })],
                },
              },
            ],
          },
        };
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;
    const out = await listPagesAndIg('user-token');
    expect(out).toEqual([
      {
        pageId: '9',
        pageName: 'Biz',
        pageAccessToken: 'tok-9',
        igId: 'ig9',
        igUsername: 'biz',
      },
    ]);
  });

  it('merges direct + business pages and dedupes by id (direct wins)', async () => {
    process.env.META_INCLUDE_BUSINESS_PAGES = 'true';
    global.fetch = mockFetch((url) => {
      if (url.includes('/me/accounts'))
        return { ok: true, json: { data: [page('1', 'Direct')] } };
      if (url.includes('/me/businesses'))
        return {
          ok: true,
          json: {
            data: [
              {
                owned_pages: { data: [page('1', 'DupFromBiz'), page('2', 'BizOnly')] },
                client_pages: { data: [] },
              },
            ],
          },
        };
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;
    const out = await listPagesAndIg('user-token');
    const byId = Object.fromEntries(out.map((t) => [t.pageId, t.pageName]));
    expect(byId).toEqual({ '1': 'Direct', '2': 'BizOnly' });
    expect(out).toHaveLength(2);
  });

  it('degrades to direct results when the business edge errors (#100, scope missing)', async () => {
    process.env.META_INCLUDE_BUSINESS_PAGES = 'true';
    global.fetch = mockFetch((url) => {
      if (url.includes('/me/accounts'))
        return { ok: true, json: { data: [page('1', 'A')] } };
      if (url.includes('/me/businesses'))
        return {
          ok: false,
          status: 400,
          json: { error: { code: 100, message: 'Missing Permission' } },
        };
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;
    const out = await listPagesAndIg('user-token');
    expect(out.map((t) => t.pageId)).toEqual(['1']);
  });

  it('drops business pages that lack a page access token', async () => {
    process.env.META_INCLUDE_BUSINESS_PAGES = 'true';
    global.fetch = mockFetch((url) => {
      if (url.includes('/me/accounts')) return { ok: true, json: { data: [] } };
      if (url.includes('/me/businesses'))
        return {
          ok: true,
          json: { data: [{ owned_pages: { data: [{ id: '7', name: 'NoToken' }] } }] },
        };
      throw new Error(`unexpected url ${url}`);
    }) as unknown as typeof fetch;
    const out = await listPagesAndIg('user-token');
    expect(out).toEqual([]);
  });
});
