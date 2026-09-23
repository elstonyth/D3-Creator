/** @jest-environment jsdom */
/**
 * The staffing board's people and cards.
 *
 * Removing a person must not depend on `window.confirm`: embedded browsers
 * (the Claude desktop pane, automation) auto-dismiss native dialogs and return
 * false, which made the × button a no-op. The confirmation is inline instead.
 *
 * Editors cut video; they are offered in every card's Editor select but are
 * never a column — only handlers own columns.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import type {
  TrackerCreator,
  TrackerMember,
} from '@gitroom/frontend/lib/tracker';
import { StaffingBoard } from './staffing-board';
import { addMember, placeCards, removeMember } from './actions';

jest.mock('./actions', () => ({
  addMember: jest.fn(async () => ({ ok: true, id: 'x' })),
  placeCards: jest.fn(async () => ({ ok: true })),
  removeMember: jest.fn(async () => ({ ok: true })),
  setAssignment: jest.fn(async () => ({ ok: true })),
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

const KEE: TrackerMember = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'KEE',
  role: 'Trader',
  kind: 'handler',
  sortOrder: 0,
};

const ZUWEI: TrackerMember = {
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  name: 'ZUWEI',
  role: 'Trader',
  kind: 'handler',
  sortOrder: 1,
};

const ALI: TrackerMember = {
  id: 'aaaaaaaa-0000-4000-8000-000000000009',
  name: 'ALI',
  role: 'Editor',
  kind: 'editor',
  sortOrder: 1,
};

function card(
  n: number,
  name: string,
  handlerId: string | null,
  editorId: string | null,
): TrackerCreator {
  return {
    id: `bbbbbbbb-0000-4000-8000-00000000000${n}`,
    name,
    avatarUrl: null,
    platforms: ['instagram'],
    handlerId,
    editorId,
    scheduledPosting: false,
    videos: 4,
    posts: 8,
    views: 1000,
    sortOrder: n,
  };
}

function renderBoard(
  members: TrackerMember[] = [KEE],
  creators: TrackerCreator[] = [],
  onFail = jest.fn(),
) {
  return render(
    <StaffingBoard
      monthLabel="September 2026"
      members={members}
      creators={creators}
      onFail={onFail}
    />,
  );
}

/** Card names in the order KEE's column shows them. */
function keeOrder() {
  return within(screen.getByRole('region', { name: 'KEE' }))
    .getAllByRole('article')
    .map((a) => a.querySelector('p')?.textContent);
}

function optionNames(select: HTMLElement) {
  return Array.from((select as HTMLSelectElement).options).map((o) => o.text);
}

