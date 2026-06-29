// apps/frontend/src/app/(public)/classes/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getAuthContext } from '@gitroom/frontend/lib/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Online Classes — D3 Creator' };

export default async function ClassesPage() {
  const auth = await getAuthContext();
  const supabase = await getSupabaseRoute();
  const { data: videos, error } = await supabase
    .from('class_video')
    .select('id, title, description, visibility')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  // Fail closed: a query/RLS failure must not collapse into the "no classes
  // published yet" empty state and hide a real backend outage.
  if (error) throw error;

  return (
    <div className="max-w-[1100px] mx-auto px-6 md:px-8 py-12 flex flex-col gap-8">
      <header className="max-w-[680px]">
        <h1 className="text-display-2 text-fg mb-3">Online classes.</h1>
        <p className="text-body-lg text-fgMuted">
          Watch our class library.{' '}
          {auth && auth.role !== 'none'
            ? 'You have member access.'
            : 'Public sessions are open to all.'}
        </p>
      </header>

      {!auth && (
        <Link
          href="/login?redirectTo=/classes"
          className="glass-subtle border border-borderGlass rounded-xl px-5 py-4 text-label text-aurora-cta hover:bg-white/[0.04] transition-colors"
        >
          Log in to unlock member classes →
        </Link>
      )}

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(videos ?? []).map((v) => (
          <Link
            key={v.id}
            href={`/classes/${v.id}`}
            className="glass-elevated rounded-2xl p-5 flex flex-col gap-2 hover:bg-white/[0.04] transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-caption text-fgSubtle uppercase tracking-wide">
                {v.visibility === 'members' ? 'Members' : 'Public'}
              </span>
            </div>
            <h2 className="text-heading text-fg">{v.title}</h2>
            {v.description && (
              <p className="text-caption text-fgMuted line-clamp-2">
                {v.description}
              </p>
            )}
          </Link>
        ))}
        {(videos ?? []).length === 0 && (
          <p className="text-body text-fgMuted">No classes published yet.</p>
        )}
      </section>
    </div>
  );
}
