'use client';

/**
 * The job tasks an admin gave this person, ticked off here. A tick is saved
 * straight away and put back (with the reason) if the server refuses it.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { setMyTaskDone } from '@gitroom/frontend/lib/team/task-actions';
import type { MyTask } from '@gitroom/frontend/lib/team/load';

export function MyTasks({ tasks: initialTasks }: { tasks: MyTask[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [error, setError] = useState<string | null>(null);
  const open = tasks.filter((x) => !x.done);
  const done = tasks.filter((x) => x.done);

  async function toggle(task: MyTask) {
    const next = !task.done;
    setError(null);
    setTasks((p) =>
      p.map((x) => (x.id === task.id ? { ...x, done: next } : x)),
    );
    let r: { ok: boolean; message?: string };
    try {
      r = await setMyTaskDone(task.id, next);
    } catch {
      // A dropped connection or a stale deploy: put the tick back and say so.
      r = { ok: false, message: 'Could not save. Try again.' };
    }
    if (r.ok) {
      // Drop the router's cached page so Back/Forward shows the tick.
      router.refresh();
      return;
    }
    setError(r.message ?? 'Could not save. Try again.');
    // Only this tick, and only if nothing changed it since.
    setTasks((p) =>
      p.map((x) =>
        x.id === task.id && x.done === next ? { ...x, done: !next } : x,
      ),
    );
  }

  return (
    <section aria-label={t('Tasks from the admin')}>
      <h2 className="mb-3 flex items-baseline justify-between gap-2 text-heading text-fg">
        {t('Tasks from the admin')}
        <span className="text-caption tnum text-fg-subtle">
          {t('{open} open · {done} done', {
            open: open.length,
            done: done.length,
          })}
        </span>
      </h2>
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{t(error)}</Alert>
        </div>
      ) : null}
      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-body-sm text-fg-muted">
          {t('No tasks for you right now.')}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {/* In the order they came, ticked or not: a row that jumped to
              the done group would take keyboard focus with it. */}
          {tasks.map((task) => (
            <li key={task.id}>
              {/* The whole row is the checkbox: a big target, named by its
                  title. */}
              <button
                type="button"
                role="checkbox"
                aria-checked={task.done}
                onClick={() => toggle(task)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] focus-visible:outline-none focus-visible:shadow-focusRing"
              >
                <span
                  aria-hidden
                  className={
                    task.done
                      ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded border border-fg-muted bg-fg-muted text-canvas'
                      : 'flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line-strong'
                  }
                >
                  {task.done ? (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                      <path
                        d="m2.5 6.2 2.2 2.2 4.8-4.9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span
                  className={
                    task.done
                      ? 'min-w-0 flex-1 break-words text-body text-fg-muted line-through'
                      : 'min-w-0 flex-1 break-words text-body text-fg'
                  }
                >
                  {task.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
