/**
 * Unit tests for loadPlaybook. `getSupabaseAdmin` is mocked, so these run
 * offline with no database connection.
 *
 * EVERY TEST RE-IMPORTS THE MODULE. `loadPlaybook` caches in module scope, and
 * a shared module instance would let the first successful test warm the cache
 * for all the others — the "a failure is not cached" case would then be served
 * the earlier test's content and pass without exercising anything. That is a
 * test that goes green when the behaviour it guards is deleted, so the reset is
 * not tidiness; it is the point.
 */
/** The stable spy every module instance ends up calling. It must live OUTSIDE
 *  the factory: `jest.resetModules()` re-runs that factory, so a bare
 *  `getSupabaseAdmin: jest.fn()` would hand each fresh `chat-playbook` a
 *  BRAND-NEW mock while the test kept configuring the old one. Every stubbed
 *  result would then be ignored and the loader would see `undefined` — which
 *  still returns `''`, so two of the tests below would have passed anyway.
 *  The name must begin with `mock` for jest's hoisting rule to allow the
 *  factory to close over it. */
const mockAdmin = jest.fn();

jest.mock('@d3/database', () => ({
  getSupabaseAdmin: () => mockAdmin(),
}));

type Result = { data: { content: string } | null; error: unknown };

/** Fake PostgREST builder: chain shape is from→select→eq→maybeSingle. Counts
 *  the reads so "did not hit the database again" is an assertion and not a
 *  guess. */
function fakeClient(results: Result[]) {
  const ids: string[] = [];
  let call = 0;
  const from = jest.fn(() => {
    const q = {
      select: jest.fn(() => q),
      eq: jest.fn((_col: string, id: string) => {
        ids.push(id);
        return q;
      }),
      maybeSingle: jest.fn(() =>
        Promise.resolve(results[Math.min(call++, results.length - 1)]),
      ),
    };
    return q;
  });
  return { client: { from }, from, ids };
}

const ok = (content: string): Result => ({ data: { content }, error: null });

/** A fresh module instance, so the module-scope cache starts cold. */
async function freshModule() {
  jest.resetModules();
  return import('./chat-playbook');
}

/** The playbook text never appears in a log line, so nothing real is needed —
 *  only something non-blank that survives the trim check. */
const PLAYBOOK = '## Foundation rules\n\nSome playbook prose.\n';

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  mockAdmin.mockReset();
  // The loader logs on every failure path on purpose; silence it so a passing
  // run is not full of red herrings.
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => errorSpy.mockRestore());

test('a successful read returns the content of the PLAYBOOK_ID row', async () => {
  const { client, ids } = fakeClient([ok(PLAYBOOK)]);
  mockAdmin.mockReturnValue(client);

  const { loadPlaybook, PLAYBOOK_ID } = await freshModule();

  expect(await loadPlaybook()).toBe(PLAYBOOK);
  // The row is selected by id, and by THAT id — a loader reading whatever row
  // came back first would pass every other assertion here.
  expect(ids).toEqual([PLAYBOOK_ID]);
  expect(PLAYBOOK_ID).toBe('d3-method');
});

test('a second call is served from memory and does not hit the database', async () => {
  // The second result differs, so a cache that is not working returns it and
  // this fails loudly rather than coincidentally agreeing.
  const { client, from } = fakeClient([ok(PLAYBOOK), ok('DIFFERENT')]);
  mockAdmin.mockReturnValue(client);

  const { loadPlaybook } = await freshModule();

  expect(await loadPlaybook()).toBe(PLAYBOOK);
  expect(await loadPlaybook()).toBe(PLAYBOOK);
  expect(from).toHaveBeenCalledTimes(1);
});

test('a failed read returns empty and is NOT cached, so the next read works', async () => {
  const { client, from } = fakeClient([
    { data: null, error: { message: 'connection reset' } },
    ok(PLAYBOOK),
  ]);
  mockAdmin.mockReturnValue(client);

  const { loadPlaybook } = await freshModule();

  // '' is what makes isPlaybookReady false, which is the route's existing 503.
  expect(await loadPlaybook()).toBe('');
  // The retry is the whole point: a cached failure would 503 the coach for the
  // life of the process, and a redeploy would be the only cure.
  expect(await loadPlaybook()).toBe(PLAYBOOK);
  expect(from).toHaveBeenCalledTimes(2);
});

