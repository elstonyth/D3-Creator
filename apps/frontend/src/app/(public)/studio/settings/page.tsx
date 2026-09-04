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
import { Container, Section } from '@gitroom/frontend/components/ui/section';
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
    <Section space="md">
      {/* Narrower than the 1200px page container: this is a form, and a label
          and its field must not sit 900px apart. */}
      <Container className="max-w-[900px] flex flex-col gap-10">
        <header className="max-w-prose flex flex-col gap-3">
          <h1 className="text-display-2 text-fg">Your business.</h1>
          <p className="text-body-lg text-fg-muted">
            Everything the coach knows about what you sell and how you sound. It
            shapes every script it writes and every video it scores.
          </p>
        </header>

        {profile === null ? (
          // Deliberately NOT a second capture form: two surfaces that both
          // create rows is how a user ends up with two businesses by accident.
          <EmptyState
            size="lg"
            title="No business set up yet"
            description="Answer four questions in Script Coach and this page fills in with the rest — tone, content pillars, things to avoid."
            action={{ href: '/studio/chat', label: 'Start in Script Coach' }}
          />
        ) : (
          <>
            <ProfileSettingsForm profile={profile} />
            <p className="max-w-prose text-body-sm text-fg-subtle">
              Changes apply to your next script or analysis. Nothing already
              generated is rewritten.{' '}
              <Link
                href="/studio/analyzer"
                className="text-fg-muted underline underline-offset-4 hover:text-fg transition-colors duration-150 ease-out"
              >
                Analyse a video
              </Link>{' '}
              to see it used.
            </p>
          </>
        )}
      </Container>
    </Section>
  );
}
