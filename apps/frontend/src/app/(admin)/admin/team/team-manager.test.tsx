/** @jest-environment jsdom */
/**
 * The admin sets what someone does (handler, editor, or both) from the team
 * list; the choice shows at once and goes back if the server refuses it.
 * Removing someone asks first, then shows the server's refusal on their row.
 * A signup with the name of someone already on the board is offered as them.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { approveStaff, removePerson, setMemberKind } from './actions';
import { TeamManager, type PendingSignup, type TeamRow } from './team-manager';

jest.mock('./actions', () => ({
  approveStaff: jest.fn(async () => ({ ok: true })),
  rejectStaff: jest.fn(),
  removePerson: jest.fn(async () => ({ ok: true })),
  setMemberKind: jest.fn(async () => ({ ok: true })),
}));
const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const KEE: TeamRow = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'KEE',
  kind: 'handler',
  email: null,
  shootsDone: 1,
  edited: 0,
  verified: 3,
  profileHref: '#',
};

beforeEach(() => jest.clearAllMocks());

it('changes a person’s job from the team list', async () => {
  render(<TeamManager pending={[]} team={[KEE]} unlinked={[]} />);
  const job = screen.getByLabelText('Job: KEE') as HTMLSelectElement;
  fireEvent.change(job, { target: { value: 'both' } });

  expect(job.value).toBe('both');
  await waitFor(() =>
    expect(setMemberKind).toHaveBeenCalledWith(KEE.id, 'both'),
  );
  await screen.findByText('Job saved.');
  expect(refresh).toHaveBeenCalled();
});

it('puts the job back when the change is refused', async () => {
  (setMemberKind as jest.Mock).mockResolvedValueOnce({
    ok: false,
    message: 'That person is no longer on the board.',
  });
  render(<TeamManager pending={[]} team={[KEE]} unlinked={[]} />);
  const job = screen.getByLabelText('Job: KEE') as HTMLSelectElement;
  fireEvent.change(job, { target: { value: 'editor' } });

  await screen.findByText('That person is no longer on the board.');
  expect(job.value).toBe('handler');
  expect(refresh).not.toHaveBeenCalled();
});

it('removes someone, even without a login, only after asking', async () => {
  render(<TeamManager pending={[]} team={[KEE]} unlinked={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove KEE' }));
  expect(removePerson).not.toHaveBeenCalled();

  const strip = screen.getByRole('group', { name: 'Remove KEE' });
  fireEvent.click(strip.querySelector('button')!);
  await waitFor(() => expect(removePerson).toHaveBeenCalledWith(KEE.id));
  await screen.findByText('Removed from the team.');
  expect(refresh).toHaveBeenCalled();
});

it('shows why a remove was refused on that person’s row', async () => {
  const why = 'That person is already gone.';
  (removePerson as jest.Mock).mockResolvedValueOnce({
    ok: false,
    message: why,
  });
  render(<TeamManager pending={[]} team={[KEE]} unlinked={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove KEE' }));
  fireEvent.click(
    screen.getByRole('group', { name: 'Remove KEE' }).querySelector('button')!,
  );

  await screen.findByText(why);
  expect(refresh).not.toHaveBeenCalled();
});

it('shows this month’s shoots, edits and checks', () => {
  render(<TeamManager pending={[]} team={[KEE]} unlinked={[]} />);
  expect(screen.getByText('Shoots').nextSibling?.textContent).toBe('1');
  expect(screen.getByText('Edited').nextSibling?.textContent).toBe('0');
  expect(screen.getByText('Verified').nextSibling?.textContent).toBe('3');
});

describe('approving a signup', () => {
  const signup = (name: string): PendingSignup => ({
    userId: 'bbbbbbbb-0000-4000-8000-000000000001',
    email: 'kee@example.com',
    name,
    kind: 'both',
    signedUpAt: '2026-09-26T05:00:00Z',
    confirmed: true,
    approved: false,
  });
  const ZUWEI = { id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'ZUWEI' };

  // Approving them as a new person would leave the old person's accounts
  // with nobody on the admin's board.
  it('offers the person already on the board with the same name', async () => {
    render(
      <TeamManager
        pending={[signup(' kee ')]}
        team={[]}
        unlinked={[ZUWEI, { id: KEE.id, name: 'KEE' }]}
      />,
    );
    expect(
      screen
        .getByRole('button', { name: 'Someone already on the board' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect((screen.getByLabelText('Person') as HTMLSelectElement).value).toBe(
      KEE.id,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(approveStaff).toHaveBeenCalledWith(signup('').userId, {
        memberId: KEE.id,
      }),
    );
  });

  it('offers a new person when nobody on the board has the name', async () => {
    render(
      <TeamManager pending={[signup('MEI')]} team={[]} unlinked={[ZUWEI]} />,
    );
    expect(
      screen
        .getByRole('button', { name: 'New person' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(approveStaff).toHaveBeenCalledWith(signup('').userId, {
        name: 'MEI',
        kind: 'both',
      }),
    );
  });
});
