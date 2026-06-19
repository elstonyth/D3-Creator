# Owned-Accounts OAuth — Phase 1: Connect Flow (Meta + TikTok)

**Date:** 2026-06-18
**Status:** Approved design, pre-implementation
**Predecessor handoff:** OAuth handoff notes (kept locally, outside the repo)
**App reference:** OAuth app reference doc — app IDs and console URLs (kept locally, outside the repo)

## 1. Goal and boundary

Let a logged-in creator connect **their own** Instagram / Facebook / TikTok account from `/me`, granting D3 official-API access ("owned-accounts tier"). This unlocks owner-only metrics (reach, impressions, demographics, watch-time) that scraping cannot reach. This is a **hybrid** addition — scrapers stay for public/competitor breadth; OAuth adds depth for connected accounts.

**This spec is the connect flow only.** It is the smallest unit that unblocks both app reviews (each platform requires a demo video of a working OAuth flow before submission).

**In scope**

- Encrypted token store (one table + RPCs).
- OAuth handshake routes for Meta and TikTok (`/api/oauth/{platform}/{start,callback}`).
- Meta account picker (one grant can expose several Pages + linked IG accounts).
- Connect / Disconnect UI under `/me/connections`.
- Meta required callbacks: `deauthorize` + `data-deletion`.
- Admin connection-status visibility (status only, never tokens).
- Privacy + Terms rewrite to disclose the OAuth flow.

**Out of scope (next spec)**

- Pulling insights/demographics into `profile_snapshot` / `post_snapshot`.
- A scheduled token-refresh cron (added with ingest, when tokens are actually read on a schedule).
- "Login with social" — app sign-in stays Supabase email/password, admin-provisioned, unchanged.

## 2. Decisions locked during brainstorming

