import Link from 'next/link';
import { drivePreviewUrl, driveDownloadUrl } from '@gitroom/frontend/lib/drive';
import type { SeriesNav } from '@gitroom/frontend/lib/class-series';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { Badge } from '@gitroom/frontend/components/ui/badge';
import { ButtonLink } from '@gitroom/frontend/components/ui/button';

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
 *
 * Yellow ledger (DESIGN.md §1): the ONE yellow on this screen is the playlist
 * row for the class being watched. Download, prev/next and the back link are
 * deliberately neutral.
 */
export function ClassPlayer({ video, nav, seriesLabel }: ClassPlayerProps) {
  const hasSeries = nav.total > 1;

  return (
    <Section space="md">
      <Container>
        <Link
          href="/classes"
          className="-ml-2 inline-flex min-h-[40px] items-center gap-2 rounded-lg px-2 text-label text-fg-muted transition-colors duration-150 ease-out hover:bg-white/[0.04] hover:text-fg"
        >
          <ArrowGlyph className="h-4 w-4 rotate-180" />
          All classes
        </Link>

        <div
          className={
            hasSeries
              ? 'mt-6 grid grid-cols-1 items-start gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_340px]'
              : 'mt-6 flex max-w-[900px] flex-col gap-6 lg:mt-8'
          }
        >
          {/* Player column */}
          <div className="flex min-w-0 flex-col gap-6">
            {(seriesLabel || (hasSeries && nav.position > 0)) && (
              <div className="flex items-center justify-between gap-3">
                {seriesLabel ? (
                  <span className="min-w-0 truncate text-micro uppercase text-fg-subtle">
                    {seriesLabel}
                  </span>
                ) : (
                  <span />
                )}
                {hasSeries && nav.position > 0 && (
                  <Badge tone="muted" className="tnum shrink-0">
                    Part {nav.position} of {nav.total}
                  </Badge>
                )}
              </div>
            )}

            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-canvas-deep">
              {/* Google Drive's /preview player CROPS the video below a minimum
                  width (its controls/layout assume a desktop-sized frame), so on
                  phones the frame is cut off on both sides. Render the iframe at
                  5x the box (w/h-[500%]) and scale it back down (scale-[0.2]) so
                  the player sees a ~desktop-width viewport and shows the full
                  frame while still fitting our 16:9 box. 5x keeps the internal
                  width above the ~1092px crop threshold even on a 320px phone.
                  The size multiple and the scale are reciprocals — keep them in
                  sync (5 × 0.2 = 1). */}
              <iframe
                src={drivePreviewUrl(video.driveFileId)}
                // Delegate fullscreen to the cross-origin Drive player via
                // Permissions-Policy; the legacy allowFullScreen alone is ignored
                // by strict browsers (e.g. mobile Safari), which hides the button.
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
                className="absolute left-0 top-0 h-[500%] w-[500%] origin-top-left scale-[0.2]"
                title={video.title}
              />
            </div>

            <header className="flex flex-col gap-3">
              <h1 className="text-section text-fg">{video.title}</h1>
              {video.description && (
                <p className="max-w-prose whitespace-pre-line break-words text-body text-fg-muted">
                  {video.description}
                </p>
              )}
              {video.allowDownload && (
                <ButtonLink
                  variant="secondary"
                  size="sm"
                  href={driveDownloadUrl(video.driveFileId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 w-fit max-sm:h-10 max-sm:px-4"
                >
                  <DownloadGlyph className="h-4 w-4" />
                  Download video
                  <span className="sr-only"> (opens Google Drive in a new tab)</span>
                </ButtonLink>
              )}
            </header>

            {hasSeries && (nav.prev || nav.next) && (
              <nav
                aria-label="Session navigation"
                className="grid grid-cols-1 gap-3 border-t border-line-subtle pt-6 sm:grid-cols-2"
              >
                <PrevNext dir="prev" item={nav.prev} />
                <PrevNext dir="next" item={nav.next} />
              </nav>
            )}
          </div>

          {/* Playlist rail */}
          {hasSeries && (
            <aside
              aria-labelledby="series-playlist-heading"
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 lg:sticky lg:top-20"
            >
              <div className="flex items-center justify-between gap-3 px-1">
                <h2 id="series-playlist-heading" className="text-label text-fg">
                  In this series
                </h2>
                <span className="tnum shrink-0 text-caption text-fg-subtle">
                  {nav.total} sessions
                </span>
              </div>
              <ol className="flex flex-col gap-1 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto">
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
      </Container>
    </Section>
  );
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M4.5 3.2 12.6 8l-8.1 4.8z" />
    </svg>
  );
}

function ArrowGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
    </svg>
  );
}

function DownloadGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 2.5v7.5M5 7.5 8 10.5l3-3M3 12.5h10" />
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
    'min-w-0 min-h-[56px] rounded-xl border px-4 py-2.5 flex items-center gap-3 transition-colors duration-150 ease-out';
  // The missing end of the series keeps its slot on the two-column desktop
  // layout so the pair never reflows, but it is inert, hidden from assistive
  // tech, and dropped entirely on mobile where it would just eat a row.
  if (!item) {
    return (
      <span
        aria-hidden="true"
        className={`${base} hidden border-line-subtle text-caption text-fg-subtle sm:flex ${
          dir === 'next' ? 'justify-end' : ''
        }`}
      >
        {dir === 'prev' ? 'Start of the series' : 'End of the series'}
      </span>
    );
  }
  return (
    <Link
      href={`/classes/${item.id}`}
      className={`${base} border-line text-fg hover:border-line-strong hover:bg-white/[0.03] ${
        dir === 'next' ? 'flex-row-reverse text-right' : ''
      }`}
    >
      <ArrowGlyph
        className={`h-4 w-4 shrink-0 text-fg-muted ${
          dir === 'prev' ? 'rotate-180' : ''
        }`}
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-micro uppercase text-fg-subtle">
          {dir === 'prev' ? 'Previous session' : 'Next session'}
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
  const cls = `group flex items-center gap-3 rounded-xl border px-3 py-2.5 min-h-[52px] transition-colors duration-150 ease-out ${
    current
      ? 'border-brand/25 bg-brand/[0.06]'
      : 'border-transparent hover:border-line hover:bg-white/[0.03]'
  }`;
  const inner = (
    <>
      <span
        className={`tnum w-5 shrink-0 text-right text-body-sm ${
          current ? 'font-semibold text-fg' : 'text-fg-subtle'
        }`}
      >
        {index}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-body-sm text-fg">{item.title}</span>
        <span
          className={`text-micro normal-case tracking-normal ${
            current ? 'text-brand' : 'text-fg-subtle'
          }`}
        >
          {current ? 'Now playing' : `Session ${index}`}
        </span>
      </span>
      <PlayGlyph
        className={`h-3 w-3 shrink-0 ${
          current ? 'text-brand' : 'text-fg-subtle group-hover:text-fg'
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
