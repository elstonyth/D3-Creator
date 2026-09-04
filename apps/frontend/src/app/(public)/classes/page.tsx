// apps/frontend/src/app/(public)/classes/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { deriveSeriesLabel } from '@gitroom/frontend/lib/class-series';
import { Container, Section } from '@gitroom/frontend/components/ui/section';
import { Badge } from '@gitroom/frontend/components/ui/badge';
import { ButtonLink } from '@gitroom/frontend/components/ui/button';
import { EmptyState } from '@gitroom/frontend/components/ui/empty-state';
import { Reveal } from '@gitroom/frontend/components/ui/reveal';

export const dynamic = 'force-dynamic';
// The public layout appends " — D3 Creator" via metadata.title.template, so the
// suffix must NOT be repeated here.
export const metadata: Metadata = { title: 'Online classes' };

interface ClassRow {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
}

interface SeriesGroup {
  label: string | null;
  items: Array<ClassRow & { session: number }>;
}

/**
 * Group consecutive classes that share a derived series label, keeping the
 * server's order untouched. `session` is the GLOBAL 1-based position, not the
 * position inside the group, because the player numbers the same list globally
 * ("Part 7 of 12" via buildSeriesNav) — group-local numbering here would send a
 * viewer who clicked "Session 3" to a page that calls itself part 7.
 */
function groupBySeries(rows: ClassRow[]): SeriesGroup[] {
  const groups: SeriesGroup[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const label = deriveSeriesLabel(row.title);
    const last = groups[groups.length - 1];
    const entry = { ...row, session: i + 1 };
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }
  return groups;
}

