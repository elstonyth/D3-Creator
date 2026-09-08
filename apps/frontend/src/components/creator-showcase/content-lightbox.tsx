'use client';

import { useEffect, useRef, type MouseEvent } from 'react';
import { PLATFORM_ICONS, PLATFORM_LABELS } from '../ui/platform-icons';
import {
  formatDuration,
  formatExact,
  formatPostDateLong,
  PLATFORM_ASPECT,
  type ContentPost,
} from './content-data';

interface ContentLightboxProps {
  post: ContentPost | null;
  onClose: () => void;
}

/**
 * Post detail, in a native <dialog> opened with showModal().
 *
 * The five modal obligations, and where each is met:
 *   focus trap      - native: showModal() makes the rest of the document inert
 *   Escape closes   - the cancel event, routed back through onClose so React
 *                     state and the DOM element never disagree about openness
 *   labelled close  - the button below carries aria-label="Close post"
 *   scroll lock     - body overflow is pinned while open (a modal <dialog>
 *                     does not reliably stop the page behind it scrolling)
 *   focus restored  - the element that opened the dialog is refocused on close
 */
export function ContentLightbox({ post, onClose }: ContentLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;

    if (post && !dlg.open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dlg.showModal();
      document.body.style.overflow = 'hidden';
    } else if (!post && dlg.open) {
      dlg.close();
      document.body.style.overflow = '';
      openerRef.current?.focus();
      openerRef.current = null;
    }
  }, [post]);

  // Escape fires a cancel event on the dialog. Let React drive the close so
  // the parent state clears too - otherwise reopening the same post renders
  // nothing, because post never went back to null.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dlg.addEventListener('cancel', onCancel);
    return () => dlg.removeEventListener('cancel', onCancel);
  }, [onClose]);

  // Unmounting mid-open (a route change) must not leave the page unscrollable.
  useEffect(
    () => () => {
      document.body.style.overflow = '';
    },
    [],
  );

  const closeOnBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={closeOnBackdrop}
      aria-labelledby={post ? 'lightbox-title' : undefined}
      className="m-auto w-[min(94vw,960px)] max-w-[960px] bg-transparent p-0 text-fg backdrop:bg-scrim"
    >
      {post ? <LightboxBody post={post} onClose={onClose} /> : null}
    </dialog>
  );
}

function LightboxBody({
  post,
  onClose,
}: {
  post: ContentPost;
  onClose: () => void;
}) {
  const Icon = PLATFORM_ICONS[post.platform];
  const label = PLATFORM_LABELS[post.platform];
  const published = formatPostDateLong(post.publishedAt);
  const meta = [
    published ? `Published ${published}` : null,
    post.durationSec != null ? `${formatDuration(post.durationSec)} long` : null,
    post.type === 'carousel' && post.mediaCount != null
      ? `${post.mediaCount} image${post.mediaCount === 1 ? '' : 's'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Explicit rows + min-h-0: a grid child defaults to min-height:auto, so
  // without them the detail column refuses to shrink inside max-h-[88vh] and
  // the container clips the caption — taking the CTA at its foot with it.
  return (
    <div className="grid max-h-[88vh] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-2xl border border-line-strong bg-surface-elevated shadow-lg md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-1">
      <div className="flex min-h-0 items-center justify-center bg-canvas-deep">
        <div
          className={`relative max-h-[48vh] w-full md:max-h-[88vh] ${PLATFORM_ASPECT[post.platform]}`}
        >
          {post.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- proxied external media, dimensions vary by platform
            <img
              src={post.thumbnailUrl}
              alt=""
              referrerPolicy="no-referrer"
              decoding="async"
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            <p className="absolute inset-0 flex items-center justify-center p-8 text-body text-fg-muted">
              No image stored for this post.
            </p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col gap-5 overflow-y-auto p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="lightbox-title"
              className="flex items-center gap-2 text-heading text-fg"
            >
              <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface-subtle text-fg">
                <Icon size={14} />
              </span>
              <span className="truncate">{label} post</span>
            </h2>
            {meta ? (
              <p className="mt-1.5 text-caption text-fg-subtle">{meta}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            aria-label="Close post"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-line text-fg-muted transition-colors duration-150 ease-out hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:shadow-focus"
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="h-4 w-4"
            >
              <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
            </svg>
          </button>
        </div>

        {post.caption ? (
          <p className="whitespace-pre-line break-words text-body-sm leading-relaxed text-fg">
            {post.caption}
          </p>
        ) : (
          <p className="text-body-sm text-fg-subtle">No caption.</p>
        )}

        {post.hashtags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {post.hashtags.map((tag) => (
              <li
                key={tag}
                className="inline-flex h-6 items-center rounded border border-line bg-surface-subtle px-2 text-micro text-fg-muted"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {post.metrics.views != null ? (
            <Metric label="Views" value={post.metrics.views} />
          ) : null}
          <Metric label="Likes" value={post.metrics.likes} />
          <Metric label="Comments" value={post.metrics.comments} />
          <Metric label="Shares" value={post.metrics.shares} />
          {post.metrics.saves != null ? (
            <Metric label="Saves" value={post.metrics.saves} />
          ) : null}
        </dl>

        <p className="text-caption text-fg-subtle">
          Counts as of the most recent daily capture, not live.
        </p>

        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-label font-medium text-fg-on-brand transition-colors duration-150 ease-out hover:bg-brand-300 focus-visible:outline-none focus-visible:shadow-focus"
        >
          View on {label}
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M6.5 3.5h6v6M12.5 3.5 4 12" />
          </svg>
        </a>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <dt className="text-micro uppercase text-fg-subtle">{label}</dt>
      <dd className="tnum mt-1 text-body-sm text-fg">{formatExact(value)}</dd>
    </div>
  );
}
