// apps/frontend/src/components/admin/creator-connections.tsx
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getAdminConnections } from '@gitroom/frontend/lib/oauth-connections';

export async function CreatorConnections({ creatorId }: { creatorId: string }) {
  const sb = await getSupabaseRoute(); // cookie-aware; RPC is gated by is_admin()
  const rows = await getAdminConnections(sb, creatorId);

  return (
    <section className="glass-subtle border border-borderGlass rounded-2xl p-6 flex flex-col gap-3">
      <h2 className="text-heading text-fg">Connected accounts</h2>
      {rows.length === 0 ? (
        <p className="text-body text-fgMuted">
          This creator hasn’t connected any accounts yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li
              key={`${r.platform}-${i}`}
              className="flex items-center justify-between gap-4"
            >
              <span className="text-body text-fg">
                {r.accountName ?? r.platform}{' '}
                <span className="text-caption text-fgSubtle">
                  · {r.platform}
                </span>
              </span>
              <span className="text-caption text-fgSubtle">
                {r.status}
                {r.accessExpiresAt
                  ? ` · exp ${new Date(r.accessExpiresAt).toLocaleDateString()}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
