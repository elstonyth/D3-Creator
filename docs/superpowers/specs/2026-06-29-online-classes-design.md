# Online Classes — Members-Only Video Library

**Date:** 2026-06-29
**Status:** Approved design, pre-implementation

## Goal

A members-only library of online-class videos sourced from Google Drive. Logged-in
members watch gated classes; admins manage the catalog and govern who has access.
Self-service signup is re-opened so anyone can become a member.

## Decisions (settled in brainstorming)

- **Audience:** public signup re-opened. New signups are **members** (class-watchers).
- **Access gate:** free + instant — confirm email, immediately watch members-only classes.
  Signup is an email-wall, not a paywall.
- **Video serving:** embed from Google Drive (file ID stored; Drive `/preview` player on a
  login-gated page). No re-hosting, no new storage/bandwidth cost.
- **Roles:** fixed set — `admin` / `creator` / `member` / `none`. Admin assigns; no runtime
  role creation (no RBAC).
- **Role vs creator-entity:** kept separate. The `creator` _role_ only unlocks `/me`; appearing
  on the public leaderboard still requires the existing provision-creator flow (social URLs +
  scraping). The role dropdown does not provision or link a public entity.

## Non-goals (YAGNI)

Courses/sections/grouping, video upload pipeline, payments/subscriptions, dynamic RBAC,
comments, search, progress tracking. Flat ordered list only.

## Operational requirement (not code)

Drive files must be shared **"anyone with the link can view"** for the embedded player to
play for non-owners. Consequence: the page/listing gate + email-wall is the protection;
the underlying Drive URL is only as private as its share setting. Members-only ≠ DRM. Hard
protection would require the re-host / dedicated-video-host path, which was ruled out.

## Data model

### New table: `class_video`

| column           | type                           | notes                                                            |
| ---------------- | ------------------------------ | ---------------------------------------------------------------- |
| `id`             | uuid pk                        | `gen_random_uuid()`                                              |
| `title`          | text not null                  |                                                                  |
| `description`    | text null                      |                                                                  |
| `drive_file_id`  | text not null                  | parsed from the pasted Drive link                                |
| `visibility`     | text not null                  | `'public'` \| `'members'`; default `'members'`; check constraint |
| `is_published`   | boolean not null default false | false = draft/hidden (admin-only)                                |
| `allow_download` | boolean not null default false | offer Drive download link to viewers                             |
| `sort_order`     | int not null default 0         | manual ordering on the list                                      |
| `created_at`     | timestamptz default now()      |                                                                  |
| `updated_at`     | timestamptz default now()      | trigger-maintained                                               |

### RLS policies on `class_video`

- **anon SELECT:** `is_published = true AND visibility = 'public'`
- **authenticated (non-admin) SELECT:** `is_published = true` (public + members)
- **admin (`is_admin()`) ALL:** full read/write (drafts included)

Drafts (`is_published = false`) are invisible to everyone except admins, regardless of
visibility. Follow the existing SECDEF / `is_admin()` hardening pattern already used in the
codebase (see migration `20260606000000` and the access-control lockdown migrations).

### Role changes

- Add `'member'` and `'none'` as recognized values of `user_role.role` (text column; no schema
  change beyond documenting/allowing the new strings — verify any existing check constraint).
- New self-signups receive `user_role.role = 'member'`. Implement by inserting the row in the
  signup server action (preferred over changing the default, which currently resolves to
  `'creator'` in middleware).
- `'none'` = logged in but no gated access (treated like anon for class visibility; bounced from
  `/me` and `/admin`).

## Routes

### Public

- **`/classes`** — list page.
  - Anon: published **public** videos only, plus a "Log in to unlock member classes" banner.
  - Logged-in (member/creator): all published videos (public + members).
  - Each card: thumbnail/title/description, links to player.
- **`/classes/[id]`** — player page.
  - Renders Drive embed iframe: `https://drive.google.com/file/d/<drive_file_id>/preview`.
  - Members-only video + not logged in → redirect to `/login?redirectTo=/classes/<id>`.
  - If `allow_download`: show download link `https://drive.google.com/uc?export=download&id=<drive_file_id>`.

### Admin

- **`/admin/classes`** — catalog CRUD.
  - Add: paste Drive link → auto-extract `drive_file_id` (regex), enter title/description.
  - Edit title/description; toggle `visibility`, `is_published`, `allow_download`; set `sort_order`.
  - Delete.
- **`/admin/users`** — role governance.
  - Lists every account: email, signup date, current role.
  - Role dropdown: `member` / `creator` / `admin` / `none` (revoke). Writes `user_role`.
  - Does **not** provision or link a public creator entity (kept separate by decision).

## Middleware (`apps/frontend/src/proxy.ts`)

- Remove the `/signup → /login` kill-redirect (currently lines ~50–52) and restore the signup page.
- `/classes` and `/classes/[id]` are **public** routes (anon-reachable); not added to
  `CREATOR_PREFIXES`. Members-only gating for the player happens in the page (RLS + redirect),
  not the middleware prefix list, so public videos remain anon-viewable.
- Recognize `'member'` and `'none'` in the role union. Members and `none` are bounced from `/me`
  (creator dashboard) and `/admin`. Admins remain confined to `/admin`.
- Post-login landing: `admin → /admin`, `creator → /me`, `member/none → /classes`.

## Drive link parsing

Extract `drive_file_id` from common Drive URL shapes:

- `https://drive.google.com/file/d/<ID>/view`
- `https://drive.google.com/open?id=<ID>`
- `https://drive.google.com/uc?id=<ID>`
- bare `<ID>`

Single regex/helper in `apps/frontend/src/lib/`. Reject input that yields no ID.

## Build order

1. `class_video` table + RLS migration.
2. Public `/classes` list + `/classes/[id]` player (Drive embed, download link).
3. Admin `/admin/classes` CRUD (Drive link parse, toggles, reorder, delete).
4. Re-open signup + `member` role on signup + middleware role/landing changes.
5. `/admin/users` role-management screen.

## Testing

- **RLS test** (SQL, `supabase/tests/`): anon sees only published-public; member sees all
  published; draft hidden from anon + member, visible to admin.
- **Drive ID parser** unit test: each URL shape → correct ID; invalid input → rejected.
- **Middleware**: member bounced from `/me`/`/admin`; member lands on `/classes`; anon can reach
  `/classes` but members-only player redirects to login.
