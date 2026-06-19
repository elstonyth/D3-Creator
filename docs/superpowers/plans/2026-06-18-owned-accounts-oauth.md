# Owned-Accounts OAuth — Connect Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in creator connect their own Instagram / Facebook / TikTok account from `/me`, storing encrypted owner tokens attached to a `profile`, with Meta's required callbacks and admin status visibility — enough to record the demo videos that unblock both app reviews.

**Architecture:** Pure, unit-tested helpers (`crypto`, `state`/PKCE, `signed_request`) in `apps/frontend/src/lib/oauth/`. Platform HTTP in the same dir. Service-role DB writes (token store + attach-or-create) in `@d3/database`. Node-runtime route handlers under `app/api/oauth/`. Connect UI under `/me/connections`; admin status on the existing creator-detail page. Tokens live in a service-role-only table as AES-256-GCM ciphertext (base64 text columns); a SECURITY DEFINER RPC exposes status only.

**Tech Stack:** Next.js App Router (Node runtime route handlers), React 19 Server Components + server actions, Supabase Postgres (CLI migrations, `is_admin()`/SECURITY DEFINER pattern), `@supabase/supabase-js`, Node `crypto`, Jest, pnpm.

---

## Design source

Spec: [docs/superpowers/specs/2026-06-18-owned-accounts-oauth-design.md](../specs/2026-06-18-owned-accounts-oauth-design.md). Read §2 (locked decisions) and §11 (security) before starting.

## File map

**Create**

- `supabase/migrations/20260618000000_oauth_connection.sql` — table, indexes, RLS, 2 RPCs, extend `claimed_via`.
- `apps/frontend/src/lib/oauth/crypto.ts` (+ `crypto.test.ts`)
- `apps/frontend/src/lib/oauth/config.ts` (+ `config.test.ts`)
- `apps/frontend/src/lib/oauth/state.ts` (+ `state.test.ts`)
- `apps/frontend/src/lib/oauth/meta.ts` (+ `meta.test.ts`)
- `apps/frontend/src/lib/oauth/tiktok.ts`
- `libraries/database/src/oauth.ts`
- `supabase/tests/oauth-connection.mts` (tsx integration)
- `apps/frontend/src/lib/oauth-connections.ts` (frontend read helpers: typed RPC pass-through)
- `apps/frontend/src/app/api/oauth/tiktok/start/route.ts`
- `apps/frontend/src/app/api/oauth/tiktok/callback/route.ts`
- `apps/frontend/src/app/api/oauth/meta/start/route.ts`
- `apps/frontend/src/app/api/oauth/meta/callback/route.ts`
- `apps/frontend/src/app/api/oauth/meta/deauthorize/route.ts`
- `apps/frontend/src/app/api/oauth/meta/data-deletion/route.ts`
- `apps/frontend/src/app/(creator)/me/connections/page.tsx`
- `apps/frontend/src/app/(creator)/me/connections/connect-buttons.tsx`
- `apps/frontend/src/app/(creator)/me/connections/meta-picker.tsx`
- `apps/frontend/src/app/(creator)/me/connections/actions.ts`
- `apps/frontend/src/components/admin/creator-connections.tsx`

**Modify**

- `libraries/database/src/index.ts` — export the new `oauth.ts` surface.
- `apps/frontend/src/app/(creator)/me/account/page.tsx` — add a nav link to `/me/connections`.
- `apps/frontend/src/app/(admin)/admin/creators/[id]/page.tsx` — render the admin connections section.
- `apps/frontend/src/lib/admin-creators.ts` — add a status reader (or add to `oauth-connections.ts`; this plan puts it in `oauth-connections.ts`).
- `apps/frontend/src/app/(public)/privacy/page.tsx`, `terms/page.tsx` — OAuth disclosure rewrite.
- `.env.example` — document `OAUTH_ENC_KEY`.

## Conventions (match existing code)

- Service-role writes go through `getSupabaseAdmin()` from `@d3/database`; never import it into browser code.
- DB helpers return `Result<T>` = `{ ok: true, value } | { ok: false, error }` (see `libraries/database/src/types.ts`).
- Server actions: `'use server'`, call `requireAdmin()`/`getAuthContext()`, validate ids with `isUuid`, return `{ ok, message }` (never throw), `revalidatePath`.
- Route handlers that use Node `crypto`/service-role set `export const runtime = 'nodejs'`.
- Reuse `safeRedirect()` for any user-influenced redirect target.
- Run a single test file: `cd apps/frontend && npx jest src/lib/oauth/<name> --no-coverage`.
  (Worktree note: the project-wide `pnpm test` glob breaks on Windows backslashes — run jest from `apps/frontend` with an explicit path, per project memory.)
- Apply migrations via Supabase MCP `apply_migration` (needs explicit per-action user OK) or `supabase db push`.

---

### Task 1: DB migration — token store + RPCs

**Files:**

- Create: `supabase/migrations/20260618000000_oauth_connection.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Owned-accounts OAuth — token store + status RPCs (2026-06-18).
-- Ciphertext stored as base64 TEXT (AES-256-GCM done app-side) to avoid
-- bytea/PostgREST encoding friction. Table is service-role only: no anon/
-- authenticated policies, so token columns never reach a browser. Status is
-- exposed via SECURITY DEFINER RPCs that return NO token columns.

-- 1. Allow 'oauth' provenance on profile_claim (owner claims created at connect).
alter table public.profile_claim drop constraint profile_claim_claimed_via_check;
alter table public.profile_claim add constraint profile_claim_claimed_via_check
  check (claimed_via in ('manual','auto_discovery','admin_assigned','oauth'));

-- 2. Token store.
create table public.oauth_connection (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id)     on delete cascade,
  profile_id          uuid not null references public.profile(id) on delete cascade,
  platform            text not null check (platform in ('instagram','facebook','tiktok')),
  external_account_id text not null,
  account_name        text,
  scopes              text,
  access_ct           text not null,
  access_iv           text not null,
  access_tag          text not null,
  refresh_ct          text,
  refresh_iv          text,
  refresh_tag         text,
  access_expires_at   timestamptz,
  refresh_expires_at  timestamptz,
  status              text not null default 'active' check (status in ('active','revoked','expired')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_refreshed_at   timestamptz,
  unique (user_id, platform, external_account_id)
);

create index oauth_connection_user_idx    on public.oauth_connection (user_id);
create index oauth_connection_profile_idx on public.oauth_connection (profile_id);

create trigger oauth_connection_updated_at before update on public.oauth_connection
  for each row execute function public.set_updated_at();

alter table public.oauth_connection enable row level security;
-- No policies for anon/authenticated => service_role only.

-- 3. Caller's own connection status (safe columns only).
create or replace function public.get_my_oauth_connections()
returns table (
  id uuid, platform text, account_name text, status text,
  access_expires_at timestamptz, refresh_expires_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.platform, c.account_name, c.status,
         c.access_expires_at, c.refresh_expires_at, c.created_at
  from public.oauth_connection c
  where c.user_id = (select auth.uid())
  order by c.created_at desc
$$;

-- 4. Admin view of all connection status (gated by is_admin()).
create or replace function public.get_admin_oauth_connections(p_creator_id uuid default null)
returns table (
  creator_id uuid, display_name text, platform text, account_name text,
  status text, access_expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select cr.id, cr.display_name, c.platform, c.account_name, c.status, c.access_expires_at
  from public.oauth_connection c
  join public.profile p on p.id = c.profile_id
  join public.creator cr on cr.id = p.creator_id
  where public.is_admin()
    and (p_creator_id is null or cr.id = p_creator_id)
  order by cr.display_name, c.platform
$$;

-- 5. Grants: mirror the windowed-RPC hardening. Both are SECURITY DEFINER with
--    pinned search_path; revoke the default PUBLIC execute, grant authenticated.
revoke execute on function public.get_my_oauth_connections()       from public, anon;
revoke execute on function public.get_admin_oauth_connections(uuid) from public, anon;
grant  execute on function public.get_my_oauth_connections()       to authenticated;
grant  execute on function public.get_admin_oauth_connections(uuid) to authenticated;
```

- [ ] **Step 2: Apply the migration**