| #   | Decision           | Choice                                                                                                 |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| 1   | Phase 1 scope      | Both-platform connect flow; insights ingest deferred                                                   |
| 2   | Token encryption   | App-layer AES-256-GCM, 32-byte key from env, ciphertext in a service-role-only table                   |
| 3   | Meta multi-account | Account picker — creator ticks which Pages / IG accounts to connect                                    |
| 4   | Token refresh      | Lazy `getValidToken()` helper (refresh-on-read); no cron this phase (YAGNI)                            |
| 5   | Login model        | Add-on "Connect account" — current email/password login untouched                                      |
| 6   | Admin visibility   | Admin sees connection **status** per creator (never tokens); insights become admin-visible next spec   |
| 7   | Who connects       | Logged-in creator only (admin lacks the creator's platform login)                                      |
| 8   | Disconnect         | Delete tokens + mark connection `revoked`; **keep** scraped profile + owner claim (scraping continues) |

## 3. Existing model this builds on

- `auth.users` → `user_role` (`admin`/`creator`) → `creator_link` (1:1 user→creator) → `creator` → `profile` (one per platform).
- `profile_claim` = M:N user↔profile, `claim_kind ∈ {owner, tracker, pending}`. **Owner = the real account holder.** Unique-owner-per-profile index already exists.
- Profiles already exist for scraped accounts. OAuth attaches an owner's tokens to a `profile`.
- Auth helpers: `getAuthContext()` (memoised), `requireAdmin()`, `is_admin()` (SQL, SECURITY DEFINER). Existing pattern: secrets/aggregations exposed through SECURITY DEFINER RPCs, base tables locked down.
- `safeRedirect()` already guards post-auth redirects against open-redirect — reuse for any post-connect redirect target.

## 4. Data model

One new table, three RPCs. Follows the existing windowed-RPC / `is_admin()` pattern (base table locked, safe columns exposed via SECURITY DEFINER).

```sql
create table public.oauth_connection (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id)  on delete cascade,
  profile_id          uuid not null references public.profile(id) on delete cascade,
  platform            text not null check (platform in ('instagram','facebook','tiktok')),
  external_account_id text not null,            -- IG user id / FB page id / TikTok open_id
  account_name        text,                     -- display/handle shown in UI
  scopes              text,
  -- AES-256-GCM blobs (base64 text: ciphertext / iv / tag), service-role only:
  access_ct           text not null,
  access_iv           text not null,
  access_tag          text not null,
  refresh_ct          text,                     -- null for Meta Page tokens (no refresh token)
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

alter table public.oauth_connection enable row level security;
-- No anon/authenticated policies => service_role only. Tokens never reach a browser.
```

**RPCs (SECURITY DEFINER, `search_path = ''`, granted per existing hardening migration `20260606000000`):**

- `get_my_oauth_connections()` → caller's rows, **safe columns only**: `platform, account_name, status, access_expires_at, refresh_expires_at, created_at`. Filtered to `user_id = auth.uid()`. Used by `/me/connections`.
- `get_admin_oauth_connections()` → gated by `public.is_admin()`; returns per-creator status joined to `creator.display_name` (`creator_id, display_name, platform, account_name, status, access_expires_at`). Used by the admin creator-detail page. **No token columns.**

Disconnect is **not** an RPC — it is a service-role server action (§6) that deletes token blobs and sets `status='revoked'`, so it never runs under the caller's RLS.

Token columns are **never** selectable by `anon`/`authenticated` and never returned by any RPC.

## 5. Routes

```
POST/GET /api/oauth/meta/start          -> 302 to Facebook OAuth dialog (signed state)
GET      /api/oauth/meta/callback       -> code→token, long-lived exchange, discover Pages+IG,
                                           stash, 302 to /me/connections picker
POST     /api/oauth/meta/deauthorize    -> verify signed_request, mark user's Meta conns revoked
POST     /api/oauth/meta/data-deletion  -> verify signed_request, delete user's Meta conns,
                                           respond { url, confirmation_code }
GET      /api/oauth/tiktok/start        -> 302 to TikTok OAuth (signed state + PKCE)
GET      /api/oauth/tiktok/callback     -> code→token (single account), finalize connection,
                                           302 to /me/connections
```

All routes run on the Node runtime (need `crypto`, app secret, service-role client). Redirect base derived from `SITE_URL` → e.g. `https://www.d3creator.com/api/oauth/meta/callback`.

### 5.1 CSRF / integrity

- **`state`** — `base64url(payload) + "." + HMAC-SHA256(payload)`, where `payload = {uid, nonce, exp}`. HMAC key derived from `OAUTH_ENC_KEY` via HKDF with a distinct info label (no extra env var). `/callback` verifies signature (timing-safe) and `exp` before trusting `uid`.
- **PKCE (TikTok)** — `/start` generates `code_verifier` (43–128 chars), sends `code_challenge = base64url(sha256(verifier))`, `method=S256`. The verifier is stored in a short-lived **httpOnly, signed cookie** (never sent to TikTok); `/callback` reads it for the token exchange.

### 5.2 Meta callback → picker handshake

One Meta grant can expose multiple Pages, each with an optional linked IG account.

1. `/callback` exchanges `code` → short-lived user token → **long-lived user token (~60d)**.
2. Calls `/me/accounts` → list of `{ page_id, page_name, page_access_token }`. For each Page, `GET /{page_id}?fields=instagram_business_account` then `GET /{ig_id}?fields=username` → linked IG target.
3. Stashes the **long-lived user token (AES-GCM encrypted)** plus the non-secret target list `[{pageId, pageName, igId, igUsername}]` in a short-lived (~10 min) httpOnly cookie. Page tokens are **not** stashed — they are re-fetched from the user token at finalize.
4. Redirects to `/me/connections`, which renders the picker checklist from the stashed list.
5. Creator ticks targets → server action (§6) re-fetches Page tokens for the chosen targets, runs attach-or-create, encrypts, upserts `oauth_connection`, clears the cookie.

### 5.3 TikTok callback

Single account. `/callback` verifies state, reads PKCE verifier cookie, exchanges `code` → `{access_token, refresh_token, open_id, scope, expires_in (~86400), refresh_expires_in (~31536000)}`, fetches `user/info` for the handle, runs attach-or-create + upsert, redirects to `/me/connections`.

### 5.4 Meta required callbacks

- **`deauthorize`** — Meta POSTs `signed_request` when a user removes the app. Verify `signed_request` (`HMAC-SHA256(payload, APP_SECRET)`, timing-safe), resolve the Meta user, set their `oauth_connection.status = 'revoked'`, delete token blobs.
- **`data-deletion`** — Meta POSTs `signed_request`. Verify, delete the user's Meta connections + tokens, respond `{ url, confirmation_code }` JSON (the URL is a status page the user can visit; confirmation_code is our tracking id). Required before App Review.

## 6. Library files

```
apps/frontend/src/lib/oauth/
  config.ts        # reads + validates env (throws if OAUTH_ENC_KEY != 32 bytes); builds redirect URIs from SITE_URL
  crypto.ts        # encryptToken/decryptToken — AES-256-GCM (random 12-byte iv, returns {ct,iv,tag})
  state.ts         # signState/verifyState (HMAC via HKDF(OAUTH_ENC_KEY)); pkceChallenge/pkceVerifier helpers
  meta.ts          # exchangeCode, exchangeLongLived, listPagesAndIg, fetchPageToken, verifySignedRequest
  tiktok.ts        # exchangeCode, refresh, fetchUserInfo
  tokens.ts        # getValidToken(connectionId): load → decrypt → refresh-if-near-expiry → re-encrypt → return plaintext
  connections.ts   # attachOrCreateProfile(...) + upsertConnection(...) using the service-role client
```

- **`attachOrCreateProfile`** — match an existing scraped `profile` by `(platform, external_account_id)` then by handle; if found, ensure `profile_claim(owner)` for the user; else create `profile` + owner claim. Returns `profile_id`. The connection is the authoritative owner link.
- **`getValidToken`** — TikTok: if access within ~5 min of expiry, refresh (TikTok rotates the refresh token — persist the new one). Meta: if the long-lived user token is within ~7 days of expiry, re-exchange (`fb_exchange_token`) to extend; Page tokens ride the user token. On refresh failure or past `refresh_expires_at`, set `status = 'expired'`. This is the seam the future insights-ingest cron plugs into.

Server action / handler for the UI lives at:

```
apps/frontend/src/app/(creator)/me/connections/actions.ts   # finalizeMeta(selected[]), disconnect(connectionId)
```

Disconnect: delete token blobs, set `status='revoked'`; keep `profile` + `profile_claim`.

## 7. UI

### 7.1 Creator — `apps/frontend/src/app/(creator)/me/connections/`

- `page.tsx` (server) — reads `get_my_oauth_connections()`; renders a "Connected accounts" card list (status, account name, expiry) + per-platform **Connect** buttons (Instagram + Facebook share one Meta grant; TikTok separate). If the Meta picker cookie is present, renders the picker.
- `connect-buttons.tsx` (client) — links to `/api/oauth/{platform}/start`.
- `meta-picker.tsx` (client) — checklist of discovered Pages/IG targets → POSTs to `finalizeMeta`.
- **Disconnect** button per connection → `disconnect` action.
- Add a nav link to `/me/connections` from `me/account/page.tsx` (the existing account page).
- Design language: reuse `glass-subtle` cards + `platform-icons`, matching `/me/account`. Read `DESIGN.md` before building UI.

### 7.2 Admin — creator-detail page

`apps/frontend/src/app/(admin)/admin/creators/[id]/` — add a "Connected accounts" status section reading `get_admin_oauth_connections()` (filtered to this creator): platform, account name, status, expiry. **No tokens, no disconnect** (admin can't manage the creator's grant). Optional follow-up: a connected/not badge in the creators list (defer if it bloats the diff).

## 8. Legal pages

`apps/frontend/src/app/(public)/privacy/page.tsx` and `terms/page.tsx` currently assert "we never use OAuth" — this contradicts the new flow and would fail Meta review. Rewrite to disclose: official platform login, what we access (account info + insights for **connected** accounts only), encrypted storage, retention, user-initiated revocation (Disconnect), and the deletion path (Meta data-deletion callback). `site.ts` constants unchanged.

## 9. Environment

| Var                    | New?            | Notes                                                                   |
| ---------------------- | --------------- | ----------------------------------------------------------------------- |
| `OAUTH_ENC_KEY`        | **new**         | 32-byte key, base64-encoded; validated at boot. Add to `.env` + Vercel. |
| `META_APP_ID`          | exists (filled) | `1487337389742304`                                                      |
| `META_APP_SECRET`      | exists (blank)  | user pastes                                                             |
| `TIKTOK_CLIENT_KEY`    | exists (blank)  | user pastes                                                             |
| `TIKTOK_CLIENT_SECRET` | exists (blank)  | user pastes                                                             |

All four platform vars + `OAUTH_ENC_KEY` must be added to **Vercel env** before prod. Worktree checkouts have no `.env` — copy from the main repo root before running the dev server. Register the local/dev redirect URIs in each console (Meta dev mode, TikTok Sandbox) for testing.

## 10. Testing (TDD)

Unit-test the pure helpers (no network):

- `crypto.test.ts` — encrypt→decrypt round-trip; wrong key / tampered tag → throws.
- `state.test.ts` — sign→verify round-trip; tampered payload → reject; expired → reject. PKCE challenge matches verifier.
- `meta-signed-request.test.ts` — valid signature verifies; bad signature → reject (timing-safe).
- `connections.test.ts` — attach-or-create: existing-match attaches + claims; no-match creates profile + owner claim; idempotent on re-connect.

Routes verified manually against **Meta dev mode** + **TikTok Sandbox** using env creds (the demo-video flow). No insights assertions (deferred). `next build` type-checks even when lint/test are green (`strictNullChecks` on) — keep helpers null-safe.

## 11. Security notes

- Token blobs: service-role only; never returned by any RPC; decrypted only inside Node route handlers / `getValidToken`.
- `OAUTH_ENC_KEY` length validated at startup (fail closed if not 32 bytes).
- `state` HMAC + `exp`; PKCE for TikTok; `signed_request` HMAC with timing-safe compare.
- Reuse `safeRedirect()` for any post-connect redirect target.
- Cookies (PKCE verifier, Meta pending stash) are httpOnly, signed/encrypted, short-TTL; the Meta stash holds only the encrypted user token + non-secret target list.

## 12. Review-submission blockers (post-build, user-owned)

Not part of this build, listed so they're not forgotten:

- Meta: Business Verification (employer docs), app icon 1024×1024, screencast of the live flow. Start Business Verification early — slowest, blocks nothing else.
- TikTok: demo video (Sandbox), app icon, products/scopes explanation. Confirm Login Kit + the 4 scopes persisted in the console (last save was unverified).
- Scopes to request at review — Meta: `instagram_basic, instagram_manage_insights, pages_show_list, pages_read_engagement, public_profile`. TikTok: `user.info.basic, user.info.profile, user.info.stats, video.list`.