test('a missing row is a failure too, and is not cached either', async () => {
  // PostgREST reports a missing row as a perfectly successful read of nothing.
  // This is the case the no-caching rule actually exists for: it is what the
  // deploy looks like BEFORE the maintainer seeds the row, and caching it would
  // keep the coach down after they did.
  const { client, from } = fakeClient([
    { data: null, error: null },
    ok(PLAYBOOK),
  ]);
  mockAdmin.mockReturnValue(client);

  const { loadPlaybook } = await freshModule();

  expect(await loadPlaybook()).toBe('');
  expect(await loadPlaybook()).toBe(PLAYBOOK);
  expect(from).toHaveBeenCalledTimes(2);
});

test('a blank row is not cached, and never reaches the route as content', async () => {
  // Whitespace fails isPlaybookReady, so caching it would be caching a failure
  // under another name.
  const { client } = fakeClient([ok('   \n  '), ok(PLAYBOOK)]);
  mockAdmin.mockReturnValue(client);

  const { loadPlaybook } = await freshModule();

  expect(await loadPlaybook()).toBe('');
  expect(await loadPlaybook()).toBe(PLAYBOOK);
});

test('a throwing getSupabaseAdmin becomes an empty string, never an exception', async () => {
  // Missing Supabase env vars. The route calls this inside a Promise.all with
  // no catch of its own, so a throw here would be an unhandled rejection and
  // Next's HTML error page instead of the logged 503.
  mockAdmin.mockImplementation(() => {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is required');
  });

  const { loadPlaybook } = await freshModule();

  await expect(loadPlaybook()).resolves.toBe('');
});

/* -------------------------------------------------------------------------- */
/* readPlaybook — the distinction /studio/chat's pre-flight depends on          */
/* -------------------------------------------------------------------------- */

/**
 * These four are the guard against ONE specific bug: swapping `loadPlaybook()`
 * into the page's pre-flight. That collapses "the database never answered" into
 * `''`, `isPlaybookReady('')` is false, and the page then renders "coach not
 * ready" — locking every user out of a coach that works perfectly — on any
 * blip. The pre-flight's whole design is that only a playbook it could READ may
 * mark the coach down.
 */

test('readPlaybook reports ok:false when the read itself fails — never a blank playbook', async () => {
  const { client } = fakeClient([
    { data: null, error: { message: 'connection reset' } },
  ]);
  mockAdmin.mockReturnValue(client);

  const { readPlaybook } = await freshModule();

  // The pre-flight reads this as "I know nothing" and stays READY. If this ever
  // becomes { ok: true, content: '' }, the page goes down on a blip.
  expect(await readPlaybook()).toEqual({ ok: false });
});

test('readPlaybook reports ok:true with blank content when the row is missing', async () => {
  const { client } = fakeClient([{ data: null, error: null }]);
  mockAdmin.mockReturnValue(client);

  const { readPlaybook } = await freshModule();

  // The database ANSWERED, and the answer was "nothing is stored". That is a
  // coach which genuinely cannot reply, so the pre-flight is right to mark it
  // down — the opposite call from the case above, on the same '' content.
  expect(await readPlaybook()).toEqual({ ok: true, content: '' });
});

test('readPlaybook returns the content on a successful read', async () => {
  const { client } = fakeClient([ok(PLAYBOOK)]);
  mockAdmin.mockReturnValue(client);

  const { readPlaybook } = await freshModule();

  expect(await readPlaybook()).toEqual({ ok: true, content: PLAYBOOK });
});

test('loadPlaybook flattens both not-ready outcomes to the same empty string', async () => {
  // The route cannot act on the difference and must not be made to: '' is its
  // single, already-logged 503 path.
  const failed = fakeClient([{ data: null, error: { message: 'boom' } }]);
  mockAdmin.mockReturnValue(failed.client);
  const first = await freshModule();
  expect(await first.loadPlaybook()).toBe('');

  const missing = fakeClient([{ data: null, error: null }]);
  mockAdmin.mockReturnValue(missing.client);
  const second = await freshModule();
  expect(await second.loadPlaybook()).toBe('');
});

test('every failure logs the one greppable line, and never the playbook text', async () => {
  const { client } = fakeClient([{ data: null, error: { message: 'boom' } }]);
  mockAdmin.mockReturnValue(client);

  const { loadPlaybook } = await freshModule();
  await loadPlaybook();

  expect(errorSpy).toHaveBeenCalledWith(
    '[chat] playbook read failed',
    expect.anything(),
  );
});