export default async function ClassesPage() {
  const auth = await getAuthContext();
  const supabase = await getSupabaseRoute();
  const { data: videos, error } = await supabase
    .from('class_video')
    .select('id, title, description, visibility')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  // Fail closed: a query/RLS failure must not collapse into the "no classes
  // published yet" empty state and hide a real backend outage.
  if (error) throw error;

  // RLS decides what is in this list: signed-out visitors (and revoked users)
  // receive published PUBLIC rows only — members-only sessions never arrive, so
  // there is nothing to draw a lock on. The wall below explains the gap instead,
  // and deliberately never claims a count we cannot see.
  const rows = (videos ?? []) as ClassRow[];
  const groups = groupBySeries(rows);
  const signedOut = !auth;

  return (
    // One <Section> owns the whole page rhythm: two stacked Sections would put
    // 20 units of padding on each side of the hairline and leave the rule
    // floating in dead space.
    <Section space="md">
      <Container>
        <header className="border-b border-line-subtle pb-10 sm:pb-12">
          <p className="text-micro uppercase text-fg-subtle">Class library</p>
          <h1 className="mt-3 text-display-2 text-fg">Online classes</h1>
          <p className="mt-4 max-w-prose text-body-lg text-fg-muted">
            Recorded sessions from the D3 creator programme, in the order we
            teach them. Start at the first session or jump straight to the one
            you need.
          </p>
          {rows.length > 0 && (
            <p className="mt-5 text-caption text-fg-subtle">
              <span className="tnum">{rows.length}</span>
              {rows.length === 1 ? ' session' : ' sessions'} available to you ·
              streamed from Google Drive
            </p>
          )}
        </header>

        <div className="mt-10 flex flex-col gap-10 sm:mt-12 sm:gap-12">
          {signedOut && rows.length > 0 && (
            <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface-subtle p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <div className="flex min-w-0 gap-3">
                <LockGlyph className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
                <div className="min-w-0">
                  <p className="text-heading text-fg">
                    Member sessions are not listed here
                  </p>
                  <p className="mt-1.5 max-w-prose text-body text-fg-muted">
                    You are seeing the classes we publish openly. Sign in with
                    your member account to see the rest of the library.
                  </p>
                </div>
              </div>
              <ButtonLink
                size="lg"
                href="/login?redirectTo=/classes"
                className="shrink-0 self-start sm:self-auto"
              >
                Sign in
              </ButtonLink>
            </div>
          )}

          {rows.length === 0 ? (
            signedOut ? (
              <EmptyState
                icon={<LockGlyph className="h-5 w-5" />}
                title="No classes are open to the public right now"
                description="Sessions are published to signed-in members. Sign in to see the library."
                action={{
                  href: '/login?redirectTo=/classes',
                  label: 'Sign in',
                }}
                secondary={{ href: '/', label: 'Back to the showcase' }}
              />
            ) : (
              <EmptyState
                icon={<PlayGlyph className="h-5 w-5" />}
                title="No classes published yet"
                description="New sessions appear here as soon as they go live. Nothing to watch today."
                action={{ href: '/', label: 'Back to the showcase' }}
              />
            )
          ) : (
            groups.map((group) => (
              <Reveal key={`${group.label ?? 'sessions'}-${group.items[0].id}`}>
                <section aria-labelledby={`series-${group.items[0].id}`}>
                  <div className="mb-4 flex items-end justify-between gap-4 border-b border-line-subtle pb-3">
                    <div className="min-w-0">
                      {group.label && (
                        <p className="text-micro uppercase text-fg-subtle">
                          Series
                        </p>
                      )}
                      <h2
                        id={`series-${group.items[0].id}`}
                        className="mt-1 text-subsection text-fg"
                      >
                        {group.label ?? 'All sessions'}
                      </h2>
                    </div>
                    <span className="shrink-0 text-caption text-fg-subtle">
                      <span className="tnum">{group.items.length}</span>
                      {group.items.length === 1 ? ' session' : ' sessions'}
                    </span>
                  </div>

                  {/* A hairline list, not a boxed card: the rows are one
                      sequence, and an un-clipped list also lets the global
                      focus ring (2px, offset 2px) draw in full on the first
                      and last row. */}
                  <ol className="divide-y divide-line-subtle border-y border-line">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/classes/${item.id}`}
                          className="group flex items-start gap-4 p-4 transition-colors duration-150 ease-out hover:bg-white/[0.03] sm:items-center sm:gap-5 sm:p-5"
                        >
                          {/* No poster art exists for a class (the row carries
                              no thumbnail and the Drive file id is not read on
                              this page), so the tile is an honest numbered
                              placeholder rather than a fabricated still. */}
                          <span
                            aria-hidden="true"
                            className="grid aspect-video w-20 shrink-0 place-items-center rounded-lg border border-line bg-surface-subtle transition-colors duration-150 ease-out group-hover:border-line-strong sm:w-28"
                          >
                            <PlayGlyph className="h-4 w-4 text-fg-subtle transition-colors duration-150 ease-out group-hover:text-fg" />
                          </span>

                          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <h3 className="text-heading text-fg">
                              {item.title}
                            </h3>
                            {item.description && (
                              <p className="line-clamp-2 text-body-sm text-fg-muted">
                                {item.description}
                              </p>
                            )}
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-caption text-fg-subtle">
                              <span className="tnum">
                                Session {item.session}
                              </span>
                              <span aria-hidden="true">·</span>
                              {item.visibility === 'members' ? (
                                <Badge tone="muted">
                                  <LockGlyph className="h-3 w-3" />
                                  Members only
                                </Badge>
                              ) : (
                                <Badge tone="muted">
                                  <GlobeGlyph className="h-3 w-3" />
                                  Public
                                </Badge>
                              )}
                            </span>
                          </div>

                          <span
                            aria-hidden="true"
                            className="mt-1 shrink-0 text-fg-subtle transition-colors duration-150 ease-out group-hover:text-fg sm:mt-0"
                          >
                            <ArrowGlyph className="h-4 w-4" />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              </Reveal>
            ))
          )}
        </div>
      </Container>
    </Section>
  );
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M4.5 3.2 12.6 8l-8.1 4.8z" />
    </svg>
  );
}

function LockGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      className={className}
    >
      <rect x="3.25" y="6.75" width="9.5" height="7" rx="1.6" />
      <path d="M5.5 6.75V5a2.5 2.5 0 0 1 5 0v1.75" strokeLinecap="round" />
    </svg>
  );
}

function GlobeGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="5.75" />
      <path d="M2.5 8h11M8 2.25c1.6 1.7 2.4 3.6 2.4 5.75S9.6 12.05 8 13.75c-1.6-1.7-2.4-3.6-2.4-5.75S6.4 3.95 8 2.25Z" />
    </svg>
  );
}

function ArrowGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M3.5 8h9M9 4.5 12.5 8 9 11.5" />
    </svg>
  );
}
