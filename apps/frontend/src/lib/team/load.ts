/**
 * Server-side reads for the staff portal and the admin console's Schedule
 * and Team pages. Service-role; every caller has already passed its own
 * gate (the (staff) / (admin) layouts, requireStaff / requireAdmin).
 *
 * Reads are windowed — a week of shoots, a month of history — and the
 * handover log is paged, so PostgREST's 1000-row cap never truncates
 * silently.
 */

import { getSupabaseAdmin } from '@d3/database';
import { fetchAllRows } from '@gitroom/frontend/lib/queries';
import { resolveMediaUrl } from '@gitroom/frontend/lib/media-url';
import {
  addMonths,
  monthRange,
  type MemberKind,
} from '@gitroom/frontend/lib/tracker';
import { holderAt, type LogRow } from './attribution';
import { rowToShoot, SHOOT_COLS, type ShootRow } from './shoot-rows';
import { sortShoots, type Shoot } from './shoots';
import { rowToVideo, VIDEO_COLS, type VideoRow } from './video-rows';
import type { Video } from './videos';

export interface TeamPerson {
  id: string;
  name: string;
  kind: MemberKind;
  /** Left the board; still named in history. */
  archived: boolean;
}

export interface RosterAccount {
  id: string;
  name: string;
  avatarUrl: string | null;
  platforms: string[];
}

export interface AccountMonth extends RosterAccount {
  /** Distinct videos published in the month (cross-platform copies collapsed). */
  videos: number;
  posts: number;
  views: number;
}

export interface Handover {
  creatorId: string;
  creatorName: string;
  field: 'handler' | 'editor';
  /** Person names; null = nobody. */
  from: string | null;
  to: string | null;
  at: string;
}

function must<T>(
  res: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (res.error) throw new Error(`team: ${what}: ${res.error.message}`);
  return (res.data ?? []) as T;
}

/** Everyone who is or was on the board, board order. */
export async function loadPeople(): Promise<TeamPerson[]> {
  const rows = must<
    { id: string; name: string; kind: string; archived_at: string | null }[]
  >(
    await getSupabaseAdmin()
      .from('tracker_member')
      .select('id, name, kind, archived_at')
      .order('sort_order')
      .order('created_at'),
    'people',
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind === 'editor' ? 'editor' : 'handler',
    archived: r.archived_at !== null,
  }));
}

/** Creator accounts that are real IPs (at least one platform profile), by name. */
export async function loadRoster(): Promise<RosterAccount[]> {
  const rows = must<
    {
      id: string;
      display_name: string;
      avatar_url: string | null;
      profile: { platform: string }[] | null;
    }[]
  >(
    await getSupabaseAdmin()
      .from('creator')
      .select('id, display_name, avatar_url, profile(platform)')
      .order('display_name'),
    'roster',
  );
  return rows
    .filter((c) => (c.profile?.length ?? 0) > 0)
    .map((c) => ({
      id: c.id,
      name: c.display_name,
      avatarUrl: resolveMediaUrl(c.avatar_url),
      platforms: Array.from(
        new Set((c.profile ?? []).map((p) => p.platform)),
      ).sort(),
    }));
}

/** Shoots on days [from, to), everyone's or one person's, in schedule order. */
export async function loadShoots(
  from: string,
  to: string,
  memberId?: string,
): Promise<Shoot[]> {
  let q = getSupabaseAdmin()
    .from('tracker_shoot')
    .select(SHOOT_COLS)
    .gte('shoot_date', from)
    .lt('shoot_date', to);
  if (memberId) q = q.eq('member_id', memberId);
  const rows = must<ShootRow[]>(
    await q.order('shoot_date').order('start_time').order('created_at'),
    'shoots',
  );
  return sortShoots(rows.map(rowToShoot));
}

/**
 * The accounts a person handled and edited in `month` — whoever held each
 * account when the month ended, from the handover log — with that month's
 * output, plus the handovers that touched them during the month.
 */
