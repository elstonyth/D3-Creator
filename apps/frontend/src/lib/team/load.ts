/**
 * Server-side reads for the Work Trackers (through tracker-data.ts) and the
 * admin console's Team pages. Service-role; every caller has already passed
 * its own gate (the (staff) / (admin) layouts, requireStaff / requireAdmin).
 *
 * Reads are windowed — a month of shoots, a month of history — and the video
 * lists are paged, so PostgREST's 1000-row cap never truncates silently.
 */

import { getSupabaseAdmin } from '@d3/database';
import { fetchAllRows } from '@gitroom/frontend/lib/queries';
import { resolveMediaUrl } from '@gitroom/frontend/lib/media-url';
import {
  addMonths,
  monthRange,
  parseMemberKind,
  type MemberKind,
} from '@gitroom/frontend/lib/tracker';
import type { AssignmentRow, MonthStatsRow } from './accounts';
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
    kind: parseMemberKind(r.kind),
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

/**
 * Who handles and edits each account, and every account's output in the
 * month (`tracker_creator_month_stats`), for the admin's account board.
 */
export async function loadPlacements(month: string): Promise<{
  assignments: AssignmentRow[];
  stats: MonthStatsRow[];
}> {
  const admin = getSupabaseAdmin();
  const { from, to } = monthRange(month);
  const [assignRes, statsRes] = await Promise.all([
    admin
      .from('tracker_assignment')
      .select(
        'creator_id, handler_id, editor_id, scheduled_posting, sort_order',
      ),
    admin.rpc('tracker_creator_month_stats', { p_from: from, p_to: to }),
  ]);
  return {
    assignments: must<AssignmentRow[]>(assignRes, 'assignments'),
    stats: must<MonthStatsRow[]>(statsRes, 'month stats'),
  };
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

/** `YYYY-MM-DD` bounds [first day, first day of next month) for a month key. */
export function monthDays(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${addMonths(month, 1)}-01` };
}

// ---- video jobs -------------------------------------------------------------

/**
 * Every video matching all of `ors` (each one or() filter; several are
 * ANDed), newest first. Paged, so PostgREST's 1000-row cap never cuts it.
 */
async function videosWhere(ors: string[], what: string): Promise<Video[]> {
  const res = await fetchAllRows<VideoRow>((a, b) => {
    let q = getSupabaseAdmin().from('tracker_video').select(VIDEO_COLS);
    for (const f of ors) q = q.or(f);
    return q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(a, b);
  });
  if (res.error) throw new Error(`team: ${what}: ${res.error.message}`);
  // ponytail: offset paging. A Done landing between two pages of a result
  // over 1000 rows can shift a row onto both (dropped here) or neither (back
  // on the next load); keyset paging if a month ever passes 1000 videos.
  return [...new Map(res.rows.map((r) => [r.id, r])).values()].map(rowToVideo);
}

/**
 * Videos still in hand (not verified), plus those verified since `since` (an
 * ISO instant). Everyone's, or the ones a person edits or passed on.
 */
export async function loadVideos(
  since: string,
  memberId?: string,
): Promise<Video[]> {
  return videosWhere(
    [
      // Values quoted: a timestamp's ':' and '.' are reserved in or(). An
      // edit is never later than its verify, so this keeps this month's
      // edits too.
      `verified_at.is.null,verified_at.gte."${since}"`,
      ...(memberId
        ? [`editor_id.eq.${memberId},handler_id.eq.${memberId}`]
        : []),
    ],
    'videos',
  );
}

/**
 * Videos whose edit or verify was marked Done in [from, to) — for counting.
 * Everyone's, or only those with a Done stamped with one person.
 */
export async function loadVideosDone(
  from: string,
  to: string,
  memberId?: string,
): Promise<Video[]> {
  return videosWhere(
    [
      `and(edited_at.gte."${from}",edited_at.lt."${to}"),and(verified_at.gte."${from}",verified_at.lt."${to}")`,
      ...(memberId
        ? [`edited_by.eq.${memberId},verified_by.eq.${memberId}`]
        : []),
    ],
    'videos done',
  );
}
