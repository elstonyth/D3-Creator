/** @jest-environment jsdom */
/**
 * The Settings form's round-trip contract: a save that touches nothing must send
 * back exactly what was stored.
 *
 * `parseProfileUpdate` is a FULL REPLACE, and its own comment says why that is
 * dangerous — a full replace of a partial body "silently nulls whatever it
 * omitted and answers 200". The form is what stands between the user and that,
 * by threading all 18 editable columns through `formFrom`. Nothing checked it.
 *
 * NOTHING HERE RESTATES THE COLUMN LIST. A second copy of today's 18 names would
 * only move the drift instead of catching it, so the source of truth stays in
 * `business-profile.ts` on both axes:
 *
 *  - WHILE WRITING: `EDITABLE` is typed `ProfileUpdateInput`, so an editor
 *    rejects this fixture the moment a column is added to or removed from that
 *    interface, and rejects any value outside its vocabulary. That is an
 *    authoring aid ONLY — `apps/frontend/tsconfig.json` excludes every
 *    `.test.ts`/`.test.tsx` under `src`, and ts-jest transpiles with
 *    `isolatedModules`, so NOTHING in CI type-checks this file. Never rely on
 *    it as a gate; the runtime check below is what holds.
 *  - IN CI: `parseProfileUpdate` is the oracle, and the only enforcement that
 *    actually runs. It rejects a body carrying an unknown key AND a body
 *    missing any key, so `ok: true` is precisely the assertion "this key set
 *    === UPDATE_KEYS". The FIRST test applies it to the fixture itself, which is
 *    what turns a column added to `UPDATE_KEYS` and forgotten here into a loud
 *    failure instead of a quietly shrinking round-trip. `UPDATE_KEYS` is not
 *    exported, and was deliberately not exported for this test.
 *
 * Between them the two catch the drift in both directions, including drift
 * between `ProfileUpdateInput` and `UPDATE_KEYS` themselves — two hand-kept
 * lists in one file that nothing else compares.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';

import {
  parseProfileUpdate,
  type BusinessProfile,
  type ProfileUpdateInput,
} from '@gitroom/frontend/lib/business-profile';

import { ProfileSettingsForm } from './profile-settings-form';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

/**
 * Every editable column, each holding a DISTINCT non-null value.
 *
 * Distinct is load-bearing: two columns sharing a value would let a mix-up in
 * `formFrom` pass `toEqual` below. So `creator_role` is not `'other'` even
 * though `business_type` must be, and `reply_language` is not
 * `content_language` — those two are independent settings on purpose.
 *
 * No leading, trailing, or doubled whitespace anywhere: the parser trims and the
 * preview's `clean()` collapses runs, and either would rewrite a value in
 * transit and read like a form bug. The first test pins that down.
 */
const EDITABLE: ProfileUpdateInput = {
  what_you_sell: 'refurbished phones with a one-year warranty',
  who_buys_it: 'students and first-job office workers',
  main_platform: 'tiktok',
  on_camera: 'sometimes',
  content_language: 'malay',
  // Forced to 'other'. The migration's `user_profile_other_needs_text` CHECK —
  // mirrored in the parser — allows `business_type_other` to be non-null ONLY
  // here, and this fixture needs all 18 columns non-null to mean anything.
  business_type: 'other',
  business_type_other: 'phone repair and trade-in',
  location: 'Petaling Jaya',
  tone: 'direct',
  business_name: 'Ah Meng Mobile',
  typical_video_seconds: 60,
  already_tried: 'posted twelve unboxing clips, none passed 400 views',
  things_to_avoid: 'no price talk, no discount claims, never say cheapest',
  creator_role: 'freelancer',
  reach: '1k_10k',
  content_pillars: 'trade-in maths, battery myths, before-and-after repairs',
  voice_notes: 'short sentences, Manglish asides, no hard sell at the end',
  reply_language: 'english',
};

/** The stored row. Spreads `EDITABLE`, so the row and the body expected back
 *  from it can never disagree about a value. */
const PROFILE: BusinessProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  ...EDITABLE,
  is_active: true,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-24T09:30:00.000Z',
};

/** The five columns a body must never name. `is_active` is the dangerous one:
 *  the route picks its target row BY that column, and naming it in an UPDATE
 *  fires the `before insert or update of is_active` trigger — so editing a
 *  business would switch to it. */
const METADATA_KEYS = [
  'id',
  'user_id',
  'is_active',
  'created_at',
  'updated_at',
];

