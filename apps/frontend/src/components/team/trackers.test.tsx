/** @jest-environment jsdom */
/**
 * The two Work Trackers put together: the staff one shows the person's own
 * work and lets them act on it; the admin's shows everyone's and offers
 * nothing that writes to it — only the account board, which is the admin's.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';

import type { Shoot } from '@gitroom/frontend/lib/team/shoots';
import type { Video } from '@gitroom/frontend/lib/team/videos';
import { AdminTracker } from './admin-tracker';
import { StaffTracker } from './staff-tracker';

jest.mock('@gitroom/frontend/lib/team/shoot-actions', () => ({}));
jest.mock('@gitroom/frontend/lib/team/video-actions', () => ({}));
jest.mock('@gitroom/frontend/lib/team/account-actions', () => ({
  placeCards: jest.fn(async () => ({ ok: true })),
  setAssignment: jest.fn(async () => ({ ok: true })),
}));
const push = jest.fn();
const refresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(),
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
const MEI = 'aaaaaaaa-0000-4000-8000-000000000003';
const people = [
  { id: KEE, name: 'KEE', kind: 'handler' as const, archived: false },
  { id: ZUWEI, name: 'ZUWEI', kind: 'handler' as const, archived: false },
  { id: MEI, name: 'MEI', kind: 'both' as const, archived: false },
];
const ACC = 'bbbbbbbb-0000-4000-8000-000000000001';
const accounts = [{ id: ACC, name: 'Gary' }];

const TODAY = '2026-09-30';

function shoot(
  n: number,
  memberId: string,
  date: string,
  title: string,
  extra: Partial<Shoot> = {},
): Shoot {
  return {
    id: `cccccccc-0000-4000-8000-00000000000${n}`,
    memberId,
    date,
    time: '10:00',
    title,
    creatorId: null,
    videosShot: null,
    status: 'planned',
    note: null,
    ...extra,
  };
}

function video(n: number, patch: Partial<Video>): Video {
  return {
    id: `dddddddd-0000-4000-8000-00000000000${n}`,
    creatorId: ACC,
    shootId: null,
    title: `Reel ${n}`,
    editorId: MEI,
    handlerId: KEE,
    editedAt: null,
    editedBy: null,
    editLink: null,
    verifiedAt: null,
    verifiedBy: null,
    createdAt: '2026-09-20T02:00:00Z',
    ...patch,
  };
}

const EDITED = { editedAt: '2026-09-29T02:00:00Z', editedBy: MEI };

beforeEach(() => jest.clearAllMocks());

describe('the staff tracker', () => {
  const shoots = [
    shoot(1, KEE, TODAY, 'Hotpot shop', { creatorId: ACC }),
    // Tomorrow is next month: on the spotlight, not in September's numbers.
    shoot(2, KEE, '2026-10-01', 'Furniture shop'),
    shoot(3, KEE, '2026-09-12', 'Mall', { status: 'done', videosShot: 4 }),
  ];
  const videos = [
    video(1, { editorId: KEE, handlerId: MEI }), // mine to edit
    video(2, EDITED), // mine to verify
    video(3, {}), // still with MEI
  ];

  function renderStaff() {
    return render(
      <StaffTracker
        month="2026-09"
        today={TODAY}
        initialDay={null}
        shoots={shoots}
        videos={videos}
        edited={2}
        verified={5}
        people={people}
        accounts={accounts}
        meId={KEE}
      />,
    );
  }

  it('puts my shoots and my queue on the spotlight', () => {
    renderStaff();
    const spot = screen.getByRole('region', { name: 'Upcoming' });
    expect(within(spot).getByText('10:00 · Hotpot shop · Gary')).toBeTruthy();
    expect(within(spot).getByText('10:00 · Furniture shop')).toBeTruthy();
    expect(within(spot).getByText('1 to edit · 1 to verify')).toBeTruthy();
  });

  it('counts only the calendar’s month', () => {
    renderStaff();
    const stats = screen.getByText('This month').parentElement!;
    const value = (label: string) =>
      within(stats).getByText(label).nextElementSibling?.textContent;
    expect(value('Shoots done')).toBe('1');
    expect(value('Videos passed')).toBe('4');
    expect(value('Edited')).toBe('2');
    expect(value('Verified')).toBe('5');
  });

  it('opens a picked day with its shoots, mine to act on', () => {
    renderStaff();
    // Today is picked first.
    expect(
      screen.getByRole('button', { name: 'Change Hotpot shop' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^12/ }));
    expect(screen.getByText('4 videos passed')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Pass videos: Mall' }),
    ).toBeTruthy();
    expect(screen.queryByText('Hotpot shop')).toBeNull();
  });

  it('takes the server’s shoots again after a refresh', () => {
    const { rerender } = renderStaff();
    fireEvent.click(screen.getByRole('button', { name: /^12/ }));
    expect(screen.getByText('4 videos passed')).toBeTruthy();
    // Its videos taken back on the board below: the server has the shoot
    // planned again, and the refresh hands a new list through.
    rerender(
      <StaffTracker
        month="2026-09"
        today={TODAY}
        initialDay={null}
        shoots={shoots.map((x) =>
          x.title === 'Mall'
            ? { ...x, status: 'planned' as const, videosShot: null }
            : x,
        )}
        videos={videos}
        edited={2}
        verified={5}
        people={people}
        accounts={accounts}
        meId={KEE}
      />,
    );
    expect(screen.queryByText('4 videos passed')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Cancel shoot: Mall' }),
    ).toBeTruthy();
    const stats = screen.getByText('This month').parentElement!;
    const value = (label: string) =>
      within(stats).getByText(label).nextElementSibling?.textContent;
    expect(value('Shoots done')).toBe('0');
    expect(value('Videos passed')).toBe('0');
  });

  it('opens a day in another month on that month', () => {
    renderStaff();
    const spot = screen.getByRole('region', { name: 'Upcoming' });
    fireEvent.click(within(spot).getAllByRole('button')[1]);
    expect(push).toHaveBeenCalledWith('?month=2026-10&day=2026-10-01');
  });

  it('lists my videos with who edits and who verifies them', () => {
    renderStaff();
    expect(
      within(screen.getByRole('region', { name: 'To edit' })).getByText(
        'Reel 1',
      ),
    ).toBeTruthy();
    const toVerify = screen.getByRole('region', { name: 'To verify' });
    const card = within(toVerify).getByText('Reel 2').closest('li')!;
    expect(within(card).getByText(/MEI/)).toBeTruthy();
    expect(within(card).getByText(/not verified yet/)).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'With the editor' })).getByText(
        'Reel 3',
      ),
    ).toBeTruthy();
  });
});

describe('the admin’s tracker', () => {
  const shoots = [
    shoot(1, KEE, TODAY, 'Hotpot shop'),
    shoot(2, ZUWEI, TODAY, 'Furniture shop', {
      status: 'done',
      videosShot: 2,
    }),
  ];
  const videos = [
    video(1, {}), // MEI editing, KEE verifies
    video(2, EDITED), // waiting on KEE
    video(3, {
      ...EDITED,
      verifiedAt: '2026-09-29T05:00:00Z',
      verifiedBy: KEE,
    }),
  ];

  function renderAdmin() {
    return render(
      <AdminTracker
        month="2026-09"
        today={TODAY}
        initialDay={null}
        shoots={shoots}
        videos={videos}
        done={{ [KEE]: { edited: 0, verified: 3 } }}
        edited={6}
        verified={3}
        people={people}
        accounts={accounts}
        board={[
          {
            id: ACC,
            name: 'Gary',
            avatarUrl: null,
            platforms: ['tiktok'],
            handlerId: ZUWEI,
            editorId: MEI,
            scheduledPosting: true,
            sortOrder: 0,
            videos: 12,
            posts: 30,
            views: 250000,
          },
        ]}
        profileBase="/team"
      />,
    );
  }

  const accountBoard = () =>
    screen.getByRole('region', { name: 'Personnel & client configuration' });

  it('offers nothing that writes to the staff’s shoots and videos', () => {
    renderAdmin();
    // What is left to press only moves around: days, months, the cards —
    // apart from the account board, which the admin sets.
    const writes =
      /^(\+ add|pass videos|change|cancel shoot|reopen|delete|done|verify|remove|undo|save)/i;
    const board = accountBoard();
    for (const b of screen.getAllByRole('button')) {
      if (board.contains(b)) continue;
      expect(b.getAttribute('aria-label') ?? b.textContent).not.toMatch(writes);
    }
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    // Outside the board, the only select filters the video list.
    expect(
      screen
        .getAllByRole('combobox')
        .filter((c) => !board.contains(c))
        .map((c) => c.id),
    ).toEqual(['videos-person']);
  });

  it('shows who handles and who edits each account', () => {
    renderAdmin();
    const board = within(accountBoard());
    const zuwei = within(
      board.getByRole('region', { name: 'ZUWEI’s accounts' }),
    );
    const gary = zuwei.getByRole('article');
    expect(within(gary).getByText('Gary')).toBeTruthy();
    expect(
      (within(gary).getByLabelText('Handler') as HTMLSelectElement).value,
    ).toBe(ZUWEI);
    expect(
      (within(gary).getByLabelText('Editor') as HTMLSelectElement).value,
    ).toBe(MEI);
    expect(
      within(gary)
        .getByRole('switch', { name: 'Scheduled posting' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    // MEI does both: a column of their own, and the one editing Gary.
    const mei = within(board.getByRole('region', { name: 'MEI’s accounts' }));
    expect(mei.getByText('Edits 1 account · 12 videos')).toBeTruthy();
  });

  it('shows everyone’s day and the videos in hand', () => {
    renderAdmin();
    const spot = screen.getByRole('region', { name: 'Upcoming' });
    expect(within(spot).getByText('10:00 · KEE · Hotpot shop')).toBeTruthy();
    expect(
      within(spot).getByText('1 being edited · 1 waiting to verify'),
    ).toBeTruthy();
    expect(screen.getByText('2 videos passed')).toBeTruthy();
  });

  it('gives each person a column: editing now, to verify, their profile', () => {
    renderAdmin();
    const kee = screen.getByRole('region', { name: 'KEE' });
    // Waiting on KEE's check: Reel 2, cut by MEI.
    expect(within(kee).getByText('Reel 2')).toBeTruthy();
    expect(
      within(kee)
        .getByRole('link', { name: /Open profile/ })
        .getAttribute('href'),
    ).toBe(`/team/${KEE}`);
    const mei = screen.getByRole('region', { name: 'MEI' });
    // MEI is cutting Reel 1 for KEE.
    expect(within(mei).getByText('Reel 1')).toBeTruthy();
    expect(within(mei).getByText('Handler & editor')).toBeTruthy();
  });
});
