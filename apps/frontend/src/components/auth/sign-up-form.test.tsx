/** @jest-environment jsdom */
/**
 * The three outcomes of `signUp()` that the form has to tell apart. The one
 * that caused a production support case is the first: an address that already
 * has a CONFIRMED account comes back looking like a fresh signup — no session,
 * a fake user id, a decoy `confirmation_sent_at` — and the only thing marking
 * it is the empty `identities` array. Getting that wrong sends a real user to
 * wait on a mail GoTrue never sends.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SignUpForm } from './sign-up-form';

const signUp = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock('@gitroom/frontend/lib/supabase-browser', () => ({
  getSupabaseBrowser: () => ({ auth: { signUp } }),
}));

/** What GoTrue returns for an address that is already registered. */
const OBFUSCATED = {
  data: {
    user: { id: 'fake-uuid', email: 'taken@example.com', identities: [] },
    session: null,
  },
  error: null,
};

/** What it returns for a genuinely new address, confirmation on. */
const NEW_ACCOUNT = {
  data: {
    user: {
      id: 'real-uuid',
      email: 'new@example.com',
      identities: [{ id: 'i1', provider: 'email' }],
    },
    session: null,
  },
  error: null,
};

function submit(address: string): void {
  fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
    target: { value: address },
  });
  fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), {
    target: { value: 'a decent long passphrase' },
  });
  fireEvent.click(screen.getByRole('button', { name: /create account/i }));
}

beforeEach(() => {
  signUp.mockReset();
});

it('says the account already exists when identities comes back empty', async () => {
  signUp.mockResolvedValue(OBFUSCATED);
  render(<SignUpForm />);
  submit('taken@example.com');

  await screen.findByText('You already have an account.');
  expect(screen.queryByText('Check your email.')).toBeNull();
  // Both exits, since the whole point is that no mail is coming.
  expect(
    screen.getByRole('link', { name: /^sign in$/i }).getAttribute('href')
  ).toBe('/login');
  expect(
    screen
      .getByRole('link', { name: /reset your password/i })
      .getAttribute('href')
  ).toBe('/forgot-password');
});

it('still sends a new address to its inbox', async () => {
  signUp.mockResolvedValue(NEW_ACCOUNT);
  render(<SignUpForm />);
  submit('new@example.com');

  await screen.findByText('Check your email.');
  expect(screen.queryByText('You already have an account.')).toBeNull();
});

it('does not claim a resend happened when the resend errored', async () => {
  signUp.mockResolvedValueOnce(NEW_ACCOUNT).mockResolvedValueOnce({
    data: { user: null, session: null },
    error: { code: 'over_email_send_rate_limit', status: 429 },
  });
  render(<SignUpForm />);
  submit('new@example.com');
  await screen.findByText('Check your email.');

  fireEvent.click(screen.getByRole('button', { name: /resend the link/i }));

  await screen.findByRole('alert');
  await waitFor(() => expect(signUp).toHaveBeenCalledTimes(2));
  expect(screen.queryByText('Requested again just now.')).toBeNull();
});

it('switches to the taken screen when a RESEND finds the address confirmed', async () => {
  signUp.mockResolvedValueOnce(NEW_ACCOUNT).mockResolvedValueOnce(OBFUSCATED);
  render(<SignUpForm />);
  submit('new@example.com');
  await screen.findByText('Check your email.');

  fireEvent.click(screen.getByRole('button', { name: /resend the link/i }));

  await screen.findByText('You already have an account.');
  // Backing out must reach the form, not the screen the resend came from.
  fireEvent.click(
    screen.getByRole('button', { name: /use a different email/i })
  );
  await screen.findByRole('button', { name: /create account/i });
  expect(screen.queryByText('Check your email.')).toBeNull();
});
