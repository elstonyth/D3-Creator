/** @jest-environment jsdom */
/**
 * A day's shoots under the tracker's calendar: permissions and saves. Staff
 * change and pass on only their own shoots; the admin's view shows everyone's
 * and changes nothing. The server has the final word (the actions re-check),
 * but the screen must not offer what the server would refuse.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';

import type { Shoot } from '@gitroom/frontend/lib/team/shoots';
import {
  addShoot,
  passVideos,
  setShootStatus,
} from '@gitroom/frontend/lib/team/shoot-actions';
import { DayShoots } from './day-shoots';

jest.mock('@gitroom/frontend/lib/team/shoot-actions', () => ({
  addShoot: jest.fn(),
  updateShoot: jest.fn(),
  setShootStatus: jest.fn(),
  deleteShoot: jest.fn(),
  passVideos: jest.fn(),
}));
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
const GARY = 'bbbbbbbb-0000-4000-8000-000000000001';
const accounts = [{ id: GARY, name: 'Gary' }];

function shoot(
  n: number,
  memberId: string,
  date: string,
  time: string | null,
  title: string | null,
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

const DAY = '2026-09-22';
const MINE = shoot(1, KEE, DAY, '19:30', 'Hotpot shop');
const THEIRS = shoot(2, ZUWEI, DAY, null, 'Furniture shop');

/** The tracker's part: it owns the list and hands the day its shoots. */
function Tracker({
  initial,
  meId,
  day = DAY,
  today = '2026-09-23',
  readOnly = false,
}: {
  initial: Shoot[];
  meId: string | null;
  day?: string;
  today?: string;
  readOnly?: boolean;
}) {
  const [shoots, setShoots] = useState(initial);
  return (
    <DayShoots
      day={day}
      today={today}
      shoots={shoots.filter((s) => s.date === day)}
      people={people}
      accounts={accounts}
      meId={meId}
      setShoots={readOnly ? undefined : setShoots}
    />
  );
}

const button = (name: string) => screen.queryByRole('button', { name });

beforeEach(() => jest.clearAllMocks());

it('lets staff change only their own shoots, and names the others', () => {
  render(<Tracker initial={[MINE, THEIRS]} meId={KEE} />);
  expect(button('Change Hotpot shop')).toBeTruthy();
  expect(button('Pass videos: Hotpot shop')).toBeTruthy();
  expect(button('Change Furniture shop')).toBeNull();
  expect(button('Pass videos: Furniture shop')).toBeNull();
  expect(button('Delete Furniture shop')).toBeNull();
  expect(screen.getByText('ZUWEI')).toBeTruthy();
  // My own shoot does not repeat my name.
  expect(screen.queryByText(/KEE/)).toBeNull();
});

