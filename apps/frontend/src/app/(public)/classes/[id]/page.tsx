// apps/frontend/src/app/(public)/classes/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { isUuid } from '@gitroom/frontend/lib/ids';
import { drivePreviewUrl, driveDownloadUrl } from '@gitroom/frontend/lib/drive';

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
  const { data: video } = await supabase
    .from('class_video')
    .select('id, title, description, drive_file_id, visibility, allow_download')
    .eq('id', id)
    .maybeSingle();

  // RLS already hides drafts + (for anon) members-only rows. If a not-logged-in
  // user requested a members-only class, RLS returns null — send them to login
  // instead of a bare 404 so they can sign in and come back.
  if (!video) {
    if (!auth) redirect(`/login?redirectTo=/classes/${id}`);
    notFound();
  }

  return (
    <div className="max-w-[900px] mx-auto px-6 md:px-8 py-12 flex flex-col gap-6">
      <Link
        href="/classes"
        className="text-caption text-fgMuted hover:text-fg transition-colors"
      >
        ← All classes
      </Link>
      <div className="aspect-video w-full overflow-hidden rounded-2xl border border-borderGlass bg-black">
        <iframe
          src={drivePreviewUrl(video.drive_file_id)}
          allow="autoplay; encrypted-media"
          allowFullScreen
          className="w-full h-full"
          title={video.title}
        />
      </div>
      <header className="flex flex-col gap-2">
        <h1 className="text-display-2 text-fg">{video.title}</h1>
        {video.description && (
          <p className="text-body text-fgMuted">{video.description}</p>
        )}
        {video.allow_download && (
          <a
            href={driveDownloadUrl(video.drive_file_id)}
            className="text-label text-aurora-cta underline underline-offset-4 w-fit"
            target="_blank"
            rel="noopener noreferrer"
          >
            Download video
          </a>
        )}
      </header>
    </div>
  );
}
