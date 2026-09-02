import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { getAdminCreatorDetail } from '@gitroom/frontend/lib/admin-creators';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
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

  return (
    <Container>
      <Section space="sm" className="max-w-prose space-y-8">
        <header>
          <Link
            href="/admin/profiles"
            className="inline-flex items-center gap-1.5 text-caption text-fg-muted underline-offset-4 transition-colors duration-150 ease-out hover:text-fg hover:underline focus-visible:outline-none focus-visible:shadow-focus"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            All accounts
          </Link>
          <h1 className="mt-4 text-display-2 text-fg">{detail.displayName}</h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            Rename the account, repoint or remove its social URLs, and manage
            the login. Every change here takes effect on the next scrape run.
          </p>
        </header>
        <CreatorEditor detail={detail} />
      </Section>
    </Container>
  );
}