const FAILURE = 'Could not save that. Try again.';

type FetchMock = jest.Mock<Promise<{ ok: boolean; status: number }>, unknown[]>;

/** jsdom has no Response; the handler only reads `ok`. */
function mockFetch(ok = true): FetchMock {
  const fetchMock: FetchMock = jest.fn(async () => ({
    ok,
    status: ok ? 200 : 400,
  }));
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function renderForm(overrides: Partial<BusinessProfile> = {}) {
  return render(<ProfileSettingsForm profile={{ ...PROFILE, ...overrides }} />);
}

/**
 * jsdom does not submit a form from a button click, so the submit event goes to
 * the form element directly — which is also why the exemplar chat test does it
 * this way. The `act` wrapper is for the handler's `await fetch`, not the event.
 */
async function save(): Promise<void> {
  await act(async () => {
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save changes' }).closest('form')!,
    );
  });
}

/** The parsed PATCH body, with the request line checked on the way past. */
function patchBody(fetchMock: FetchMock): Record<string, unknown> {
  // Checked here, not just at the call sites: a column missing from `formFrom`
  // makes the parser refuse and the handler return BEFORE fetch, so without this
  // every test below would report an unreadable "undefined is not iterable"
  // instead of naming the save that never happened.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [
    string,
    { method: string; body: string },
  ];
  expect(url).toBe('/api/studio/profile');
  expect(init.method).toBe('PATCH');
  return JSON.parse(init.body);
}

function status(): string {
  return screen.getByRole('status').textContent ?? '';
}

/* -------------------------------------------------------------------------- */

it('the fixture still holds exactly the editable column set, unchanged by the parser', () => {
  // THE DRIFT DETECTOR, and the reason this file needs no list of column names.
  //
  // `ok: true` fails the moment the fixture is missing a key that `UPDATE_KEYS`
  // has (a column added to the schema and forgotten here, which would otherwise
  // just shrink the round-trip's coverage in silence) or carries one it does not.
  //
  // `value: EDITABLE` additionally proves every string is inside its
  // PROFILE_LIMITS cap — those are runtime-only — and that nothing is rewritten
  // in transit. The parser trims and the preview's `clean()` collapses
  // whitespace runs, so a stray space in a fixture string would otherwise fail
  // the tests below and read like a defect in the form.
  expect(parseProfileUpdate(EDITABLE)).toEqual({ ok: true, value: EDITABLE });
});

it('a save that touches nothing sends every stored column back unchanged, and no metadata column', async () => {
  const fetchMock = mockFetch();
  renderForm();

  await save();

  // A column MISSING from `formFrom` never reaches the assertion below: the
  // parser refuses the body on the missing key and the handler returns before
  // fetch. So the drop shows up here, as a call that never happened.
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(status()).toBe('Saved.');

  const body = patchBody(fetchMock);

  // The real cross-check. A column seeded from the wrong place in `formFrom`
  // keeps its key and arrives `null` against a non-null fixture value — which is
  // exactly the "silently nulls a column and answers 200" bug, caught here.
  expect(body).toEqual(EDITABLE);

  // Implied by the line above, kept because it names the hazard rather than
  // leaving a future reader to infer it from a deep-equal.
  for (const key of METADATA_KEYS) {
    expect(key in body).toBe(false);
  }
});

it('a changed field marks the form dirty and the new value reaches the body', async () => {
  const fetchMock = mockFetch();
  renderForm();

  // Nothing typed yet, so the status line is empty rather than warning.
  expect(status()).toBe('');

  fireEvent.change(screen.getByDisplayValue(EDITABLE.business_name!), {
    target: { value: 'Ah Meng Mobile 2' },
  });
  expect(status()).toBe('You have unsaved changes.');

  await save();
  expect(patchBody(fetchMock)).toEqual({
    ...EDITABLE,
    business_name: 'Ah Meng Mobile 2',
  });
});

it('clearing an optional text field sends null, not an empty string', async () => {
  const fetchMock = mockFetch();
  renderForm();

  fireEvent.change(screen.getByDisplayValue(EDITABLE.location!), {
    target: { value: '' },
  });
  await save();

  // `''` would pass the column's CHECK and store a blank string that every
  // consumer downstream then has to treat as "set". `optionalText` is what turns
  // it into a real null, and the form has to hand it a blank to get there.
  expect(patchBody(fetchMock)).toEqual({ ...EDITABLE, location: null });
});

