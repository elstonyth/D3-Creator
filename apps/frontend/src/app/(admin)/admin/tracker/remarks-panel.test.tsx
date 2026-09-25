/** @jest-environment jsdom */
/**
 * The remarks pad's autosave.
 *
 * Every save names the version of the note it was typed over, so a tab left
 * open since the morning is refused instead of wiping what was typed on a
 * phone since. A call that throws (a dropped connection, a stale deploy) is a
 * refusal like any other: the pad keeps saving afterwards.
 *
 * Changing month asks the pad to settle() first, so the next month's page
 * reads the words just typed rather than meeting them as a conflict.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef, type Ref } from 'react';

import { saveRemarks, type ActionResult } from './actions';
import { RemarksPanel, type RemarksHandle } from './work-tracker';

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
  'These remarks were changed elsewhere. Copy your text, then reload the page.';
const save = saveRemarks as jest.Mock;

function renderPad(onFail = jest.fn(), ref?: Ref<RemarksHandle>) {
  render(
    <RemarksPanel
      ref={ref}
      initial="a"
      initialAt={LOADED_AT}
      onFail={onFail}
    />,
  );
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
    expect(screen.getByText('Not saved')).toBeTruthy();
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(pad().value).toBe('ab');

    await typeAndSave('abc');
    expect(save).toHaveBeenCalledTimes(1);
    expect(pad().value).toBe('abc');
    // Typing on does not hide why nothing saves any more.
    expect(screen.getByText('Not saved')).toBeTruthy();
  });

  it('a conflict keeps the instruction on screen', async () => {
    save.mockResolvedValueOnce({
      ok: false,
      conflict: true,
      message: CONFLICT,
    });
    renderPad();
    expect(screen.queryByRole('alert')).toBeNull();
    await typeAndSave('ab');
    expect(screen.getByRole('alert').textContent).toBe(CONFLICT);

    // Not a toast: it is still there after more typing.
    await typeAndSave('abc');
    expect(screen.getByRole('alert').textContent).toBe(CONFLICT);
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

  it('a save whose answer was lost is not taken for a conflict', async () => {
    // The first save lands, but its answer never comes back.
    save.mockRejectedValueOnce(new Error('network'));
    // So the next one finds that very text there under a newer version.
    save.mockResolvedValueOnce({
      ok: false,
      conflict: true,
      message: CONFLICT,
      body: 'ab',
      at: 'v2',
    });
    const onFail = renderPad();
    await typeAndSave('ab');
    await typeAndSave('abc');

    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenNthCalledWith(2, 'abc', LOADED_AT);
    expect(save).toHaveBeenNthCalledWith(3, 'abc', 'v2');
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onFail).toHaveBeenCalledTimes(1); // the lost answer, nothing more
  });

  it('a lost answer is still recognised after later saves failed too', async () => {
    // "ab" lands but its answer is lost; "abc" fails outright (offline).
    save.mockRejectedValueOnce(new Error('network'));
    save.mockRejectedValueOnce(new Error('network'));
    // Back online, the next save finds "ab" there under a newer version.
    save.mockResolvedValueOnce({
      ok: false,
      conflict: true,
      message: CONFLICT,
      body: 'ab',
      at: 'v2',
    });
    const onFail = renderPad();
    await typeAndSave('ab');
    await typeAndSave('abc');
    await typeAndSave('abcd');

    expect(save).toHaveBeenCalledTimes(4);
    expect(save).toHaveBeenNthCalledWith(3, 'abcd', LOADED_AT);
    expect(save).toHaveBeenNthCalledWith(4, 'abcd', 'v2');
    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onFail).toHaveBeenCalledTimes(2); // the two failed saves only
  });
});

describe('RemarksPanel settle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  it('sends a pending edit and resolves only once it is saved', async () => {
    let release!: (r: ActionResult) => void;
    save.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const handle = createRef<RemarksHandle>();
    renderPad(jest.fn(), handle);
    fireEvent.change(pad(), { target: { value: 'ab' } });

    // Well inside the 800 ms autosave delay.
    let done = false;
    let settling!: Promise<boolean>;
    await act(async () => {
      settling = handle.current!.settle();
      void settling.then(() => (done = true));
    });
    expect(save).toHaveBeenCalledWith('ab', LOADED_AT);
    expect(done).toBe(false);

    // Typed while that save is on its way: settle waits for this one too.
    fireEvent.change(pad(), { target: { value: 'abc' } });
    let ok: boolean | undefined;
    await act(async () => {
      release({ ok: true, at: 'v2' });
      ok = await settling;
    });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('abc', 'v2');
  });

  it('waits for an autosave already on its way', async () => {
    let release!: (r: ActionResult) => void;
    save.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const handle = createRef<RemarksHandle>();
    renderPad(jest.fn(), handle);
    fireEvent.change(pad(), { target: { value: 'ab' } });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(800);
    });
    expect(save).toHaveBeenCalledTimes(1);

    let done = false;
    let settling!: Promise<boolean>;
    await act(async () => {
      settling = handle.current!.settle();
      void settling.then(() => (done = true));
    });
    expect(done).toBe(false);

    let ok: boolean | undefined;
    await act(async () => {
      release({ ok: true });
      ok = await settling;
    });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('resolves false when the save fails, and keeps the text', async () => {
    save.mockRejectedValueOnce(new Error('network'));
    const handle = createRef<RemarksHandle>();
    const onFail = renderPad(jest.fn(), handle);
    fireEvent.change(pad(), { target: { value: 'ab' } });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await handle.current!.settle();
    });
    expect(ok).toBe(false);
    expect(onFail).toHaveBeenCalledTimes(1);
    expect(pad().value).toBe('ab');
  });

  it('waits out an autosave that starts another, then resolves true', async () => {
    let release1!: (r: ActionResult) => void;
    let release2!: (r: ActionResult) => void;
    save
      .mockImplementationOnce(() => new Promise((r) => (release1 = r)))
      .mockImplementationOnce(() => new Promise((r) => (release2 = r)));
    const handle = createRef<RemarksHandle>();
    renderPad(jest.fn(), handle);
    fireEvent.change(pad(), { target: { value: 'ab' } });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(800);
    });
    // Typed while that autosave is on its way.
    fireEvent.change(pad(), { target: { value: 'abc' } });

    let done = false;
    let settling!: Promise<boolean>;
    await act(async () => {
      settling = handle.current!.settle();
      void settling.then(() => (done = true));
    });
    // The autosave lands and starts the next save, for the newer text.
    await act(async () => release1({ ok: true, at: 'v2' }));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('abc', 'v2');
    expect(done).toBe(false);

    let ok: boolean | undefined;
    await act(async () => {
      release2({ ok: true, at: 'v3' });
      ok = await settling;
    });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('stops on a conflict it finds, and lets the next attempt go', async () => {
    save.mockResolvedValueOnce({
      ok: false,
      conflict: true,
      message: CONFLICT,
    });
    const handle = createRef<RemarksHandle>();
    const onFail = renderPad(jest.fn(), handle);
    fireEvent.change(pad(), { target: { value: 'ab' } });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await handle.current!.settle();
    });
    // The user stays, with the instruction and their words on screen.
    expect(ok).toBe(false);
    expect(screen.getByRole('alert').textContent).toBe(CONFLICT);
    expect(pad().value).toBe('ab');

    // They have seen it: a second attempt goes.
    await act(async () => {
      ok = await handle.current!.settle();
    });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('is read-only while the board leaves, and only then', () => {
    const onFail = jest.fn();
    const { rerender } = render(
      <RemarksPanel initial="a" initialAt={LOADED_AT} onFail={onFail} />,
    );
    expect(pad().readOnly).toBe(false);
    rerender(
      <RemarksPanel
        readOnly
        initial="a"
        initialAt={LOADED_AT}
        onFail={onFail}
      />,
    );
    expect(pad().readOnly).toBe(true);
  });
});
