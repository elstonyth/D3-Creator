/**
 * The videos a person finished in a month — the edits they clicked Done on
 * and the posts they clicked Done on — each with the link they pasted, so
 * the admin can open exactly what was delivered. Server component.
 */

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import { localeTag } from '@gitroom/frontend/lib/i18n';
import { dateKeyAt } from '@gitroom/frontend/lib/tracker';
import { safeHref, type Video } from '@gitroom/frontend/lib/team/videos';

export async function PersonVideos({
  edited,
  posted,
  accountName,
}: {
  edited: Video[];
  posted: Video[];
  accountName: Map<string, string>;
}) {
  const { t, locale } = await getI18n();
  const tag = localeTag(locale);
  const day = (iso: string) =>
    new Intl.DateTimeFormat(tag, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${dateKeyAt(new Date(iso))}T00:00:00Z`));

  const list = (
    title: string,
    empty: string,
    items: Video[],
    when: (v: Video) => string | null,
    link: (v: Video) => string | null,
    linkLabel: string,
  ) => (
    <section aria-label={title} className="min-w-0">
      <h3 className="mb-2 flex items-baseline justify-between gap-2 text-label text-fg">
        {title}
        <span className="text-caption tnum text-fg-subtle">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-body-sm text-fg-muted">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {items.map((v) => {
            const href = safeHref(link(v));
            const at = when(v);
            return (
              <li key={v.id} className="px-4 py-3 text-body-sm">
                <p className="break-words text-fg">{v.title}</p>
                <p className="mt-0.5 text-caption text-fg-muted">
                  {v.creatorId ? (accountName.get(v.creatorId) ?? '—') : '—'}
                  {at ? ` · ${day(at)}` : ''}
                  {href ? (
                    <>
                      {' · '}
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded text-fg underline underline-offset-4 hover:text-fg-muted focus-visible:outline-none focus-visible:shadow-focusRing"
                      >
                        {linkLabel}
                      </a>
                    </>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <section aria-label={t('Videos done')} className="space-y-3">
      <h2 className="text-heading text-fg">{t('Videos done')}</h2>
      <div className="grid gap-5 md:grid-cols-2">
        {list(
          t('Edited'),
          t('No edits marked done this month.'),
          edited,
          (v) => v.editedAt,
          (v) => v.editLink,
          t('Edited video'),
        )}
        {list(
          t('Posted'),
          t('No posts marked done this month.'),
          posted,
          (v) => v.postedAt,
          (v) => v.postLink,
          t('Live post'),
        )}
      </div>
    </section>
  );
}
