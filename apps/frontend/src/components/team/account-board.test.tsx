/** @jest-environment jsdom */
/**
 * The admin's account board: who handles each account and who edits it.
 * The admin sets who handles each one — a select on every card, or a drag
 * onto a column; the editor follows the staff's choices and only shows.
 * Without a handover to call, the board only looks.
 *
 * Editors cut video; they sit in a row of chips and are never a column —
 * only people who run accounts own columns.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { AccountCard } from '@gitroom/frontend/lib/team/accounts';
import { AccountBoard } from './account-board';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
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
    igLive: true,
    handlerId,
    editorId,
    sortOrder: n,
    videos: 4,
    views: 1000,
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

const column = (name: string) => within(screen.getByRole('region', { name }));

/** What an account's card says: handler and editor. */
function whoOf(account: string) {
  const item = screen
    .getAllByRole('listitem')
    .find((li) => li.querySelector('p')?.textContent === account)!;
  const cells = within(item)
    .getAllByRole('definition')
    .map((d) => d.textContent);
  return { handler: cells[0], editor: cells[1] };
}

it('shows who handles and who edits each account', () => {
  renderBoard(
    [KEE, ZUWEI, ALI],
    [card(1, 'Gary', ZUWEI.id, ALI.id), card(2, 'Amy', KEE.id, null)],
  );
  expect(column('ZUWEI’s accounts').getByText('Gary')).toBeTruthy();
  expect(whoOf('Gary')).toEqual({ handler: 'ZUWEI', editor: 'ALI' });
  expect(whoOf('Amy')).toEqual({ handler: 'KEE', editor: 'Nobody' });
});

it('offers nothing to change without a handover to call', () => {
  renderBoard([KEE, ALI], [card(1, 'Gary', KEE.id, ALI.id)]);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  expect(screen.queryAllByRole('switch')).toHaveLength(0);
  expect(screen.queryByText(/Scheduled posting/)).toBeNull();
  expect(screen.getAllByRole('listitem').every((li) => !li.draggable)).toBe(
    true,
  );
});

it('lists an editor as a chip, never as a column', () => {
  renderBoard([KEE, ALI], [card(1, 'Gary', KEE.id, ALI.id)]);
  expect(screen.getByRole('heading', { name: 'KEE' })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'ALI' })).toBeNull();
  const row = within(screen.getByRole('region', { name: 'Editors' }));
  expect(row.getByText('ALI')).toBeTruthy();
  expect(row.getByText('Edits 1 account · 4 IG videos')).toBeTruthy();
});

it('gives someone who does both jobs a column, not a chip', () => {
  renderBoard([KEE, ALI, MEI], [card(1, 'Gary', MEI.id, MEI.id)]);
  expect(column('MEI’s accounts').getByText('Handler & editor')).toBeTruthy();
  expect(
    column('MEI’s accounts').getByText('Edits 1 account · 4 IG videos'),
  ).toBeTruthy();
  const row = within(screen.getByRole('region', { name: 'Editors' }));
  expect(row.queryByText('MEI')).toBeNull();
});

it('puts accounts nobody handles, or whose handler is now an editor, in Unassigned', () => {
  const EX = person(6, 'EX', 'editor'); // used to handle, now only edits
  renderBoard(
    [KEE, EX, GONE],
    [card(1, 'Gary', null, null), card(2, 'Amy', EX.id, null)],
  );
  expect(screen.queryByRole('heading', { name: 'GONE' })).toBeNull();
  const pool = column('Unassigned accounts');
  expect(pool.getByText('Gary')).toBeTruthy();
  expect(pool.getByText('Amy')).toBeTruthy();
  // The card agrees with its column, though EX is still on the team.
  expect(whoOf('Amy')).toEqual({ handler: 'Unassigned', editor: 'Nobody' });
  expect(column('KEE’s accounts').getByText('No accounts yet.')).toBeTruthy();
});

it('names each account’s platforms for screen readers', () => {
  renderBoard([KEE], [card(1, 'Gary', KEE.id, null)]);
  expect(screen.getByRole('img', { name: 'Instagram' })).toBeTruthy();
});

it('totals each column: accounts, videos, views', () => {
  renderBoard(
    [KEE, ZUWEI],
    [
      card(1, 'Amy', KEE.id, null),
      card(2, 'Bob', KEE.id, null),
      card(3, 'Zed', ZUWEI.id, null),
    ],
  );
  const cells = column('KEE’s accounts')
    .getAllByRole('definition')
    .slice(0, 3)
    .map((d) => d.textContent);
  expect(cells).toEqual(['2', '8', '2K']);
});

