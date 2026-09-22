/**
 * Server-side loader for /admin/tracker. Service-role reads only — the caller
 * (page.tsx) has already passed the (admin) layout gate and re-checks the role.
 */

import { getSupabaseAdmin } from '@d3/database';
import { resolveMediaUrl } from '@gitroom/frontend/lib/media-url';
import {
  monthRange,
  todayKey,
  type TrackerCreator,
  type TrackerData,
} from '@gitroom/frontend/lib/tracker';

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

  const [
    membersRes,
    tasksRes,
    eventsRes,
    noteRes,
    creatorsRes,
    assignRes,
    statsRes,
  ] = await Promise.all([
    admin
      .from('tracker_member')
      .select('id, name, role, sort_order')
      .order('sort_order')
      .order('created_at'),
    admin
      .from('tracker_task')
      .select('id, title, done, sort_order')
      .order('sort_order')
      .order('created_at'),
    admin
      .from('tracker_event')
      .select('id, event_date, title')
      .order('event_date')
      .order('created_at'),
    admin
      .from('tracker_note')
      .select('body')
      .eq('key', 'remarks')
      .maybeSingle(),
    admin
      .from('creator')
      .select('id, display_name, avatar_url, profile(platform)')
      .order('display_name'),
    admin
      .from('tracker_assignment')
      .select('creator_id, handler_id, editor_id, scheduled_posting'),
    admin.rpc('tracker_creator_month_stats', { p_from: from, p_to: to }),
  ]);

  const members = must<
    { id: string; name: string; role: string; sort_order: number }[]
  >(membersRes, 'members');
  const tasks = must<
    { id: string; title: string; done: boolean; sort_order: number }[]
  >(tasksRes, 'tasks');
  const events = must<{ id: string; event_date: string; title: string }[]>(
    eventsRes,
    'events',
  );
  if (noteRes.error)
    throw new Error(`tracker: remarks: ${noteRes.error.message}`);
  const creatorRows = must<CreatorRow[]>(creatorsRes, 'creators');
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
        videos: s?.videos ?? 0,
        posts: s?.posts ?? 0,
        views: Number(s?.views ?? 0),
      };
    });

  return {
    month,
    today: todayKey(),
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      sortOrder: m.sort_order,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      done: t.done,
      sortOrder: t.sort_order,
    })),
    events: events.map((e) => ({
      id: e.id,
      date: e.event_date,
      title: e.title,
    })),
    creators,
    remarks: noteRes.data?.body ?? '',
  };
}
