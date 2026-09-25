/** @jest-environment jsdom */
/**
 * "Check your email" is only honest when Supabase accepted the request. Before
 * this, anything but a 429 — a dropped connection, a mail outage — landed on
 * the success screen and left the user waiting on a mail that was never sent.
 */

import { fireEvent, render, screen } from '@testing-library/react';

import { ForgotPasswordForm } from './forgot-password-form';
import { LocaleProvider } from '../i18n/locale-provider';

const resetPasswordForEmail = jest.fn();

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
  getSupabaseBrowser: () => ({ auth: { resetPasswordForEmail } }),
}));

function submit(button: string): void {
  fireEvent.change(screen.getByPlaceholderText('you@email.com'), {
    target: { value: 'someone@example.com' },
  });
  fireEvent.click(screen.getByRole('button', { name: button }));
}

beforeEach(() => {
  resetPasswordForEmail.mockReset();
});

it('says the send failed instead of claiming a mail is on its way', async () => {
  resetPasswordForEmail.mockResolvedValue({
    data: null,
    error: { status: 500, message: 'x' },
  });
  render(<ForgotPasswordForm />);
  submit('Send reset link');

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(
    'Could not send the link. Try again in a moment.',
  );
  expect(screen.queryByText('Check your email.')).toBeNull();
});

it('shows the sent screen when Supabase accepted the request', async () => {
  resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  render(<ForgotPasswordForm />);
  submit('Send reset link');

  await screen.findByText('Check your email.');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('names the rate limit', async () => {
  resetPasswordForEmail.mockResolvedValue({
    data: null,
    error: { code: 'over_email_send_rate_limit' },
  });
  render(<ForgotPasswordForm />);
  submit('Send reset link');

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(
    'Too many emails sent to that address. Wait a few minutes and try again.',
  );
  expect(screen.queryByText('Check your email.')).toBeNull();
});

it('has Chinese copy for the send failure', async () => {
  // The sentence reaches the page through t(error), which the i18n literal
  // scan cannot see, so this is what proves it is translated.
  resetPasswordForEmail.mockResolvedValue({
    data: null,
    error: { status: 500, message: 'x' },
  });
  render(
    <LocaleProvider locale="zh">
      <ForgotPasswordForm />
    </LocaleProvider>,
  );
  submit('发送重设密码链接');

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('链接发送失败，请稍后再试。');
});
