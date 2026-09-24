import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@d3/database';
import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isAdminHost } from '@gitroom/frontend/lib/portal-host';
import { monthRange, todayKey } from '@gitroom/frontend/lib/tracker';
import { doneCounts } from '@gitroom/frontend/lib/team/videos';
import {
  loadPeople,
  loadShoots,
  loadVideosDone,
  monthDays,
} from '@gitroom/frontend/lib/team/load';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { TeamManager, type PendingSignup, type TeamRow } from './team-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t('Team — D3 Admin') };
}

/** Staff approvals, and each person's month in three numbers. */
export default async function AdminTeamPage() {
  const { t } = await getI18n();
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const admin = getSupabaseAdmin();
  const month = todayKey().slice(0, 7);
  const { from, to } = monthRange(month);
  const days = monthDays(month);
  const profileBase = isAdminHost((await headers()).get('host'))
    ? '/team'
    : '/admin/team';

  const [pendingRes, linkedRes, people, videos, shoots] = await Promise.all([
    admin
      .from('user_role')
      .select('user_id, role')
      .in('role', ['staff_pending', 'staff']),
    admin
      .from('tracker_member')
      .select('id, user_id')
      .not('user_id', 'is', null)
      .is('archived_at', null),
    loadPeople(),
    loadVideosDone(new Date(from).toISOString(), new Date(to).toISOString()),
    loadShoots(days.from, days.to),
  ]);
  if (pendingRes.error) throw pendingRes.error;
  if (linkedRes.error) throw linkedRes.error;

  // Waiting: a pending signup, or a staff login linked to nobody (an
  // approval whose link step failed) — both can be approved or turned away.
  const linkedLogins = new Set(
    (linkedRes.data ?? []).map((r) => r.user_id as string),
  );
  const waitingRows = (pendingRes.data ?? []).filter(
    (r) => r.role === 'staff_pending' || !linkedLogins.has(r.user_id as string),
  );

  // Emails and signup details live in auth.users (not exposed via PostgREST).
  // A handful of staff: one admin-API call each.
  const ids = [...waitingRows.map((r) => r.user_id as string), ...linkedLogins];
  const users = new Map(
    (
      await Promise.all(ids.map((id) => admin.auth.admin.getUserById(id)))
    ).flatMap((r) =>
      r.data.user ? [[r.data.user.id, r.data.user] as const] : [],
    ),
  );
  const loginOf = new Map(
    (linkedRes.data ?? []).map((r) => [r.id as string, r.user_id as string]),
  );

  const pending: PendingSignup[] = waitingRows.flatMap((r) => {
    const u = users.get(r.user_id as string);
    if (!u) return [];
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    return [
      {
        userId: u.id,
        email: u.email ?? '—',
        name: typeof meta.display_name === 'string' ? meta.display_name : '',
        kind: meta.staff_kind === 'editor' ? 'editor' : 'handler',
        signedUpAt: u.created_at,
        confirmed: Boolean(u.email_confirmed_at),
        approved: r.role === 'staff',
      },
    ];
  });

  const team: TeamRow[] = people
    .filter((p) => !p.archived)
    .map((p) => {
      const login = loginOf.get(p.id);
      const counts = doneCounts(
        videos,
        p.id,
        new Date(from).toISOString(),
        new Date(to).toISOString(),
      );
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        email: login ? (users.get(login)?.email ?? '—') : null,
        edited: counts.edited,
        posted: counts.posted,
        shootsDone: shoots.filter(
          (s) => s.memberId === p.id && s.status === 'done',
        ).length,
        profileHref: `${profileBase}/${p.id}`,
      };
    });

  const unlinked = people
    .filter((p) => !p.archived && !loginOf.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));

  return (
    <Container>
      <Section space="sm" className="space-y-8">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">{t('Team')}</p>
          <h1 className="mt-3 text-display-2 text-fg">{t('The team')}</h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            {t(
              'Approve staff who signed up, and see what each person has done this month.',
            )}
          </p>
        </header>
        <TeamManager pending={pending} team={team} unlinked={unlinked} />
      </Section>
    </Container>
  );
}
