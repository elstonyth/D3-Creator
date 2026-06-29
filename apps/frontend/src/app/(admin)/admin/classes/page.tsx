import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { ClassManager } from './class-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { title: 'Classes — D3 Admin' };

export default async function AdminClassesPage() {
  const auth = await getAuthContext();
  if (!auth) redirect('/login');
  if (auth.role !== 'admin') redirect('/me');

  const admin = getSupabaseAdmin();
  const { data: videos } = await admin
    .from('class_video')
    .select(
      'id, title, description, drive_file_id, visibility, is_published, allow_download, sort_order',
    )
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  return (
    <div className="flex flex-col gap-8 pt-12 pb-24">
      <header className="max-w-[680px]">
        <h1 className="text-display-2 text-fg mb-3">Online classes.</h1>
        <p className="text-body-lg text-fgMuted">
          Add classes by pasting a Google Drive link. Drive files must be shared
          "anyone with the link can view" to play.
        </p>
      </header>
      <ClassManager videos={videos ?? []} />
    </div>
  );
}
