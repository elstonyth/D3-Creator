import { notFound, redirect } from 'next/navigation';

import { getAuthContext, type UserRole } from '@gitroom/frontend/lib/auth';
import { getSupabaseRoute } from '@gitroom/frontend/lib/supabase-route';
import ClassPlayerPage from './page';

jest.mock('next/navigation', () => ({
  // Both throw for real, and the page relies on it: nothing after them runs.
  redirect: jest.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
  notFound: jest.fn(() => {
    throw new Error('notFound');
  }),
}));
jest.mock('@gitroom/frontend/lib/i18n-server', () => ({ getI18n: jest.fn() }));
jest.mock('@gitroom/frontend/lib/supabase-route', () => ({
  getSupabaseRoute: jest.fn(),
}));
// Only who is signed in is faked; the real isStudioMember decides.
jest.mock('@gitroom/frontend/lib/auth', () => ({
  ...jest.requireActual('@gitroom/frontend/lib/auth'),
  getAuthContext: jest.fn(),
}));
jest.mock('@gitroom/frontend/components/classes/class-player', () => ({
  ClassPlayer: () => null,
}));

const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

/** A signed-in viewer for whom RLS returns no row for the class. */
function signedInWithNoRow(role: UserRole): void {
  (getAuthContext as jest.Mock).mockResolvedValue({
    userId: 'u1',
    email: 'someone@example.com',
    role,
    hasRoleRow: true,
    creatorLink: null,
  });
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: async () => ({ data: null, error: null }),
  };
  (getSupabaseRoute as jest.Mock).mockResolvedValue({ from: () => query });
}

function open() {
  return ClassPlayerPage({ params: Promise.resolve({ id: ID }) });
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('sends a signed-in non-member to /classes instead of a 404', async () => {
  signedInWithNoRow('none');
  await expect(open()).rejects.toThrow('redirect /classes');
  expect(redirect).toHaveBeenCalledWith('/classes');
  expect(notFound).not.toHaveBeenCalled();
});

it('still answers a member with a 404 for a class that is not there', async () => {
  signedInWithNoRow('member');
  await expect(open()).rejects.toThrow('notFound');
  expect(redirect).not.toHaveBeenCalled();
});
