import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { resolveCreatorProfiles } from '@gitroom/frontend/lib/creator-metrics';
import { SignOutButton } from '@gitroom/frontend/components/auth/signout-button';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { ButtonLink } from '@gitroom/frontend/components/ui/button';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Account — D3 Creator',
};

export default async function AccountPage() {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role === 'admin') redirect('/admin');

  // Current display name lives on the linked creator row (may not exist yet for
  // a brand-new creator — that's fine, the field starts blank and saving
  // provisions it). Same client also resolves how many profiles this user
  // tracks — via the shared resolver so the count matches /me + /me/leaderboard.
  const sb = await getSupabaseRoute();
  let displayName = '';
  const creatorId = auth.creatorLink?.creator_id ?? null;
  if (creatorId) {
    const { data } = await sb
      .from('creator')
      .select('display_name')
      .eq('id', creatorId)
      .maybeSingle();
    displayName = data?.display_name ?? '';
  }
  const { profiles } = await resolveCreatorProfiles(sb, {
    userId: auth.userId,
    creatorId,
  });
  const tracked = profiles.length;

  return (
    <Container className="pb-16">
      {/* One Section for the whole page so the rhythm matches /me: a bare div
          between two Sections contributes no spacing of its own. */}
      <Section space="sm" className="flex flex-col gap-10 sm:gap-12">
        <header className="max-w-prose">
          <h1 className="text-display-2 text-fg">Your account.</h1>
          <p className="mt-4 text-body-lg text-fg-muted">
            Your agency owns the creator record and the accounts attached to it.
            This page shows what we hold, and lets you sign out.
          </p>
        </header>

        <div>
          {/* One panel of hairline-separated rows, not three floating cards —
            these are three facts about one account, not three features. */}
          <dl className="max-w-prose divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line bg-surface">
            <Row
              term="Creator name"
              note="Shown wherever your work appears on D3. Your agency can change it."
            >
              <span className={displayName ? 'text-fg' : 'text-fg-subtle'}>
                {displayName || 'Not set yet'}
              </span>
            </Row>

            <Row
              term="Signed in as"
              note="Used for sign-in and account recovery."
            >
              <span className="block truncate text-fg">{auth.email}</span>
            </Row>

            <Row
              term="Tracked accounts"
              note="Every profile feeding the numbers on your dashboard."
            >
              <span className="tnum text-fg">
                {tracked === 0
                  ? 'None yet'
                  : `${tracked} account${tracked === 1 ? '' : 's'}`}
              </span>
            </Row>
          </dl>

          <div className="mt-6 flex max-w-prose flex-wrap items-center gap-3">
            <ButtonLink href="/me" variant="secondary">
              Back to your numbers
            </ButtonLink>
            <SignOutButton />
          </div>
        </div>
      </Section>
    </Container>
  );
}

function Row({
  term,
  note,
  children,
}: {
  term: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-baseline sm:gap-6 sm:py-5">
      <dt className="text-label text-fg-muted sm:w-44 sm:shrink-0">{term}</dt>
      <dd className="min-w-0 flex-1 text-body">
        {children}
        <span className="mt-1 block text-caption text-fg-subtle">{note}</span>
      </dd>
    </div>
  );
}
