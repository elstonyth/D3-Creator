/** @jest-environment jsdom */
/**
 * The week schedule's permissions and saves. Staff see the whole team's
 * shoots but change only their own, and pass on the videos from their own
 * shoots; the admin's view shows everything and changes nothing. The server
 * has the final word (the actions re-check), but the screen must not offer
 * what the server would refuse.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import type { Shoot } from '@gitroom/frontend/lib/team/shoots';
import {
  addShoot,
  passVideos,
  setShootStatus,
} from '@gitroom/frontend/lib/team/shoot-actions';
import { WeekSchedule } from './week-schedule';

jest.mock('@gitroom/frontend/lib/team/shoot-actions', () => ({
  addShoot: jest.fn(),
  updateShoot: jest.fn(),
  setShootStatus: jest.fn(),
  deleteShoot: jest.fn(),
  passVideos: jest.fn(),
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

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ZUWEI = 'aaaaaaaa-0000-4000-8000-000000000002';
const ALI = 'aaaaaaaa-0000-4000-8000-000000000009';
const MEI = 'aaaaaaaa-0000-4000-8000-000000000003';
const people = [
  { id: KEE, name: 'KEE', kind: 'handler' as const, archived: false },
  { id: ZUWEI, name: 'ZUWEI', kind: 'handler' as const, archived: false },
  { id: ALI, name: 'ALI', kind: 'editor' as const, archived: false },
  { id: MEI, name: 'MEI', kind: 'both' as const, archived: false },
];
const accounts = [{ id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Gary' }];

function shoot(
  n: number,
  memberId: string,
  date: string,
  time: string | null,
  title: string,
  extra: Partial<Shoot> = {},
): Shoot {
  return {
    id: `cccccccc-0000-4000-8000-00000000000${n}`,
    memberId,
    date,
    time,
    title,
    creatorId: null,
    videosShot: null,
    status: 'planned',
    note: null,
    ...extra,
  };
}

const MINE = shoot(1, KEE, '2026-09-22', '19:30', 'Hotpot shop');
const THEIRS = shoot(2, ZUWEI, '2026-09-24', null, 'Furniture shop');

function renderWeek(
  meId: string | null,
  shoots = [MINE, THEIRS],
  { start = '2026-09-21', today = '2026-09-23', readOnly = false } = {},
) {
  return render(
    <WeekSchedule
      start={start}
      today={today}
      shoots={shoots}
      people={people}
      accounts={accounts}
      meId={meId}
      readOnly={readOnly}
      basePath="/"
    />,
  );
}

const button = (name: string) => screen.queryByRole('button', { name });

beforeEach(() => jest.clearAllMocks());

it('lets staff change only their own shoots, and names the others', () => {
  renderWeek(KEE);
  expect(button('Change Hotpot shop')).toBeTruthy();
  expect(button('Pass videos: Hotpot shop')).toBeTruthy();
  expect(button('Change Furniture shop')).toBeNull();
  expect(button('Pass videos: Furniture shop')).toBeNull();
  expect(button('Delete Furniture shop')).toBeNull();
  const thursday = screen.getByRole('region', { name: /Thursday/ });
  expect(within(thursday).getByText('ZUWEI')).toBeTruthy();
  // My own shoot does not repeat my name.
  const tuesday = screen.getByRole('region', { name: /Tuesday/ });
  expect(within(tuesday).queryByText(/KEE/)).toBeNull();
});

it('filters to my own shoots', () => {
  renderWeek(KEE);
  fireEvent.click(screen.getByRole('button', { name: 'Mine' }));
  expect(screen.queryByText('Furniture shop')).toBeNull();
  expect(screen.getByText('Hotpot shop')).toBeTruthy();
});

it('adds a shoot for the day it was opened on', async () => {
  (addShoot as jest.Mock).mockResolvedValue({
    ok: true,
    shoot: shoot(3, KEE, '2026-09-23', '11:30', 'Café visit'),
  });
  renderWeek(KEE);
  fireEvent.click(
    screen.getByRole('button', { name: 'Add a shoot on Wednesday' }),
  );
  fireEvent.change(screen.getByLabelText(/Time/), {
    target: { value: '11:30' },
  });
  fireEvent.change(screen.getByLabelText('Where / what'), {
    target: { value: 'Café visit' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(screen.getByText('Café visit')).toBeTruthy());
  // Staff never choose the person; the server uses theirs.
  expect(addShoot).toHaveBeenCalledWith({
    date: '2026-09-23',
    time: '11:30',
    title: 'Café visit',
    creatorId: '',
    note: '',
  });
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
});

it('keeps the form open and says why when the server refuses', async () => {
  (addShoot as jest.Mock).mockResolvedValue({
    ok: false,
    message: 'Time must look like 19:30.',
  });
  renderWeek(KEE);
  fireEvent.click(
    screen.getByRole('button', { name: 'Add a shoot on Wednesday' }),
  );
  fireEvent.change(screen.getByLabelText('Where / what'), {
    target: { value: 'Café visit' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect((await screen.findByRole('alert')).textContent).toContain(
    'Time must look like 19:30.',
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
});

it('passes a shoot’s videos on, one row per video, to the editors', async () => {
  (passVideos as jest.Mock).mockResolvedValue({
    ok: true,
    shoot: { ...MINE, status: 'done', videosShot: 2 },
    videos: [],
  });
  renderWeek(KEE);
  fireEvent.click(
    screen.getByRole('button', { name: 'Pass videos: Hotpot shop' }),
  );
  // Only people who cut video can be given one.
  const first = screen.getByLabelText('Video 1 editor') as HTMLSelectElement;
  expect([...first.options].slice(1).map((o) => o.text)).toEqual([
    'ALI',
    'MEI',
  ]);
  fireEvent.change(screen.getByLabelText('Video 1 title'), {
    target: { value: 'Reel 1' },
  });
  fireEvent.change(first, { target: { value: MEI } });
  fireEvent.click(screen.getByRole('button', { name: '+ Add video' }));
  // A new row starts with the editor above it.
  expect(
    (screen.getByLabelText('Video 2 editor') as HTMLSelectElement).value,
  ).toBe(MEI);
  fireEvent.change(screen.getByLabelText('Video 2 title'), {
    target: { value: 'Reel 2' },
  });
  fireEvent.change(screen.getByLabelText('Video 2 editor'), {
    target: { value: ALI },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Pass videos' }));
  });

  expect(passVideos).toHaveBeenCalledWith(MINE.id, [
    { title: 'Reel 1', editorId: MEI },
    { title: 'Reel 2', editorId: ALI },
  ]);
  expect(screen.getByText('2 videos passed')).toBeTruthy();
  expect(screen.queryByLabelText('Video 1 title')).toBeNull();
});

it('keeps each row’s text when a row above it is removed', () => {
  renderWeek(KEE);
  fireEvent.click(
    screen.getByRole('button', { name: 'Pass videos: Hotpot shop' }),
  );
  fireEvent.change(screen.getByLabelText('Video 1 title'), {
    target: { value: 'Reel 1' },
  });
  fireEvent.click(screen.getByRole('button', { name: '+ Add video' }));
  fireEvent.change(screen.getByLabelText('Video 2 title'), {
    target: { value: 'Reel 2' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Remove video 1' }));
  expect(
    (screen.getByLabelText('Video 1 title') as HTMLInputElement).value,
  ).toBe('Reel 2');
});

it('offers the right steps for each state of my own shoot', () => {
  const done = shoot(3, KEE, '2026-09-21', null, 'Mall', {
    status: 'done',
    videosShot: 4,
  });
  const cancelled = shoot(4, KEE, '2026-09-25', null, 'Beach', {
    status: 'cancelled',
  });
  renderWeek(KEE, [MINE, done, cancelled]);

  // Planned: change it, pass its videos on, cancel it, delete it.
  expect(button('Change Hotpot shop')).toBeTruthy();
  expect(button('Pass videos: Hotpot shop')).toBeTruthy();
  expect(button('Cancel shoot: Hotpot shop')).toBeTruthy();
  expect(button('Delete Hotpot shop')).toBeTruthy();
  expect(button('Reopen Hotpot shop')).toBeNull();

  // Done: pass more on; it stays done.
  expect(screen.getByText('4 videos passed')).toBeTruthy();
  expect(button('Pass videos: Mall')).toBeTruthy();
  expect(button('Change Mall')).toBeTruthy();
  expect(button('Delete Mall')).toBeTruthy();
  expect(button('Cancel shoot: Mall')).toBeNull();
  expect(button('Reopen Mall')).toBeNull();

  // Cancelled: reopen or delete, never pass.
  expect(button('Reopen Beach')).toBeTruthy();
  expect(button('Delete Beach')).toBeTruthy();
  expect(button('Pass videos: Beach')).toBeNull();
  expect(button('Change Beach')).toBeNull();
});

it('keeps last month closed, except for passing its videos on', () => {
  const lastMonth = shoot(4, KEE, '2026-08-31', '10:00', 'Café visit');
  const thisMonth = shoot(5, KEE, '2026-09-01', '10:00', 'Hotpot shop');
  const week = { start: '2026-08-31', today: '2026-09-02' };
  renderWeek(KEE, [lastMonth, thisMonth], week);
  expect(button('Pass videos: Café visit')).toBeTruthy();
  expect(button('Change Café visit')).toBeNull();
  expect(button('Cancel shoot: Café visit')).toBeNull();
  expect(button('Delete Café visit')).toBeNull();
  expect(button('Change Hotpot shop')).toBeTruthy();
  expect(button('Add a shoot on Monday')).toBeNull();
  expect(button('Add a shoot on Tuesday')).toBeTruthy();
});

it('cancels a planned shoot with one click', async () => {
  (setShootStatus as jest.Mock).mockResolvedValue({
    ok: true,
    shoot: { ...MINE, status: 'cancelled' },
  });
  renderWeek(KEE);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel shoot: Hotpot shop' }),
    );
  });
  expect(setShootStatus).toHaveBeenCalledWith(MINE.id, 'cancelled');
  expect(button('Reopen Hotpot shop')).toBeTruthy();
});

it('shows a refused one-click change on that shoot', async () => {
  (setShootStatus as jest.Mock).mockResolvedValue({
    ok: false,
    message: 'That shoot is not yours to change, or it has moved on.',
  });
  renderWeek(KEE);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel shoot: Hotpot shop' }),
    );
  });
  const tuesday = screen.getByRole('region', { name: /Tuesday/ });
  expect(within(tuesday).getByRole('alert').textContent).toContain(
    'has moved on',
  );
});

it('frees the week and says why when an action throws', async () => {
  (setShootStatus as jest.Mock).mockRejectedValue(
    new TypeError('Failed to fetch'),
  );
  renderWeek(KEE);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel shoot: Hotpot shop' }),
    );
  });
  const tuesday = screen.getByRole('region', { name: /Tuesday/ });
  expect(within(tuesday).getByRole('alert').textContent).toContain(
    'Could not save. Try again.',
  );
  const cancel = screen.getByRole('button', {
    name: 'Cancel shoot: Hotpot shop',
  }) as HTMLButtonElement;
  expect(cancel.disabled).toBe(false);
});

describe('the admin’s view', () => {
  it('shows everyone’s shoots with nothing to press', () => {
    const done = shoot(3, ZUWEI, '2026-09-21', null, 'Mall', {
      status: 'done',
      videosShot: 3,
    });
    renderWeek(null, [MINE, THEIRS, done], { readOnly: true });
    // Week links are links and the person filter is a select: any button
    // here would be a way to change something.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const tuesday = screen.getByRole('region', { name: /Tuesday/ });
    expect(within(tuesday).getByText('KEE')).toBeTruthy();
    expect(screen.getByText('3 videos passed')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Next week' }).getAttribute('href'),
    ).toBe('/?week=2026-09-28');
  });

  it('filters to one person', () => {
    renderWeek(null, [MINE, THEIRS], { readOnly: true });
    fireEvent.change(screen.getByLabelText('Show whose shoots'), {
      target: { value: ZUWEI },
    });
    expect(screen.queryByText('Hotpot shop')).toBeNull();
    expect(screen.getByText('Furniture shop')).toBeTruthy();
  });

  it('stays read-only even when given a person', () => {
    renderWeek(KEE, [MINE], { readOnly: true });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
