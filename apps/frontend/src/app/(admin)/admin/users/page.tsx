import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
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
    <div className="flex flex-col gap-8 pt-12 pb-24">
      <header className="max-w-[680px]">
        <h1 className="text-display-2 text-fg mb-3">Users &amp; roles.</h1>
        <p className="text-body-lg text-fgMuted">
          Assign each account a role. Members watch classes; creators get the
          /me dashboard; &ldquo;none&rdquo; revokes access. Public listing still
          requires the provision-creator flow.
        </p>
      </header>
      <RoleTable rows={rows} selfId={auth.userId} />
    </div>
  );
}
