# Staff portal + work-tracker fixes — design

Date: 2026-09-23 · Status: approved in chat, built; revised the same day
(the working process — video jobs, tasks for a person, staff sign-up name
and job — see "Revision: the working process")

## Context

The work tracker (`/admin/tracker`, served from `admin.d3creator.com`) went live
on 2026-09-22. The owner's first round of feedback asks for four board fixes and
one explanation. The owner also wants staff to key in their own shoot schedule
(today it goes into a WhatsApp group as free text: day, time, place, "shoot 4")
so the admin can read it off the calendar, and wants a record of who handled
what.

Two tracks, two PRs. Track A is independent and ships first; Track B builds on
it (it needs the member `kind` from A3).

## Track A — board fixes

**A1. No autocomplete popup.** The dark popup under the task input is Chrome's
form-autocomplete history (the text it offers is the task typed earlier; the
task row carries no `title`). Every free-text tracker input gets
`autoComplete="off"`: task, event, person name/role, and the new edit inputs.

**A2. Edit a task / event.** A pencil on each open task and each event swaps the
text for an input. Enter or blur saves, Esc cancels, an empty or unchanged value
cancels. New actions `updateTask(id, title)` and `updateEvent(id, title)` with
the same guards as their add counterparts (`requireAdmin`, `isUuid`,
`cleanTitle`). Optimistic, rolled back on failure like every other edit.

**A3. Editors are not columns.** Today every `tracker_member` is both a handler
column and an editor option, so adding an editor adds a column.

- Migration: `tracker_member.kind text not null default 'handler' check (kind in ('handler','editor'))`.
  Existing rows stay handlers.
- Board columns: handlers only. "+ Add person" asks Handler / Editor.
- Editors show as a chip row under the board header, each with its own
  "edits N accounts · M videos" and a remove control (same inline confirm).
- The Editor select on a card lists editors first, then handlers
  (`<optgroup>`), so every existing `editor_id` keeps resolving.

**A4. Reorder cards.** `tracker_assignment.sort_order` exists and is unused
(all rows 0). The loader orders creators by `sort_order`, then name.

- Drag a card onto another card: it lands at that card's position, in that
  column (same column = reorder, other column = hand over + place).
- Each card also gets ↑ / ↓ buttons — HTML5 drag-and-drop does not exist on
  touch screens.
- New action `placeCards(handlerId | null, creatorIds[])`: upserts
  `{creator_id, handler_id, sort_order: index}` for the whole column in order.
  Cards placed through the handler select keep their old `sort_order` (ties
  sort by name).

**A5. What "VIDEOS" means.** Answered in chat. On the board, one caption line
under the staffing header: videos = different videos posted in the month; one
clip on several platforms counts once.

## Track B — staff portal

### Hosts

| Host                  | Who                                    | What                                                            |
| --------------------- | -------------------------------------- | --------------------------------------------------------------- |
| `www.d3creator.com`   | public, creators, members              | unchanged (classes, Studio, `/me`)                              |
| `admin.d3creator.com` | `admin` only                           | console as today + **Schedule** + **Team**; no Studio for admin |
| `staff.d3creator.com` | `staff` (and `staff_pending`, waiting) | staff sign up + sign in, schedule, accounts, history            |

Dev hosts: `admin.localhost:4200`, `staff.localhost:4200` (Chromium resolves
`*.localhost`).

`lib/admin-host.ts` becomes `lib/portal-host.ts`: one table of portals
(`admin` → app prefix `/admin`, `staff` → app prefix `/staff`), each with its
hosts and the public origin it belongs to. Same rules for both portals: the
host root rewrites onto the prefix (`/history` → `/staff/history`), a URL that
still carries the prefix redirects to the stripped one, the public host
redirects `/admin/*` and `/staff/*` across (production hosts only), shared
paths (auth pages, `/api`, `/dev`, files) pass through. Own-property lookups
stay.

The routing decision moves out of `proxy.ts` into a pure function
`decideRoute({host, path, search, role})` in `lib/portal-routing.ts` (unit
tested). `proxy.ts` keeps the session refresh, the role lookup, and applies the
decision.

Signed-in routing, by role:

- `admin` → admin console; anywhere else (www, staff host, `/studio`) bounces
  there. The `/studio` exemption for admins is removed. `/reset-password` stays
  reachable.
- `staff`, `staff_pending` → staff portal; bounced there from www and the admin
  host. `staff_pending` only ever sees `/pending`; `staff` never does.
- `creator`, `member`, `none` → as today on www; bounced back to www from both
  portal hosts.
- No `user_role` row: www keeps its `creator` default; on the staff and admin
  hosts it means no access.
- Role lookup error: fail closed, as today.

Anonymous: portal pages redirect to `/login?redirectTo=…` on the same host.
Signup is refused on the admin host (as today) and allowed on the staff host.

