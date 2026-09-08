'use client';

/**
 * Class catalogue editor. One form per video plus an "add" form at the top;
 * each posts to its own server action and reports through a single shared
 * message line.
 *
 * Delete is an inline confirm that names the class title — the native
 * confirm() it replaces was a browser dialog with no styling and no title in
 * it, which is how you delete the wrong row.
 */

import { localizeAdminError } from '../localize-error';
import { useI18n } from '@gitroom/frontend/components/i18n/locale-provider';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@gitroom/frontend/components/ui/button';
import { Input, Field, Select } from '@gitroom/frontend/components/ui/input';
import { Alert } from '@gitroom/frontend/components/ui/alert';
import { Card } from '@gitroom/frontend/components/ui/card';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import {
  createClassVideo,
  updateClassVideo,
  deleteClassVideo,
} from './actions';

interface Video {
  id: string;
  title: string;
  description: string | null;
  drive_file_id: string;
  visibility: string;
  is_published: boolean;
  allow_download: boolean;
  sort_order: number;
}

type Msg = { ok: boolean; text: string } | null;

export function ClassManager({ videos }: { videos: Video[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  // Keyed by action AND row ("save:<id>" / "delete:<id>"): a single row id made
  // Save and Delete spin together, so a delete looked like a save.
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  function fail(e: unknown) {
    // Transport-level failure (network, timeout, aborted navigation): the
    // action never returned a result, so say so instead of failing silently.
    setMsg({
      ok: false,
      text: localizeAdminError(
        e instanceof Error ? e.message : 'Unexpected error',
        locale,
        t,
      ),
    });
  }

  async function onCreate(fd: FormData) {
    setMsg(null);
    setPendingKey('new');
    try {
      const res = await createClassVideo(null, fd);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      // Always clear pending — a rejected action must not strand the button.
      setPendingKey(null);
    }
  }

  async function onUpdate(fd: FormData) {
    setMsg(null);
    const id = String(fd.get('id') ?? '');
    setPendingKey(`save:${id}`);
    try {
      const res = await updateClassVideo(null, fd);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      setPendingKey(null);
    }
  }

  async function onDelete(id: string) {
    setMsg(null);
    setPendingKey(`delete:${id}`);
    try {
      const res = await deleteClassVideo(id);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-8">
      {msg && <Alert tone={msg.ok ? 'success' : 'danger'}>{t(msg.text)}</Alert>}

      <section aria-labelledby="add-class-heading" className="space-y-4">
        <h2 id="add-class-heading" className="text-section text-fg">
          {t('Add a class')}
        </h2>
        <Card tone="subtle" padding="lg">
          <form action={onCreate} className="space-y-5">
            <ClassFields idPrefix="new" />
            <div className="flex justify-end border-t border-line-subtle pt-5">
              <Button type="submit" loading={pendingKey === 'new'}>
                {t('Add class')}
              </Button>
            </div>
          </form>
        </Card>
      </section>

      <section aria-labelledby="catalogue-heading" className="space-y-4">
        <div className="max-w-prose">
          <h2 id="catalogue-heading" className="text-section text-fg">
            {t('Catalogue')}
          </h2>
          <p className="mt-2 text-body text-fg-muted">
            {videos.length === 0
              ? t('Nothing published yet.')
              : t(
                  videos.length === 1
                    ? '{count} class, ordered by the order field then newest first.'
                    : '{count} classes, ordered by the order field then newest first.',
                  { count: videos.length },
                )}
          </p>
        </div>

        {videos.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('The library is empty')}
            description={t(
              'Paste a Drive link above to publish the first class. Members see it as soon as Visible is ticked.',
            )}
          />
        ) : (
          <div className="space-y-4">
            {videos.map((v) => (
              <ClassRow
                key={v.id}
                video={v}
                saving={pendingKey === `save:${v.id}`}
                deleting={pendingKey === `delete:${v.id}`}
                onUpdate={onUpdate}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ClassRow({
  video,
  saving,
  deleting,
  onUpdate,
  onDelete,
}: {
  video: Video;
  saving: boolean;
  deleting: boolean;
  onUpdate: (fd: FormData) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  return (
    <Card padding="lg">
      <form action={onUpdate} className="space-y-5">
        <input type="hidden" name="id" value={video.id} />
        <ClassFields idPrefix={video.id} video={video} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle pt-5">
          <Button type="submit" variant="secondary" loading={saving}>
            {t('Save changes')}
          </Button>
          {!confirming && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(true)}
              aria-label={t('Delete the class {title}', { title: video.title })}
            >
              {t('Delete')}
            </Button>
          )}
        </div>
      </form>

      {confirming && (
        <div className="mt-4 space-y-3 border-t border-line-subtle pt-4">
          <p className="text-body-sm text-fg-muted">
            {t(
              'Delete {title} from the library? Members lose access immediately. The Drive file itself is not touched.',
              { title: video.title },
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              {t('Keep')}
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={deleting}
              onClick={() => onDelete(video.id)}
              aria-label={t('Delete the class {title}', { title: video.title })}
            >
              {t('Delete class')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * The field set, shared by the add form and every edit form so a column added
 * to one can never go missing from the other.
 */
function ClassFields({ idPrefix, video }: { idPrefix: string; video?: Video }) {
  const { t } = useI18n();
  const uid = useId();
  const id = (name: string) => `${uid}-${idPrefix}-${name}`;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('Title')} htmlFor={id('title')}>
          <Input
            id={id('title')}
            name="title"
            required
            maxLength={200}
            defaultValue={video?.title}
            placeholder={t('Hook writing, part 1')}
          />
        </Field>
        <Field label={t('Description')} htmlFor={id('description')} optional>
          <Input
            id={id('description')}
            name="description"
            maxLength={500}
            defaultValue={video?.description ?? ''}
            placeholder={t('One line shown under the title')}
          />
        </Field>
      </div>

      <Field
        label={t('Google Drive link')}
        htmlFor={id('link')}
        hint={t('Sharing must be “anyone with the link can view”')}
      >
        <Input
          id={id('link')}
          name="drive_link"
          required
          aria-describedby={`${id('link')}-hint`}
          defaultValue={
            video
              ? `https://drive.google.com/file/d/${video.drive_file_id}/view`
              : undefined
          }
          placeholder="https://drive.google.com/file/d/…/view"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t('Who can watch')} htmlFor={id('visibility')}>
          <Select
            id={id('visibility')}
            name="visibility"
            defaultValue={video?.visibility ?? 'members'}
          >
            <option value="members">{t('Members only')}</option>
            <option value="public">{t('Anyone')}</option>
          </Select>
        </Field>
        <Field
          label={t('Order')}
          htmlFor={id('sort_order')}
          hint={t('Lower shows first')}
        >
          <Input
            id={id('sort_order')}
            name="sort_order"
            inputMode="numeric"
            aria-describedby={`${id('sort_order')}-hint`}
            defaultValue={String(video?.sort_order ?? 0)}
          />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-label text-fg">{t('Options')}</legend>
          <Checkbox
            id={id('is_published')}
            name="is_published"
            defaultChecked={video?.is_published}
            label={t('Visible in the library')}
          />
          <Checkbox
            id={id('allow_download')}
            name="allow_download"
            defaultChecked={video?.allow_download}
            label={t('Allow download')}
          />
        </fieldset>
      </div>
    </>
  );
}

function Checkbox({
  id,
  name,
  label,
  defaultChecked,
}: {
  id: string;
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex min-h-[24px] items-center gap-2.5">
      <input
        type="checkbox"
        id={id}
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 shrink-0 cursor-pointer accent-brand focus-visible:outline-none focus-visible:shadow-focus"
      />
      <label htmlFor={id} className="cursor-pointer text-body-sm text-fg-muted">
        {label}
      </label>
    </div>
  );
}
