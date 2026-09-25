/** @jest-environment jsdom */
/**
 * The admin sets what someone does (handler, editor, or both) from the team
 * list; the choice shows at once and goes back if the server refuses it.
 * Removing someone asks first, then shows the server's refusal on their row.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { removePerson, setMemberKind } from './actions';
import { TeamManager, type TeamRow } from './team-manager';

jest.mock('./actions', () => ({
  approveStaff: jest.fn(),
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
  const why =
    'They still have videos to edit or verify. Those must be finished, or passed to someone else, first.';
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
