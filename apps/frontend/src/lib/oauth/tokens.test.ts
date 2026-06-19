/** @jest-environment node */
import { getValidToken, type OAuthConnectionRow } from './tokens';
import { encryptToken } from './crypto';
import { refresh as tiktokRefresh } from './tiktok';
import { updateConnectionTokens } from '@d3/database';

// ts-jest compiles ES exports as non-configurable, so jest.spyOn can't replace
// them in place; and jest's resolver doesn't honor the tsconfig `@d3/database`
// path. Mock both modules at the top so the refresh + persist calls are
// observable. `./tiktok` keeps its real exports except `refresh`.
jest.mock(
  '@d3/database',
  () => ({
    updateConnectionTokens: jest
      .fn()
      .mockResolvedValue({ ok: true, value: true }),
  }),
  { virtual: true },
);
jest.mock('./tiktok', () => ({
  ...jest.requireActual('./tiktok'),
  refresh: jest.fn(),
}));

const mockRefresh = tiktokRefresh as jest.Mock;
const mockUpdate = updateConnectionTokens as jest.Mock;

const KEY = Buffer.alloc(32, 5).toString('base64');
beforeEach(() => {
  process.env.OAUTH_ENC_KEY = KEY;
  process.env.TIKTOK_CLIENT_KEY = 'ck';
  process.env.TIKTOK_CLIENT_SECRET = 'cs';
  mockRefresh.mockReset();
  mockUpdate.mockReset().mockResolvedValue({ ok: true, value: true });
});

const META_BLOB = () => encryptToken('PAGE_TOKEN_123');

function metaConn(over: Partial<OAuthConnectionRow> = {}): OAuthConnectionRow {
  const b = META_BLOB();
  return {
    id: 'c1',
    platform: 'instagram',
    status: 'active',
    access_ct: b.ct,
    access_iv: b.iv,
    access_tag: b.tag,
    refresh_ct: null,
    refresh_iv: null,
    refresh_tag: null,
    access_expires_at: null,
    ...over,
  };
}

describe('getValidToken — Meta', () => {
  it('returns decrypted page token', async () => {
    expect(await getValidToken(metaConn())).toBe('PAGE_TOKEN_123');
  });
  it('throws for revoked', async () => {
    await expect(
      getValidToken(metaConn({ status: 'revoked' })),
    ).rejects.toThrow(/not active/);
  });
  it('throws for wiped blob', async () => {
    await expect(getValidToken(metaConn({ access_ct: '' }))).rejects.toThrow(
      /not active/,
    );
  });
});

function ttConn(
  expISO: string | null,
  over: Partial<OAuthConnectionRow> = {},
): OAuthConnectionRow {
  const a = encryptToken('OLD_ACCESS');
  const r = encryptToken('OLD_REFRESH');
  return {
    id: 't1',
    platform: 'tiktok',
    status: 'active',
    access_ct: a.ct,
    access_iv: a.iv,
    access_tag: a.tag,
    refresh_ct: r.ct,
    refresh_iv: r.iv,
    refresh_tag: r.tag,
    access_expires_at: expISO,
    ...over,
  };
}

describe('getValidToken — TikTok', () => {
  it('returns decrypted access when not near expiry (no refresh)', async () => {
    const far = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(await getValidToken(ttConn(far))).toBe('OLD_ACCESS');
    expect(mockRefresh).not.toHaveBeenCalled();
  });
  it('refreshes + persists rotated token when near expiry', async () => {
    mockRefresh.mockResolvedValue({
      access_token: 'NEW_ACCESS',
      refresh_token: 'NEW_REFRESH',
      expires_in: 86400,
      refresh_expires_in: 31536000,
      open_id: 'o',
      scope: 's',
    });
    const near = new Date(Date.now() + 60 * 1000).toISOString(); // 1 min left
    expect(await getValidToken(ttConn(near))).toBe('NEW_ACCESS');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
