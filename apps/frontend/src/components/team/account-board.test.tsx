/** @jest-environment jsdom */
/**
 * The admin's account board: who handles each account and who edits it.
 * Staff work sets it; the admin only looks, so it offers nothing to press.
 *
 * Editors cut video; they sit in a row of chips and are never a column —
 * only people who run accounts own columns.
 */

import { render, screen, within } from '@testing-library/react';

import type { AccountCard } from '@gitroom/frontend/lib/team/accounts';
import { AccountBoard } from './account-board';

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
    sortOrder: n,
    videos: 4,
    posts: 8,
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

it('offers nothing to change: the admin only looks', () => {
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
  expect(row.getByText('Edits 1 account · 4 videos')).toBeTruthy();
});

it('gives someone who does both jobs a column, not a chip', () => {
  renderBoard([KEE, ALI, MEI], [card(1, 'Gary', MEI.id, MEI.id)]);
  expect(column('MEI’s accounts').getByText('Handler & editor')).toBeTruthy();
  expect(
    column('MEI’s accounts').getByText('Edits 1 account · 4 videos'),
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
  expect(column('KEE’s accounts').getByText('No accounts yet.')).toBeTruthy();
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
