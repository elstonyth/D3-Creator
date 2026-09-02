import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { ClassManager } from './class-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Classes — D3 Admin' };

export default async function AdminClassesPage() {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const admin = getSupabaseAdmin();
  const { data: videos, error } = await admin
    .from('class_video')
    .select(
      'id, title, description, drive_file_id, visibility, is_published, allow_download, sort_order',
    )
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  // Fail closed: a query error must not render as a misleading empty catalog.
  if (error) throw error;

  return (
    <Container>
      <Section space="sm" className="space-y-8">
        <header className="max-w-prose">
          <p className="text-micro uppercase text-fg-subtle">Classes</p>
          <h1 className="mt-3 text-display-2 text-fg">Video library</h1>
          <p className="mt-3 text-body-lg text-fg-muted">
            Each class is a Google Drive file embedded in the members area.
            Drive sharing must be set to{' '}
            <span className="text-fg">anyone with the link can view</span> — a
            private file renders as a black player, not an error.
          </p>
        </header>
        <ClassManager videos={videos ?? []} />
      </Section>
    </Container>
  );
}
