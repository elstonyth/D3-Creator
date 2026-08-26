/**
 * /studio/settings — Amendment 1 Part C.i (owner decision 10).
 *
 * Reads the caller's ACTIVE `user_profile` row directly through RLS, the same
 * way every other Studio Server Component reads. There is no GET endpoint and
 * none is needed.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

import { ProfileSettingsForm } from '@gitroom/frontend/components/studio/settings/profile-settings-form';
import { StudioLocked } from '@gitroom/frontend/components/studio/studio-locked';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import { getAuthContext, isStudioMember } from '@gitroom/frontend/lib/auth';
import type { BusinessProfile } from '@gitroom/frontend/lib/business-profile';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';

export const dynamic = 'force-dynamic'; // per-user, auth-dependent, never cacheable
export const metadata: Metadata = {
  title: 'Settings — D3 Creator',
  robots: { index: false, follow: false },
};

export default async function StudioSettingsPage(): Promise<ReactElement> {
  const auth = await getAuthContext();
  if (!auth) redirect('/login?redirectTo=/studio/settings');
  if (!isStudioMember(auth)) return <StudioLocked />;

  // `maybeSingle()` is safe because of the partial unique index
  // `user_profile_one_active_per_user`.
  const supabase = await getSupabaseRoute();
  const { data, error } = await supabase
    .from('user_profile')
    .select('*')
    .eq('user_id', auth.userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  const profile = data as BusinessProfile | null;

  return (
    <div className="max-w-[880px] mx-auto py-12 flex flex-col gap-10">
      <header className="max-w-[62ch] flex flex-col gap-3">
        <h1 className="text-display-2 text-fg">Your business.</h1>
        <p className="text-body-lg text-fgMuted">
          Everything the coach knows about what you sell and how you sound. It
          shapes every script and every video analysis.
        </p>
      </header>

      {profile === null ? (
        // Deliberately NOT a second capture form: two surfaces that both create
        // rows is how a user ends up with two businesses by accident.
        <EmptyState
          size="lg"
          title="No business set up yet"
          description="Answer four questions in Script Coach and this page fills in with the rest."
          action={{ href: '/studio/chat', label: 'Start in Script Coach' }}
        />
      ) : (
        <>
          <ProfileSettingsForm profile={profile} />
          <p className="text-body-sm text-fgSubtle">
            Changes apply to your next script or analysis. Nothing already
            generated is rewritten.{' '}
            <Link
              href="/studio/analyzer"
              className="text-fgMuted hover:text-fg transition-colors duration-150 ease-out"
            >
              Analyze a video
            </Link>{' '}
            to see it used.
          </p>
        </>
      )}
    </div>
  );
}
