/** @jest-environment jsdom */
/**
 * The admin sets what someone does (handler, editor, or both) from the team
 * list; the choice shows at once and goes back if the server refuses it.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { setMemberKind } from './actions';
import { TeamManager, type TeamRow } from './team-manager';

jest.mock('./actions', () => ({
  approveStaff: jest.fn(),
  rejectStaff: jest.fn(),
  unlinkStaff: jest.fn(),
  setMemberKind: jest.fn(async () => ({ ok: true })),
}));
const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const KEE: TeamRow = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'KEE',
  kind: 'handler',
  email: null,
  edited: 0,
  posted: 3,
  shootsDone: 1,
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

it('says so when a new editor’s accounts moved to Unassigned', async () => {
  (setMemberKind as jest.Mock).mockResolvedValueOnce({
    ok: true,
    message: 'Job saved. Their accounts moved to Unassigned.',
  });
  render(<TeamManager pending={[]} team={[KEE]} unlinked={[]} />);
  fireEvent.change(screen.getByLabelText('Job: KEE'), {
    target: { value: 'editor' },
  });
  await screen.findByText('Job saved. Their accounts moved to Unassigned.');
});
