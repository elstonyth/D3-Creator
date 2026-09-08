'use client';

/**
 * Per-creator editor. Each section posts to its own server action via
 * useActionState; rows live in their own components so hooks obey
 * react-hooks/rules-of-hooks. Password reset reveals the new password once,
 * reusing the provision-form credentials pattern.
 *
 * Destructive actions (remove a URL, delete the creator) name their exact
 * target and its consequence in the confirm step, and use the danger variant
 * with the word "Delete"/"Remove" — never a bare icon.
 */

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Input, Field } from '@gitroom/frontend/components/ui/input';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import {
  Card,
  CardDescription,
  CardHeader,
} from '@gitroom/frontend/components/ui/card';
import type {
  AdminCreatorDetail,
  AdminProfileRow,
  AdminCreatorLogin,
} from '@gitroom/frontend/lib/admin-creators';
import {
  renameCreator,
  addCreatorUrl,
  editCreatorUrl,
  removeCreatorUrl,
  addCreatorLogin,
  resetCreatorPassword,
  deleteCreator,
  type ActionResult,
  type PasswordResetResult,
} from './actions';

function Save({
  label = 'Save',
  variant = 'secondary',
  ariaLabel,
}: {
  label?: string;
  variant?: 'primary' | 'secondary' | 'danger';
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      loading={pending}
      aria-label={ariaLabel}
    >
      {label}
    </Button>
  );
}

