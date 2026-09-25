/** @jest-environment jsdom */
/**
 * A sign-in request that throws — rather than returning an error — used to
 * leave the button spinning with nothing on screen. It has to say so and hand
 * the form back.
 */

import { fireEvent, render, screen } from '@testing-library/react';

import { SignInForm } from './sign-in-form';
import { LocaleProvider } from '../i18n/locale-provider';

const signInWithPassword = jest.fn();

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
  getSupabaseBrowser: () => ({ auth: { signInWithPassword } }),
}));

function submit(passwordPlaceholder: string, button: string): void {
  fireEvent.change(screen.getByPlaceholderText('you@agency.com'), {
    target: { value: 'someone@example.com' },
  });
  fireEvent.change(screen.getByPlaceholderText(passwordPlaceholder), {
    target: { value: 'a decent long passphrase' },
  });
  fireEvent.click(screen.getByRole('button', { name: button }));
}

beforeEach(() => {
  signInWithPassword.mockReset();
});

it('says the request failed and hands the form back when sign-in throws', async () => {
  signInWithPassword.mockRejectedValue(new Error('network'));
  render(<SignInForm />);
  submit('Your password', 'Sign in');

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain(
    'Could not sign in. Check your connection and try again.',
  );
  const button = screen.getByRole('button', {
    name: 'Sign in',
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
});

it('still reads a returned credentials error as such', async () => {
  signInWithPassword.mockResolvedValue({
    data: { user: null, session: null },
    error: { code: 'invalid_credentials' },
  });
  render(<SignInForm />);
  submit('Your password', 'Sign in');

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Invalid email or password.');
});

it('has Chinese copy for the thrown failure', async () => {
  // The sentence reaches the page through t(error), which the i18n literal
  // scan cannot see, so this is what proves it is translated.
  signInWithPassword.mockRejectedValue(new Error('network'));
  render(
    <LocaleProvider locale="zh">
      <SignInForm />
    </LocaleProvider>,
  );
  submit('您的密码', '登录');

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('登录失败，请检查网络后重试。');
});