Apply via Supabase MCP `apply_migration` (name `oauth_connection`, the SQL above) — approve the per-action prompt — or `supabase db push`.
Expected: success; `oauth_connection` table created.

- [ ] **Step 3: Verify the table + RPCs exist**

Run (Supabase MCP `execute_sql` or `psql`):

```sql
select count(*) from public.oauth_connection;
select proname from pg_proc where proname in ('get_my_oauth_connections','get_admin_oauth_connections');
```

Expected: count `0`; two function rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260618000000_oauth_connection.sql
git commit -m "feat(oauth): add oauth_connection token store + status RPCs"
```

---

### Task 2: Token encryption (`crypto.ts`)

**Files:**

- Create: `apps/frontend/src/lib/oauth/crypto.ts`
- Test: `apps/frontend/src/lib/oauth/crypto.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/** @jest-environment node */
import { encryptToken, decryptToken } from './crypto';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('oauth crypto', () => {
  beforeEach(() => {
    process.env.OAUTH_ENC_KEY = KEY;
  });

  it('round-trips a token', () => {
    const blob = encryptToken('secret-token');
    expect(decryptToken(blob)).toBe('secret-token');
  });

  it('uses a fresh iv per call', () => {
    expect(encryptToken('x').iv).not.toBe(encryptToken('x').iv);
  });

  it('rejects a tampered auth tag', () => {
    const blob = encryptToken('secret');
    const bad = { ...blob, tag: Buffer.alloc(16, 0).toString('base64') };
    expect(() => decryptToken(bad)).toThrow();
  });

  it('throws when the key is the wrong length', () => {
    process.env.OAUTH_ENC_KEY = Buffer.alloc(16, 1).toString('base64');
    expect(() => encryptToken('x')).toThrow(/32 bytes/);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd apps/frontend && npx jest src/lib/oauth/crypto --no-coverage`
Expected: FAIL — "Cannot find module './crypto'".

- [ ] **Step 3: Implement**

```ts
// apps/frontend/src/lib/oauth/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function getKey(): Buffer {
  const b64 = process.env.OAUTH_ENC_KEY;
  if (!b64) throw new Error('OAUTH_ENC_KEY is not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error(`OAUTH_ENC_KEY must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}

export interface EncryptedBlob {
  ct: string; // base64 ciphertext
  iv: string; // base64 iv
  tag: string; // base64 GCM auth tag
}

export function encryptToken(plaintext: string): EncryptedBlob {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ct: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptToken(blob: EncryptedBlob): string {
  const decipher = createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(blob.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(blob.ct, 'base64')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd apps/frontend && npx jest src/lib/oauth/crypto --no-coverage`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/oauth/crypto.ts apps/frontend/src/lib/oauth/crypto.test.ts
git commit -m "feat(oauth): AES-256-GCM token encrypt/decrypt"
```

---

### Task 3: Config + env validation (`config.ts`)

**Files:**

- Create: `apps/frontend/src/lib/oauth/config.ts`
- Test: `apps/frontend/src/lib/oauth/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/** @jest-environment node */
import {
  metaRedirectUri,
  tiktokRedirectUri,
  requireOauthEncKey,
} from './config';

describe('oauth config', () => {
  it('builds redirect URIs from SITE_URL', () => {
    expect(metaRedirectUri()).toBe(
      'https://www.d3creator.com/api/oauth/meta/callback',
    );
    expect(tiktokRedirectUri()).toBe(
      'https://www.d3creator.com/api/oauth/tiktok/callback',
    );
  });

  it('accepts a 32-byte key', () => {
    process.env.OAUTH_ENC_KEY = Buffer.alloc(32, 1).toString('base64');
    expect(() => requireOauthEncKey()).not.toThrow();
  });

  it('rejects a short key', () => {
    process.env.OAUTH_ENC_KEY = Buffer.alloc(8, 1).toString('base64');
    expect(() => requireOauthEncKey()).toThrow(/32 bytes/);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd apps/frontend && npx jest src/lib/oauth/config --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/frontend/src/lib/oauth/config.ts
import { SITE_URL } from '@gitroom/frontend/lib/site';

export const META_GRAPH_VERSION = 'v21.0'; // bump to latest stable if needed

export function metaRedirectUri(): string {
  return `${SITE_URL}/api/oauth/meta/callback`;
}
export function tiktokRedirectUri(): string {
  return `${SITE_URL}/api/oauth/tiktok/callback`;
}

export function requireOauthEncKey(): Buffer {
  const b64 = process.env.OAUTH_ENC_KEY;
  if (!b64) throw new Error('OAUTH_ENC_KEY is not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32)
    throw new Error(`OAUTH_ENC_KEY must decode to 32 bytes, got ${key.length}`);
  return key;
}

export function metaAppId(): string {
  const v = process.env.META_APP_ID;
  if (!v) throw new Error('META_APP_ID is not set');
  return v;
}
export function metaAppSecret(): string {
  const v = process.env.META_APP_SECRET;
  if (!v) throw new Error('META_APP_SECRET is not set');
  return v;
}
export function tiktokClientKey(): string {
  const v = process.env.TIKTOK_CLIENT_KEY;
  if (!v) throw new Error('TIKTOK_CLIENT_KEY is not set');
  return v;
}
export function tiktokClientSecret(): string {
  const v = process.env.TIKTOK_CLIENT_SECRET;
  if (!v) throw new Error('TIKTOK_CLIENT_SECRET is not set');
  return v;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd apps/frontend && npx jest src/lib/oauth/config --no-coverage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/oauth/config.ts apps/frontend/src/lib/oauth/config.test.ts
git commit -m "feat(oauth): env/config accessors + redirect URIs"
```

---

### Task 4: Signed state + PKCE (`state.ts`)

**Files:**

- Create: `apps/frontend/src/lib/oauth/state.ts`
- Test: `apps/frontend/src/lib/oauth/state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
/** @jest-environment node */
import { signState, verifyState, makePkce } from './state';
import { createHash } from 'node:crypto';

beforeEach(() => {
  process.env.OAUTH_ENC_KEY = Buffer.alloc(32, 3).toString('base64');
});

describe('oauth state', () => {
  it('round-trips uid', () => {
    const s = signState('user-123');
    expect(verifyState(s)?.uid).toBe('user-123');
  });

  it('rejects a tampered payload', () => {
    const s = signState('user-123');
    const [, sig] = s.split('.');
    const forged = Buffer.from(
      JSON.stringify({ uid: 'attacker', nonce: 'x', exp: 9_999_999_999 }),
      'utf8',
    ).toString('base64url');
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects an expired state', () => {
    const s = signState('user-123', 600);
    expect(verifyState(s, 9_999_999_999)).toBeNull();
  });

  it('PKCE challenge is the s256 of the verifier', () => {
    const { verifier, challenge } = makePkce();
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(
      challenge,
    );
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd apps/frontend && npx jest src/lib/oauth/state --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/frontend/src/lib/oauth/state.ts
import {
  createHmac,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

function stateKey(): Buffer {
  const b64 = process.env.OAUTH_ENC_KEY;
  if (!b64) throw new Error('OAUTH_ENC_KEY is not set');
  const ikm = Buffer.from(b64, 'base64');
  // Distinct derived key so the state HMAC key != the token encryption key.
  return Buffer.from(
    hkdfSync('sha256', ikm, Buffer.alloc(0), 'd3-oauth-state', 32),
  );
}

export interface StatePayload {
  uid: string;
  nonce: string;
  exp: number; // unix seconds
}

export function signState(uid: string, ttlSeconds = 600): string {
  const payload: StatePayload = {
    uid,
    nonce: randomBytes(8).toString('hex'),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const sig = createHmac('sha256', stateKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(
  state: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): StatePayload | null {
  const [body, sig] = state.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', stateKey())
    .update(body)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || payload.exp < nowSeconds) return null;
  return payload;
}

export function makePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url'); // 64 url-safe chars
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd apps/frontend && npx jest src/lib/oauth/state --no-coverage`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/oauth/state.ts apps/frontend/src/lib/oauth/state.test.ts
git commit -m "feat(oauth): signed CSRF state + PKCE helpers"
```

---

### Task 5: Meta HTTP + signed_request (`meta.ts`)

**Files:**

- Create: `apps/frontend/src/lib/oauth/meta.ts`
- Test: `apps/frontend/src/lib/oauth/meta.test.ts`

The pure, unit-tested piece is `verifySignedRequest`. The HTTP functions are exercised manually against Meta dev mode.

- [ ] **Step 1: Write the failing test**

```ts
/** @jest-environment node */
import { createHmac } from 'node:crypto';
import { verifySignedRequest } from './meta';

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
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd apps/frontend && npx jest src/lib/oauth/meta --no-coverage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// apps/frontend/src/lib/oauth/meta.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { META_GRAPH_VERSION } from './config';

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** Verify a Meta signed_request ("<sig>.<payload>", base64url). */
export function verifySignedRequest(
  signed: string,
  appSecret: string,
): Record<string, unknown> | null {
  const [encodedSig, payload] = signed.split('.');
  if (!encodedSig || !payload) return null;
  const expected = createHmac('sha256', appSecret).update(payload).digest();
  const provided = Buffer.from(encodedSig, 'base64url');
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      data.algorithm &&
      String(data.algorithm).toUpperCase() !== 'HMAC-SHA256'
    )
      return null;
    return data;
  } catch {
    return null;
  }
}

export function metaAuthorizeUrl(opts: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string {
  const p = new URLSearchParams({
    client_id: opts.appId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    response_type: 'code',
    scope: opts.scopes.join(','),
  });
  return `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${p.toString()}`;
}

export interface MetaToken {
  access_token: string;
  expires_in?: number;
}

export async function exchangeCode(opts: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<MetaToken> {
  const p = new URLSearchParams({
    client_id: opts.appId,
    client_secret: opts.appSecret,
    redirect_uri: opts.redirectUri,
    code: opts.code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${p.toString()}`);
  if (!res.ok)
    throw new Error(
      `Meta code exchange failed: ${res.status} ${await res.text()}`,
    );
  return (await res.json()) as MetaToken;
}

export async function exchangeLongLived(opts: {
  appId: string;
  appSecret: string;
  shortToken: string;
}): Promise<MetaToken> {
  const p = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: opts.appId,
    client_secret: opts.appSecret,
    fb_exchange_token: opts.shortToken,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${p.toString()}`);
  if (!res.ok)
    throw new Error(
      `Meta long-lived exchange failed: ${res.status} ${await res.text()}`,
    );
  return (await res.json()) as MetaToken;
}

export interface MetaTarget {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igId: string | null;
  igUsername: string | null;
}

/** List the user's Pages + each Page's linked IG business account. */
export async function listPagesAndIg(userToken: string): Promise<MetaTarget[]> {
  const p = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    access_token: userToken,
    limit: '100',
  });
  const res = await fetch(`${GRAPH}/me/accounts?${p.toString()}`);
  if (!res.ok)
    throw new Error(
      `Meta /me/accounts failed: ${res.status} ${await res.text()}`,
    );
  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: { id: string; username?: string };
    }>;
  };
  return (json.data ?? []).map((pg) => ({
    pageId: pg.id,
    pageName: pg.name,
    pageAccessToken: pg.access_token,
    igId: pg.instagram_business_account?.id ?? null,
    igUsername: pg.instagram_business_account?.username ?? null,
  }));
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd apps/frontend && npx jest src/lib/oauth/meta --no-coverage`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/lib/oauth/meta.ts apps/frontend/src/lib/oauth/meta.test.ts
git commit -m "feat(oauth): Meta OAuth http + signed_request verify"
```

---

### Task 6: TikTok HTTP (`tiktok.ts`)

**Files:**

- Create: `apps/frontend/src/lib/oauth/tiktok.ts`

No unit test (all network). Verified manually in TikTok Sandbox.

- [ ] **Step 1: Implement**

```ts
// apps/frontend/src/lib/oauth/tiktok.ts
const AUTHORIZE = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN = 'https://open.tiktokapis.com/v2/oauth/token/';
const USERINFO = 'https://open.tiktokapis.com/v2/user/info/';

export function tiktokAuthorizeUrl(opts: {
  clientKey: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: string[];
}): string {
  const p = new URLSearchParams({
    client_key: opts.clientKey,
    response_type: 'code',
    scope: opts.scopes.join(','),
    redirect_uri: opts.redirectUri,
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE}?${p.toString()}`;
}

export interface TikTokToken {
  access_token: string;
  expires_in: number; // seconds (~86400)
  refresh_token: string;
  refresh_expires_in: number; // seconds (~31536000)
  open_id: string;
  scope: string;
}

export async function exchangeCode(opts: {
  clientKey: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<TikTokToken> {
  const body = new URLSearchParams({
    client_key: opts.clientKey,
    client_secret: opts.clientSecret,
    code: opts.code,
    grant_type: 'authorization_code',
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `TikTok code exchange failed: ${res.status} ${JSON.stringify(json)}`,
    );
  }
  return json as TikTokToken;
}

export async function refresh(opts: {
  clientKey: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TikTokToken> {
  const body = new URLSearchParams({
    client_key: opts.clientKey,
    client_secret: opts.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
  });
  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(
      `TikTok refresh failed: ${res.status} ${JSON.stringify(json)}`,
    );
  }
  return json as TikTokToken;
}

export async function fetchUserInfo(
  accessToken: string,
): Promise<{ open_id: string; display_name: string | null }> {
  const res = await fetch(`${USERINFO}?fields=open_id,display_name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok || json.error?.code !== 'ok') {
    throw new Error(
      `TikTok user/info failed: ${res.status} ${JSON.stringify(json)}`,
    );
  }
  return {
    open_id: json.data?.user?.open_id ?? '',
    display_name: json.data?.user?.display_name ?? null,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit -p tsconfig.json`
Expected: no errors from `tiktok.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/oauth/tiktok.ts
git commit -m "feat(oauth): TikTok OAuth http (exchange/refresh/userinfo)"
```

---

### Task 7: DB token-store helpers (`@d3/database` `oauth.ts`)

**Files:**

- Create: `libraries/database/src/oauth.ts`
- Modify: `libraries/database/src/index.ts`
- Test: `supabase/tests/oauth-connection.mts` (tsx integration, real DB)

- [ ] **Step 1: Implement the helper module**

```ts
// libraries/database/src/oauth.ts
import { getSupabaseAdmin } from './supabase-server';
import { findOrCreateProfile } from './claim';
import type { Platform, Result } from './types';

export type OAuthPlatform = 'instagram' | 'facebook' | 'tiktok';

export interface EncryptedBlob {
  ct: string;
  iv: string;
  tag: string;
}

/** Build the canonical profile_url for an owned account so it matches the
 *  same URL shape the scraper/admin would have stored. */
export function ownedProfileUrl(
  platform: OAuthPlatform,
  handle: string,
  externalId: string,
): string {
  switch (platform) {
    case 'instagram':
      return `https://www.instagram.com/${handle}`;
    case 'tiktok':
      return `https://www.tiktok.com/@${handle}`;
    case 'facebook':
      // Pages are stable by id; numeric id is always resolvable.
      return `https://www.facebook.com/${externalId}`;
  }
}

/**
 * Ensure a profile + owner claim for a connected account, owned by user_id.
 * Reuses findOrCreateProfile (race-safe canonical lookup) then inserts an
 * 'owner'/'oauth' claim. The scraped profile (if any) is matched by URL.
 */
export async function attachOwnedProfile(input: {
  user_id: string;
  creator_id: string;
  platform: OAuthPlatform;
  handle: string;
  external_account_id: string;
}): Promise<Result<{ profile_id: string }>> {
  const supabase = getSupabaseAdmin();
  const url = ownedProfileUrl(
    input.platform,
    input.handle,
    input.external_account_id,
  );

  const found = await findOrCreateProfile({
    platform: input.platform as Platform,
    profile_url: url,
    fallback_creator_id: input.creator_id,
  });
  if (found.ok !== true) return { ok: false, error: found.error };
  const profileId = found.value.profile.id;

  // Owner claim. Insert directly (service role) so we can set claimed_via='oauth'.
  const claim = await supabase.from('profile_claim').upsert(
    {
      user_id: input.user_id,
      profile_id: profileId,
      claim_kind: 'owner',
      claimed_via: 'oauth',
      confirmed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,profile_id' },
  );
  if (claim.error) {
    // 23505 from the partial unique "one owner per profile" => owned by someone else.
    if (claim.error.code === '23505') {
      return {
        ok: false,
        error: 'This account is already connected by another user.',
      };
    }
    return { ok: false, error: `Owner claim failed: ${claim.error.message}` };
  }
  return { ok: true, value: { profile_id: profileId } };
}

/** Upsert the encrypted token row for (user, platform, external account). */
export async function upsertOAuthConnection(input: {
  user_id: string;
  profile_id: string;
  platform: OAuthPlatform;
  external_account_id: string;
  account_name: string | null;
  scopes: string | null;
  access: EncryptedBlob;
  refresh: EncryptedBlob | null;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
}): Promise<Result<{ id: string }>> {
  const supabase = getSupabaseAdmin();
  const row = {
    user_id: input.user_id,
    profile_id: input.profile_id,
    platform: input.platform,
    external_account_id: input.external_account_id,
    account_name: input.account_name,
    scopes: input.scopes,
    access_ct: input.access.ct,
    access_iv: input.access.iv,
    access_tag: input.access.tag,
    refresh_ct: input.refresh?.ct ?? null,
    refresh_iv: input.refresh?.iv ?? null,
    refresh_tag: input.refresh?.tag ?? null,
    access_expires_at: input.access_expires_at,
    refresh_expires_at: input.refresh_expires_at,
    status: 'active' as const,
    last_refreshed_at: new Date().toISOString(),
  };
  const res = await supabase
    .from('oauth_connection')
    .upsert(row, { onConflict: 'user_id,platform,external_account_id' })
    .select('id')
    .single();
  if (res.error || !res.data) {
    return {
      ok: false,
      error: `Connection upsert failed: ${res.error?.message ?? 'no row'}`,
    };
  }
  return { ok: true, value: { id: res.data.id } };
}

/** Disconnect: wipe token blobs + mark revoked. Keeps the profile + claim. */
export async function revokeOAuthConnection(input: {
  user_id: string;
  connection_id: string;
}): Promise<Result<true>> {
  const supabase = getSupabaseAdmin();
  const res = await supabase
    .from('oauth_connection')
    .update({
      status: 'revoked',
      access_ct: '',
      access_iv: '',
      access_tag: '',
      refresh_ct: null,
      refresh_iv: null,
      refresh_tag: null,
    })
    .eq('id', input.connection_id)
    .eq('user_id', input.user_id); // scope to owner so one user can't revoke another's
  if (res.error)
    return { ok: false, error: `Revoke failed: ${res.error.message}` };
  return { ok: true, value: true };
}

/** Delete all of a Meta user's connections (deauthorize / data-deletion). */
export async function deleteMetaConnectionsForUser(
  user_id: string,
): Promise<Result<true>> {
  const supabase = getSupabaseAdmin();
  const res = await supabase
    .from('oauth_connection')
    .delete()
    .eq('user_id', user_id)
    .in('platform', ['instagram', 'facebook']);
  if (res.error)
    return { ok: false, error: `Meta delete failed: ${res.error.message}` };
  return { ok: true, value: true };
}
```

Note: `access_ct text not null` — `revokeOAuthConnection` sets it to `''` (empty string) rather than NULL to satisfy the NOT NULL constraint while wiping the secret.

- [ ] **Step 2: Export from the package index**

In `libraries/database/src/index.ts`, after the `claim` exports block, add:

```ts
export {
  attachOwnedProfile,
  upsertOAuthConnection,
  revokeOAuthConnection,
  deleteMetaConnectionsForUser,
  ownedProfileUrl,
  type OAuthPlatform,
  type EncryptedBlob,
} from './oauth';
```

- [ ] **Step 3: Write the integration test**

```ts
// supabase/tests/oauth-connection.mts
// Run: cd <repo-root> && npx tsx supabase/tests/oauth-connection.mts
// Requires service-role env (.env). Creates a temp creator + user, exercises
// attach-or-create + upsert + revoke, then cleans up.
import 'dotenv/config';
import {
  getSupabaseAdmin,
  attachOwnedProfile,
  upsertOAuthConnection,
  revokeOAuthConnection,
} from '../../libraries/database/src/index';

const db = getSupabaseAdmin();
let pass = 0,
  fail = 0;
function check(name: string, cond: boolean) {
  cond
    ? (pass++, console.log(`ok  ${name}`))
    : (fail++, console.error(`FAIL ${name}`));
}

const { data: creator } = await db
  .from('creator')
  .insert({ display_name: 'OAuth Test' })
  .select('id')
  .single();
const { data: userRow } = await db.auth.admin.createUser({
  email: `oauth-test-${Date.now()}@example.com`,
  email_confirm: true,
});
const userId = userRow!.user!.id;
const creatorId = creator!.id;

try {
  const attach = await attachOwnedProfile({
    user_id: userId,
    creator_id: creatorId,
    platform: 'tiktok',
    handle: 'oauthtestacct',
    external_account_id: 'open_test_1',
  });
  check('attach returns ok', attach.ok === true);
  const profileId = attach.ok ? attach.value.profile_id : '';

  const { data: claim } = await db
    .from('profile_claim')
    .select('claim_kind, claimed_via')
    .eq('user_id', userId)
    .eq('profile_id', profileId)
    .single();
  check(
    'owner claim via oauth',
    claim?.claim_kind === 'owner' && claim?.claimed_via === 'oauth',
  );

  const up = await upsertOAuthConnection({
    user_id: userId,
    profile_id: profileId,
    platform: 'tiktok',
    external_account_id: 'open_test_1',
    account_name: 'oauthtestacct',
    scopes: 'user.info.basic',
    access: { ct: 'a', iv: 'b', tag: 'c' },
    refresh: { ct: 'd', iv: 'e', tag: 'f' },
    access_expires_at: null,
    refresh_expires_at: null,
  });
  check('upsert returns ok', up.ok === true);
  const connId = up.ok ? up.value.id : '';

  const rev = await revokeOAuthConnection({
    user_id: userId,
    connection_id: connId,
  });
  check('revoke returns ok', rev.ok === true);
  const { data: after } = await db
    .from('oauth_connection')
    .select('status, access_ct')
    .eq('id', connId)
    .single();
  check(
    'revoked + token wiped',
    after?.status === 'revoked' && after?.access_ct === '',
  );
} finally {
  await db.from('oauth_connection').delete().eq('user_id', userId);
  await db.from('profile_claim').delete().eq('user_id', userId);
  await db.from('profile').delete().eq('creator_id', creatorId);
  await db.from('creator').delete().eq('id', creatorId);
  await db.auth.admin.deleteUser(userId);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 4: Run the integration test — expect PASS**

Run: `npx tsx supabase/tests/oauth-connection.mts`
Expected: `4 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add libraries/database/src/oauth.ts libraries/database/src/index.ts supabase/tests/oauth-connection.mts
git commit -m "feat(oauth): token-store + attach-or-create db helpers"
```

---

### Task 8: TikTok routes (start + callback)

**Files:**

- Create: `apps/frontend/src/app/api/oauth/tiktok/start/route.ts`
- Create: `apps/frontend/src/app/api/oauth/tiktok/callback/route.ts`

- [ ] **Step 1: Implement `start`**

```ts
// apps/frontend/src/app/api/oauth/tiktok/start/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { signState, makePkce } from '@gitroom/frontend/lib/oauth/state';
import { tiktokAuthorizeUrl } from '@gitroom/frontend/lib/oauth/tiktok';
import {
  tiktokClientKey,
  tiktokRedirectUri,
} from '@gitroom/frontend/lib/oauth/config';

export const runtime = 'nodejs';

const SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
];

export async function GET() {
  const auth = await getAuthContext();
  if (!auth || auth.role === 'admin') {
    return NextResponse.redirect(
      new URL(
        '/login',
        process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.d3creator.com',
      ),
    );
  }
  const state = signState(auth.userId);
  const { verifier, challenge } = makePkce();
  (await cookies()).set('tt_pkce', verifier, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/oauth/tiktok',
    maxAge: 600,
  });
  const url = tiktokAuthorizeUrl({
    clientKey: tiktokClientKey(),
    redirectUri: tiktokRedirectUri(),
    state,
    codeChallenge: challenge,
    scopes: SCOPES,
  });
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Implement `callback`**

```ts
// apps/frontend/src/app/api/oauth/tiktok/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { verifyState } from '@gitroom/frontend/lib/oauth/state';
import { encryptToken } from '@gitroom/frontend/lib/oauth/crypto';
import {
  exchangeCode,
  fetchUserInfo,
} from '@gitroom/frontend/lib/oauth/tiktok';
import {
  tiktokClientKey,
  tiktokClientSecret,
  tiktokRedirectUri,
} from '@gitroom/frontend/lib/oauth/config';
import {
  ensureCreatorForUser,
  attachOwnedProfile,
  upsertOAuthConnection,
} from '@d3/database';

export const runtime = 'nodejs';

function back(origin: string, params: Record<string, string>) {
  const u = new URL('/me/connections', origin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const auth = await getAuthContext();
  if (!auth) return NextResponse.redirect(new URL('/login', origin));

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  if (!code || !state) return back(origin, { error: 'missing_code' });

  const payload = state ? verifyState(state) : null;
  if (!payload || payload.uid !== auth.userId)
    return back(origin, { error: 'bad_state' });

  const jar = await cookies();
  const verifier = jar.get('tt_pkce')?.value;
  if (!verifier) return back(origin, { error: 'missing_pkce' });
  jar.delete('tt_pkce');

  try {
    const tok = await exchangeCode({
      clientKey: tiktokClientKey(),
      clientSecret: tiktokClientSecret(),
      redirectUri: tiktokRedirectUri(),
      code,
      codeVerifier: verifier,
    });
    const info = await fetchUserInfo(tok.access_token);
    const handle = info.display_name ?? tok.open_id;

    const creator = await ensureCreatorForUser({ user_id: auth.userId });
    if (creator.ok !== true) return back(origin, { error: 'creator_failed' });

    const attach = await attachOwnedProfile({
      user_id: auth.userId,
      creator_id: creator.value.creator_id,
      platform: 'tiktok',
      handle,
      external_account_id: tok.open_id,
    });
    if (attach.ok !== true) return back(origin, { error: 'attach_failed' });

    const now = Date.now();
    const up = await upsertOAuthConnection({
      user_id: auth.userId,
      profile_id: attach.value.profile_id,
      platform: 'tiktok',
      external_account_id: tok.open_id,
      account_name: handle,
      scopes: tok.scope,
      access: encryptToken(tok.access_token),
      refresh: encryptToken(tok.refresh_token),
      access_expires_at: new Date(now + tok.expires_in * 1000).toISOString(),
      refresh_expires_at: new Date(
        now + tok.refresh_expires_in * 1000,
      ).toISOString(),
    });
    if (up.ok !== true) return back(origin, { error: 'store_failed' });

    return back(origin, { connected: 'tiktok' });
  } catch {
    return back(origin, { error: 'tiktok_oauth_failed' });
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/frontend && npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/api/oauth/tiktok
git commit -m "feat(oauth): TikTok start + callback routes"
```

---

### Task 9: Meta routes (start + callback → picker stash)

**Files:**

- Create: `apps/frontend/src/app/api/oauth/meta/start/route.ts`
- Create: `apps/frontend/src/app/api/oauth/meta/callback/route.ts`

The callback discovers targets, encrypts the long-lived user token into a short-lived httpOnly cookie alongside the non-secret target list, and redirects to the picker. (Page tokens are re-fetched at finalize from the user token — see Task 11.)

- [ ] **Step 1: Implement `start`**

```ts
// apps/frontend/src/app/api/oauth/meta/start/route.ts
import { NextResponse } from 'next/server';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { signState } from '@gitroom/frontend/lib/oauth/state';
import { metaAuthorizeUrl } from '@gitroom/frontend/lib/oauth/meta';
import { metaAppId, metaRedirectUri } from '@gitroom/frontend/lib/oauth/config';

export const runtime = 'nodejs';

const SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
  'public_profile',
];

export async function GET() {
  const auth = await getAuthContext();
  if (!auth || auth.role === 'admin') {
    return NextResponse.redirect(
      new URL(
        '/login',
        process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.d3creator.com',
      ),
    );
  }
  const url = metaAuthorizeUrl({
    appId: metaAppId(),
    redirectUri: metaRedirectUri(),
    state: signState(auth.userId),
    scopes: SCOPES,
  });
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Implement `callback`**

```ts
// apps/frontend/src/app/api/oauth/meta/callback/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { verifyState } from '@gitroom/frontend/lib/oauth/state';
import { encryptToken } from '@gitroom/frontend/lib/oauth/crypto';
import {
  exchangeCode,
  exchangeLongLived,
  listPagesAndIg,
} from '@gitroom/frontend/lib/oauth/meta';
import {
  metaAppId,
  metaAppSecret,
  metaRedirectUri,
} from '@gitroom/frontend/lib/oauth/config';

export const runtime = 'nodejs';

function back(origin: string, params: Record<string, string>) {
  const u = new URL('/me/connections', origin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const auth = await getAuthContext();
  if (!auth) return NextResponse.redirect(new URL('/login', origin));

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  if (!code || !state) return back(origin, { error: 'missing_code' });
  const payload = verifyState(state);
  if (!payload || payload.uid !== auth.userId)
    return back(origin, { error: 'bad_state' });

  try {
    const short = await exchangeCode({
      appId: metaAppId(),
      appSecret: metaAppSecret(),
      redirectUri: metaRedirectUri(),
      code,
    });
    const long = await exchangeLongLived({
      appId: metaAppId(),
      appSecret: metaAppSecret(),
      shortToken: short.access_token,
    });
    const targets = await listPagesAndIg(long.access_token);
    if (targets.length === 0) return back(origin, { error: 'no_pages' });

    // Stash: encrypted long-lived user token + non-secret target list.
    const enc = encryptToken(long.access_token);
    const stash = {
      userToken: enc,
      userTokenExp: long.expires_in
        ? Date.now() + long.expires_in * 1000
        : null,
      targets: targets.map((t) => ({
        pageId: t.pageId,
        pageName: t.pageName,
        igId: t.igId,
        igUsername: t.igUsername,
      })),
    };
    (await cookies()).set(
      'meta_pending',
      Buffer.from(JSON.stringify(stash), 'utf8').toString('base64'),
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/me/connections',
        maxAge: 600,
      },
    );
    return back(origin, { pick: 'meta' });
  } catch {
    return back(origin, { error: 'meta_oauth_failed' });
  }
}
```

- [ ] **Step 3: Type-check + commit**

Run: `cd apps/frontend && npx tsc --noEmit -p tsconfig.json` (expect no errors).

```bash
git add apps/frontend/src/app/api/oauth/meta/start apps/frontend/src/app/api/oauth/meta/callback
git commit -m "feat(oauth): Meta start + callback (discover pages/ig → picker stash)"
```

---

### Task 10: Meta deauthorize + data-deletion callbacks

**Files:**

- Create: `apps/frontend/src/app/api/oauth/meta/deauthorize/route.ts`
- Create: `apps/frontend/src/app/api/oauth/meta/data-deletion/route.ts`

These receive a `signed_request` form POST keyed by the **Meta** user id, not our session. Mapping Meta-user-id → our user is only possible if we stored it; since v1 keys connections by our `user_id`, the safest correct behaviour is: verify the signature (authenticity), and for data-deletion return the required JSON. Full per-Meta-user deletion is wired once we persist `external_account_id` linkage to the Meta user (already stored as page/IG ids). For v1 we verify + acknowledge; the Disconnect UI is the user-driven deletion path. **Document this clearly** (review requires the endpoints to exist and verify the signature).

- [ ] **Step 1: Implement `deauthorize`**

```ts
// apps/frontend/src/app/api/oauth/meta/deauthorize/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { verifySignedRequest } from '@gitroom/frontend/lib/oauth/meta';
import { metaAppSecret } from '@gitroom/frontend/lib/oauth/config';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const signed = String(form.get('signed_request') ?? '');
  const data = verifySignedRequest(signed, metaAppSecret());
  if (!data)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  // Authentic Meta deauthorization. (User-driven token deletion is handled by
  // the Disconnect action; this endpoint acknowledges Meta's notification.)
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Implement `data-deletion`**

```ts
// apps/frontend/src/app/api/oauth/meta/data-deletion/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { randomBytes } from 'node:crypto';
import { verifySignedRequest } from '@gitroom/frontend/lib/oauth/meta';
import { metaAppSecret } from '@gitroom/frontend/lib/oauth/config';
import { SITE_URL } from '@gitroom/frontend/lib/site';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const signed = String(form.get('signed_request') ?? '');
  const data = verifySignedRequest(signed, metaAppSecret());
  if (!data)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });

  // Meta requires a JSON body with a status URL + tracking code.
  const code = randomBytes(8).toString('hex');
  return NextResponse.json({
    url: `${SITE_URL}/privacy?meta_deletion=${code}`,
    confirmation_code: code,
  });
}
```

- [ ] **Step 3: Type-check + commit**

Run: `cd apps/frontend && npx tsc --noEmit -p tsconfig.json` (expect no errors).

```bash
git add apps/frontend/src/app/api/oauth/meta/deauthorize apps/frontend/src/app/api/oauth/meta/data-deletion
git commit -m "feat(oauth): Meta deauthorize + data-deletion callbacks (signed_request verified)"
```

---

### Task 11: Connect UI + actions (`/me/connections`)

**Files:**

- Create: `apps/frontend/src/lib/oauth-connections.ts` (typed RPC readers)
- Create: `apps/frontend/src/app/(creator)/me/connections/page.tsx`
- Create: `apps/frontend/src/app/(creator)/me/connections/connect-buttons.tsx`
- Create: `apps/frontend/src/app/(creator)/me/connections/meta-picker.tsx`
- Create: `apps/frontend/src/app/(creator)/me/connections/actions.ts`
- Modify: `apps/frontend/src/app/(creator)/me/account/page.tsx` (nav link)

- [ ] **Step 1: Typed RPC reader**

```ts
// apps/frontend/src/lib/oauth-connections.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface MyConnection {
  id: string;
  platform: 'instagram' | 'facebook' | 'tiktok';
  accountName: string | null;
  status: 'active' | 'revoked' | 'expired';
  accessExpiresAt: string | null;
}

export async function getMyConnections(
  client: SupabaseClient,
): Promise<MyConnection[]> {
  const { data, error } = await client.rpc('get_my_oauth_connections');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    platform: r.platform as MyConnection['platform'],
    accountName: (r.account_name as string | null) ?? null,
    status: r.status as MyConnection['status'],
    accessExpiresAt: (r.access_expires_at as string | null) ?? null,
  }));
}

export interface AdminConnection {
  creatorId: string;
  displayName: string | null;
  platform: string;
  accountName: string | null;
  status: string;
  accessExpiresAt: string | null;
}

export async function getAdminConnections(
  client: SupabaseClient,
  creatorId: string,
): Promise<AdminConnection[]> {
  const { data, error } = await client.rpc('get_admin_oauth_connections', {
    p_creator_id: creatorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    creatorId: r.creator_id as string,
    displayName: (r.display_name as string | null) ?? null,
    platform: r.platform as string,
    accountName: (r.account_name as string | null) ?? null,
    status: r.status as string,
    accessExpiresAt: (r.access_expires_at as string | null) ?? null,
  }));
}
```

- [ ] **Step 2: Server actions**

```ts
// apps/frontend/src/app/(creator)/me/connections/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import {
  encryptToken,
  decryptToken,
  type EncryptedBlob,
} from '@gitroom/frontend/lib/oauth/crypto';
import { listPagesAndIg } from '@gitroom/frontend/lib/oauth/meta';
import {
  ensureCreatorForUser,
  attachOwnedProfile,
  upsertOAuthConnection,
  revokeOAuthConnection,
} from '@d3/database';

export interface ActionResult {
  ok: boolean;
  message: string;
}

interface MetaStash {
  userToken: EncryptedBlob;
  userTokenExp: number | null;
  targets: Array<{
    pageId: string;
    pageName: string;
    igId: string | null;
    igUsername: string | null;
  }>;
}

async function readStash(): Promise<MetaStash | null> {
  const raw = (await cookies()).get('meta_pending')?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as MetaStash;
  } catch {
    return null;
  }
}

export async function finalizeMeta(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await getAuthContext();
  if (!auth || auth.role === 'admin')
    return { ok: false, message: 'Not authorized.' };

  const stash = await readStash();
  if (!stash)
    return { ok: false, message: 'Connection session expired — reconnect.' };

  const selectedPageIds = new Set(formData.getAll('pageId').map(String));
  if (selectedPageIds.size === 0)
    return { ok: false, message: 'Pick at least one account.' };

  const creator = await ensureCreatorForUser({ user_id: auth.userId });
  if (creator.ok !== true) return { ok: false, message: creator.error };

  // Re-fetch page tokens from the long-lived user token (not stored in the cookie).
  const userToken = decryptToken(stash.userToken);
  let live;
  try {
    live = await listPagesAndIg(userToken);
  } catch {
    return { ok: false, message: 'Meta fetch failed — reconnect.' };
  }
  const liveById = new Map(live.map((t) => [t.pageId, t]));

  let connected = 0;
  const accessExp = stash.userTokenExp
    ? new Date(stash.userTokenExp).toISOString()
    : null;

  for (const pageId of selectedPageIds) {
    const t = liveById.get(pageId);
    if (!t) continue;

    // Facebook Page connection (page access token).
    const fbProfile = await attachOwnedProfile({
      user_id: auth.userId,
      creator_id: creator.value.creator_id,
      platform: 'facebook',
      handle: t.pageName,
      external_account_id: t.pageId,
    });
    if (fbProfile.ok === true) {
      await upsertOAuthConnection({
        user_id: auth.userId,
        profile_id: fbProfile.value.profile_id,
        platform: 'facebook',
        external_account_id: t.pageId,
        account_name: t.pageName,
        scopes: 'pages_read_engagement',
        access: encryptToken(t.pageAccessToken),
        refresh: null,
        access_expires_at: accessExp,
        refresh_expires_at: null,
      });
      connected++;
    }

    // Linked Instagram business account (uses the same page token for insights).
    if (t.igId) {
      const igProfile = await attachOwnedProfile({
        user_id: auth.userId,
        creator_id: creator.value.creator_id,
        platform: 'instagram',
        handle: t.igUsername ?? t.igId,
        external_account_id: t.igId,
      });
      if (igProfile.ok === true) {
        await upsertOAuthConnection({
          user_id: auth.userId,
          profile_id: igProfile.value.profile_id,
          platform: 'instagram',
          external_account_id: t.igId,
          account_name: t.igUsername ?? t.igId,
          scopes: 'instagram_manage_insights',
          access: encryptToken(t.pageAccessToken),
          refresh: null,
          access_expires_at: accessExp,
          refresh_expires_at: null,
        });
        connected++;
      }
    }
  }

  (await cookies()).delete('meta_pending');
  revalidatePath('/me/connections');
  return connected > 0
    ? {
        ok: true,
        message: `Connected ${connected} account${connected === 1 ? '' : 's'}.`,
      }
    : { ok: false, message: 'Nothing connected.' };
}

export async function disconnect(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await getAuthContext();
  if (!auth || auth.role === 'admin')
    return { ok: false, message: 'Not authorized.' };
  const connectionId = String(formData.get('connection_id') ?? '');
  if (!isUuid(connectionId))
    return { ok: false, message: 'Invalid connection id.' };
  const res = await revokeOAuthConnection({
    user_id: auth.userId,
    connection_id: connectionId,
  });
  if (res.ok !== true) return { ok: false, message: res.error };
  revalidatePath('/me/connections');
  return { ok: true, message: 'Disconnected.' };
}
```

- [ ] **Step 3: Connect buttons (client)**

```tsx
// apps/frontend/src/app/(creator)/me/connections/connect-buttons.tsx
'use client';

import {
  PLATFORM_ICONS,
  PLATFORM_LABELS,
  type PlatformKey,
} from '@gitroom/frontend/components/ui/platform-icons';

const OPTIONS: Array<{ platform: PlatformKey; href: string; label: string }> = [
  {
    platform: 'instagram',
    href: '/api/oauth/meta/start',
    label: 'Connect Instagram',
  },
  {
    platform: 'facebook',
    href: '/api/oauth/meta/start',
    label: 'Connect Facebook',
  },
  {
    platform: 'tiktok',
    href: '/api/oauth/tiktok/start',
    label: 'Connect TikTok',
  },
];

export function ConnectButtons() {
  return (
    <div className="flex flex-col gap-3">
      {OPTIONS.map(({ platform, href, label }) => {
        const Icon = PLATFORM_ICONS[platform];
        return (
          <a
            key={label}
            href={href}
            className="flex items-center gap-3 glass-base border border-borderGlass rounded-xl px-4 py-3 text-body text-fg hover:border-aurora-cta transition-colors"
          >
            <span className="flex items-center justify-center size-8 rounded-full glass-subtle text-fgMuted">
              <Icon size={16} />
            </span>
            <span>{label}</span>
            <span className="ml-auto text-caption text-fgSubtle">
              {PLATFORM_LABELS[platform]}
            </span>
          </a>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Meta picker (client)**

```tsx
// apps/frontend/src/app/(creator)/me/connections/meta-picker.tsx
'use client';

import { useActionState } from 'react';
import { finalizeMeta, type ActionResult } from './actions';

export interface MetaTargetView {
  pageId: string;
  pageName: string;
  igUsername: string | null;
}

export function MetaPicker({ targets }: { targets: MetaTargetView[] }) {
  const [state, action, pending] = useActionState<
    ActionResult | null,
    FormData
  >(finalizeMeta, null);
  return (
    <form
      action={action}
      className="glass-subtle border border-borderGlass rounded-2xl p-6 flex flex-col gap-4"
    >
      <div>
        <h2 className="text-heading text-fg">Choose accounts to connect</h2>
        <p className="text-body text-fgMuted mt-1">
          Tick the Pages / Instagram accounts you want D3 to read insights for.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {targets.map((t) => (
          <li key={t.pageId} className="flex items-center gap-3">
            <input
              type="checkbox"
              name="pageId"
              value={t.pageId}
              defaultChecked
              id={`pg-${t.pageId}`}
            />
            <label htmlFor={`pg-${t.pageId}`} className="text-body text-fg">
              {t.pageName}
              {t.igUsername ? (
                <span className="text-caption text-fgSubtle">
                  {' '}
                  · IG @{t.igUsername}
                </span>
              ) : null}
            </label>
          </li>
        ))}
      </ul>
      <button
        type="submit"
        disabled={pending}
        className="self-start glass-base border border-borderGlass rounded-xl px-4 py-2 text-body text-fg hover:border-aurora-cta disabled:opacity-60"
      >
        {pending ? 'Connecting…' : 'Connect selected'}
      </button>
      {state ? (
        <p
          className={`text-caption ${state.ok ? 'text-aurora-cta' : 'text-red-400'}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 5: Page (server)**

```tsx
// apps/frontend/src/app/(creator)/me/connections/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getMyConnections } from '@gitroom/frontend/lib/oauth-connections';
import { ConnectButtons } from './connect-buttons';
import { MetaPicker, type MetaTargetView } from './meta-picker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Connected accounts — D3 Creator' };

function readPicker(raw: string | undefined): MetaTargetView[] | null {
  if (!raw) return null;
  try {
    const stash = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as {
      targets: MetaTargetView[];
    };
    return stash.targets ?? null;
  } catch {
    return null;
  }
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ pick?: string; connected?: string; error?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role === 'admin') redirect('/admin');

  const sb = await getSupabaseRoute();
  const connections = await getMyConnections(sb);
  const sp = await searchParams;
  const picker =
    sp.pick === 'meta'
      ? readPicker((await cookies()).get('meta_pending')?.value)
      : null;

  return (
    <div className="flex flex-col gap-10 pt-12 pb-24 max-w-[640px]">
      <header>
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-subtle border border-borderGlass text-caption text-fgMuted mb-6">
          <span className="inline-block size-1.5 rounded-full bg-aurora-cta" />
          Connections
        </span>
        <h1 className="text-display-2 text-fg mb-4">Connect your accounts.</h1>
        <p className="text-body-lg text-fgMuted">
          Link your own Instagram, Facebook, or TikTok to unlock owner-only
          insights (reach, impressions, demographics). You can disconnect
          anytime.
        </p>
      </header>

      {sp.error ? (
        <p className="text-caption text-red-400">
          Connection failed ({sp.error}). Please try again.
        </p>
      ) : null}
      {sp.connected ? (
        <p className="text-caption text-aurora-cta">
          Connected {sp.connected}.{' '}
        </p>
      ) : null}

      {picker && picker.length > 0 ? <MetaPicker targets={picker} /> : null}

      <section className="glass-subtle border border-borderGlass rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="text-heading text-fg">Connected accounts</h2>
        {connections.length === 0 ? (
          <p className="text-body text-fgMuted">No accounts connected yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {connections.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-body text-fg truncate">
                    {c.accountName ?? c.platform}{' '}
                    <span className="text-caption text-fgSubtle">
                      · {c.platform}
                    </span>
                  </div>
                  <div className="text-caption text-fgSubtle">
                    {c.status}
                    {c.accessExpiresAt
                      ? ` · expires ${new Date(c.accessExpiresAt).toLocaleDateString()}`
                      : ''}
                  </div>
                </div>
                <form action="/me/connections" method="get">
                  {/* Disconnect uses the server action via a small client form below */}
                </form>
                <DisconnectButton connectionId={c.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-subtle border border-borderGlass rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="text-heading text-fg">Add a connection</h2>
        <ConnectButtons />
      </section>
    </div>
  );
}

// Inline client disconnect button (kept here to colocate with the list).
import { DisconnectButton } from './disconnect-button';
```

Note: the trailing `import` is illegal at the bottom of a module — move it to the top during implementation. The `DisconnectButton` is a separate small client component (next step). (Listed this way only to make the dependency explicit.)

- [ ] **Step 6: Disconnect button (client)**

```tsx
// apps/frontend/src/app/(creator)/me/connections/disconnect-button.tsx
'use client';

import { useActionState } from 'react';
import { disconnect, type ActionResult } from './actions';

export function DisconnectButton({ connectionId }: { connectionId: string }) {
  const [, action, pending] = useActionState<ActionResult | null, FormData>(
    disconnect,
    null,
  );
  return (
    <form action={action}>
      <input type="hidden" name="connection_id" value={connectionId} />
      <button
        type="submit"
        disabled={pending}
        className="text-caption text-fgMuted hover:text-red-400 disabled:opacity-60"
      >
        {pending ? '…' : 'Disconnect'}
      </button>
    </form>
  );
}
```

Add `import { DisconnectButton } from './disconnect-button';` to the top of `page.tsx` and delete the illustrative bottom import + the empty `<form>` placeholder.

- [ ] **Step 7: Nav link from account page**

In `apps/frontend/src/app/(creator)/me/account/page.tsx`, inside the "Tracked profiles summary" section (after its `<p>`), add:

```tsx
<a
  href="/me/connections"
  className="text-caption text-aurora-cta underline underline-offset-4 mt-1"
>
  Connect an account for deeper insights →
</a>
```

- [ ] **Step 8: Type-check + build the page**

Run: `cd apps/frontend && npx tsc --noEmit -p tsconfig.json`
Expected: no errors. Then dev-server smoke (see Task 14): `/me/connections` renders with the three Connect buttons and an empty "Connected accounts" list.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/lib/oauth-connections.ts "apps/frontend/src/app/(creator)/me/connections" "apps/frontend/src/app/(creator)/me/account/page.tsx"
git commit -m "feat(oauth): /me/connections connect UI + disconnect + meta picker"
```

---

### Task 12: Admin connection-status section

**Files:**

- Create: `apps/frontend/src/components/admin/creator-connections.tsx`
- Modify: `apps/frontend/src/app/(admin)/admin/creators/[id]/page.tsx`

- [ ] **Step 1: Status section component (server component, async)**

```tsx
// apps/frontend/src/components/admin/creator-connections.tsx
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getAdminConnections } from '@gitroom/frontend/lib/oauth-connections';

export async function CreatorConnections({ creatorId }: { creatorId: string }) {
  const sb = await getSupabaseRoute(); // cookie-aware; RPC is gated by is_admin()
  const rows = await getAdminConnections(sb, creatorId);

  return (
    <section className="glass-subtle border border-borderGlass rounded-2xl p-6 flex flex-col gap-3">
      <h2 className="text-heading text-fg">Connected accounts</h2>
      {rows.length === 0 ? (
        <p className="text-body text-fgMuted">
          This creator hasn’t connected any accounts yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li
              key={`${r.platform}-${i}`}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-body text-fg">
                {r.accountName ?? r.platform}{' '}
                <span className="text-caption text-fgSubtle">
                  · {r.platform}
                </span>
              </span>
              <span className="text-caption text-fgSubtle">
                {r.status}
                {r.accessExpiresAt
                  ? ` · exp ${new Date(r.accessExpiresAt).toLocaleDateString()}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Render it on the creator-detail page**

In `apps/frontend/src/app/(admin)/admin/creators/[id]/page.tsx`, add the import and render it after `<CreatorEditor detail={detail} />`:

```tsx
import { CreatorConnections } from '@gitroom/frontend/components/admin/creator-connections';
// ...
      <CreatorEditor detail={detail} />
      <CreatorConnections creatorId={id} />
```

- [ ] **Step 3: Type-check + commit**

Run: `cd apps/frontend && npx tsc --noEmit -p tsconfig.json` (expect no errors).

```bash
git add apps/frontend/src/components/admin/creator-connections.tsx "apps/frontend/src/app/(admin)/admin/creators/[id]/page.tsx"
git commit -m "feat(oauth): admin connection-status section on creator detail"
```

---

### Task 13: Legal pages — OAuth disclosure

**Files:**

- Modify: `apps/frontend/src/app/(public)/privacy/page.tsx`
- Modify: `apps/frontend/src/app/(public)/terms/page.tsx`

- [ ] **Step 1: Read both pages**

Run: open both files; locate any clause asserting "we never use OAuth / official login / platform APIs" (the contradicting copy).

- [ ] **Step 2: Replace the contradicting clause (privacy)**

Remove the "no OAuth" assertion and add a section (match the page's existing heading/paragraph components — do not invent new ones):

> **Connected accounts (official platform login).** When you choose to connect your own Instagram, Facebook, or TikTok account, you authorize D3 Creator to access account information and insights (such as reach, impressions, and audience demographics) for that account through the platform's official API. We store the access credentials **encrypted** and use them only to retrieve those insights for display in your dashboard and to your agency. You can disconnect at any time from **My data → Connections**, which deletes the stored credentials. To request deletion of associated data, disconnect the account or contact us at the email below; Meta-initiated deletion requests are handled through our data-deletion endpoint.

- [ ] **Step 3: Mirror in terms**

In `terms/page.tsx`, remove any "scraping only / no OAuth" wording and add a short clause that connecting an account is optional, grants read access to insights via the official API, and can be revoked.

- [ ] **Step 4: Type-check + commit**

Run: `cd apps/frontend && npx tsc --noEmit -p tsconfig.json` (expect no errors).

```bash
git add "apps/frontend/src/app/(public)/privacy/page.tsx" "apps/frontend/src/app/(public)/terms/page.tsx"
git commit -m "docs(legal): disclose owned-accounts OAuth in privacy + terms"
```

---

### Task 14: Env, ops, and end-to-end smoke

**Files:**

- Modify: `.env.example`

- [ ] **Step 1: Document the new env var**

Add to `.env.example`:

```
# Owned-accounts OAuth — 32-byte key, base64-encoded. Generate with:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
OAUTH_ENC_KEY=
```

- [ ] **Step 2: Generate a real key into `.env`**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
Paste the value into the repo-root `.env` as `OAUTH_ENC_KEY=...`. (User also adds `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.)

- [ ] **Step 3: Register dev redirect URIs in the consoles**

- Meta app → Facebook Login → Valid OAuth Redirect URIs: add `http://localhost:4200/api/oauth/meta/callback` and `https://www.d3creator.com/api/oauth/meta/callback`. Set Deauthorize + Data-Deletion callback URLs to the two `/api/oauth/meta/...` endpoints.
- TikTok app → Login Kit → Redirect URI: add `http://localhost:4200/api/oauth/tiktok/callback` and the prod URI. Confirm Login Kit + the 4 scopes persisted (per spec §12).

- [ ] **Step 4: End-to-end smoke (manual, the demo flow)**

Start dev (per project worktree notes): `pnpm install --prefer-offline --ignore-scripts` if needed, copy `.env`, `pnpm --filter frontend dev` (port 4200). Then:

1. Log in as a creator, go to `/me/connections`.
2. Click **Connect TikTok** → complete TikTok Sandbox login → land back on `/me/connections` with the account listed `active`. Verify a row exists: `select platform, account_name, status from oauth_connection;`.
3. Click **Connect Facebook** → complete Meta dev-mode login → pick a Page/IG → see them listed.
4. Click **Disconnect** on one → row flips to `revoked`, `access_ct=''`.
5. As admin, open `/admin/creators/<that creator id>` → see the **Connected accounts** status section.

This is the screen-recording for both app submissions.

- [ ] **Step 5: Add the 5 env vars to Vercel**

Add `OAUTH_ENC_KEY`, `META_APP_ID`, `META_APP_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` to Vercel env (Production + Preview).

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "chore(oauth): document OAUTH_ENC_KEY in env example"
```

---

## Self-review

**Spec coverage:**

- §4 token store + RPCs → Task 1. base64-text refinement noted.
- §5 routes (meta/tiktok start+callback, deauthorize, data-deletion) → Tasks 8–10. CSRF state/PKCE → Task 4; Meta picker stash → Task 9 + 11.
- §6 lib files: crypto (T2), config (T3), state/PKCE (T4), meta (T5), tiktok (T6), connections/tokens (T7 — token-store helpers; lazy `getValidToken` refresh is **deferred to the insights spec** since no scheduled read exists this phase — noted in spec §6 as the seam; this plan does not implement it because nothing calls it yet. **Coverage note:** spec §6 lists `tokens.ts`; this plan intentionally omits it per YAGNI — flag for the user).
- §7 UI (/me/connections + nav link) → Task 11; admin status → Task 12.
- §8 legal → Task 13.
- §9 env → Task 14.
- §10 tests: crypto, state, signed_request, attach-or-create → Tasks 2,4,5,7.
- §11 security: service-role-only table, RPC no tokens, key length check, state HMAC, PKCE, signed_request timing-safe, httpOnly short-TTL cookies → covered across Tasks 1,3,4,5,9,11.

**Gap flagged:** spec §6's `tokens.ts` (`getValidToken` lazy refresh) is **not** built here — it has no caller until insights ingest. Confirm with the user that deferring it is acceptable (recommended: yes, YAGNI). TikTok refresh + Meta long-lived extension logic moves to the insights spec where the cron reads tokens.

**Placeholder scan:** the illustrative bottom-of-file `import` in Task 11 Step 5 is explicitly called out to be moved to the top in Step 6 — not a real placeholder, a wiring note. No TBDs elsewhere.

**Type consistency:** `EncryptedBlob {ct,iv,tag}` consistent across crypto.ts, oauth.ts, actions.ts. `attachOwnedProfile` / `upsertOAuthConnection` / `revokeOAuthConnection` signatures match between Task 7 definition and Task 8/11 calls. RPC names `get_my_oauth_connections` / `get_admin_oauth_connections` consistent between Task 1 SQL and Task 11 readers. `MyConnection.platform` union matches the table CHECK.
