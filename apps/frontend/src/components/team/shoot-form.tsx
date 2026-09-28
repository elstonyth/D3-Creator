'use client';

/**
 * Add / edit one shoot: the day, a time if there is one, and optionally
 * which account — all staff need to know is when and where to be. It no
 * longer asks where or what, or for a note (the owner's calls); an old shoot
 * keeps the title and note it was saved with. The server parses and
 * validates; this form only collects strings.
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
  creatorId: string;
}

export function draftOf(s: Shoot | null, date: string): ShootDraft {
  return {
    date: s?.date ?? date,
    time: s?.time ?? '',
    creatorId: s?.creatorId ?? '',
  };
}

export function ShootForm({
  initial,
  accounts,
  onlyHandled = false,
  minDate,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: ShootDraft;
  accounts: { id: string; name: string }[];
  /** `accounts` is only the ones this person handles: say so. */
  onlyHandled?: boolean;
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
    if (!d.date) return;
    onSave(d);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-[18px] border border-white/10 bg-black/25 p-3"
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
            // The form opens in place of the button that opened it; focus
            // lands on the first thing usually filled in.
            autoFocus
          />
        </Field>
      </div>

      <Field
        label={t('Creator account')}
        htmlFor={`${id}-acct`}
        optional
        hint={
          !onlyHandled
            ? undefined
            : accounts.length === 0
              ? t('You handle no accounts yet. Ask the admin to assign one.')
              : t('Only the accounts you handle.')
        }
      >
        <Select
          id={`${id}-acct`}
          value={d.creatorId}
          onChange={(e) => set({ creatorId: e.target.value })}
          aria-describedby={onlyHandled ? `${id}-acct-hint` : undefined}
        >
          <option value="">{t('No account')}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button type="submit" size="sm" loading={saving} disabled={!d.date}>
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}