it('the Reply language blank option reads "Same as content language" and saves null', async () => {
  const fetchMock = mockFetch();
  renderForm();

  // Blank is a MEANING on this control — "follow content_language", which is
  // what every row did before the column existed — not an unfinished field. The
  // default "Choose one" placeholder would read as the latter, so the wording is
  // part of the contract, and the option has to be selectable at all.
  const blank = screen.getByText(
    'Same as content language',
  ) as HTMLOptionElement;
  expect(blank.disabled).toBe(false);

  fireEvent.change(blank.closest('select')!, { target: { value: '' } });
  await save();

  expect(patchBody(fetchMock)).toEqual({ ...EDITABLE, reply_language: null });
});

it('a rejected save shows the failure and keeps every typed value', async () => {
  const fetchMock = mockFetch(false);
  renderForm();

  fireEvent.change(screen.getByDisplayValue(EDITABLE.voice_notes!), {
    target: { value: 'clipped delivery, no outro' },
  });
  await save();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(status()).toBe(FAILURE);
  // This form does not unmount on save and `router.refresh` is mocked, so the
  // only thing that could empty the field is the component. Losing a 500-char
  // voice note to one failed request is the whole reason it is asserted.
  expect(screen.getByDisplayValue('clipped delivery, no outro')).toBeTruthy();
});

it('choosing Other reveals the free text, and Other left blank is refused before any fetch', async () => {
  const fetchMock = mockFetch();
  // The one test that cannot use the shared fixture: it needs to START on a
  // type that is not 'other', and the CHECK pair forces the free text null there.
  renderForm({ business_type: 'retail', business_type_other: null });

  const freeText = 'e.g. phone repair and trade-in';
  expect(screen.queryByPlaceholderText(freeText)).toBeNull();

  fireEvent.change(screen.getByText('Retail').closest('select')!, {
    target: { value: 'other' },
  });
  expect(screen.getByPlaceholderText(freeText)).toBeTruthy();

  // Both halves of `user_profile_other_needs_text` are mirrored in the parser,
  // so this pair is refused in the browser. The request that would have come
  // back as a Postgres 23514 dressed up as a 500 is never sent at all.
  await save();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(status()).toBe(FAILURE);
});

it('the preview shows what is typed, not what is stored', () => {
  renderForm();
  fireEvent.click(screen.getByRole('button', { name: /What the coach reads/ }));

  // The panel runs the SAME `renderProfileBlock` the model is given, off
  // `toPreviewProfile` — a SECOND thread of all 18 columns, separate from the one
  // the save uses. A column dropped there shows the STORED value forever, and no
  // assertion on the PATCH body can see it: that body is built from `form`
  // directly and never passes through `toPreviewProfile` at all.
  const panel = () => document.querySelector('pre')?.textContent ?? '';
  expect(panel()).toContain(EDITABLE.voice_notes!);

  fireEvent.change(screen.getByDisplayValue(EDITABLE.voice_notes!), {
    target: { value: 'clipped delivery, no outro' },
  });
  expect(panel()).toContain('clipped delivery, no outro');
  expect(panel()).not.toContain(EDITABLE.voice_notes!);
});

it('renders exactly one control per editable column', () => {
  renderForm();

  // The fourth thread, and the one nothing else here can see. A column can be
  // seeded by `formFrom`, mirrored in `toPreviewProfile` and labelled in
  // `LABELS` and STILL have no control on the page — delete a `<textarea>` and
  // every other test in this file passes, because the round-trip never touches
  // a field and the state it round-trips is still correct. The user simply
  // cannot edit that column any more.
  //
  // Counted off the fixture, never a hand-written 18. It trips on a column with
  // two controls as well as a column with none; both are bugs.
  //
  // `business_type` is 'other' in the fixture, which is what keeps the
  // conditional `business_type_other` input mounted and the count at parity.
  expect(document.querySelectorAll('input, textarea, select')).toHaveLength(
    Object.keys(EDITABLE).length,
  );
});

it('every select option renders a display label, never a raw stored slug', () => {
  renderForm();

  // The fifth thread. `LABELS` is keyed by column, kept by hand, and read as
  // `labels[slug] ?? slug` — it FALLS BACK to the slug rather than failing, so a
  // vocabulary that grows a value nobody labelled ships a control reading
  // "business_owner" and no test notices. Checked across every control at once,
  // without restating a single label here.
  const options = Array.from(document.querySelectorAll('option'));
  expect(options.length).toBeGreaterThan(0);
  for (const option of options) {
    expect(option.textContent).not.toBe(option.value);
  }
});
