// apps/frontend/src/app/(creator)/me/connections/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getMyConnections } from '@gitroom/frontend/lib/oauth-connections';
import { getMyOwnedInsights } from '@gitroom/frontend/lib/owned-insights';
import { InsightsPanel } from '@gitroom/frontend/components/insights/insights-panel';
import { ConnectButtons } from './connect-buttons';
import { MetaPicker, type MetaTargetView } from './meta-picker';
import { DisconnectButton } from './disconnect-button';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Connected accounts — D3 Creator' };

function readPicker(raw: string | undefined): MetaTargetView[] | null {
  if (!raw) return null;
  try {
    const stash = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as {
      targets: MetaTargetView[];
    };
    return stash.targets ?? null;
  } catch {
    return null;
  }
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ pick?: string; connected?: string; error?: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role === 'admin') redirect('/admin');

  const sb = await getSupabaseRoute();
  const connections = await getMyConnections(sb);
  // Pull insights for each owned profile the user has (owner claims). The RPC is
  // owner-guarded, so a non-owned profile returns null and is skipped.
  const { data: claims } = await sb
    .from('profile_claim')
    .select('profile_id')
    .eq('claim_kind', 'owner');
  const insightsByProfile = await Promise.all(
    (claims ?? []).map(async (c) => ({
      profileId: c.profile_id as string,
      data: await getMyOwnedInsights(sb, c.profile_id as string),
    })),
  );
  const sp = await searchParams;
  const picker =
    sp.pick === 'meta'
      ? readPicker((await cookies()).get('meta_pending')?.value)
      : null;

  return (
    <div className="flex flex-col gap-10 pt-12 pb-24 max-w-[640px]">
      <header>
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-subtle border border-borderGlass text-caption text-fgMuted mb-6">
          <span className="inline-block size-1.5 rounded-full bg-aurora-cta" />
          Connections
        </span>
        <h1 className="text-display-2 text-fg mb-4">Connect your accounts.</h1>
        <p className="text-body-lg text-fgMuted">
          Link your own Instagram, Facebook, or TikTok to unlock owner-only
          insights (reach, impressions, demographics). You can disconnect
          anytime.
        </p>
      </header>

      {sp.error ? (
        <p className="text-caption text-red-400">
          Connection failed ({sp.error}). Please try again.
        </p>
      ) : null}
      {sp.connected ? (
        <p className="text-caption text-aurora-cta">
          Connected {sp.connected}.{' '}
        </p>
      ) : null}

      {picker && picker.length > 0 ? <MetaPicker targets={picker} /> : null}

      <section className="glass-subtle border border-borderGlass rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="text-heading text-fg">Connected accounts</h2>
        {connections.length === 0 ? (
          <p className="text-body text-fgMuted">No accounts connected yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {connections.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-body text-fg truncate">
                    {c.accountName ?? c.platform}{' '}
                    <span className="text-caption text-fgSubtle">
                      · {c.platform}
                    </span>
                  </div>
                  <div className="text-caption text-fgSubtle">
                    {c.status}
                    {c.accessExpiresAt
                      ? ` · expires ${new Date(c.accessExpiresAt).toLocaleDateString()}`
                      : ''}
                  </div>
                </div>
                <DisconnectButton connectionId={c.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {insightsByProfile
        .filter((x) => x.data)
        .map((x) => (
          <InsightsPanel key={x.profileId} data={x.data!} />
        ))}

      <section className="glass-subtle border border-borderGlass rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="text-heading text-fg">Add a connection</h2>
        <ConnectButtons />
      </section>
    </div>
  );
}
