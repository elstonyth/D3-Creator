/** @jest-environment jsdom */
/**
 * After a reset the account goes where the page says it belongs. It used to
 * be /studio/chat on every host — a creator page, even for staff on
 * staff.d3creator.com.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ResetPasswordForm } from './reset-password-form';

const push = jest.fn();
const updateUser = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
}));
jest.mock('@gitroom/frontend/lib/supabase-browser', () => ({
  getSupabaseBrowser: () => ({
    auth: {
      getSession: async () => ({ data: { session: {} } }),
      updateUser,
    },
  }),
}));

beforeEach(() => {
  push.mockReset();
  updateUser.mockReset();
  updateUser.mockResolvedValue({ error: null });
});

it.each(['/', '/studio/chat'])(
  'goes to %s once the password is set',
  async (to) => {
    render(<ResetPasswordForm redirectTo={to} />);
    for (const placeholder of ['At least 8 characters', 'Type it again'])
      fireEvent.change(await screen.findByPlaceholderText(placeholder), {
        target: { value: 'a decent long passphrase' },
      });
    fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(to));
    expect(updateUser).toHaveBeenCalledWith({
      password: 'a decent long passphrase',
    });
  },
);
