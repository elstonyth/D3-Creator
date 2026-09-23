'use client';

/**
 * A line of text with a pencil beside it; the pencil swaps the text for an
 * input. Enter or leaving the field saves, Escape walks away. Nothing is
 * saved when the tidied text is blank or unchanged.
 */

import { useRef, useState } from 'react';
import { cn } from '@gitroom/frontend/lib/utils';
import s from './tracker.module.scss';

export function EditableTitle({
  value,
  onSave,
  editLabel,
  inputLabel,
  className = 'min-w-0 flex-1 truncate',
  onEditingChange,
}: {
  value: string;
  onSave: (next: string) => void;
  editLabel: string;
  inputLabel: string;
  /**
   * The text's full class list, used as given. Not merged through `cn`:
   * tailwind-merge reads `text-body` as a colour and drops it when a colour
   * such as `text-fg` sits in the same call.
   */
  className?: string;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Enter closes the input, and unmounting a focused input can fire blur
  // after it: finish exactly once.
  const closed = useRef(false);

  function open() {
    closed.current = false;
    setDraft(value);
    setEditing(true);
    onEditingChange?.(true);
  }

  function close(save: boolean) {
    if (closed.current) return;
    closed.current = true;
    setEditing(false);
    onEditingChange?.(false);
    const next = draft.replace(/\s+/g, ' ').trim();
    if (save && next && next !== value) onSave(next);
  }

  if (!editing) {
    return (
      <>
        <span className={className}>{value}</span>
        <button
          type="button"
          onClick={open}
          aria-label={editLabel}
          className="rounded-full p-1 text-fg-subtle transition-colors hover:text-fg"
        >
          <Pencil />
        </button>
      </>
    );
  }

  return (
    <input
      autoFocus
      autoComplete="off"
      aria-label={inputLabel}
      value={draft}
      maxLength={200}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          close(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
        }
      }}
      onBlur={() => close(true)}
      className={cn(s.field, 'h-9 min-w-0 flex-1 px-3 text-body')}
    />
  );
}

function Pencil() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
      <path
        d="M10.5 3.5l2 2L6 12l-2.75.75L4 10l6.5-6.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
