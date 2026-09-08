'use client';

/**
 * The player / transcript pair — PRD 3 §6.5 item 5. The report page's one
 * client island.
 *
 * The player's presence depends on the video source ALONE, never on the
 * transcript. The two conditions are independent: an empty transcript with a
 * working video shows the player and the "no speech" line; a full transcript
 * with no video shows plain rows and no player.
 */

import { useRef, useState, type ReactElement } from 'react';

import {
  formatTimecode,
  type TranscriptSegment,
} from '@gitroom/frontend/lib/analyzer-contract';
import { cn } from '@gitroom/frontend/lib/utils';

/** The full row recipe. Plain rows keep it minus the hover and active states,
 *  so the list does not reflow when the player is absent. */
const ROW =
  'w-full text-left flex gap-4 px-4 py-3 min-h-[48px] transition-colors duration-150 ease-out';

export function TranscriptPlayer({
  videoSrc,
  segments,
}: {
  videoSrc: string | null;
  segments: TranscriptSegment[];
}): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  function onTimeUpdate() {
    const at = videoRef.current?.currentTime ?? 0;
    // The scan assumes the transcript is ascending by `start` (PRD 1 §8.7.5)
    // and breaks at the first line past the playhead.
    let next = -1;
    for (let i = 0; i < segments.length; i += 1) {
      if (segments[i].start <= at) next = i;
      else break;
    }
    // timeupdate fires ~4x/second — only set state when the index changes.
    setActiveIndex((prev) => (prev === next ? prev : next));
  }

  function seek(seconds: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    // A rejected play() promise (autoplay policy) is swallowed — the seek has
    // already landed.
    void video.play().catch(() => undefined);
  }

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {videoSrc !== null && (
        // Sticky at lg so the player stays in view while a long transcript
        // scrolls past it. `top-20` clears the 56px sticky header.
        <div className="lg:w-[360px] shrink-0 lg:sticky lg:top-20 lg:self-start">
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            preload="metadata"
            onTimeUpdate={onTimeUpdate}
            className="w-full aspect-video rounded-xl border border-line bg-surface"
          />
        </div>
      )}

      {segments.length === 0 ? (
        <div className="flex-1 min-w-0 rounded-2xl border border-line bg-surface-subtle px-5 py-6">
          <p className="text-body text-fg-muted">
            No speech was detected in this video.
          </p>
          <p className="mt-1 text-caption text-fg-subtle">
            The scores above are based on what the analyst could see, not on a
            transcript.
          </p>
        </div>
      ) : (
        <ol className="flex-1 min-w-0 divide-y divide-line-subtle overflow-hidden rounded-2xl border border-line bg-surface-subtle">
          {segments.map((segment, index) => {
            const active = index === activeIndex;
            const body = (
              <>
                <span className="tnum w-12 shrink-0 text-caption text-fg-subtle leading-6">
                  {formatTimecode(segment.start)}
                </span>
                {/* No colour class — the colour is the row's, so the active
                    state is not overridden by its own child. */}
                <span className="text-body">{segment.text}</span>
              </>
            );
            return (
              <li key={`${segment.start}-${index}`}>
                {videoSrc === null ? (
                  // Never a button that looks clickable and does nothing.
                  <div className={cn(ROW, 'text-fg-muted')}>{body}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => seek(segment.start)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      ROW,
                      // Not yellow — this screen's yellow is Download report.
                      active
                        ? 'bg-white/[0.05] text-fg'
                        : 'text-fg-muted hover:bg-white/[0.025] hover:text-fg',
                    )}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
