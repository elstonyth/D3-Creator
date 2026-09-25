/**
 * Server-side loader for /admin/tracker. Service-role reads only — the caller
 * (page.tsx) has already passed the (admin) layout gate and re-checks the role.
 */

import { getSupabaseAdmin } from '@d3/database';
import { resolveMediaUrl } from '@gitroom/frontend/lib/media-url';
import { fetchAllRows } from '@gitroom/frontend/lib/queries';
import {
  addDays,
  addMonths,
  monthRange,
  parseMemberKind,
  todayKey,
  type TrackerCreator,
  type TrackerData,
} from '@gitroom/frontend/lib/tracker';

/** Finished tasks shown under the open list. Older ones stay in the table. */
const DONE_TASKS_SHOWN = 30;

interface CreatorRow {
  id: string;
  display_name: string;
  avatar_url: string | null;
  profile: { platform: string }[] | null;
}

interface AssignmentRow {
  creator_id: string;
  handler_id: string | null;
  editor_id: string | null;
  scheduled_posting: boolean;
  sort_order: number;
}

/** An embedded to-one, which PostgREST types as an object or an array. */
type One<T> = T | T[] | null;

interface ShootRow {
  id: string;
  shoot_date: string;
  start_time: string | null;
  title: string;
  status: string;
  member: One<{ name: string }>;
}

interface PostRow {
  id: string;
  post_date: string;
  post_time: string | null;
  title: string;
  posted_at: string | null;
  creator: One<{ display_name: string }>;
  handler: One<{ name: string }>;
  editor: One<{ name: string }>;
  poster: One<{ name: string }>;
}

interface StatsRow {
  creator_id: string;
  videos: number;
  posts: number;
  views: number | string;
}