/** Result line for a section. Success is quiet; failure is an Alert. */
function Msg({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (!state.ok)
    return (
      <Alert tone="danger" className="text-caption">
        {state.message}
      </Alert>
    );
  return (
    <p role="status" className="text-caption text-fg-muted">
      {state.message}
    </p>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card tone="subtle" padding="lg" className="space-y-4">
      <CardHeader className="block">
        {/* h2, not <CardTitle> (an h3): the page above owns the only h1 and
            these are its top-level sections, so an h3 here skips a level. */}
        <h2 className="text-heading text-fg">{title}</h2>
        <CardDescription className="mt-1.5">{description}</CardDescription>
      </CardHeader>
      {children}
    </Card>
  );
}

export function CreatorEditor({ detail }: { detail: AdminCreatorDetail }) {
  return (
    <div className="space-y-6">
      <RenameSection
        creatorId={detail.creatorId}
        displayName={detail.displayName}
      />
      <UrlsSection creatorId={detail.creatorId} profiles={detail.profiles} />
      <LoginsSection creatorId={detail.creatorId} logins={detail.logins} />
      <DangerSection
        creatorId={detail.creatorId}
        displayName={detail.displayName}
      />
    </div>
  );
}

function RenameSection({
  creatorId,
  displayName,
}: {
  creatorId: string;
  displayName: string;
}) {
  const [state, action] = useActionState(renameCreator, null);
  const id = useId();
  return (
    <SectionCard
      title="Display name"
      description="Shown on the public leaderboard and every creator page."
    >
      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="creator_id" value={creatorId} />
        <div className="min-w-0 flex-1">
          <Field label="Name" htmlFor={id}>
            <Input
              id={id}
              name="display_name"
              type="text"
              required
              maxLength={80}
              defaultValue={displayName}
            />
          </Field>
        </div>
        <Save />
      </form>
      <Msg state={state} />
    </SectionCard>
  );
}

function UrlsSection({
  creatorId,
  profiles,
}: {
  creatorId: string;
  profiles: AdminProfileRow[];
}) {
  return (
    <SectionCard
      title="Social URLs"
      description="One profile per platform. Repointing a URL keeps the history attached; removing one deletes its snapshots."
    >
      {profiles.length === 0 ? (
        <p className="text-body-sm text-fg-muted">
          No profiles yet. Add the first URL below — the platform is detected
          automatically.
        </p>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {profiles.map((p) => (
            <ProfileUrlRow key={p.id} creatorId={creatorId} profile={p} />
          ))}
        </ul>
      )}
      <AddUrlRow creatorId={creatorId} />
    </SectionCard>
  );
}

function ProfileUrlRow({
  creatorId,
  profile,
}: {
  creatorId: string;
  profile: AdminProfileRow;
}) {
  const [editState, editAction] = useActionState(editCreatorUrl, null);
  const [removeState, removeAction] = useActionState(removeCreatorUrl, null);
  const [confirming, setConfirming] = useState(false);
  const editFormRef = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (editState?.ok) editFormRef.current?.reset();
  }, [editState]);

  const name = profile.handle ?? profile.profileUrl;

  return (
    <li className="space-y-2 py-4 first:pt-0 last:pb-0">
      <form
        ref={editFormRef}
        action={editAction}
        className="flex items-end gap-2"
      >
        <input type="hidden" name="creator_id" value={creatorId} />
        <input type="hidden" name="profile_id" value={profile.id} />
        <div className="min-w-0 flex-1">
          <Field label={profile.platform} htmlFor={id}>
            <Input
              id={id}
              name="url"
              type="url"
              defaultValue={profile.profileUrl}
            />
          </Field>
        </div>
        <Save ariaLabel={`Save ${profile.platform} URL`} />
      </form>

      {confirming ? (
        <form action={removeAction} className="space-y-2">
          <input type="hidden" name="creator_id" value={creatorId} />
          <input type="hidden" name="profile_id" value={profile.id} />
          <p className="text-caption text-fg-muted">
            Remove the {profile.platform} profile{' '}
            <span className="text-fg">{name}</span>? Its snapshot history goes
            with it and cannot be restored.
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
            <Save
              label="Remove profile"
              variant="danger"
              ariaLabel={`Remove ${profile.platform} profile ${name}`}
            />
          </div>
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${profile.platform} profile ${name}`}
        >
          Remove
        </Button>
      )}

      <Msg state={editState} />
      <Msg state={removeState} />
    </li>
  );
}

function AddUrlRow({ creatorId }: { creatorId: string }) {
  const [state, action] = useActionState(addCreatorUrl, null);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <div className="space-y-2 border-t border-line-subtle pt-4">
      <form ref={formRef} action={action} className="flex items-end gap-2">
        <input type="hidden" name="creator_id" value={creatorId} />
        <div className="min-w-0 flex-1">
          <Field
            label="Add a URL"
            htmlFor={id}
            hint="Instagram, TikTok, Facebook or Douyin profile page"
          >
            <Input
              id={id}
              name="url"
              type="url"
              required
              aria-describedby={`${id}-hint`}
              placeholder="https://www.instagram.com/handle"
            />
          </Field>
        </div>
        <Save label="Add" />
      </form>
      <Msg state={state} />
    </div>
  );
}

function LoginsSection({
  creatorId,
  logins,
}: {
  creatorId: string;
  logins: AdminCreatorLogin[];
}) {
  // Own the add-login action state HERE, not inside AddLoginRow: a successful add
  // revalidates → logins becomes nonzero → the add-form unmounts. Holding the
  // state in this always-mounted section preserves the one-time credentials
  // across that swap, and surfaces them on partial failure too (login created
  // but a downstream step failed), where the generated password is irreplaceable.
  const [addState, addAction] = useActionState(
    addCreatorLogin,
    null as PasswordResetResult | null
  );
  return (
    <SectionCard
      title="Login"
      description="Portal access for this creator. Passwords are shown once, at the moment they are set."
    >
      {logins.length === 0 ? (
        <AddLoginRow
          creatorId={creatorId}
          state={addState}
          action={addAction}
        />
      ) : (
        <ul className="divide-y divide-line-subtle">
          {logins.map((l) => (
            <LoginRow key={l.userId} creatorId={creatorId} login={l} />
          ))}
        </ul>
      )}
      {addState?.credentials && (
        <CredentialsPanel
          title="New login"
          email={addState.credentials.email}
          password={addState.credentials.password}
        />
      )}
    </SectionCard>
  );
}

function AddLoginRow({
  creatorId,
  state,
  action,
}: {
  creatorId: string;
  state: PasswordResetResult | null;
  action: (formData: FormData) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-fg-muted">
        No login linked. This creator cannot sign in until one exists.
      </p>
      <form
        ref={formRef}
        action={action}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="creator_id" value={creatorId} />
        <div className="flex-1">
          <Field label="Email" htmlFor={`${id}-email`}>
            <Input
              id={`${id}-email`}
              name="email"
              type="email"
              required
              autoComplete="off"
              placeholder="creator@email.com"
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field
            label="Password"
            htmlFor={`${id}-password`}
            hint="Leave blank to generate one"
            optional
          >
            {/* type="text" is intentional — the admin reads it back to share it once */}
            <Input
              id={`${id}-password`}
              name="password"
              type="text"
              autoComplete="off"
              aria-describedby={`${id}-password-hint`}
              minLength={8}
              maxLength={72}
            />
          </Field>
        </div>
        <Save label="Create login" />
      </form>
      {/* CredentialsPanel is rendered by LoginsSection so it survives the form's
          unmount on success; here we only show the inline error on failure. */}
      {state && !state.ok && (
        <Alert tone="danger" className="text-caption">
          {state.message}
        </Alert>
      )}
    </div>
  );
}

function LoginRow({
  creatorId,
  login,
}: {
  creatorId: string;
  login: AdminCreatorLogin;
}) {
  const [state, action] = useActionState(
    resetCreatorPassword,
    null as PasswordResetResult | null
  );
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0">
      <p className="break-all font-mono text-body-sm text-fg">{login.email}</p>
      <form
        ref={formRef}
        action={action}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="creator_id" value={creatorId} />
        <input type="hidden" name="user_id" value={login.userId} />
        <div className="flex-1">
          <Field
            label="New password"
            htmlFor={id}
            hint="Leave blank to generate one"
            optional
          >
            {/* type="text" is intentional — the admin reads it back to share it once */}
            <Input
              id={id}
              name="password"
              type="text"
              autoComplete="off"
              aria-describedby={`${id}-hint`}
              minLength={8}
              maxLength={72}
            />
          </Field>
        </div>
        <Save
          label="Reset password"
          ariaLabel={`Reset the password for ${login.email}`}
        />
      </form>
      {state && !state.ok && (
        <Alert tone="danger" className="text-caption">
          {state.message}
        </Alert>
      )}
      {state?.ok && state.credentials && (
        <CredentialsPanel
          title="New password"
          email={state.credentials.email}
          password={state.credentials.password}
        />
      )}
    </li>
  );
}

function CredentialsPanel({
  title,
  email,
  password,
}: {
  title: string;
  email: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${email}\n${password}`);
      setCopied(true);
    } catch {
      // Clipboard API unavailable (insecure context) or permission denied — the
      // credentials are visible on screen for manual copy, so just no-op.
      setCopied(false);
    }
  }
  return (
    <div className="rounded-2xl border border-line-strong bg-surface-elevated p-4 shadow">
      <div className="flex items-center justify-between gap-3">
        <p className="text-label text-fg">{title}</p>
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy both'}
        </Button>
      </div>
      <dl className="mt-3 space-y-1.5 font-mono text-body-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 font-sans text-caption text-fg-subtle">
            Email
          </dt>
          <dd className="min-w-0 break-all text-fg">{email}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 font-sans text-caption text-fg-subtle">
            Password
          </dt>
          <dd className="min-w-0 break-all text-fg">{password}</dd>
        </div>
      </dl>
      <p className="mt-3 text-caption text-fg-subtle">
        Shown once. Leaving this page loses it — another reset is the only way
        back.
      </p>
    </div>
  );
}

function DangerSection({
  creatorId,
  displayName,
}: {
  creatorId: string;
  displayName: string;
}) {
  const [state, action] = useActionState(deleteCreator, null);
  const [confirming, setConfirming] = useState(false);
  return (
    <SectionCard
      title="Delete this creator"
      description="Removes the account, every platform profile under it, all snapshot history, and the login."
    >
      {confirming ? (
        <form action={action} className="space-y-3">
          <input type="hidden" name="creator_id" value={creatorId} />
          <Alert tone="warning" title="This cannot be undone">
            Deleting <span className="text-fg">{displayName}</span> also deletes
            its profiles, every snapshot ever taken of them, and its login.
            Public pages lose the creator immediately.
          </Alert>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
            {/* Fixed label: a display name can run 80 chars and the button
                is whitespace-nowrap, which would push the row off a 360px
                screen. The Alert directly above names the target. */}
            <Save
              label="Delete permanently"
              variant="danger"
              ariaLabel={`Permanently delete ${displayName} and all of its data`}
            />
          </div>
        </form>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${displayName}`}
        >
          Delete creator
        </Button>
      )}
      {state && !state.ok && (
        <Alert tone="danger" className="text-caption">
          {state.message}
        </Alert>
      )}
    </SectionCard>
  );
}
