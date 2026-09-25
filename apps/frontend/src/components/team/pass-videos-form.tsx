'use client';

/**
 * Passing a shoot's videos on: one row per video — its title and who edits
 * it. A new row starts with the editor of the row above, so a shoot that
 * goes to one editor is mostly typing. The server parses and validates; this
 * form only collects strings.
 */

import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Input, Select } from '@gitroom/frontend/components/ui/input';
import { PASS_MAX, type PassRow } from '@gitroom/frontend/lib/team/videos';

interface Row extends PassRow {
  /** Stable while rows above it are removed, so inputs keep their text. */
  key: number;
}

export function PassVideosForm({
  editors,
  saving,
  error,
  onSave,
  onCancel,
}: {
  /** Who can be given a video: people on the team who cut video. */
  editors: { id: string; name: string }[];
  saving: boolean;
  /** Why the last save was refused, shown in the form. */
  error?: string | null;
  onSave: (rows: PassRow[]) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [rows, setRows] = useState<Row[]>([
    // With one editor on the team there is nothing to choose.
    { key: 0, title: '', editorId: editors.length === 1 ? editors[0].id : '' },
  ]);
  const ready = rows.every((r) => r.title.trim() && r.editorId);

  const set = (key: number, patch: Partial<PassRow>) =>
    setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    onSave(rows.map(({ title, editorId }) => ({ title, editorId })));
  }

  if (editors.length === 0)
    return (
      <div className="mt-3 space-y-2">
        <Alert tone="info">
          {t(
            'Nobody on the team edits videos yet. Ask an admin to set someone’s job to Editor.',
          )}
        </Alert>
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t('Close')}
          </Button>
        </div>
      </div>
    );

  return (
    <form
      onSubmit={submit}
      className="mt-3 space-y-3 rounded-[18px] border border-white/10 bg-black/25 p-3"
    >
      <p className="text-caption text-fg-muted">
        {t('One row per video: its title, and who edits it.')}
      </p>
      <ol className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.key} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`${id}-t${r.key}`} className="sr-only">
              {t('Video {n} title', { n: i + 1 })}
            </label>
            <Input
              id={`${id}-t${r.key}`}
              value={r.title}
              onChange={(e) => set(r.key, { title: e.target.value })}
              maxLength={200}
              required
              autoFocus={i === rows.length - 1}
              autoComplete="off"
              placeholder={t('Video title')}
              className="sm:flex-1"
            />
            <div className="flex gap-2">
              <label htmlFor={`${id}-e${r.key}`} className="sr-only">
                {t('Video {n} editor', { n: i + 1 })}
              </label>
              <div className="min-w-0 flex-1 sm:w-40 sm:flex-none">
                <Select
                  id={`${id}-e${r.key}`}
                  value={r.editorId}
                  onChange={(e) => set(r.key, { editorId: e.target.value })}
                  required
                >
                  <option value="">{t('Editor…')}</option>
                  {editors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              {rows.length > 1 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setRows((p) => p.filter((x) => x.key !== r.key))
                  }
                  aria-label={t('Remove video {n}', { n: i + 1 })}
                >
                  ×
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {rows.length < PASS_MAX ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setRows((p) => {
              const last = p[p.length - 1];
              return [
                ...p,
                { key: last.key + 1, title: '', editorId: last.editorId },
              ];
            })
          }
        >
          {t('+ Add video')}
        </Button>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!ready}>
          {t('Pass videos')}
        </Button>
      </div>
    </form>
  );
}