describe('StaffingBoard remove person', () => {
  beforeEach(() => jest.clearAllMocks());

  it('confirms inline and never calls window.confirm', async () => {
    const confirmSpy = jest
      .spyOn(window, 'confirm')
      .mockImplementation(() => false);
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Remove KEE' }));
    // The inline confirmation, not a native dialog.
    expect(
      screen.getByText('Remove KEE? Their accounts move to Unassigned.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith(KEE.id));
    expect(screen.queryByRole('heading', { name: 'KEE' })).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('cancel keeps the person', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Remove KEE' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByText('Remove KEE? Their accounts move to Unassigned.'),
    ).toBeNull();
    expect(screen.getByRole('heading', { name: 'KEE' })).toBeTruthy();
    expect(removeMember).not.toHaveBeenCalled();
  });
});

describe('StaffingBoard editors', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists an editor as a chip, never as a column', () => {
    renderBoard([KEE, ALI], [card(1, 'Gary', KEE.id, ALI.id)]);
    expect(screen.getByRole('heading', { name: 'KEE' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'ALI' })).toBeNull();
    const row = within(screen.getByRole('region', { name: 'Editors' }));
    expect(row.getByText('ALI')).toBeTruthy();
    expect(row.getByText('Edits 1 accounts · 4 videos')).toBeTruthy();
  });

  it('offers editors in the Editor select and handlers only as handlers', () => {
    renderBoard([KEE, ALI], [card(1, 'Gary', KEE.id, null)]);
    const editor = screen.getByLabelText('Editor');
    expect(optionNames(editor)).toEqual(['Nobody', 'ALI', 'KEE']);
    expect(
      editor.querySelector('optgroup[label="Editors"] option')?.textContent,
    ).toBe('ALI');
    expect(optionNames(screen.getByLabelText('Handler'))).toEqual([
      'Unassigned',
      'KEE',
    ]);
  });

  it('adds an editor without adding a column', async () => {
    renderBoard([KEE]);
    fireEvent.click(screen.getByRole('button', { name: '+ Add editor' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'MEI' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(addMember).toHaveBeenCalledWith('MEI', 'Editor', 'editor'),
    );
    expect(screen.getByText('MEI')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'MEI' })).toBeNull();
  });

  it('adds a handler as a column', async () => {
    renderBoard([KEE]);
    fireEvent.click(screen.getByRole('button', { name: '+ Add handler' }));
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'SK' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(addMember).toHaveBeenCalledWith('SK', 'Trader', 'handler'),
    );
    expect(screen.getByRole('heading', { name: 'SK' })).toBeTruthy();
  });

  it('removing an editor confirms inline and clears their cards', async () => {
    renderBoard([KEE, ALI], [card(1, 'Gary', KEE.id, ALI.id)]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove ALI' }));
    expect(
      screen.getByText('Remove ALI? Accounts they edit go back to Nobody.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith(ALI.id));
    expect((screen.getByLabelText('Editor') as HTMLSelectElement).value).toBe(
      '',
    );
    expect(screen.queryByText('ALI')).toBeNull();
  });
});

describe('StaffingBoard card order', () => {
  beforeEach(() => jest.clearAllMocks());
  const A = card(1, 'Amy', KEE.id, null);
  const B = card(2, 'Bob', KEE.id, null);
  const C = card(3, 'Cat', KEE.id, null);

  /** A placeCards call the test settles by hand. */
  function holdNextSave() {
    let settle!: (r: { ok: boolean; message?: string }) => void;
    (placeCards as jest.Mock).mockImplementationOnce(
      () => new Promise((r) => (settle = r)),
    );
    return (r: { ok: boolean; message?: string }) =>
      act(async () => settle(r));
  }

  it('moves a card up and saves the column order', async () => {
    renderBoard([KEE], [A, B]);
    expect(keeOrder()).toEqual(['Amy', 'Bob']);
    expect(
      (screen.getByRole('button', { name: 'Move Amy up' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Move Bob up' }));

    expect(keeOrder()).toEqual(['Bob', 'Amy']);
    await waitFor(() =>
      expect(placeCards).toHaveBeenCalledWith(KEE.id, [B.id, A.id], []),
    );
  });

  it('queues a quick second move and then saves the newest order', async () => {
    const settle = holdNextSave();
    renderBoard([KEE], [A, B, C]);

    fireEvent.click(screen.getByRole('button', { name: 'Move Cat up' }));
    await waitFor(() => expect(placeCards).toHaveBeenCalledTimes(1));
    expect(placeCards).toHaveBeenLastCalledWith(KEE.id, [A.id, C.id, B.id], []);

    fireEvent.click(screen.getByRole('button', { name: 'Move Cat up' }));
    expect(keeOrder()).toEqual(['Cat', 'Amy', 'Bob']);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(placeCards).toHaveBeenCalledTimes(1); // waits for the first

    await settle({ ok: true });
    await waitFor(() => expect(placeCards).toHaveBeenCalledTimes(2));
    expect(placeCards).toHaveBeenLastCalledWith(KEE.id, [C.id, A.id, B.id], []);
  });

  it('a failed save puts back the last order the server accepted', async () => {
    const settle = holdNextSave();
    const onFail = jest.fn((_r, rollback: () => void) => rollback());
    renderBoard([KEE], [A, B, C], onFail);

    fireEvent.click(screen.getByRole('button', { name: 'Move Cat up' }));
    await waitFor(() => expect(placeCards).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Move Cat up' }));

    await settle({ ok: false, message: 'Not authorized.' });
    await waitFor(() => expect(onFail).toHaveBeenCalled());
    expect(keeOrder()).toEqual(['Amy', 'Bob', 'Cat']);
    expect(placeCards).toHaveBeenCalledTimes(1);
  });

  it('the handler select hands a card over and puts it last there', async () => {
    const Z = card(4, 'Zed', ZUWEI.id, null);
    renderBoard([KEE, ZUWEI], [A, Z]);
    const amy = screen
      .getAllByRole('article')
      .find((a) => a.querySelector('p')?.textContent === 'Amy')!;
    fireEvent.change(within(amy).getByLabelText('Handler'), {
      target: { value: ZUWEI.id },
    });
    await waitFor(() =>
      expect(placeCards).toHaveBeenCalledWith(ZUWEI.id, [Z.id, A.id], [A.id]),
    );
    expect(placeCards).toHaveBeenCalledTimes(1); // KEE only lost a card
  });
});