### Accounts and approval

One Supabase auth pool, so one email is one account; staff use an email that
is not already registered on www.

- `user_role.role` check gains `staff` and `staff_pending`.
- `handle_new_auth_user()`: admin-email match → `admin` (unchanged); else
  `raw_user_meta_data->>'portal' = 'staff'` → `staff_pending`; else `member`.
  The metadata is client-controlled, so it may only ever select the
  lower-privilege state — a pending account can read nothing.
- The staff signup form sends `options.data = {portal: 'staff'}`, confirms back
  to the staff host root, and says an admin approves new accounts.
- `staff` / `staff_pending` are outside `has_studio_access()` and the
  `class_video` member policy already (both list member/creator/admin), so they
  get no Studio and no member classes. `isStudioMember()` is tightened to the
  same set so the UI agrees with RLS.
- Admin **Team** page: pending signups (approve → link to an existing unlinked
  person, or create a new handler/editor; reject → `none`), active staff
  (unlink → `none`). One login per person: `tracker_member.user_id unique`.
- The Users page shows staff rows read-only with a pointer to Team; its role
  select never offers the staff roles.
- Removing a person from the board **archives** them (`archived_at`): hidden
  from the board and pickers, their accounts fall to Unassigned, their login
  (if any) drops to `none`, their shoots and log entries stay.

### Data (one migration, all service-role only)

```
user_role.role check        + 'staff', 'staff_pending'
handle_new_auth_user()      + staff_pending branch
tracker_member              + user_id uuid unique → auth.users on delete set null
                            + archived_at timestamptz
tracker_assignment          + updated_by uuid → auth.users on delete set null
tracker_shoot               id, member_id → tracker_member (restrict),
                            shoot_date date, start_time time null,
                            title text 1..200, creator_id → creator null (set null),
                            videos_planned / videos_shot smallint 0..99 null,
                            status planned|done|cancelled, note text ≤1000 null,
                            created_by → auth.users (set null), created_at, updated_at
tracker_assignment_log      id, creator_id → creator (cascade),
                            field handler|editor|scheduled_posting,
                            old_value, new_value text, changed_by, changed_at
trigger on tracker_assignment (after insert or update): one log row per
                            changed field, changed_by = new.updated_by
```

RLS on, no policies, `revoke all from anon, authenticated` — same posture as
the existing tracker tables. Pages and actions use the service-role client
behind their own guards.

### Staff portal pages (phone first, default language 中文)

- **My work** (`/`, the home): job tasks the admin gave you (tick them off)
  and the video jobs you edit or post (see the revision below).
- **Schedule** (`/schedule`): a Mon–Sun week, prev/next/this-week. Everyone's shoots
  are visible (team read-only, like the WhatsApp group); filter Everyone / Me.
  Per day: add a shoot — time (optional; blank for "afternoon"-style entries,
  written into the title), what/where (required), creator account (optional),
  videos planned (optional), note (optional). Own shoots: edit, mark done with
  videos shot, cancel, delete. Untimed shoots sort after timed ones.
- **My accounts** (`/accounts`): accounts I handle and accounts I edit, with
  this month's videos / posts / views (the existing month-stats RPC).
- **History** (`/history`): month by month — the videos I finished (with
  the links I pasted), my shoots (done / cancelled / still planned) with totals
  (shoots done, videos shot), the accounts I held, and the handover log.
- **Pending** (`/pending`): "waiting for approval" for `staff_pending`.

The staff layout is its own root layout (like `(admin)`): logo + "Staff",
nav, language switcher, sign out. With no language cookie set, the staff host
renders in Chinese.

### Admin additions

- **Tracker**: calendar day cells count shoots with events; the selected day
  lists everyone's shoots (time, person, what/where, status) under its events;
  today/tomorrow spotlight includes shoots.
- **Schedule** (`/schedule`): the same week component as staff, admin may add
  (for any person) and edit any shoot; filter by person.
- **Videos** (`/videos`): give a video job to an account's editor and
  handler, follow it to done, open the pasted links (see the revision below).
- **Team** (`/team`): approvals and active staff as above, each person's month
  in three numbers (videos edited, videos posted, shoots done); each person
  links to `/team/[id]` — their finished videos with links, plus the same
  History view.
- **Tracker**: a job task can be given to a person ("For: KEE"); the calendar
  also shows video posting slots next to shoots.

### Records and attribution

- Every handler / editor / scheduled-posting change is logged by the trigger,
  with who made it (`updated_by`, set by the actions). The log starts with this
  migration; nothing before it can be recovered.
- Month totals for a past month credit whoever held the account at the end of
  that month: the latest `handler` log entry before the month ends, else the
  `old_value` of the first entry after it, else today's handler. Pure function,
  unit tested. For the current month it is today's handler.
