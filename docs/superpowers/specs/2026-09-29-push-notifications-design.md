# Push notifications for the Work Tracker — design

Date: 2026-09-29. Status: approved in chat ("go"), building on `feat/push-notifications`.

## Why

The pop-up ("Waiting for you", `components/team/work-alerts.tsx`) shows only while the
portal is open. Eunice D3: "要打开website才看到pop up". The ask: staff get the same
alerts as real notifications, including when the browser is closed. The owner wants
them in real time.

## What pushes, to whom

Every pop-up item becomes a push, and the pop-up itself stays as it is.

| Event (where it happens)                         | Who gets it              | Title (en / zh)                                                  | Body                                      |
| ------------------------------------------------ | ------------------------ | ---------------------------------------------------------------- | ----------------------------------------- |
| `passVideos`                                     | each editor given videos | New videos to edit / 新的剪辑任务                                | titles · From {handler} · {account}       |
| `updateVideo` gives a video to another editor    | the new editor           | New videos to edit                                               | title · From {handler} · {account}        |
| `finishEdit` (editor's Done)                     | the video's handler      | Edited — ready for you to verify / 剪好了，等你审核              | title · Cut by {editor} · {account}       |
| `addShoot` by someone else (the admin, for them) | the shoot's person       | New shoot scheduled for you / 为你安排了新拍摄                   | {day} · {time} · {title or account}       |
| `updateShoot` / `setShootStatus` by someone else | the shoot's person       | Shoot changed for you / 你的拍摄有变动                           | label · Cancelled, or · Changed: {reason} |
| Cron: a planned shoot falls due                  | the shoot's person       | Shoot time is up — pass the videos on / 拍摄时间到了——请交出视频 | label                                     |

- **Nobody is pushed about their own act.** An event is skipped when the recipient's
  login is the login that did it. This is the same rule as the pop-up (`createdBy !== loginId`).
  - An admin acting _as_ a person still pushes that person.
- **Due time** for a timed shoot is `shootDueAt`: start + 1 h, the same as the pop-up.
  - A shoot with no time pushes at **09:00 (+08) the next morning**, not at its
    midnight due time.
  - Each shoot pushes once. Moving its day or time re-arms it.

## Delivery reality (told to the owner)

- Android (Chrome): arrives with the browser closed.
- iPhone: only after Share → Add to Home Screen, opened from there, on iOS 16.4+.
- Desktop Chrome/Edge: only while the browser runs, including in the background.
  Otherwise it arrives the next time the browser starts.

## Pieces

1. **`public/sw.js`**, served from every host at `/sw.js`. The middleware matcher
   skips `.js`, and the CSP already has `worker-src 'self'`.
   - It handles only two events.
   - `push` shows `{title, body, tag}`.
   - `notificationclick` focuses an open tab of this origin and navigates it to
     `path`, or opens one there. Only same-origin paths are allowed.
2. **`components/team/push-toggle.tsx`** sits in the tracker header under "Today",
   through a new `aside` slot on `TrackerScene`. It renders on the staff tracker, and
   on the admin tracker when the admin is on the board (`meId`). Its states:
   - The key is missing: it renders nothing.
   - The browser has no Push API: it renders nothing. On an iPhone outside the Home
     Screen it shows the Add to Home Screen hint instead.
   - Permission denied: "Notifications are blocked in this browser's settings."
   - Not subscribed: a **Turn on notifications** button. It registers the service
     worker, asks permission, subscribes, and saves.
   - Subscribed: "Notifications on", with Turn off. On every load an existing
     subscription is saved again, so a shared device follows whoever is signed in.
3. **`lib/team/push-actions.ts`** (`'use server'`) holds `savePush(sub, locale, path)`
   and `dropPush(endpoint)`.
   - Only a signed-in staff member or admin may call them.
   - The row's `user_id` comes from the session, never the browser.
   - Input is checked by `parsePushSubscription` (pure, `lib/team/push-input.ts`):
     - the endpoint is `https:` on a known push service: `fcm.googleapis.com`,
       `*.push.apple.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`
     - `p256dh` and `auth` are base64url within length limits
     - `locale` is `en` or `zh`
     - `path` is a same-origin path like `/` or `/tracker`
   - The allowlist keeps the server from POSTing to arbitrary URLs (SSRF).
4. **`lib/team/push.ts`**: server-only, and not an action file.
   - `notify(events, actorUserId)` queues the sends with `after()`, so a save never
     waits on them or fails because of them.
   - `sendPush(events, actorUserId)` does the work. The cron awaits it directly.
     1. Resolve each recipient person to their login. People who have left, and
        people with no login, are skipped.
     2. Load their subscriptions, plus the names the text needs (people, accounts).
     3. Build each text in the subscription's locale (`lib/team/push-words.ts`,
        pure) and send with `web-push`: TTL 24 h, urgency high, one `tag` per event.
     4. A 404 or 410 deletes that subscription. Other failures are logged. It never throws.
   - Without `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` it is a no-op. The VAPID subject
     is `https://www.d3creator.com`.