it('says its numbers are Instagram only', () => {
  renderBoard([KEE], [card(1, 'Gary', KEE.id, null)]);
  const kee = column('KEE’s accounts');
  expect(kee.getByText('IG videos')).toBeTruthy();
  expect(kee.getByText('IG views')).toBeTruthy();
  expect(kee.getByText('1K IG views')).toBeTruthy();
  expect(
    screen.getByText(
      'Videos and views count Instagram videos posted in September 2026 only.',
    ),
  ).toBeTruthy();
});

it('shows a dash, not a zero, for an account with no working Instagram', () => {
  renderBoard(
    [KEE],
    [
      {
        ...card(1, 'Gary', KEE.id, null),
        platforms: ['douyin', 'tiktok'],
        igLive: false,
        videos: 0,
        views: 0,
      },
    ],
  );
  const item = screen.getByText('Gary').closest('li')!;
  expect(within(item).getByText('—')).toBeTruthy();
  expect(within(item).getByText('No working Instagram account')).toBeTruthy();
  expect(within(item).queryByText('0 IG views')).toBeNull();
});

it('dims the platforms the numbers do not count', () => {
  renderBoard(
    [KEE],
    [{ ...card(1, 'Gary', KEE.id, null), platforms: ['instagram', 'tiktok'] }],
  );
  const icon = (name: string) =>
    screen.getByRole('img', { name }).getAttribute('class') ?? '';
  expect(icon('Instagram')).not.toContain('opacity-40');
  expect(icon('TikTok')).toContain('opacity-40');
});