it('adds a shoot for the day it was opened on', async () => {
  (addShoot as jest.Mock).mockResolvedValue({
    ok: true,
    shoot: shoot(3, KEE, DAY, '11:30', null, { creatorId: GARY }),
  });
  render(<Tracker initial={[MINE]} meId={KEE} />);
  fireEvent.click(screen.getByRole('button', { name: '+ Add a shoot' }));
  // The form no longer asks where or what.
  expect(screen.queryByLabelText(/Where/)).toBeNull();
  expect(screen.queryByRole('textbox', { name: /what/i })).toBeNull();
  fireEvent.change(screen.getByLabelText(/Time/), {
    target: { value: '11:30' },
  });
  fireEvent.change(screen.getByLabelText(/Creator account/), {
    target: { value: GARY },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  // Saved, the form closes, and the new shoot is named by its account (the
  // form's own "Gary" option is gone by then, so it can't answer for it).
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull(),
  );
  expect(button('Change 11:30 Gary')).toBeTruthy();
  expect(screen.getByText('Gary').tagName).toBe('P');
  // Staff never choose the person; the server uses theirs.
  expect(addShoot).toHaveBeenCalledWith({
    date: DAY,
    time: '11:30',
    creatorId: GARY,
    note: '',
  });
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('saves a shoot with nothing but its day', async () => {
  (addShoot as jest.Mock).mockResolvedValue({
    ok: true,
    shoot: shoot(3, KEE, DAY, null, null),
  });
  render(<Tracker initial={[]} meId={KEE} />);
  fireEvent.click(screen.getByRole('button', { name: '+ Add a shoot' }));
  const save = screen.getByRole('button', { name: 'Save' });
  expect((save as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(save);
  await waitFor(() =>
    expect(addShoot).toHaveBeenCalledWith({
      date: DAY,
      time: '',
      creatorId: '',
      note: '',
    }),
  );
  expect(await screen.findByText('Shoot')).toBeTruthy();
});

it('names an untitled shoot by its account, and its buttons by time too', () => {
  const a = shoot(4, KEE, DAY, '10:00', null, { creatorId: GARY });
  const b = shoot(5, KEE, DAY, '15:00', null, { creatorId: GARY });
  render(<Tracker initial={[a, b]} meId={KEE} />);
  expect(screen.getAllByText('Gary')).toHaveLength(2);
  expect(button('Change 10:00 Gary')).toBeTruthy();
  expect(button('Change 15:00 Gary')).toBeTruthy();
});

it('reads out the note with the buttons of two untimed shoots for one account', () => {
  const a = shoot(4, KEE, DAY, null, null, {
    creatorId: GARY,
    note: 'afternoon, bring the fill light',
  });
  const b = shoot(5, KEE, DAY, null, null, {
    creatorId: GARY,
    note: 'evening, JB',
  });
  render(<Tracker initial={[a, b]} meId={KEE} />);
  const described = screen
    .getAllByRole('button', { name: 'Delete Gary' })
    .map(
      (el) =>
        document.getElementById(el.getAttribute('aria-describedby') ?? '')
          ?.textContent,
    );
  expect(described).toEqual(['afternoon, bring the fill light', 'evening, JB']);
});

it('keeps an old shoot’s title, with its account beside it', () => {
  render(<Tracker initial={[{ ...MINE, creatorId: GARY }]} meId={KEE} />);
  expect(screen.getByText('Hotpot shop')).toBeTruthy();
  expect(screen.getByText('Gary')).toBeTruthy();
  expect(button('Change Hotpot shop')).toBeTruthy();
});

it('keeps the form open and says why when the server refuses', async () => {
  (addShoot as jest.Mock).mockResolvedValue({
    ok: false,
    message: 'Time must look like 19:30.',
  });
  render(<Tracker initial={[]} meId={KEE} />);
  fireEvent.click(screen.getByRole('button', { name: '+ Add a shoot' }));
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
  render(<Tracker initial={[MINE]} meId={KEE} />);
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
  // The tracker re-reads the page: the new videos show in its video list.
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('keeps each row’s text when a row above it is removed', () => {
  render(<Tracker initial={[MINE]} meId={KEE} />);
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
  const done = shoot(3, KEE, DAY, '10:00', 'Mall', {
    status: 'done',
    videosShot: 4,
  });
  const cancelled = shoot(4, KEE, DAY, null, 'Beach', {
    status: 'cancelled',
  });
  render(<Tracker initial={[MINE, done, cancelled]} meId={KEE} />);

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
  const { unmount } = render(
    <Tracker
      initial={[lastMonth]}
      meId={KEE}
      day="2026-08-31"
      today="2026-09-02"
    />,
  );
  expect(button('Pass videos: Café visit')).toBeTruthy();
  expect(button('Change Café visit')).toBeNull();
  expect(button('Cancel shoot: Café visit')).toBeNull();
  expect(button('Delete Café visit')).toBeNull();
  expect(button('+ Add a shoot')).toBeNull();
  unmount();

  const thisMonth = shoot(5, KEE, '2026-09-01', '10:00', 'Hotpot shop');
  render(
    <Tracker
      initial={[thisMonth]}
      meId={KEE}
      day="2026-09-01"
      today="2026-09-02"
    />,
  );
  expect(button('Change Hotpot shop')).toBeTruthy();
  expect(button('+ Add a shoot')).toBeTruthy();
});

it('cancels a planned shoot with one click', async () => {
  (setShootStatus as jest.Mock).mockResolvedValue({
    ok: true,
    shoot: { ...MINE, status: 'cancelled' },
  });
  render(<Tracker initial={[MINE]} meId={KEE} />);
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
  render(<Tracker initial={[MINE]} meId={KEE} />);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel shoot: Hotpot shop' }),
    );
  });
  const card = screen.getByText('Hotpot shop').closest('li')!;
  expect(card.querySelector('[role="alert"]')?.textContent).toContain(
    'has moved on',
  );
});

it('frees the panel and says why when an action throws', async () => {
  (setShootStatus as jest.Mock).mockRejectedValue(
    new TypeError('Failed to fetch'),
  );
  render(<Tracker initial={[MINE]} meId={KEE} />);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel shoot: Hotpot shop' }),
    );
  });
  expect(screen.getByRole('alert').textContent).toContain(
    'Could not save. Try again.',
  );
  const cancel = screen.getByRole('button', {
    name: 'Cancel shoot: Hotpot shop',
  }) as HTMLButtonElement;
  expect(cancel.disabled).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
});

describe('the admin’s view', () => {
  it('shows everyone’s shoots with nothing to press', () => {
    const done = shoot(3, ZUWEI, DAY, null, 'Mall', {
      status: 'done',
      videosShot: 3,
    });
    render(<Tracker initial={[MINE, THEIRS, done]} meId={null} readOnly />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('KEE')).toBeTruthy();
    expect(screen.getByText('3 videos passed')).toBeTruthy();
    expect(screen.getAllByText('Planned')).toHaveLength(2);
  });

  it('stays read-only even when given a person', () => {
    render(<Tracker initial={[MINE]} meId={KEE} readOnly />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
