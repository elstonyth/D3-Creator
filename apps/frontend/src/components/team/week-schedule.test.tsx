/** @jest-environment jsdom */
/**
 * The week schedule's permissions and saves. Staff see the whole team's
 * shoots but can only change their own; the admin can change anyone's and
 * picks the person when adding. The server has the final word (the actions
 * re-check), but the screen must not offer what the server would refuse.
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
  setShootStatus,
} from '@gitroom/frontend/lib/team/shoot-actions';
import { WeekSchedule } from './week-schedule';

jest.mock('@gitroom/frontend/lib/team/shoot-actions', () => ({
  addShoot: jest.fn(),
  updateShoot: jest.fn(),
  setShootStatus: jest.fn(),
  deleteShoot: jest.fn(),
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
const people = [
  { id: KEE, name: 'KEE', archived: false },
  { id: ZUWEI, name: 'ZUWEI', archived: false },
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
    videosPlanned: null,
    videosShot: null,
    status: 'planned',
    note: null,
    ...extra,
  };
}

const MINE = shoot(1, KEE, '2026-09-22', '19:30', 'Hotpot shop', {
  videosPlanned: 3,
});
const THEIRS = shoot(2, ZUWEI, '2026-09-24', null, 'Furniture shop');

function renderWeek(
  meId: string | null,
  shoots = [MINE, THEIRS],
  { start = '2026-09-21', today = '2026-09-23' } = {},
) {
  return render(
    <WeekSchedule
      start={start}
      today={today}
      shoots={shoots}
      people={people}
      accounts={accounts}
      meId={meId}
      basePath="/"
    />,
  );
}

beforeEach(() => jest.clearAllMocks());

it('lets staff change only their own shoots, and names the others', () => {
  renderWeek(KEE);
  expect(screen.getByRole('button', { name: 'Edit Hotpot shop' })).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Edit Furniture shop' }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Delete Furniture shop' }),
  ).toBeNull();
  const thursday = screen.getByRole('region', { name: /Thursday/ });
  expect(within(thursday).getByText('ZUWEI')).toBeTruthy();
  // My own shoot does not repeat my name.
  const tuesday = screen.getByRole('region', { name: /Tuesday/ });
  expect(within(tuesday).queryByText(/KEE/)).toBeNull();
  expect(within(tuesday).getByText('3 videos planned')).toBeTruthy();
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
    shoot: shoot(3, KEE, '2026-09-23', '11:30', 'Café visit', {
      videosPlanned: 4,
    }),
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
  fireEvent.change(screen.getByLabelText(/Videos/), {
    target: { value: '4' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(screen.getByText('Café visit')).toBeTruthy());
  expect(addShoot).toHaveBeenCalledWith(
    {
      date: '2026-09-23',
      time: '11:30',
      title: 'Café visit',
      creatorId: '',
      videosPlanned: '4',
      note: '',
    },
    undefined, // staff never choose the person; the server uses theirs
  );
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

it('marks a shoot done with how many videos came out of it', async () => {
  (setShootStatus as jest.Mock).mockResolvedValue({
    ok: true,
    shoot: { ...MINE, status: 'done', videosShot: 2 },
  });
  renderWeek(KEE);
  fireEvent.click(screen.getByRole('button', { name: 'Done: Hotpot shop' }));
  const box = screen.getByLabelText('Videos shot') as HTMLInputElement;
  expect(box.value).toBe('3'); // starts from the plan
  fireEvent.change(box, { target: { value: '2' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mark done' }));
  });

  expect(setShootStatus).toHaveBeenCalledWith(MINE.id, 'done', '2');
  await waitFor(() =>
    expect(screen.getByText('Finished · 2 videos')).toBeTruthy(),
  );
});

it('lets the admin change anyone and choose the person when adding', () => {
  renderWeek(null);
  expect(
    screen.getByRole('button', { name: 'Edit Furniture shop' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Edit Hotpot shop' })).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Add a shoot on Monday' }),
  );
  fireEvent.change(screen.getByLabelText('Where / what'), {
    target: { value: 'Client A, 4 videos' },
  });
  const save = screen.getByRole('button', {
    name: 'Save',
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true); // nobody chosen yet
  fireEvent.change(screen.getByLabelText('Person'), {
    target: { value: ZUWEI },
  });
  expect(save.disabled).toBe(false);
});

it('keeps staff out of last month, which an admin has counted', () => {
  const lastMonth = shoot(4, KEE, '2026-08-31', '10:00', 'Café visit');
  const thisMonth = shoot(5, KEE, '2026-09-01', '10:00', 'Hotpot shop');
  const week = { start: '2026-08-31', today: '2026-09-02' };
  renderWeek(KEE, [lastMonth, thisMonth], week);
  expect(screen.queryByRole('button', { name: 'Edit Café visit' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Done: Café visit' })).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Done: Hotpot shop' }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Add a shoot on Monday' }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Add a shoot on Tuesday' }),
  ).toBeTruthy();
});

it('shows a refused one-click change on that shoot', async () => {
  (setShootStatus as jest.Mock).mockResolvedValue({
    ok: false,
    message:
      'You can only change your own shoots, from this month on. Ask an admin.',
  });
  renderWeek(KEE);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel shoot: Hotpot shop' }),
    );
  });
  const tuesday = screen.getByRole('region', { name: /Tuesday/ });
  expect(within(tuesday).getByRole('alert').textContent).toContain(
    'from this month on',
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
