/** @jest-environment jsdom */
/**
 * The admin's account board: who handles each account and who edits it.
 *
 * Editors cut video; they are offered in every card's Editor select but are
 * never a column — only people who run accounts own columns. Card moves save
 * one column at a time, queued, and a refusal puts back what the server last
 * accepted.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import type { AccountCard } from '@gitroom/frontend/lib/team/accounts';
import {
  placeCards,
  setAssignment,
} from '@gitroom/frontend/lib/team/account-actions';
import { AccountBoard } from './account-board';

jest.mock('@gitroom/frontend/lib/team/account-actions', () => ({
  placeCards: jest.fn(async () => ({ ok: true })),
  setAssignment: jest.fn(async () => ({ ok: true })),
}));
const refresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
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

type Person = {
  id: string;
  name: string;
  kind: 'handler' | 'editor' | 'both';
  archived: boolean;
};

const person = (
  n: number,
  name: string,
  kind: Person['kind'] = 'handler',
  archived = false,
): Person => ({
  id: `aaaaaaaa-0000-4000-8000-00000000000${n}`,
  name,
  kind,
  archived,
});

const KEE = person(1, 'KEE');
const ZUWEI = person(2, 'ZUWEI');
const ALI = person(3, 'ALI', 'editor');
const MEI = person(4, 'MEI', 'both');
const GONE = person(5, 'GONE', 'handler', true);

function card(
  n: number,
  name: string,
  handlerId: string | null,
  editorId: string | null,
): AccountCard {
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

function renderBoard(people: Person[] = [KEE], accounts: AccountCard[] = []) {
  return render(
    <AccountBoard
      monthLabel="September 2026"
      people={people}
      accounts={accounts}
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

const cardOf = (name: string) =>
  screen
    .getAllByRole('article')
    .find((a) => a.querySelector('p')?.textContent === name)!;

beforeEach(() => jest.clearAllMocks());

describe('the account board’s people', () => {
  it('lists an editor as a chip, never as a column', () => {
    renderBoard([KEE, ALI], [card(1, 'Gary', KEE.id, ALI.id)]);
    expect(screen.getByRole('heading', { name: 'KEE' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'ALI' })).toBeNull();
    const row = within(screen.getByRole('region', { name: 'Editors' }));
    expect(row.getByText('ALI')).toBeTruthy();
    expect(row.getByText('Edits 1 account · 4 videos')).toBeTruthy();
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

  it('gives someone who does both jobs a column and lists them with the editors', () => {
    renderBoard([KEE, ALI, MEI], [card(1, 'Gary', KEE.id, null)]);
    expect(screen.getByRole('heading', { name: 'MEI' })).toBeTruthy();
    // Their column already carries them: no chip as well.
    const row = within(screen.getByRole('region', { name: 'Editors' }));
    expect(row.queryByText('MEI')).toBeNull();
    const editor = screen.getByLabelText('Editor');
    expect(optionNames(editor)).toEqual(['Nobody', 'ALI', 'MEI', 'KEE']);
    expect(optionNames(screen.getByLabelText('Handler'))).toEqual([
      'Unassigned',
      'KEE',
      'MEI',
    ]);
  });

  it('shows who handles and who edits each account', () => {
    renderBoard([KEE, ZUWEI, ALI], [card(1, 'Gary', ZUWEI.id, ALI.id)]);
    const zuwei = screen.getByRole('region', { name: 'ZUWEI' });
    const gary = within(zuwei).getByRole('article');
    expect(
      (within(gary).getByLabelText('Handler') as HTMLSelectElement).value,
    ).toBe(ZUWEI.id);
    expect(
      (within(gary).getByLabelText('Editor') as HTMLSelectElement).value,
    ).toBe(ALI.id);
    expect(
      within(screen.getByRole('region', { name: 'KEE' })).getByText(
        'Drop an account here.',
      ),
    ).toBeTruthy();
  });

  it('leaves people who left off the board and never offers them', () => {
    // The loader already shows a leaver's slots as empty.
    renderBoard([KEE, GONE], [card(1, 'Gary', null, null)]);
    expect(screen.queryByRole('heading', { name: 'GONE' })).toBeNull();
    expect(optionNames(screen.getByLabelText('Handler'))).toEqual([
      'Unassigned',
      'KEE',
    ]);
    expect(optionNames(screen.getByLabelText('Editor'))).toEqual([
      'Nobody',
      'KEE',
    ]);
    expect(
      within(screen.getByRole('region', { name: 'Unassigned' })).getByText(
        'Gary',
      ),
    ).toBeTruthy();
  });

  it('offers no way to add or remove people (the Team page does that)', () => {
    renderBoard([KEE, ALI], [card(1, 'Gary', KEE.id, ALI.id)]);
    for (const b of screen.getAllByRole('button'))
      expect(b.getAttribute('aria-label') ?? b.textContent).not.toMatch(
        /add|remove/i,
      );
  });
});

describe('a card’s own controls', () => {
  it('sets the editor, then refreshes the page', async () => {
    const A = card(1, 'Gary', KEE.id, null);
    renderBoard([KEE, ALI], [A]);
    fireEvent.change(screen.getByLabelText('Editor'), {
      target: { value: ALI.id },
    });
    await waitFor(() =>
      expect(setAssignment).toHaveBeenCalledWith(A.id, { editorId: ALI.id }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(
      within(screen.getByRole('region', { name: 'Editors' })).getByText(
        'Edits 1 account · 4 videos',
      ),
    ).toBeTruthy();
  });

  it('a refused editor goes back and says why', async () => {
    (setAssignment as jest.Mock).mockResolvedValueOnce({
      ok: false,
      message: 'That person is not on the board.',
    });
    renderBoard([KEE, ALI], [card(1, 'Gary', KEE.id, null)]);
    fireEvent.change(screen.getByLabelText('Editor'), {
      target: { value: ALI.id },
    });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'That person is not on the board.',
      ),
    );
    expect((screen.getByLabelText('Editor') as HTMLSelectElement).value).toBe(
      '',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('switches scheduled posting', async () => {
    const A = card(1, 'Gary', KEE.id, null);
    renderBoard([KEE], [A]);
    const sw = screen.getByRole('switch', { name: 'Scheduled posting' });
    fireEvent.click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await waitFor(() =>
      expect(setAssignment).toHaveBeenCalledWith(A.id, {
        scheduledPosting: true,
      }),
    );
  });
});

describe('card order', () => {
  const A = card(1, 'Amy', KEE.id, null);
  const B = card(2, 'Bob', KEE.id, null);
  const C = card(3, 'Cat', KEE.id, null);

  /** A placeCards call the test settles by hand. */
  function holdNextSave() {
    let settle!: (r: { ok: boolean; message?: string }) => void;
    (placeCards as jest.Mock).mockImplementationOnce(
      () => new Promise((r) => (settle = r)),
    );
    return (r: { ok: boolean; message?: string }) => act(async () => settle(r));
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
    await waitFor(() => expect(refresh).toHaveBeenCalled());
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
    renderBoard([KEE], [A, B, C]);

    fireEvent.click(screen.getByRole('button', { name: 'Move Cat up' }));
    await waitFor(() => expect(placeCards).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Move Cat up' }));

    await settle({ ok: false, message: 'Not authorized.' });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Not authorized.'),
    );
    expect(keeOrder()).toEqual(['Amy', 'Bob', 'Cat']);
    expect(placeCards).toHaveBeenCalledTimes(1);
  });

  it('a thrown save rolls back and still saves the next move', async () => {
    // A dropped connection: the call throws instead of returning a refusal.
    (placeCards as jest.Mock).mockRejectedValueOnce(new Error('network'));
    renderBoard([KEE], [A, B, C]);

    fireEvent.click(screen.getByRole('button', { name: 'Move Cat up' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Could not save. Try again.',
      ),
    );
    expect(keeOrder()).toEqual(['Amy', 'Bob', 'Cat']);

    fireEvent.click(screen.getByRole('button', { name: 'Move Cat up' }));
    await waitFor(() => expect(placeCards).toHaveBeenCalledTimes(2));
  });

  it('the handler select hands a card over and puts it last there', async () => {
    const Z = card(4, 'Zed', ZUWEI.id, null);
    renderBoard([KEE, ZUWEI], [A, Z]);
    fireEvent.change(within(cardOf('Amy')).getByLabelText('Handler'), {
      target: { value: ZUWEI.id },
    });
    await waitFor(() =>
      expect(placeCards).toHaveBeenCalledWith(ZUWEI.id, [Z.id, A.id], [A.id]),
    );
    expect(placeCards).toHaveBeenCalledTimes(1); // KEE only lost a card
    expect(
      within(screen.getByRole('region', { name: 'ZUWEI' })).getByText('Amy'),
    ).toBeTruthy();
  });

  it('totals each column: accounts, videos, views', () => {
    renderBoard([KEE, ZUWEI], [A, B, card(4, 'Zed', ZUWEI.id, null)]);
    const kee = within(screen.getByRole('region', { name: 'KEE' }));
    const cells = kee.getAllByRole('definition').map((d) => d.textContent);
    expect(cells).toEqual(['2', '8', '2K']);
  });
});
