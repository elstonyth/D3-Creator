'use client';

/**
 * The script card — PRD 3 §7.3, which owns this file's layout, classes and copy.
 *
 * The parent renders this if and only if `script !== null` AND `isValidScript`
 * passed (PRD 2 §10A.8, §7.3). There is no type tag and no string sniffing.
 *
 * Exactly three buttons: Copy, Shorten, More hooks. There is NO Save — no
 * saved-script table exists and none is invented here.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';

import {
  compactSecondary,
  scriptToClipboard,
  type ChatScript,
} from '@gitroom/frontend/lib/studio-chat';

const COPIED_MS = 2000;

interface ScriptCardProps {
  script: ChatScript;
  /** Sends a literal follow-up on the same thread. Not a new endpoint. */
  onFollowUp: (message: string) => void;
  /** §7.7's control table: `pending || coachDown`. Copy is never gated by it. */
  sendBlocked: boolean;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement | string;
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-fgMuted">{label}</p>
      {typeof children === 'string' ? (
        <p className="text-body text-fg whitespace-pre-wrap break-words">
          {children}
        </p>
      ) : (
        children
      )}
    </div>
  );
}

export function ScriptCard({
  script,
  onFollowUp,
  sendBlocked,
}: ScriptCardProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  async function onCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(scriptToClipboard(script));
    } catch {
      // A refused clipboard permission returns early: the label does not
      // change and nothing else is shown.
      return;
    }
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  // `lesson_used` is validated as a string and no further, so a blank one drops
  // the whole clause rather than rendering a bare "Based on".
  const caption =
    script.lesson_used.trim() === ''
      ? `${script.length_seconds}s`
      : `${script.length_seconds}s · Based on ${script.lesson_used}`;

  return (
    <article className="bg-glass-base border border-borderGlass rounded-2xl p-6 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-heading text-fg">{script.script_type}</h3>
        <p className="text-caption text-fgSubtle">{caption}</p>
      </div>

      <Field label="Hook (0–3s)">{script.hook}</Field>

      <Field label="Body">
        {/* Tailwind preflight strips default markers, so an unstyled <ol>
            renders identically to prose. */}
        <ol className="list-decimal list-inside flex flex-col gap-4">
          {script.body.map((beat, index) => (
            <li key={index} className="text-body text-fg">
              {beat.say}
              <span className="block pl-6 mt-2 text-caption text-fgSubtle">
                {beat.seconds}s
              </span>
              <span className="block pl-6 text-caption text-fgSubtle">
                Show: {beat.show}
              </span>
              {beat.on_screen_text !== '' && (
                <span className="block pl-6 text-caption text-fgSubtle">
                  On screen: {beat.on_screen_text}
                </span>
              )}
            </li>
          ))}
        </ol>
      </Field>

      <Field label="Call to action">{script.call_to_action}</Field>

      {/* The card is already a `flex flex-col gap-4`, so the gap supplies the
          space above the rule — no `mt-4` as well. */}
      <div className="border-t border-borderGlass pt-4 flex flex-wrap gap-2">
        <button type="button" className={compactSecondary} onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          type="button"
          className={compactSecondary}
          disabled={sendBlocked}
          onClick={() => onFollowUp('Make it shorter.')}
        >
          Shorten
        </button>
        <button
          type="button"
          className={compactSecondary}
          disabled={sendBlocked}
          onClick={() => onFollowUp('Give me 3 more hooks.')}
        >
          More hooks
        </button>
        {/* Card-local, so "Copied" and the page-level reply notification cannot
            overwrite each other. */}
        <span aria-live="polite" className="sr-only">
          {copied ? 'Script copied to clipboard.' : ''}
        </span>
      </div>
    </article>
  );
}