describe('the admin’s drag and drop', () => {
  // jsdom has neither pointer events nor hit-testing.
  class FakePointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  beforeAll(() => {
    Object.assign(window, { PointerEvent: FakePointerEvent });
  });
  afterEach(() => {
    Object.assign(document, { elementFromPoint: undefined });
    jest.restoreAllMocks();
  });

  const GARY = card(1, 'Gary', KEE.id, ALI.id);
  const AMY = card(2, 'Amy', ZUWEI.id, null);
  const BOB = card(3, 'Bob', ZUWEI.id, null);

  function renderMovable(onPlace: jest.Mock, accounts = [GARY, AMY, BOB]) {
    return render(
      <AccountBoard
        monthLabel="September 2026"
        people={[KEE, ZUWEI, ALI, MEI]}
        accounts={accounts}
        onPlace={onPlace}
      />,
    );
  }

  /** Press on `from`, move over `over` at height `y`, let go. */
  async function drag(from: Element, over: Element, y = 300) {
    Object.assign(document, { elementFromPoint: () => over });
    fireEvent.pointerDown(from, { button: 0, clientX: 10, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: y, buttons: 1 });
    const marked = over.hasAttribute('data-drop-over');
    await act(async () => {
      fireEvent.pointerUp(window, { clientX: 40, clientY: y });
    });
    return marked;
  }

  const cardOf = (name: string) => screen.getByText(name).closest('li')!;

  beforeEach(() => jest.clearAllMocks());

  it('hands an account to the person whose column it is dropped on', async () => {
    const onPlace = jest.fn(async () => ({ ok: true }));
    renderMovable(onPlace);
    const zuwei = screen.getByRole('region', { name: 'ZUWEI’s accounts' });
    expect(await drag(cardOf('Gary'), zuwei)).toBe(true);
    // Dropped below the others: at the end, and handed over.
    expect(onPlace).toHaveBeenCalledWith([AMY.id, BOB.id, GARY.id], {
      creatorId: GARY.id,
      handlerId: ZUWEI.id,
    });
    expect(column('ZUWEI’s accounts').getByText('Gary')).toBeTruthy();
    expect(whoOf('Gary')).toEqual({ handler: 'ZUWEI', editor: 'ALI' });
    expect(zuwei.hasAttribute('data-drop-over')).toBe(false);
    expect(screen.getByRole('status').textContent).toBe(
      'Gary is now handled by ZUWEI.',
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reorders a column without touching who handles it', async () => {
    const onPlace = jest.fn(async () => ({ ok: true }));
    renderMovable(onPlace);
    // Amy's middle is at y 230: dropping Bob above it puts Bob first.
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ top: 200, bottom: 260 } as DOMRect);
    const zuwei = screen.getByRole('region', { name: 'ZUWEI’s accounts' });
    await drag(cardOf('Bob'), zuwei, 100);
    expect(onPlace).toHaveBeenCalledWith([BOB.id, AMY.id], null);
    const names = column('ZUWEI’s accounts')
      .getAllByRole('listitem')
      .map((li) => li.querySelector('p')?.textContent)
      .filter(Boolean);
    expect(names).toEqual(['Bob', 'Amy']);
  });

  it('puts the board back and says why when the drop is refused', async () => {
    const onPlace = jest.fn(async () => ({
      ok: false,
      message: 'That person is not on the board, or does not handle accounts.',
    }));
    renderMovable(onPlace);
    await drag(
      cardOf('Gary'),
      screen.getByRole('region', { name: 'ZUWEI’s accounts' }),
    );
    expect(column('KEE’s accounts').getByText('Gary')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain(
      'does not handle accounts',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does nothing for a drop where the card already is, or a click', async () => {
    const onPlace = jest.fn(async () => ({ ok: true }));
    renderMovable(onPlace);
    await drag(
      cardOf('Gary'),
      screen.getByRole('region', { name: 'KEE’s accounts' }),
    );
    // A press that never travels is a click, not a drag.
    fireEvent.pointerDown(cardOf('Amy'), {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerUp(window, { clientX: 12, clientY: 11 });
    expect(onPlace).not.toHaveBeenCalled();
  });

  it('drops nothing when the mouse button was let go outside the window', async () => {
    const onPlace = jest.fn(async () => ({ ok: true }));
    renderMovable(onPlace);
    const zuwei = screen.getByRole('region', { name: 'ZUWEI’s accounts' });
    Object.assign(document, { elementFromPoint: () => zuwei });
    fireEvent.pointerDown(cardOf('Gary'), {
      button: 0,
      clientX: 10,
      clientY: 300,
    });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 300, buttons: 1 });
    expect(zuwei.hasAttribute('data-drop-over')).toBe(true);
    // Back over the page with no button held: the release never came.
    fireEvent.pointerMove(window, { clientX: 50, clientY: 300, buttons: 0 });
    expect(zuwei.hasAttribute('data-drop-over')).toBe(false);
    fireEvent.pointerUp(window, { clientX: 50, clientY: 300 });
    expect(onPlace).not.toHaveBeenCalled();
  });

  it('lets a finger pick a card up only by its grip', async () => {
    const onPlace = jest.fn(async () => ({ ok: true }));
    renderMovable(onPlace);
    const zuwei = screen.getByRole('region', { name: 'ZUWEI’s accounts' });
    Object.assign(document, { elementFromPoint: () => zuwei });
    const touch = { pointerType: 'touch', clientX: 10, clientY: 300 };
    // On the card itself a finger scrolls the page.
    fireEvent.pointerDown(cardOf('Gary'), touch);
    fireEvent.pointerMove(window, { ...touch, clientY: 360 });
    fireEvent.pointerUp(window, touch);
    expect(onPlace).not.toHaveBeenCalled();
    // By the grip, it drags.
    const grip = cardOf('Gary').querySelector('[data-drag-handle]')!;
    fireEvent.pointerDown(grip, touch);
    fireEvent.pointerMove(window, { ...touch, clientY: 360 });
    await act(async () => {
      fireEvent.pointerUp(window, { ...touch, clientY: 360 });
    });
    expect(onPlace).toHaveBeenCalledWith([AMY.id, BOB.id, GARY.id], {
      creatorId: GARY.id,
      handlerId: ZUWEI.id,
    });
  });

  it('keeps a hidden Handler select for the keyboard', async () => {
    const onPlace = jest.fn(async () => ({ ok: true }));
    renderMovable(onPlace);
    const pick = screen.getByRole('combobox', {
      name: 'Handler for Gary',
    }) as HTMLSelectElement;
    // People who run accounts, and Unassigned — never someone who only edits.
    expect([...pick.options].map((o) => o.text)).toEqual([
      'Unassigned',
      'KEE',
      'ZUWEI',
      'MEI',
    ]);
    pick.focus();
    await act(async () => {
      fireEvent.change(pick, { target: { value: '' } });
    });
    expect(onPlace).toHaveBeenCalledWith([GARY.id], {
      creatorId: GARY.id,
      handlerId: null,
    });
    expect(column('Unassigned accounts').getByText('Gary')).toBeTruthy();
    // The card moved column; focus went with it.
    expect(document.activeElement).toBe(
      column('Unassigned accounts').getByRole('combobox', {
        name: 'Handler for Gary',
      }),
    );
  });

  describe('the order of the columns', () => {
    function renderOrderable(onOrder: jest.Mock) {
      return render(
        <AccountBoard
          monthLabel="September 2026"
          people={[KEE, ZUWEI, ALI, MEI]}
          accounts={[GARY, AMY, BOB]}
          onPlace={jest.fn(async () => ({ ok: true }))}
          onOrder={onOrder}
        />,
      );
    }
    const columns = () =>
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    const headerOf = (name: string) =>
      screen.getByRole('heading', { name }).closest('header')!;

    it('moves a column into the place of the one it is dropped on', async () => {
      const onOrder = jest.fn(async () => ({ ok: true }));
      renderOrderable(onOrder);
      expect(columns()).toEqual(['KEE', 'ZUWEI', 'MEI', 'Unassigned']);
      // To the left: MEI takes KEE's place, first.
      expect(
        await drag(
          headerOf('MEI'),
          screen.getByRole('region', { name: 'KEE’s accounts' }),
        ),
      ).toBe(true);
      // Everyone, editors too, in the new order: the order of people
      // everywhere.
      expect(onOrder).toHaveBeenLastCalledWith([
        MEI.id,
        KEE.id,
        ZUWEI.id,
        ALI.id,
      ]);
      expect(columns()).toEqual(['MEI', 'KEE', 'ZUWEI', 'Unassigned']);
      // To the right: MEI takes ZUWEI's place, ahead of the editors still.
      await drag(
        headerOf('MEI'),
        screen.getByRole('region', { name: 'ZUWEI’s accounts' }),
      );
      expect(onOrder).toHaveBeenLastCalledWith([
        KEE.id,
        ZUWEI.id,
        MEI.id,
        ALI.id,
      ]);
      expect(columns()).toEqual(['KEE', 'ZUWEI', 'MEI', 'Unassigned']);
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('never drops a column on Unassigned, or on itself', async () => {
      const onOrder = jest.fn(async () => ({ ok: true }));
      renderOrderable(onOrder);
      expect(
        await drag(
          headerOf('KEE'),
          screen.getByRole('region', { name: 'Unassigned accounts' }),
        ),
      ).toBe(false);
      expect(
        await drag(
          headerOf('KEE'),
          screen.getByRole('region', { name: 'KEE’s accounts' }),
        ),
      ).toBe(false);
      expect(onOrder).not.toHaveBeenCalled();
    });

    it('puts the columns back and says why when the order is refused', async () => {
      const onOrder = jest.fn(async () => ({
        ok: false,
        message: 'Could not save. Try again.',
      }));
      renderOrderable(onOrder);
      await drag(
        headerOf('ZUWEI'),
        screen.getByRole('region', { name: 'KEE’s accounts' }),
      );
      expect(columns()).toEqual(['KEE', 'ZUWEI', 'MEI', 'Unassigned']);
      expect(screen.getByRole('status').textContent).toBe(
        'Could not save. Try again.',
      );
      expect(refresh).not.toHaveBeenCalled();
    });

    it('lets a finger move a column only by its grip', async () => {
      const onOrder = jest.fn(async () => ({ ok: true }));
      renderOrderable(onOrder);
      const kee = screen.getByRole('region', { name: 'KEE’s accounts' });
      Object.assign(document, { elementFromPoint: () => kee });
      const touch = { pointerType: 'touch', clientX: 10, clientY: 300 };
      fireEvent.pointerDown(
        screen.getByRole('heading', { name: 'MEI' }),
        touch,
      );
      fireEvent.pointerMove(window, { ...touch, clientX: 60 });
      fireEvent.pointerUp(window, touch);
      expect(onOrder).not.toHaveBeenCalled();
      const grip = headerOf('MEI').querySelector('[data-drag-handle]')!;
      fireEvent.pointerDown(grip, touch);
      fireEvent.pointerMove(window, { ...touch, clientX: 60 });
      await act(async () => {
        fireEvent.pointerUp(window, { ...touch, clientX: 60 });
      });
      expect(onOrder).toHaveBeenCalledWith([MEI.id, KEE.id, ZUWEI.id, ALI.id]);
    });
  });
});
