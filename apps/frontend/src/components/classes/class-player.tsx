import Link from 'next/link';
import { drivePreviewUrl, driveDownloadUrl } from '@gitroom/frontend/lib/drive';
import type { SeriesNav } from '@gitroom/frontend/lib/class-series';

type PlaylistItem = { id: string; title: string };

export interface ClassPlayerProps {
  video: {
    id: string;
    title: string;
    description: string | null;
    driveFileId: string;
    allowDownload: boolean;
  };
  nav: SeriesNav<PlaylistItem>;
  /** Series/collection name shown as an eyebrow; null hides it. */
  seriesLabel: string | null;
}

/**
 * Course-player layout for a single class: the Drive video, series context
 * (eyebrow + "Part N of M"), prev/next, and a playlist of every session in the
 * series. Single column on mobile; on lg+ the playlist becomes a sticky right
 * rail beside a larger video. Purely presentational — the page feeds it data.
 */
export function ClassPlayer({ video, nav, seriesLabel }: ClassPlayerProps) {
  const hasSeries = nav.total > 1;

  return (
    <div className="max-w-[1100px] mx-auto px-6 md:px-8 py-12 flex flex-col gap-8">
      <Link
        href="/classes"
        className="w-fit text-caption text-fgMuted hover:text-fg transition-colors"
      >
        ← All classes
      </Link>

      <div
        className={
          hasSeries
            ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start'
            : 'flex flex-col gap-6 max-w-[900px]'
        }
      >
        {/* Player column */}
        <div className="flex min-w-0 flex-col gap-6">
          {(seriesLabel || nav.position > 0) && (
            <div className="flex items-center justify-between gap-3">
              {seriesLabel ? (
                <span className="min-w-0 truncate text-micro uppercase tracking-[0.04em] text-fgSubtle">
                  {seriesLabel}
                </span>
              ) : (
                <span />
              )}
              {nav.position > 0 && (
                <span className="shrink-0 rounded-full border border-borderGlass glass-subtle px-3 py-1 text-caption text-fgMuted tabular-nums">
                  Part {nav.position} of {nav.total}
                </span>
              )}
            </div>
          )}

          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-borderGlass bg-black">
            <iframe
              src={drivePreviewUrl(video.driveFileId)}
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="h-full w-full"
              title={video.title}
            />
          </div>

          <header className="flex flex-col gap-2">
            <h1 className="text-display-2 text-fg">{video.title}</h1>
            {video.description && (
              <p className="whitespace-pre-line break-words text-body text-fgMuted">
                {video.description}
              </p>
            )}
            {video.allowDownload && (
              <a
                href={driveDownloadUrl(video.driveFileId)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 w-fit text-label text-aurora-cta underline underline-offset-4"
              >
                Download video
              </a>
            )}
          </header>

          {hasSeries && (nav.prev || nav.next) && (
            <nav aria-label="Course navigation" className="flex gap-3">
              <PrevNext dir="prev" item={nav.prev} />
              <PrevNext dir="next" item={nav.next} />
            </nav>
          )}
        </div>

        {/* Playlist rail */}
        {hasSeries && (
          <aside className="flex flex-col gap-3 rounded-2xl border border-borderGlass glass-base p-4 lg:sticky lg:top-20">
            <div className="flex items-center justify-between px-1">
              <span className="text-label font-medium text-fg">
                In this series
              </span>
              <span className="text-caption text-fgSubtle tabular-nums">
                {nav.total} sessions
              </span>
            </div>
            <ol className="flex flex-col gap-1.5">
              {nav.items.map((item, i) => (
                <PlaylistRow
                  key={item.id}
                  item={item}
                  index={i + 1}
                  current={item.id === video.id}
                />
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>
  );
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 3l9 5-9 5z" />
    </svg>
  );
}

function PrevNext({
  dir,
  item,
}: {
  dir: 'prev' | 'next';
  item: PlaylistItem | null;
}) {
  const base =
    'flex-1 min-w-0 h-12 rounded-xl border px-3 flex items-center gap-2 transition-colors';
  if (!item) {
    return (
      <span
        aria-hidden="true"
        className={`${base} justify-center border-borderGlass/50 text-caption text-fgSubtle/40`}
      >
        {dir === 'prev' ? '← Prev' : 'Next →'}
      </span>
    );
  }
  return (
    <Link
      href={`/classes/${item.id}`}
      className={`${base} border-borderGlass text-fg hover:border-borderGlassStrong hover:bg-white/[0.03] ${
        dir === 'next' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <span className="shrink-0 text-fgMuted">
        {dir === 'prev' ? '←' : '→'}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-micro uppercase tracking-[0.04em] text-fgSubtle">
          {dir === 'prev' ? 'Prev' : 'Next'}
        </span>
        <span className="truncate text-body-sm text-fg">{item.title}</span>
      </span>
    </Link>
  );
}

function PlaylistRow({
  item,
  index,
  current,
}: {
  item: PlaylistItem;
  index: number;
  current: boolean;
}) {
  const cls = `group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
    current
      ? 'bg-brand/[0.06] border-brand/25'
      : 'border-transparent hover:border-borderGlass hover:bg-white/[0.03]'
  }`;
  const inner = (
    <>
      <span
        className={`w-6 shrink-0 font-mono text-body-sm tabular-nums ${
          current ? 'font-semibold text-brand' : 'text-fgSubtle'
        }`}
      >
        {String(index).padStart(2, '0')}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-sm text-fg">{item.title}</span>
        <span
          className={`text-micro ${current ? 'text-brand' : 'text-fgSubtle'}`}
        >
          {current ? 'Now playing' : `Session ${index}`}
        </span>
      </span>
      <PlayGlyph
        className={`shrink-0 ${
          current ? 'text-brand' : 'text-fgSubtle/40 group-hover:text-fgMuted'
        }`}
      />
    </>
  );
  return (
    <li>
      {current ? (
        <div className={cls} aria-current="true">
          {inner}
        </div>
      ) : (
        <Link href={`/classes/${item.id}`} className={cls}>
          {inner}
        </Link>
      )}
    </li>
  );
}