function must<T>(
  res: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (res.error) throw new Error(`tracker: ${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

export async function loadTrackerData(month: string): Promise<TrackerData> {
  const admin = getSupabaseAdmin();
  const { from, to } = monthRange(month);
  const today = todayKey();
  // Events for the month on screen plus today/tomorrow (the spotlight), and
  // nothing else: PostgREST caps a response at 1000 rows and would truncate
  // an unbounded read silently once the table grows past that.
  const monthStart = `${month}-01`;
  const nextMonthStart = `${addMonths(month, 1)}-01`;
  const eventsFrom = today < monthStart ? today : monthStart;
  const dayAfterTomorrow = addDays(today, 2);
  const eventsTo =
    dayAfterTomorrow > nextMonthStart ? dayAfterTomorrow : nextMonthStart;
  // Shoots and posting slots are many more rows than events: they read the
  // two windows rather than the span between them, and are paged in a total
  // order, so neither a far month nor a busy one can cut today's rows.
  const windows = (col: string) =>
    `and(${col}.gte.${monthStart},${col}.lt.${nextMonthStart}),and(${col}.gte.${today},${col}.lt.${dayAfterTomorrow})`;

  const [
    membersRes,
    openTasksRes,
    doneTasksRes,
    eventsRes,
    noteRes,
    creatorsRes,
    assignRes,
    statsRes,
    shootsRes,
    postsRes,
  ] = await Promise.all([
    admin
      .from('tracker_member')
      .select('id, name, role, kind, sort_order')
      // Archived people keep their history but leave the board.
      .is('archived_at', null)
      .order('sort_order')
      .order('created_at'),
    admin
      .from('tracker_task')
      .select('id, title, done, sort_order, assignee_id')
      .eq('done', false)
      .order('sort_order')
      .order('created_at'),
    admin
      .from('tracker_task')
      .select('id, title, done, sort_order, assignee_id')
      .eq('done', true)
      .order('completed_at', { ascending: false })
      .limit(DONE_TASKS_SHOWN),
    admin
      .from('tracker_event')
      .select('id, event_date, title')
      .gte('event_date', eventsFrom)
      .lt('event_date', eventsTo)
      .order('event_date')
      .order('created_at'),
    admin
      .from('tracker_note')
      .select('body, updated_at')
      .eq('key', 'remarks')
      .maybeSingle(),
    admin
      .from('creator')
      .select('id, display_name, avatar_url, profile(platform)')
      .order('display_name'),
    admin
      .from('tracker_assignment')
      .select(
        'creator_id, handler_id, editor_id, scheduled_posting, sort_order',
      ),
    admin.rpc('tracker_creator_month_stats', { p_from: from, p_to: to }),
    // The staff portal's shoots and video posting slots, for the calendar
    // and the spotlight.
    fetchAllRows<ShootRow>((a, b) =>
      admin
        .from('tracker_shoot')
        .select(
          'id, shoot_date, start_time, title, status, member:tracker_member(name)',
        )
        .or(windows('shoot_date'))
        .neq('status', 'cancelled')
        .order('shoot_date')
        .order('start_time')
        .order('id')
        .range(a, b),
    ),
    fetchAllRows<PostRow>((a, b) =>
      admin
        .from('tracker_video')
        .select(
          'id, post_date, post_time, title, posted_at, creator:creator(display_name), handler:tracker_member!tracker_video_handler_id_fkey(name), editor:tracker_member!tracker_video_editor_id_fkey(name), poster:tracker_member!tracker_video_posted_by_fkey(name)',
        )
        .or(windows('post_date'))
        .order('post_date')
        .order('post_time')
        .order('id')
        .range(a, b),
    ),
  ]);

  const members = must<
    {
      id: string;
      name: string;
      role: string;
      kind: string;
      sort_order: number;
    }[]
  >(membersRes, 'members');
  type TaskRow = {
    id: string;
    title: string;
    done: boolean;
    sort_order: number;
    assignee_id: string | null;
  };
  const tasks = [
    ...must<TaskRow[]>(openTasksRes, 'tasks'),
    ...must<TaskRow[]>(doneTasksRes, 'done tasks'),
  ];
  const events = must<{ id: string; event_date: string; title: string }[]>(
    eventsRes,
    'events',
  );
  if (noteRes.error)
    throw new Error(`tracker: remarks: ${noteRes.error.message}`);
  const creatorRows = must<CreatorRow[]>(creatorsRes, 'creators');
  // PostgREST types an embedded to-one as object or array depending on how
  // it reads the FK; take either.
  const first = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
  if (shootsRes.error)
    throw new Error(`tracker: shoots: ${shootsRes.error.message}`);
  if (postsRes.error)
    throw new Error(`tracker: posting slots: ${postsRes.error.message}`);
  const shootRows = shootsRes.rows;
  const postRows = postsRes.rows;
  const assignments = must<AssignmentRow[]>(assignRes, 'assignments');
  const stats = must<StatsRow[]>(statsRes, 'month stats');

  const byCreator = new Map(assignments.map((a) => [a.creator_id, a]));
  const statsByCreator = new Map(stats.map((s) => [s.creator_id, s]));

  const creators: TrackerCreator[] = creatorRows
    // A creator with no platform profile is a login shell, not an IP.
    .filter((c) => (c.profile?.length ?? 0) > 0)
    .map((c) => {
      const a = byCreator.get(c.id);
      const s = statsByCreator.get(c.id);
      return {
        id: c.id,
        name: c.display_name,
        avatarUrl: resolveMediaUrl(c.avatar_url),
        platforms: Array.from(
          new Set((c.profile ?? []).map((p) => p.platform)),
        ).sort(),
        handlerId: a?.handler_id ?? null,
        editorId: a?.editor_id ?? null,
        scheduledPosting: a?.scheduled_posting ?? false,
        sortOrder: a?.sort_order ?? 0,
        videos: s?.videos ?? 0,
        posts: s?.posts ?? 0,
        views: Number(s?.views ?? 0),
      };
    })
    // Stable: cards the team never ordered keep the database's name order.
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    month,
    today,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      kind: parseMemberKind(m.kind),
      sortOrder: m.sort_order,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      sortOrder: t.sort_order,
      assigneeId: t.assignee_id,
    })),
    events: events.map((e) => ({
      id: e.id,
      date: e.event_date,
      title: e.title,
    })),
    shoots: shootRows.map((r) => ({
      id: r.id,
      date: r.shoot_date,
      time: r.start_time ? r.start_time.slice(0, 5) : null,
      title: r.title,
      person: first(r.member)?.name ?? '—',
      status: r.status === 'done' ? 'done' : 'planned',
    })),
    posts: postRows.map((r) => ({
      id: r.id,
      date: r.post_date,
      time: r.post_time ? r.post_time.slice(0, 5) : null,
      title: r.title,
      account: first(r.creator)?.display_name ?? null,
      // Who posts it: once out, whoever it was stamped with; before, the
      // handler, or the editor on a job with no handler.
      person:
        (r.posted_at ? first(r.poster)?.name : null) ??
        first(r.handler)?.name ??
        first(r.editor)?.name ??
        null,
      posted: r.posted_at !== null,
    })),
    creators,
    remarks: noteRes.data?.body ?? '',
    remarksAt: noteRes.data?.updated_at ?? null,
  };
}
