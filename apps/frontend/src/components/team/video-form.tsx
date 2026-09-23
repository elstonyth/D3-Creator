'use client';

/**
 * The admin's form for a video job: which account, which video, who edits and
 * who posts it (filled in from the staffing board when the account is
 * picked), and optionally when it goes out. The server validates.
 */

import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import type { Video } from '@gitroom/frontend/lib/team/videos';

export interface VideoDraft {
  creatorId: string;
  title: string;
  editorId: string;
  handlerId: string;
  postDate: string;
  postTime: string;
  note: string;
}

export function videoDraftOf(v: Video | null): VideoDraft {
  return {
    creatorId: v?.creatorId ?? '',
    title: v?.title ?? '',
    editorId: v?.editorId ?? '',
    handlerId: v?.handlerId ?? '',
    postDate: v?.postDate ?? '',
    postTime: v?.postTime ?? '',
    note: v?.note ?? '',
  };
}

export function VideoForm({
  initial,
  accounts,
  editors,
  handlers,
  assignments,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: VideoDraft;
  accounts: { id: string; name: string }[];
  /** Everyone who can edit (editors first, then handlers). */
  editors: { id: string; name: string }[];
  handlers: { id: string; name: string }[];
  /** Today's board, to fill in the people when an account is picked. */
  assignments: Record<
    string,
    { handlerId: string | null; editorId: string | null }
  >;
  saving: boolean;
  /** Why the last save was refused, shown in the form. */
  error?: string | null;
  onSave: (d: VideoDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [d, setD] = useState(initial);
  const set = (patch: Partial<VideoDraft>) => setD((p) => ({ ...p, ...patch }));
  const ready =
    d.creatorId !== '' && d.title.trim() !== '' && (d.editorId || d.handlerId);

  function pickAccount(creatorId: string) {
    const a = assignments[creatorId];
    set({
      creatorId,
      editorId: a?.editorId ?? '',
      handlerId: a?.handlerId ?? '',
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ready) onSave(d);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-line-strong bg-surface p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('Creator account')} htmlFor={`${id}-acct`}>
          <Select
            id={`${id}-acct`}
            value={d.creatorId}
            onChange={(e) => pickAccount(e.target.value)}
            required
          >
            <option value="">{t('Choose…')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('Which video')} htmlFor={`${id}-title`}>
          <Input
            id={`${id}-title`}
            value={d.title}
            onChange={(e) => set({ title: e.target.value })}
            maxLength={200}
            required
            autoComplete="off"
            placeholder={t('e.g. CNY promo, reel 2')}
          />
        </Field>
        <Field label={t('Editor')} htmlFor={`${id}-ed`}>
          <Select
            id={`${id}-ed`}
            value={d.editorId}
            onChange={(e) => set({ editorId: e.target.value })}
          >
            <option value="">{t('Nobody')}</option>
            {editors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('Handler')} htmlFor={`${id}-hd`}>
          <Select
            id={`${id}-hd`}
            value={d.handlerId}
            onChange={(e) => set({ handlerId: e.target.value })}
          >
            <option value="">{t('Nobody')}</option>
            {handlers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('Posting day')} htmlFor={`${id}-day`} optional>
          <Input
            id={`${id}-day`}
            type="date"
            value={d.postDate}
            onChange={(e) => set({ postDate: e.target.value })}
          />
        </Field>
        <Field label={t('Time')} htmlFor={`${id}-time`} optional>
          <Input
            id={`${id}-time`}
            type="time"
            value={d.postTime}
            onChange={(e) => set({ postTime: e.target.value })}
          />
        </Field>
      </div>
      <Field label={t('Note')} htmlFor={`${id}-note`} optional>
        <Input
          id={`${id}-note`}
          value={d.note}
          onChange={(e) => set({ note: e.target.value })}
          maxLength={1000}
          autoComplete="off"
        />
      </Field>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!ready}>
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}