5. **`app/api/cron/work-due/route.ts`**, scheduled `* * * * *` in `vercel.json`
   (Pro allows per-minute crons).
   - It is guarded by `Bearer CRON_SECRET`, like the other crons.
   - It reads planned shoots dated yesterday or today whose `due_pushed_at` is null.
   - It keeps those whose push time falls within the last 2 h. That way the first run
     after deploy doesn't push every stale overdue shoot, and a missed minute still
     catches up.
   - It claims them atomically: `update … set due_pushed_at = now() where id in (…)
and due_pushed_at is null and status = 'planned' returning …`. Overlapping runs
     therefore never push a shoot twice.
   - Then it awaits `sendPush`.

## Data (one migration)

```sql
create table public.push_subscription (
  endpoint   text primary key,           -- one row per browser; upsert moves it to the signed-in user
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  locale     text not null default 'en' check (locale in ('en', 'zh')),
  path       text not null default '/',  -- where a tap lands on this device's host
  created_at timestamptz not null default now()
);
create index push_subscription_user_id_idx on public.push_subscription (user_id);
revoke all on table public.push_subscription from anon, authenticated;
alter table public.push_subscription enable row level security;   -- service role only

alter table public.tracker_shoot add column due_pushed_at timestamptz;
```

`updateShoot` writes `due_pushed_at = null` when the day or time changes.

## Config

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: generated with `web-push generate-vapid-keys`.
  - They go in Vercel Production and the local `.env`.
  - The public key reaches the browser as a prop from the server page, not as a
    `NEXT_PUBLIC_` build-time value.
- New dependency `web-push` (plus `@types/web-push`) in `apps/frontend`.
  - Web Push needs ECDH, HKDF and AES-GCM payload encryption plus an ES256 VAPID JWT.
    That is not a few lines, and it is security-sensitive.

## Rollout

1. Apply the migration to prod via MCP, with the owner's OK. Rename the file to prod's version.
2. Set the VAPID env vars in Vercel Production.
3. Merge. The merge deploys and starts the per-minute cron.
4. Check the cron runs in the Vercel logs. The owner turns notifications on on a phone,
   then passes a test video.

## Tests

- Pure:
  - `parsePushSubscription` (allowlist, formats, path)
  - `push-words` (every event, en and zh)
  - due-shoot selection (window, untimed at 09:00, midnight crossing)
- `push.ts` with `web-push` and the database mocked:
  - recipients, the skip-self rule, archived people and people with no login
  - locale per device, 404/410 cleanup, never throws, no-op without keys
- Actions: each one calls `notify` with the right events (`./push` mocked).
- Cron: 401 without the secret, and it claims then sends.
- `vercel-crons.test.ts` asserts the per-minute cron.
- Local end-to-end: real Chrome against the local Supabase stack. Subscribe on
  `staff.localhost:4200`, pass a video, and see the service worker show the notification.
