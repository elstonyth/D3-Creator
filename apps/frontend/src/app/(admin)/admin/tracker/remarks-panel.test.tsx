/** @jest-environment jsdom */
/**
 * The remarks pad's autosave.
 *
 * Every save names the version of the note it was typed over, so a tab left
 * open since the morning is refused instead of wiping what was typed on a
 * phone since. A call that throws (a dropped connection, a stale deploy) is a
 * refusal like any other: the pad keeps saving afterwards.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';

import { saveRemarks } from './actions';
import { RemarksPanel } from './work-tracker';

jest.mock('./actions', () => ({
  saveRemarks: jest.fn(async () => ({ ok: true })),
}));
// The liquid-glass dist is ESM-only; the panel is chrome, not behaviour.
jest.mock('./glass-panel', () => ({
  GlassPanel: ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));
jest.mock('./tracker.module.scss', () => ({}));

const LOADED_AT = '2026-09-25T00:00:00.000000+00:00';
const CONFLICT =
  'These remarks were changed on another device. Copy your text, then reload the page.';
const save = saveRemarks as jest.Mock;

function renderPad(onFail = jest.fn()) {
  render(<RemarksPanel initial="a" initialAt={LOADED_AT} onFail={onFail} />);
  return onFail;
}

function pad() {
  return screen.getByLabelText('Remarks') as HTMLTextAreaElement;
}

/** Type, let the 800 ms autosave fire, and let its save settle. */
async function typeAndSave(text: string) {
  fireEvent.change(pad(), { target: { value: text } });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(800);
  });
  await act(async () => {});
}

describe('RemarksPanel autosave', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  it('sends the version it was typed over', async () => {
    renderPad();
    await typeAndSave('ab');
    expect(save).toHaveBeenCalledWith('ab', LOADED_AT);
  });

  it('a thrown save does not freeze the pad', async () => {
    save.mockRejectedValueOnce(new Error('network'));
    const onFail = renderPad();
    await typeAndSave('ab');
    expect(screen.getByText('Unsaved')).toBeTruthy();
    expect(onFail).toHaveBeenCalledWith(
      { ok: false, message: 'Could not save. Try again.' },
      expect.any(Function),
    );

    await typeAndSave('abc');
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('abc', LOADED_AT);
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('a conflict stops autosave and keeps the text', async () => {
    save.mockResolvedValueOnce({
      ok: false,
      conflict: true,
      message: CONFLICT,
    });
    const onFail = renderPad();
    await typeAndSave('ab');
    expect(
      screen.getByText('Not saved — changed on another device'),
    ).toBeTruthy();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(pad().value).toBe('ab');

    await typeAndSave('abc');
    expect(save).toHaveBeenCalledTimes(1);
    expect(pad().value).toBe('abc');
    // Typing on does not hide why nothing saves any more.
    expect(
      screen.getByText('Not saved — changed on another device'),
    ).toBeTruthy();
  });

  it('the next save names the version the last one returned', async () => {
    save.mockResolvedValueOnce({ ok: true, at: 'v2' });
    renderPad();
    await typeAndSave('ab');
    expect(screen.getByText('Saved')).toBeTruthy();

    await typeAndSave('abc');
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, 'abc', 'v2');
  });
});
