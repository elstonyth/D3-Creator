'use client';

/**
 * Drag and drop for the work trackers, with a mouse, a finger or a pen:
 * pointer events, not HTML5 drag and drop, which never fires on a touch
 * screen.
 *
 * - A press becomes a drag only once the pointer travels a few pixels, so a
 *   click stays a click. A mouse picks an item up anywhere on it; a finger
 *   only by its grip handle (`data-drag-handle`, touch-action: none), so the
 *   page still scrolls under a finger everywhere else. Nothing starts from a
 *   button, link or field inside the item.
 * - While dragging, a ghost label follows the pointer, the page scrolls
 *   itself near the top and bottom edges, and the drop target under the
 *   pointer — any element with `data-drop="…"` that `accepts` — is marked
 *   `data-drop-over`. Escape, leaving the window, or a mouse button let go
 *   outside it cancels; the click a drop would fire is swallowed.
 */

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/** How far a press travels before it is a drag, in px. */
const SLOP = 6;
/** How close to the top or bottom edge the page starts scrolling, in px. */
const EDGE = 72;
const MAX_STEP = 16;
const INTERACTIVE = 'button, a, input, select, textarea, label';

/** How far to scroll the page this frame with the pointer at `y`. */
export function edgeScroll(y: number, height: number): number {
  if (y < EDGE) return -Math.min(MAX_STEP, Math.ceil((EDGE - y) / 4));
  if (y > height - EDGE)
    return Math.min(MAX_STEP, Math.ceil((y - height + EDGE) / 4));
  return 0;
}

export interface DropTarget {
  /** Its `data-drop` value. */
  key: string;
  el: HTMLElement;
}

interface Session {
  id: string;
  pointerId: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  dragging: boolean;
  over: DropTarget | null;
  frame: number;
}

export function useDrag({
  accepts,
  onOver,
  onDrop,
}: {
  accepts: (id: string, key: string) => boolean;
  /** Every move while dragging: the target under the pointer, if accepted. */
  onOver?: (id: string, over: DropTarget | null, y: number) => void;
  onDrop: (id: string, key: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  // The latest callbacks, so the window listeners never call stale ones.
  const calls = useRef({ accepts, onOver, onDrop });
  useEffect(() => {
    calls.current = { accepts, onOver, onDrop };
  });
  const session = useRef<Session | null>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  const stop = useRef<() => void>(() => {});

  // A drag cut short by the component going away (a refresh, a new page)
  // leaves no listener behind.
  useEffect(() => () => stop.current(), []);

  // Where the pointer is now: the ghost, and the target under it.
  function place(s: Session) {
    ghost.current?.style.setProperty(
      'transform',
      `translate(${s.x + 14}px, ${s.y + 14}px)`,
    );
    const hit = document.elementFromPoint?.(s.x, s.y);
    const el =
      hit instanceof Element
        ? (hit.closest('[data-drop]') as HTMLElement | null)
        : null;
    const key = el?.dataset.drop;
    const over =
      el && key && calls.current.accepts(s.id, key) ? { key, el } : null;
    if (over?.el !== s.over?.el) {
      s.over?.el.removeAttribute('data-drop-over');
      over?.el.setAttribute('data-drop-over', '');
    }
    s.over = over;
    calls.current.onOver?.(s.id, over, s.y);
  }

  function start(id: string, e: ReactPointerEvent) {
    if (session.current) return;
    const target = e.target as Element;
    if (target.closest(INTERACTIVE)) return;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return;
      // No text selection while dragging.
      e.preventDefault();
    } else if (!target.closest('[data-drag-handle]')) return;

    const s: Session = {
      id,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
      over: null,
      frame: 0,
    };
    session.current = s;

    // Scrolling near an edge, and hit-testing again as the page moves under
    // a pointer held still (no pointermove fires then).
    function tick() {
      const step = edgeScroll(s.y, window.innerHeight);
      if (step !== 0) {
        window.scrollBy(0, step);
        place(s);
      }
      s.frame = requestAnimationFrame(tick);
    }
    function move(ev: PointerEvent) {
      if (ev.pointerId !== s.pointerId) return;
      // The button was let go where the page never heard it (outside the
      // window): that drag is over, and drops nowhere.
      if (ev.pointerType === 'mouse' && ev.buttons === 0) return end(false);
      s.x = ev.clientX;
      s.y = ev.clientY;
      if (!s.dragging) {
        if (Math.hypot(s.x - s.x0, s.y - s.y0) < SLOP) return;
        s.dragging = true;
        setDragId(id);
        s.frame = requestAnimationFrame(tick);
      }
      ev.preventDefault();
      place(s);
    }
    function up(ev: PointerEvent) {
      if (ev.pointerId === s.pointerId) end(true);
    }
    function cancel(ev: PointerEvent) {
      if (ev.pointerId === s.pointerId) end(false);
    }
    function escape(ev: KeyboardEvent) {
      if (ev.key === 'Escape') end(false);
    }
    function blur() {
      end(false);
    }
    // The click a drop fires lands on whatever is under the pointer.
    function swallow(ev: Event) {
      ev.stopPropagation();
      ev.preventDefault();
    }
    function cleanup() {
      cancelAnimationFrame(s.frame);
      s.over?.el.removeAttribute('data-drop-over');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', blur);
      session.current = null;
      stop.current = () => {};
      setDragId(null);
    }
    function end(drop: boolean) {
      const { dragging, over } = s;
      cleanup();
      if (!dragging) return;
      window.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(
        () => window.removeEventListener('click', swallow, { capture: true }),
        0,
      );
      if (drop && over) calls.current.onDrop(s.id, over.key);
    }
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', blur);
    stop.current = cleanup;
  }

  /** The label that follows the pointer while `dragId` is being dragged. */
  function ghostOf(label: ReactNode) {
    if (dragId === null) return null;
    return createPortal(
      <div
        ref={(el) => {
          ghost.current = el;
          const s = session.current;
          if (el && s)
            el.style.transform = `translate(${s.x + 14}px, ${s.y + 14}px)`;
        }}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[60] max-w-[260px] truncate rounded-xl border border-white/15 bg-surface px-3 py-2 text-label text-fg shadow-glass"
      >
        {label}
      </div>,
      document.body,
    );
  }

  return { dragId, start, ghostOf };
}
