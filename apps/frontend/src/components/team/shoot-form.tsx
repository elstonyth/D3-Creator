'use client';

/**
 * Add / edit one shoot. Fields mirror how the team writes its schedule in
 * the group chat: a time if there is one (blank for "afternoon"-style
 * entries — write that in the title), where or what, and optionally which
 * account and how many videos. The server parses and validates; this form
 * only collects strings.
 */

import { useId, useState, type FormEvent } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import type { Shoot } from '@gitroom/frontend/lib/team/shoots';

export interface ShootDraft {
  /** `YYYY-MM-DD`; prefilled with the day the form was opened on. */
  date: string;
  time: string;
  title: string;
  creatorId: string;
  videosPlanned: string;
  note: string;
  /** Admin only: whose shoot. */
  memberId: string;
}

export function draftOf(
  s: Shoot | null,
  date: string,
  memberId = '',
): ShootDraft {
  return {
    date: s?.date ?? date,
    time: s?.time ?? '',
    title: s?.title ?? '',
    creatorId: s?.creatorId ?? '',
    videosPlanned: s?.videosPlanned == null ? '' : String(s.videosPlanned),
    note: s?.note ?? '',
    memberId: s?.memberId ?? memberId,
  };
}

export function ShootForm({
  initial,
  accounts,
  people,
  saving,
  onSave,
  onCancel,
}: {
  initial: ShootDraft;
  accounts: { id: string; name: string }[];
  /** Given only to an admin adding a shoot: whose it is. */
  people?: { id: string; name: string }[];
  saving: boolean;
  onSave: (draft: ShootDraft) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [d, setD] = useState(initial);
  const set = (patch: Partial<ShootDraft>) => setD((p) => ({ ...p, ...patch }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!d.date || !d.title.trim() || (people && !d.memberId)) return;
    onSave(d);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-lg border border-line-strong bg-surface-subtle p-3"
    >
      {people ? (
        <Field label={t('Person')} htmlFor={`${id}-who`}>
          <Select
            id={`${id}-who`}
            value={d.memberId}
            onChange={(e) => set({ memberId: e.target.value })}
            required
          >
            <option value="">{t('Choose…')}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Day')} htmlFor={`${id}-date`}>
          <Input
            id={`${id}-date`}
            type="date"
            value={d.date}
            onChange={(e) => set({ date: e.target.value })}
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

      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
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
        <Field label={t('Videos')} htmlFor={`${id}-n`} optional>
          <Input
            id={`${id}-n`}
            type="number"
            inputMode="numeric"
            min={0}
            max={99}
            step={1}
            value={d.videosPlanned}
            onChange={(e) => set({ videosPlanned: e.target.value })}
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

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button
          type="submit"
          size="sm"
          loading={saving}
          disabled={
            !d.date || !d.title.trim() || (people !== undefined && !d.memberId)
          }
        >
          {t('Save')}
        </Button>
      </div>
    </form>
  );
}
