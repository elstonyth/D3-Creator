'use client';

/**
 * Add / edit one shoot: the day, a time if there is one, and optionally
 * which account — all staff need to know is when and where to be. It no
 * longer asks where or what, or for a note (the owner's calls); an old shoot
 * keeps the title and note it was saved with. Every change to a saved shoot
 * asks why (the client changed the time, and so on) — the owner's call too.
 * The server parses and validates; this form only collects strings.
 */

import { useId, useState, type FormEvent, type MouseEvent } from 'react';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Field, Input, Select } from '@gitroom/frontend/components/ui/input';
import {
  isMove,
  REASON_MAX,
  type Shoot,
} from '@gitroom/frontend/lib/team/shoots';
import { fmtDate } from './tracker-shell';

export interface ShootDraft {
  /** `YYYY-MM-DD`; prefilled with the day the form was opened on. */
  date: string;
  time: string;
  creatorId: string;
  /** Why it changed: asked of every change to a saved shoot. */
  reason: string;
}

export function draftOf(s: Shoot | null, date: string): ShootDraft {
  return {
    date: s?.date ?? date,
    time: s?.time ?? '',
    creatorId: s?.creatorId ?? '',
    reason: '',
  };
}

/**
 * A click anywhere on the day or the time opens its picker, not only the
 * small icon at its end (desktop Chrome); a phone opens its own on a tap.
 */
function openPicker(e: MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker();
  } catch {
    // No picker in this browser, or it is already open: typing still works.
  }
}

export function ShootForm({
  initial,
  startDate,
  editing = false,
  accounts,
  onlyHandled = false,
  minDate,
  saving,
  error,
  onSave,
  onCancel,
}: {
  initial: ShootDraft;
  /**
   * The day it opens on, when not `initial`'s: a shoot dropped on another
   * day. `initial` stays what a move is measured from.
   */
  startDate?: string;
  /** Changing a saved shoot (not adding one): it asks why. */
  editing?: boolean;
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
  const { t, locale } = useI18n();
  const id = useId();
  const [d, setD] = useState({ ...initial, date: startDate ?? initial.date });
  const set = (patch: Partial<ShootDraft>) => setD((p) => ({ ...p, ...patch }));
  // Only for the hint: what it is moving from.
  const moving =
    editing &&
    isMove(
      { date: initial.date, time: initial.time || null },
      { date: d.date, time: d.time || null },
    );
  const ready = !!d.date && (!editing || !!d.reason.trim());

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ready) onSave(d);
  }

  const was = [
    fmtDate(initial.date, localeTag(locale), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }),
    initial.time,
  ]
    .filter(Boolean)
    .join(' ');

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
            onClick={openPicker}
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
            onClick={openPicker}
            // The form opens in place of the button that opened it; focus
            // lands on the first thing usually filled in — or, opened by a
            // drop, on why it is moving.
            autoFocus={!startDate}
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

      {editing ? (
        <Field
          label={t('Why the change?')}
          htmlFor={`${id}-reason`}
          hint={moving ? t('Moving from {when}.', { when: was }) : undefined}
        >
          <Input
            id={`${id}-reason`}
            value={d.reason}
            onChange={(e) => set({ reason: e.target.value })}
            list={`${id}-reasons`}
            placeholder={t('The client changed the time')}
            maxLength={REASON_MAX}
            aria-describedby={moving ? `${id}-reason-hint` : undefined}
            autoComplete="off"
            autoFocus={!!startDate}
            required
          />
          <datalist id={`${id}-reasons`}>
            <option value={t('The client changed the time')} />
          </datalist>
        </Field>
      ) : null}

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
