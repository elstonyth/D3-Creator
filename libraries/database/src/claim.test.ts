/**
 * Unit tests for the pure claim helpers.
 * Run with: npx jest --config libraries/database/jest.config.cjs
 *
 * decideInitialClaimKind is the owner-vs-pending decision that gates profile
 * ownership, so it is worth real coverage — and it is a pure function, so it
 * needs no DB at all. It used to sit in the same file as the Supabase-backed
 * integration tests, which called getSupabaseAdmin() at module scope; that made
 * the whole file throw on import without a live stack, and CI never ran any of
 * it. The DB-backed half now lives in claim.integration.test.ts (node:test,
 * manual run); these pure tests run under jest with the rest of the library.
 *
 * Imported through ./index rather than ./claim so this exercises the same
 * public surface callers use. (normalizeHandle is defined in profile-url.ts and
 * re-exported there; it is tested here because claim's handle-matching is its
 * caller.)
 */

import { decideInitialClaimKind, normalizeHandle } from './index';

describe('normalizeHandle', () => {
  it('folds case + separators', () => {
    expect(normalizeHandle('John.Smith')).toBe('johnsmith');
    expect(normalizeHandle('j_smith_')).toBe('jsmith');
    expect(normalizeHandle('JANE-DOE')).toBe('janedoe');
  });
  it('strips trailing platform suffix conventions', () => {
    expect(normalizeHandle('johnofficial')).toBe('john');
    expect(normalizeHandle('jane.tv')).toBe('jane');
    expect(normalizeHandle('alex_real')).toBe('alex');
    expect(normalizeHandle('sam_ig')).toBe('sam');
  });
  it('handles null/empty', () => {
    expect(normalizeHandle(null)).toBe('');
    expect(normalizeHandle(undefined)).toBe('');
    expect(normalizeHandle('')).toBe('');
  });
});

describe('decideInitialClaimKind', () => {
  it('returns owner when profile was just created', () => {
    const k = decideInitialClaimKind({
      created: true,
      profileHandle: 'foo',
      onboardingHandles: [],
    });
    expect(k).toBe('owner');
  });
  it('returns owner when handle matches caller history (case/separator-insensitive)', () => {
    const k = decideInitialClaimKind({
      created: false,
      profileHandle: 'J.Smith',
      onboardingHandles: ['jsmith'],
    });
    expect(k).toBe('owner');
  });
  it('returns pending when handle does not match anything caller knows', () => {
    const k = decideInitialClaimKind({
      created: false,
      profileHandle: 'someone_else',
      onboardingHandles: ['jsmith', 'janed'],
    });
    expect(k).toBe('pending');
  });
  it('returns pending when caller has no known handles', () => {
    const k = decideInitialClaimKind({
      created: false,
      profileHandle: 'foo',
      onboardingHandles: [],
    });
    expect(k).toBe('pending');
  });
});
