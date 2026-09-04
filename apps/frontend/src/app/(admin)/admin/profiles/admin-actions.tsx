'use client';

/**
 * Client wrappers for the admin mutation buttons.
 *
 * Each wraps a server action with useActionState so the button can show a
 * pending state and surface the returned {ok, message} instead of throwing
 * into an error boundary. Delete is gated behind an inline confirm that names
 * the exact profile and what goes with it (no portal/modal dependency),
 * because the delete permanently cascades every snapshot.
 *
 * On success the server action calls revalidatePath, so the affected row
 * disappears (claim resolved / profile removed) — no success toast needed;
 * only the failure message is rendered inline.
 */

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@gitroom/frontend/components/ui/button';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { approveClaim, rejectClaim, deleteProfile } from './actions';

/**
 * Submit button that reads the enclosing <form>'s pending state.
 *
 * useFormStatus only reports for the form it is rendered inside, which is why
 * each action gets its own tiny form rather than one form with several buttons.
 */
function SubmitButton({
  variant = 'secondary',
  children,
  label,
}: {
  variant?: 'primary' | 'secondary' | 'danger';
  children: React.ReactNode;
  /** Accessible name when the visible label alone is ambiguous ("Confirm"). */
  label?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      loading={pending}
      aria-label={label}
    >
      {children}
    </Button>
  );
}

export function ClaimActions({
  userId,
  profileId,
  alreadyOwned,
  target,
}: {
  userId: string;
  profileId: string;
  alreadyOwned: boolean;
  /** The profile being claimed, for the button's accessible name. */
  target: string;
}) {
  const [approveState, approveAction] = useActionState(approveClaim, null);
  const [rejectState, rejectAction] = useActionState(rejectClaim, null);
  const error =
    approveState && !approveState.ok
      ? approveState.message
      : rejectState && !rejectState.ok
        ? rejectState.message
        : null;

  return (
    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
      <div className="flex gap-2">
        {!alreadyOwned && (
          <form action={approveAction}>
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="profile_id" value={profileId} />
            <SubmitButton
              variant="primary"
              label={`Approve claim on ${target}`}
            >
              Approve
            </SubmitButton>
          </form>
        )}
        <form action={rejectAction}>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="profile_id" value={profileId} />
          <SubmitButton label={`Reject claim on ${target}`}>
            Reject
          </SubmitButton>
        </form>
      </div>
      {alreadyOwned && (
        <p className="max-w-[240px] text-caption text-fg-subtle sm:text-right">
          Already owned. Reject this, or reassign it in the creator&apos;s
          editor.
        </p>
      )}
      {error && (
        <Alert tone="danger" className="max-w-[280px] text-caption">
          {error}
        </Alert>
      )}
    </div>
  );
}

export function DeleteProfileButton({
  profileId,
  target,
}: {
  profileId: string;
  /** Named in the confirmation so the operator deletes what they think they do. */
  target: string;
}) {
  const [state, action] = useActionState(deleteProfile, null);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      {confirming ? (
        <form action={action} className="flex flex-col items-end gap-2">
          <input type="hidden" name="profile_id" value={profileId} />
          <p className="max-w-[220px] text-right text-caption text-fg-muted">
            Delete <span className="text-fg">{target}</span> and every snapshot
            ever taken of it? This cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
            <SubmitButton variant="danger" label={`Delete ${target}`}>
              Delete
            </SubmitButton>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${target}`}
        >
          Delete
        </Button>
      )}
      {state && !state.ok && (
        <Alert tone="danger" className="max-w-[240px] text-caption">
          {state.message}
        </Alert>
      )}
    </div>
  );
}
