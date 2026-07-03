// apps/frontend/src/app/(public)/classes/[id]/page.tsx
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import {
  buildSeriesNav,
  deriveSeriesLabel,
} from '@gitroom/frontend/lib/class-series';
import { ClassPlayer } from '@gitroom/frontend/components/classes/class-player';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Class — D3 Creator' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClassPlayerPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const auth = await getAuthContext();
  const supabase = await getSupabaseRoute();
  const { data: video, error } = await supabase
    .from('class_video')
    .select('id, title, description, drive_file_id, visibility, allow_download')
    .eq('id', id)
    .maybeSingle();

  // A real query/RLS failure must not masquerade as "no row" (which would send
  // anon to login and members to a 404). Surface it instead.
  if (error) throw error;

  // RLS already hides drafts + (for anon) members-only rows. If a not-logged-in
  // user requested a members-only class, RLS returns null — send them to login
  // instead of a bare 404 so they can sign in and come back.
  if (!video) {
    if (!auth) redirect(`/login?redirectTo=/classes/${id}`);
    notFound();
  }

  // Sibling classes drive the playlist + prev/next. Same table + RLS as the
  // single fetch, so a viewer only ever sees classes they're allowed to.
  // ponytail: there's one course today, so "the series" == every visible class;
  // add a collection column if distinct courses ever need separate playlists.
  const { data: siblings, error: siblingsError } = await supabase
    .from('class_video')
    .select('id, title')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (siblingsError) throw siblingsError;

  const items =
    siblings && siblings.length > 0
      ? siblings
      : [{ id: video.id, title: video.title }];
  const nav = buildSeriesNav(items, video.id);

  return (
    <ClassPlayer
      video={{
        id: video.id,
        title: video.title,
        description: video.description,
        driveFileId: video.drive_file_id,
        allowDownload: video.allow_download,
      }}
      nav={nav}
      seriesLabel={deriveSeriesLabel(video.title)}
    />
  );
}
