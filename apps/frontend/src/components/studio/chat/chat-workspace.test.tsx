/** @jest-environment jsdom */
/**
 * The thinking indicator's contract: animated dots appear the moment a send is
 * in flight, the reassurance line joins at SLOW_REPLY_AT_MS, and the whole
 * block leaves when the reply lands.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ChatWorkspace } from './chat-workspace';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), push: jest.fn() }),
}));

// jsdom implements neither; the component calls both on send.
beforeAll(() => {
  Element.prototype.scrollTo = jest.fn();
  // jsdom's AbortSignal has no static timeout(); without this the send path
  // throws while BUILDING the fetch options and pending never survives a tick.
  if (typeof AbortSignal.timeout !== 'function') {
    AbortSignal.timeout = () => new AbortController().signal;
  }
  // jsdom's crypto has no randomUUID; the component keys local turns with it.
  if (typeof crypto.randomUUID !== 'function') {
    let n = 0;
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => `00000000-0000-4000-8000-${String(n++).padStart(12, '0')}`,
    });
  }
  window.matchMedia = jest.fn().mockReturnValue({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }) as unknown as typeof window.matchMedia;
});

function deferredFetch() {
  // jsdom has no Response; the component only touches ok/status/json().
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  global.fetch = jest.fn(() => promise) as unknown as typeof fetch;
  return { resolve };
}

function okEnvelope(message: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      threadId: '4c1f6f60-0000-4000-8000-000000000000',
      reply: { message, script: null },
    }),
  };
}

function renderWorkspace() {
  return render(
    <ChatWorkspace
      initialTurns={[]}
      threadId={null}
      showProfileForm={false}
      coachReady
    />,
  );
}

function sendMessage(text: string) {
  fireEvent.change(screen.getByLabelText('Message the script coach'), {
    target: { value: text },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Send' }).closest('form')!,
  );
}

afterEach(() => {
  jest.useRealTimers();
});

it('shows the labeled dot indicator while a reply is outstanding', () => {
  deferredFetch();
  renderWorkspace();
  expect(document.querySelectorAll('.animate-thinkingDot')).toHaveLength(0);

  sendMessage('Write me a hook');

  // Labeled like an assistant turn, where the reply will land.
  expect(screen.getByText('Script coach')).toBeTruthy();
  expect(document.querySelectorAll('.animate-thinkingDot')).toHaveLength(3);
});

it('adds the reassurance line at 10s, and clears everything when the reply lands', async () => {
  jest.useFakeTimers();
  const { resolve } = deferredFetch();
  renderWorkspace();
  sendMessage('Write me a hook');

  expect(screen.queryByText(/Still working/)).toBeNull();
  act(() => {
    jest.advanceTimersByTime(10_000);
  });
  expect(screen.getByText(/Still working/)).toBeTruthy();

  await act(async () => {
    resolve(okEnvelope('Here is your hook.'));
    await Promise.resolve();
  });

  expect(screen.getByText('Here is your hook.')).toBeTruthy();
  expect(document.querySelectorAll('.animate-thinkingDot')).toHaveLength(0);
  expect(screen.queryByText(/Still working/)).toBeNull();
});

it('a fresh send resets the reassurance line instead of inheriting the last one', async () => {
  jest.useFakeTimers();
  const first = deferredFetch();
  renderWorkspace();
  sendMessage('First');
  act(() => {
    jest.advanceTimersByTime(10_000);
  });
  expect(screen.getByText(/Still working/)).toBeTruthy();

  await act(async () => {
    first.resolve(okEnvelope('Done.'));
    await Promise.resolve();
  });

  deferredFetch();
  sendMessage('Second');
  // Dots are back immediately; the slow line must NOT be.
  expect(document.querySelectorAll('.animate-thinkingDot')).toHaveLength(3);
  expect(screen.queryByText(/Still working/)).toBeNull();
});
