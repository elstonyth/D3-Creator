import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { RoleTable } from './role-table';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Users — D3 Admin' };

export default async function AdminUsersPage() {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const admin = getSupabaseAdmin();
  // Emails live in auth.users (not exposed via PostgREST) — use the admin auth API.
  const [rolesRes, usersRes] = await Promise.all([
    admin.from('user_role').select('user_id, role, created_at'),
    // ponytail: perPage=1000 covers current scale; paginate when users approach 1000
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  // Fail closed: a PostgREST or auth-admin outage must not render an empty or
  // (unknown)-email table that looks authoritative to the admin.
  if (rolesRes.error) throw rolesRes.error;
  if (usersRes.error) throw usersRes.error;
  const roleRows = rolesRes.data;
  const usersList = usersRes.data;
  const emailById = new Map(
    (usersList?.users ?? []).map((u) => [u.id, u.email ?? '']),
  );
  const rows = (roleRows ?? []).map((r) => ({
    user_id: r.user_id as string,
    role: r.role as string,
    created_at: r.created_at as string,
    email: emailById.get(r.user_id as string) ?? '(unknown)',
  }));

  return (
    <Container>
      <Section space="sm" className="space-y-8">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">Users</p>
          <h1 className="mt-3 text-display-2 text-fg">Roles</h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            A role decides what a signed-in account can reach. Changing one
            takes effect on their next request — it does not sign them out.
          </p>
        </header>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-body-sm sm:grid-cols-2">
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-fg">Admin</dt>
            <dd className="text-fg-muted">
              This console, and everything below.
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-fg">Creator</dt>
            <dd className="text-fg-muted">
              The /me dashboard for their own profiles.
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-fg">Member</dt>
            <dd className="text-fg-muted">Online classes only.</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-fg">None</dt>
            <dd className="text-fg-muted">
              Signed in, but every gated page is closed.
            </dd>
          </div>
        </dl>

        <RoleTable rows={rows} selfId={auth.userId} />

        <p className="max-w-prose text-caption text-fg-subtle">
          A role never puts someone on the public leaderboard — that still runs
          through the provision-creator flow on the overview.
        </p>
      </Section>
    </Container>
  );
}
