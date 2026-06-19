import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getAdminCreatorDetail } from '@gitroom/frontend/lib/admin-creators';
import { getAdminOwnedInsights } from '@gitroom/frontend/lib/owned-insights';
import { CreatorConnections } from '@gitroom/frontend/components/admin/creator-connections';
import { InsightsPanel } from '@gitroom/frontend/components/insights/insights-panel';
import { CreatorEditor } from './creator-editor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Admin · Edit creator — D3 Creator',
};

export default async function AdminCreatorEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const detail = await getAdminCreatorDetail(getSupabaseAdmin(), id);
  if (!detail) notFound();

  const sb = await getSupabaseRoute();
  const { data: profs } = await getSupabaseAdmin()
    .from('profile')
    .select('id')
    .eq('creator_id', id);
  const adminInsights = await Promise.all(
    (profs ?? []).map(async (p) => ({
      profileId: p.id as string,
      data: await getAdminOwnedInsights(sb, p.id as string),
    })),
  );

  return (
    <div className="flex flex-col gap-10 pt-12 pb-24 max-w-[760px]">
      <header>
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-subtle border border-borderGlass text-caption text-aurora-cta mb-6">
          <span className="inline-block size-1.5 rounded-full bg-aurora-cta" />
          Admin · Edit creator
        </span>
        <h1 className="text-display-2 text-fg mb-4">{detail.displayName}</h1>
        <p className="text-body-lg text-fgMuted">
          Manage this creator&apos;s name, social URLs, and login.{' '}
          <Link
            href="/admin/profiles"
            className="text-aurora-cta underline underline-offset-4"
          >
            ← Back to accounts
          </Link>
        </p>
      </header>
      <CreatorEditor detail={detail} />
      <CreatorConnections creatorId={id} />
      {adminInsights
        .filter(
          (x) =>
            x.data &&
            (x.data.profile.length > 0 || x.data.demographics.length > 0),
        )
        .map((x) => (
          <InsightsPanel key={x.profileId} data={x.data!} />
        ))}
    </div>
  );
}
