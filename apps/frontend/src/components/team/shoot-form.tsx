'use client';

/**
 * Add / edit one shoot. Fields mirror how the team writes its schedule in
 * the group chat: a time if there is one (blank for "afternoon"-style
 * entries — write that in the title), where or what, and optionally which
 * account and a note. The server parses and validates; this form only
 * collects strings.
 */

import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import type { Shoot } from '@gitroom/frontend/lib/team/shoots';

export interface ShootDraft {
  /** `YYYY-MM-DD`; prefilled with the day the form was opened on. */
  date: string;
  time: string;
  title: string;
  creatorId: string;
  note: string;
}

export function draftOf(s: Shoot | null, date: string): ShootDraft {
  return {
    date: s?.date ?? date,
    time: s?.time ?? '',
    title: s?.title ?? '',
    creatorId: s?.creatorId ?? '',
    note: s?.note ?? '',
  };
}

export function ShootForm({
  initial,
  accounts,
  minDate,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: ShootDraft;
  accounts: { id: string; name: string }[];
  /** Earliest day that can be picked (staff: the first of this month). */
  minDate?: string;
  saving: boolean;
  /** Why the last save was refused, shown in the form. */
  error?: string | null;
  onSave: (draft: ShootDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [d, setD] = useState(initial);
  const set = (patch: Partial<ShootDraft>) => setD((p) => ({ ...p, ...patch }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!d.date || !d.title.trim()) return;
    onSave(d);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-line-strong bg-surface-subtle p-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Day')} htmlFor={`${id}-date`}>
          <Input
            id={`${id}-date`}
            type="date"
            value={d.date}
            onChange={(e) => set({ date: e.target.value })}
            min={minDate}
            required
          />
        </Field>
        <Field label={t('Time')} htmlFor={`${id}-time`} optional>
          <Input
            id={`${id}-time`}
            type="time"
            value={d.time}
            onChange={(e) => set({ time: e.target.value })}
          />
        </Field>
      </div>

      <Field label={t('Where / what')} htmlFor={`${id}-title`}>
        <Input
          id={`${id}-title`}
          value={d.title}
          onChange={(e) => set({ title: e.target.value })}
          maxLength={200}
          required
          autoFocus
          autoComplete="off"
          placeholder={t('e.g. Hotpot shop, JB')}
        />
      </Field>

      <Field label={t('Creator account')} htmlFor={`${id}-acct`} optional>
        <Select
          id={`${id}-acct`}
          value={d.creatorId}
          onChange={(e) => set({ creatorId: e.target.value })}
        >
          <option value="">{t('No account')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

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
        <Button
          type="submit"
          size="sm"
          loading={saving}
          disabled={!d.date || !d.title.trim()}
        >
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}