- Shoots are never deleted with a person (members are archived; the FK is
  `restrict`).

### Server actions and security

- `requireStaff()` → `{userId, memberId}`; throws unless role is `staff` and a
  non-archived member is linked. Every staff write scopes by that `memberId`
  server-side; a shoot id from the browser is re-checked against it. Never a
  member id from the client.
- Admin actions keep `requireAdmin()`; the admin may act on any member.
- Inputs bounded in the action (date keys, `HH:MM`, lengths, integers 0..99,
  UUIDs) as well as by table checks, so a refusal reads as a sentence.
- Reads are windowed (a week, a month) so the 1000-row PostgREST cap never
  truncates silently.

### i18n

Every new string has a zh entry (`i18n/staff.zh.ts` for the portal, additions
to `admin.zh.ts` / `auth.zh.ts`). Duplicate keys across dictionaries fail tsc.

## Revision: the working process

Added the same day, from the user's description of how the team works:

- **Sign-up.** A staff member signs up with the name the team knows them by
  and their job (handler or editor). Both ride in the signup metadata as a
  suggestion; the admin confirms or edits them when approving, and the
  approval puts them on the board in that row (a handler column or an editor
  chip). The approval gate stays: the board holds client names.
- **Tasks for a person.** `tracker_task.assignee_id`. The admin gives a job
  task to someone on the board; they see it on My work and tick it off there
  (`setMyTaskDone`, filtered by their own person).
- **Video jobs.** `tracker_video`: one video for one account, through two
  hands. The admin creates it (account, which video, editor and handler —
  filled in from the staffing board — optional posting day/time, note). The
  editor clicks **Done** with the link to the cut (`finishEdit`); the handler
  sets the posting day/time and clicks **Done** with the link to the live post
  (`finishPost`), only after the edit is done or when there is no editor. Each
  Done can be taken back while it is the latest step. Links must be http(s),
  are checked when saved and again when rendered.
- **Counting.** A video counts for its editor in the month they clicked Done
  on the edit, and for its handler in the month they clicked Done on the post
  (`finishedBy` / `doneCounts`, Malaysia-time month windows). The Team page
  shows the counts; a person's profile lists the videos behind them.

## Revision: after review

- **Credit is stamped.** `tracker_video.edited_by` / `posted_by` are set by a
  trigger from the job's people when a Done appears, cleared when it is taken
  back, and never written by the app. Counts read the stamps, so reassigning
  a job or archiving a person never moves finished work.
- **A job with no handler** is scheduled and posted by its editor.
- **Counted months are the admin's.** Staff take back only their own Done and
  only from this month, and add or change shoots only from this month on.
  Example: on 1 Oct a staff member cannot mark a 30 Sep shoot done; the admin
  can.
- **Removing a person** turns their login off, gives their accounts and open
  tasks back to nobody, and archives them last (every step repeatable). Video
  jobs and shoots stay as they are, marked "(left)", for the admin to hand on.
- **Accounts in a month** are the ones held when the month ended (open
  question for the owner: someone archived on the 28th shows none that month).
- **Approving** needs a confirmed email. The role flip is the first write
  and is conditional, so of two approvals of one signup exactly one goes
  on; the unique login column stops double links. A staff login linked to
  nobody counts as waiting, so a half-done approval can always be redone.
- **Nobody who has left** can be given a task, a handover or a card move.

## Testing and preview

- Unit: `portal-host`, `portal-routing` (every host × role × path class),
  attribution, shoot input validation, week helpers, video stages, link
  parsing, done counting.
- Component (jsdom + RTL): staffing board editor chips + reorder buttons; week
  schedule own-vs-other permissions; video board — who gets which Done, links,
  refusals, admin auto-fill; staff sign-up metadata.
- Migration: run against a throwaway Postgres with an assertion script
  (signup roles, one login per person, log rows, constraints, FKs, lockdown).
- Preview on sample data before any merge: `/dev/tracker-preview` (Track A),
  `/dev/staff-preview` (Track B). Real end-to-end (signup → approve → schedule)
  runs after the migrations are applied.

## Go-live (each step needs the owner's OK)

1. Apply the Track A migration, then the Track B migration, to prod; stamp each
   file with prod's recorded version.
2. Vercel: attach `staff.d3creator.com` to the project; Cloudflare: CNAME
   `staff` → the project's Vercel target, DNS only; issue the cert if Vercel
   does not.
3. Supabase Auth redirect URLs: `https://staff.d3creator.com/**` (and the
   still-pending `https://admin.d3creator.com/**`).

## Out of scope

- Staff creating their own video jobs (the admin gives them out).
- Parsing a pasted WhatsApp schedule.
- One person holding both a www member account and a staff account on one email.
- Re-attributing months before the log existed.
