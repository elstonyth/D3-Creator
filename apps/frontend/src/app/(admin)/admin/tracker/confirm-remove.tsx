'use client';

import { useId } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import clsx from 'clsx';
import s from './tracker.module.scss';

/**
 * The inline "are you sure" strip. Never `window.confirm`: embedded browsers
 * auto-dismiss native dialogs (the Claude desktop pane returns false in 1 ms),
 * which turns the button into a no-op.
 */
export function ConfirmRemove({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  className,
}: {
  message: string;
  /** The confirm button's text; `Remove` when not given. */
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  // The strip is named by its question, so a screen reader that lands on
  // Cancel still hears what is being asked.
  const messageId = useId();
  return (
    <div
      role="group"
      aria-labelledby={messageId}
      className={clsx(
        'flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-caption text-fg',
        className,
      )}
    >
      <span id={messageId} className="min-w-0 flex-1 break-words">
        {message}
      </span>
      <button
        type="button"
        onClick={onConfirm}
        className={clsx(s.pill, s.pillBrand, 'h-8 px-3 text-caption')}
      >
        {confirmLabel ?? t('Remove')}
      </button>
      {/* Focus lands on the safe choice: Enter or Space right after the
          click that opened this strip must not destroy anything. */}
      <button
        type="button"
        onClick={onCancel}
        autoFocus
        className={clsx(s.pill, 'h-8 px-3 text-caption')}
      >
        {t('Cancel')}
      </button>
    </div>
  );
}
