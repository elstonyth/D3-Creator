/** @jest-environment jsdom */
/**
 * What pops up for a staff member: a shoot whose time has come, with Pass
 * videos right there; videos just passed to them; cuts that wait on their
 * Verify. Seen once per device, so it doesn't nag — except a shoot whose
 * videos still wait, which comes back on the next visit.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { Shoot } from '@gitroom/frontend/lib/team/shoots';
import type { Video } from '@gitroom/frontend/lib/team/videos';
import { passVideos } from '@gitroom/frontend/lib/team/shoot-actions';
import { armChime, playChime } from '@gitroom/frontend/lib/team/chime';
import { WorkAlerts } from './work-alerts';

jest.mock('@gitroom/frontend/lib/team/shoot-actions', () => ({
  passVideos: jest.fn(),
}));
jest.mock('@gitroom/frontend/lib/team/chime', () => ({
  armChime: jest.fn(() => () => undefined),
  playChime: jest.fn(),
}));
const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
jest.mock('./tracker.module.scss', () => ({}));
// The liquid-glass dist is ESM-only; tracker-shell's panel is not used here.
jest.mock('./glass-panel', () => ({ GlassPanel: () => null }));

// jsdom has <dialog> but not its modal methods.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';
const MEI = 'aaaaaaaa-0000-4000-8000-000000000003';
const GARY = 'bbbbbbbb-0000-4000-8000-000000000001';
const people = [
  { id: KEE, name: 'KEE' },
  { id: MEI, name: 'MEI' },
];
const accounts = [{ id: GARY, name: 'Gary' }];
const TODAY = '2026-09-29';
// 29 Sep, 18:30 in Malaysia.
const NOW = Date.parse('2026-09-29T18:30:00+08:00');

function shoot(n: number, time: string | null, extra: Partial<Shoot> = {}) {
  return {
    id: `cccccccc-0000-4000-8000-00000000000${n}`,
    memberId: KEE,
    date: TODAY,
    time,
    title: null,
    creatorId: GARY,
    videosShot: null,
    status: 'planned',
    note: null,
    ...extra,
  } as Shoot;
}

function video(n: number, patch: Partial<Video> = {}): Video {
  return {
    id: `dddddddd-0000-4000-8000-00000000000${n}`,
    creatorId: GARY,
    shootId: null,
    title: `Reel ${n}`,
    editorId: KEE,
    handlerId: MEI,
    editedAt: null,
    editedBy: null,
    editLink: null,
    verifiedAt: null,
    verifiedBy: null,
    createdAt: '2026-09-29T02:00:00Z',
    ...patch,
  };
}

function alerts({
  shoots = [] as Shoot[],
  videos = [] as Video[],
  now = NOW as number | null,
  onPassed = jest.fn(),
} = {}) {
  return (
    <WorkAlerts
      meId={KEE}
      month="2026-09"
      today={TODAY}
      now={now}
      shoots={shoots}
      videos={videos}
      people={people}
      accounts={accounts}
      editors={[{ id: MEI, name: 'MEI' }]}
      onPassed={onPassed}
    />
  );
}

// An open <dialog> only: a closed one stays in the page, empty.
const dialog = () => document.querySelector<HTMLElement>('dialog[open]');

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

it('asks to pass the videos on an hour after a shoot’s time', async () => {
  const onPassed = jest.fn();
  const at17 = shoot(1, '17:00');
  (passVideos as jest.Mock).mockResolvedValue({
    ok: true,
    shoot: { ...at17, status: 'done', videosShot: 1 },
    videos: [],
  });
  render(alerts({ shoots: [at17, shoot(2, '18:00')], onPassed }));
  const box = within(dialog()!);
  expect(box.getByText('Shoot time is up — pass the videos on')).toBeTruthy();
  // 17:00 began over an hour ago; 18:00 is still going on.
  expect(box.getByText('Today · 17:00 · Gary')).toBeTruthy();
  expect(box.queryByText(/18:00/)).toBeNull();

  fireEvent.click(
    box.getByRole('button', { name: 'Pass videos: Today · 17:00 · Gary' }),
  );
  fireEvent.change(box.getByLabelText('Video 1 title'), {
    target: { value: 'Reel 1' },
  });
  await act(async () => {
    fireEvent.click(box.getByRole('button', { name: 'Pass videos' }));
  });
  expect(passVideos).toHaveBeenCalledWith(at17.id, [
    { title: 'Reel 1', editorId: MEI },
  ]);
  expect(onPassed).toHaveBeenCalledWith(
    expect.objectContaining({ id: at17.id, status: 'done' }),
  );
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('keeps the pass form open and says why when it is refused', async () => {
  (passVideos as jest.Mock).mockResolvedValue({
    ok: false,
    message: 'You can only pass videos from your own shoots.',
  });
  render(alerts({ shoots: [shoot(1, '17:00')] }));
  const box = within(dialog()!);
  fireEvent.click(box.getByRole('button', { name: /^Pass videos: / }));
  fireEvent.change(box.getByLabelText('Video 1 title'), {
    target: { value: 'Reel 1' },
  });
  await act(async () => {
    fireEvent.click(box.getByRole('button', { name: 'Pass videos' }));
  });
  expect(box.getByRole('alert').textContent).toContain('your own shoots');
  expect(box.getByLabelText('Video 1 title')).toBeTruthy();
});

it('asks about a shoot with no time only once its day is over', () => {
  const untimed = shoot(1, null);
  const { rerender } = render(alerts({ shoots: [untimed] }));
  expect(dialog()).toBeNull();
  rerender(
    alerts({
      shoots: [untimed],
      now: Date.parse('2026-09-30T00:00:00+08:00'),
    }),
  );
  expect(within(dialog()!).getByText(/Gary/)).toBeTruthy();
});

it('never asks about a cancelled or done shoot, or someone else’s', () => {
  render(
    alerts({
      shoots: [
        shoot(1, '09:00', { status: 'cancelled' }),
        shoot(2, '10:00', { status: 'done', videosShot: 2 }),
        shoot(3, '11:00', { memberId: MEI }),
      ],
    }),
  );
  expect(dialog()).toBeNull();
});

it('holds a due shoot back after Later, until the next visit', () => {
  const at17 = shoot(1, '17:00');
  const { unmount } = render(alerts({ shoots: [at17] }));
  fireEvent.click(screen.getByRole('button', { name: 'Later' }));
  expect(dialog()).toBeNull();
  unmount();
  render(alerts({ shoots: [at17] }));
  expect(dialog()).not.toBeNull();
});

it('tells the editor about videos passed to them, once', () => {
  const first = [video(1)];
  const { rerender } = render(alerts({ videos: first }));
  const box = within(dialog()!);
  expect(box.getByText('New videos to edit')).toBeTruthy();
  expect(box.getByText('Reel 1')).toBeTruthy();
  expect(box.getByText('From MEI · Gary')).toBeTruthy();
  fireEvent.click(box.getByRole('button', { name: 'Got it' }));
  expect(dialog()).toBeNull();

  // Seen: the page reads itself again, nothing new, nothing pops up.
  rerender(alerts({ videos: [...first] }));
  expect(dialog()).toBeNull();
  // One more arrives: only that one.
  rerender(alerts({ videos: [...first, video(2)] }));
  expect(within(dialog()!).queryByText('Reel 1')).toBeNull();
  expect(within(dialog()!).getByText('Reel 2')).toBeTruthy();
});

it('remembers what was seen on this device across visits', () => {
  const { unmount } = render(alerts({ videos: [video(1)] }));
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
  unmount();
  render(alerts({ videos: [video(1)] }));
  expect(dialog()).toBeNull();
});

it('tells the handler a cut is done, but never about their own cut', () => {
  render(
    alerts({
      videos: [
        video(1, {
          editorId: MEI,
          handlerId: KEE,
          editedAt: '2026-09-29T08:00:00Z',
          editedBy: MEI,
        }),
        video(2, {
          editorId: KEE,
          handlerId: KEE,
          editedAt: '2026-09-29T08:00:00Z',
          editedBy: KEE,
        }),
      ],
    }),
  );
  const box = within(dialog()!);
  expect(box.getByText('Edited — ready for you to verify')).toBeTruthy();
  expect(box.getByText('Reel 1')).toBeTruthy();
  expect(box.getByText('Cut by MEI · Gary')).toBeTruthy();
  expect(box.queryByText('Reel 2')).toBeNull();
});

it('shows nothing before the page is in the browser', () => {
  render(
    alerts({ shoots: [shoot(1, '17:00')], videos: [video(1)], now: null }),
  );
  expect(dialog()).toBeNull();
  expect(playChime).not.toHaveBeenCalled();
});

it('chimes once for each thing new to the pop-up', () => {
  const { rerender } = render(alerts({ videos: [video(1)] }));
  expect(armChime).toHaveBeenCalled();
  expect(playChime).toHaveBeenCalledTimes(1);
  // The page reads itself again with nothing new: no chime.
  rerender(alerts({ videos: [video(1)] }));
  expect(playChime).toHaveBeenCalledTimes(1);
  // Another video passed on while the pop-up is still open.
  rerender(alerts({ videos: [video(1), video(2)] }));
  expect(playChime).toHaveBeenCalledTimes(2);
  // Put away: seen, so the same again stays quiet.
  fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
  rerender(alerts({ videos: [video(1), video(2)] }));
  expect(playChime).toHaveBeenCalledTimes(2);
  // A shoot comes due.
  rerender(
    alerts({ shoots: [shoot(1, '17:00')], videos: [video(1), video(2)] }),
  );
  expect(playChime).toHaveBeenCalledTimes(3);
});

it('asks about a closed month’s shoot once per device, since it can’t be cancelled', () => {
  // 29 Sep, seen on 1 Oct: September is closed.
  const lastMonth = shoot(1, '17:00');
  const october = { now: Date.parse('2026-10-01T09:00:00+08:00') };
  const view = (extra = {}) => (
    <WorkAlerts
      meId={KEE}
      month="2026-10"
      today="2026-10-01"
      now={october.now}
      shoots={[lastMonth]}
      videos={[]}
      people={people}
      accounts={accounts}
      editors={[{ id: MEI, name: 'MEI' }]}
      onPassed={jest.fn()}
      {...extra}
    />
  );
  const { unmount } = render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Later' }));
  unmount();
  render(view());
  expect(dialog()).toBeNull();
});

it('closes an open pass form on Escape, keeping the pop-up', () => {
  render(alerts({ shoots: [shoot(1, '17:00')] }));
  fireEvent.click(
    within(dialog()!).getByRole('button', { name: /^Pass videos: / }),
  );
  expect(within(dialog()!).getByLabelText('Video 1 title')).toBeTruthy();
  fireEvent(dialog()!, new Event('cancel', { cancelable: true }));
  expect(dialog()).not.toBeNull();
  expect(within(dialog()!).queryByLabelText('Video 1 title')).toBeNull();
  fireEvent(dialog()!, new Event('cancel', { cancelable: true }));
  expect(dialog()).toBeNull();
});