export async function loadAccountsAt(
  memberId: string,
  month: string,
  people: TeamPerson[],
): Promise<{
  handled: AccountMonth[];
  edited: AccountMonth[];
  handovers: Handover[];
}> {
  const admin = getSupabaseAdmin();
  const { from, to } = monthRange(month);
  const [roster, assignRes, statsRes, logRes] = await Promise.all([
    loadRoster(),
    admin
      .from('tracker_assignment')
      .select('creator_id, handler_id, editor_id'),
    admin.rpc('tracker_creator_month_stats', { p_from: from, p_to: to }),
    fetchAllRows<{
      id: number;
      creator_id: string;
      field: LogRow['field'];
      old_value: string | null;
      new_value: string | null;
      changed_at: string;
    }>((a, b) =>
      admin
        .from('tracker_assignment_log')
        .select('id, creator_id, field, old_value, new_value, changed_at')
        .in('field', ['handler', 'editor'])
        .order('id')
        .range(a, b),
    ),
  ]);
  const assignments = must<
    {
      creator_id: string;
      handler_id: string | null;
      editor_id: string | null;
    }[]
  >(assignRes, 'assignments');
  const stats = must<
    {
      creator_id: string;
      videos: number;
      posts: number;
      views: number | string;
    }[]
  >(statsRes, 'month stats');
  if (logRes.error) throw new Error(`team: log: ${logRes.error.message}`);
  const log: LogRow[] = logRes.rows.map((r) => ({
    creatorId: r.creator_id,
    field: r.field,
    oldValue: r.old_value,
    newValue: r.new_value,
    changedAt: r.changed_at,
  }));

  const current = new Map(assignments.map((a) => [a.creator_id, a]));
  const statsBy = new Map(stats.map((s) => [s.creator_id, s]));
  const withStats = (c: RosterAccount): AccountMonth => {
    const s = statsBy.get(c.id);
    return {
      ...c,
      videos: s?.videos ?? 0,
      posts: s?.posts ?? 0,
      views: Number(s?.views ?? 0),
    };
  };

  const handled: AccountMonth[] = [];
  const edited: AccountMonth[] = [];
  for (const c of roster) {
    const now = current.get(c.id);
    if (
      holderAt(log, c.id, 'handler', to, now?.handler_id ?? null) === memberId
    )
      handled.push(withStats(c));
    if (holderAt(log, c.id, 'editor', to, now?.editor_id ?? null) === memberId)
      edited.push(withStats(c));
  }

  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const creatorName = new Map(roster.map((c) => [c.id, c.name]));
  const start = Date.parse(from);
  const end = Date.parse(to);
  const handovers: Handover[] = log
    .filter((r): r is LogRow & { field: 'handler' | 'editor' } => {
      const t = Date.parse(r.changedAt);
      return (
        (r.field === 'handler' || r.field === 'editor') &&
        t >= start &&
        t < end &&
        (r.oldValue === memberId || r.newValue === memberId)
      );
    })
    .map((r) => ({
      creatorId: r.creatorId,
      creatorName: creatorName.get(r.creatorId) ?? '—',
      field: r.field,
      from: r.oldValue ? (nameOf.get(r.oldValue) ?? '—') : null,
      to: r.newValue ? (nameOf.get(r.newValue) ?? '—') : null,
      at: r.changedAt,
    }))
    .reverse(); // newest first

  return { handled, edited, handovers };
}

/** `YYYY-MM-DD` bounds [first day, first day of next month) for a month key. */
export function monthDays(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${addMonths(month, 1)}-01` };
}

// ---- video jobs and tasks ----------------------------------------------------

/** Enough for a team of this size; the pages say so if a list is cut. */
const VIDEO_LIMIT = 500;

/**
 * Video jobs still in hand (not posted), plus those finished — edited or
 * posted — since `since` (an ISO instant). Everyone's, or one person's as
 * editor or handler.
 */
export async function loadVideos(
  since: string,
  memberId?: string,
): Promise<Video[]> {
  let q = getSupabaseAdmin()
    .from('tracker_video')
    .select(VIDEO_COLS)
    // Values quoted: a timestamp's ':' and '.' are reserved in or().
    .or(
      `posted_at.is.null,posted_at.gte."${since}",edited_at.gte."${since}"`,
    );
  if (memberId) q = q.or(`editor_id.eq.${memberId},handler_id.eq.${memberId}`);
  const rows = must<VideoRow[]>(
    await q.order('created_at', { ascending: false }).limit(VIDEO_LIMIT),
    'videos',
  );
  return rows.map(rowToVideo);
}

/** Videos whose edit or post was clicked Done in [from, to) — for counting. */
export async function loadVideosDone(from: string, to: string): Promise<Video[]> {
  const rows = must<VideoRow[]>(
    await getSupabaseAdmin()
      .from('tracker_video')
      .select(VIDEO_COLS)
      .or(
        `and(edited_at.gte."${from}",edited_at.lt."${to}"),and(posted_at.gte."${from}",posted_at.lt."${to}")`,
      )
      .order('created_at', { ascending: false })
      .limit(VIDEO_LIMIT),
    'videos done',
  );
  return rows.map(rowToVideo);
}

/** Who handles and edits each account today, for filling in a new job. */
export async function loadAssignments(): Promise<
  Record<string, { handlerId: string | null; editorId: string | null }>
> {
  const rows = must<
    { creator_id: string; handler_id: string | null; editor_id: string | null }[]
  >(
    await getSupabaseAdmin()
      .from('tracker_assignment')
      .select('creator_id, handler_id, editor_id'),
    'assignments',
  );
  return Object.fromEntries(
    rows.map((r) => [
      r.creator_id,
      { handlerId: r.handler_id, editorId: r.editor_id },
    ]),
  );
}

export interface MyTask {
  id: string;
  title: string;
  done: boolean;
}

/** Tasks the admin gave this person: all open ones, and the last few done. */
export async function loadMyTasks(memberId: string): Promise<MyTask[]> {
  const admin = getSupabaseAdmin();
  const [open, done] = await Promise.all([
    admin
      .from('tracker_task')
      .select('id, title, done')
      .eq('assignee_id', memberId)
      .eq('done', false)
      .order('sort_order')
      .order('created_at'),
    admin
      .from('tracker_task')
      .select('id, title, done')
      .eq('assignee_id', memberId)
      .eq('done', true)
      .order('completed_at', { ascending: false })
      .limit(10),
  ]);
  return [...must<MyTask[]>(open, 'my tasks'), ...must<MyTask[]>(done, 'my done tasks')];
}
