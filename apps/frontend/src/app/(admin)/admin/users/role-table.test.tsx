/** @jest-environment jsdom */
/**
 * Picking a role only asks; Save writes it. One wrong pick used to grant full
 * Admin, or cut a member off from the classes, the moment it was made.
 */

import { fireEvent, render, screen } from '@testing-library/react';

import { setUserRole } from './actions';
import { RoleTable } from './role-table';

jest.mock('./actions', () => ({
  setUserRole: jest.fn(async () => ({ ok: true, message: 'Role updated.' })),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

const SELF = 'aaaaaaaa-0000-4000-8000-000000000001';
const AMY = {
  user_id: 'aaaaaaaa-0000-4000-8000-000000000002',
  role: 'member',
  created_at: '2026-09-01T00:00:00Z',
  email: 'amy@example.com',
};
const BOB = {
  user_id: 'aaaaaaaa-0000-4000-8000-000000000003',
  role: 'creator',
  created_at: '2026-09-02T00:00:00Z',
  email: 'bob@example.com',
};
const ADMIN_WARNING = 'Admins can see and change everything in the console.';

function renderTable() {
  render(<RoleTable rows={[AMY, BOB]} selfId={SELF} />);
}

function roleOf(email: string) {
  return screen.getByLabelText(`Role for ${email}`) as HTMLSelectElement;
}

beforeEach(() => jest.clearAllMocks());

it('asks before changing a role, and warns about Admin', () => {
  renderTable();
  fireEvent.change(roleOf(AMY.email), { target: { value: 'admin' } });

  expect(setUserRole).not.toHaveBeenCalled();
  expect(
    screen.getByText('Change amy@example.com from Member to Admin?'),
  ).toBeTruthy();
  expect(screen.getByText(ADMIN_WARNING)).toBeTruthy();
});

it('saves the role only when Save is clicked', async () => {
  renderTable();
  fireEvent.change(roleOf(AMY.email), { target: { value: 'admin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByText('Role updated.');
  expect(setUserRole).toHaveBeenCalledTimes(1);
  expect(setUserRole).toHaveBeenCalledWith(AMY.user_id, 'admin');
});

it('Cancel puts the saved role back and writes nothing', () => {
  renderTable();
  fireEvent.change(roleOf(AMY.email), { target: { value: 'admin' } });
  // A second pick while the question is open still starts from the saved role.
  fireEvent.change(roleOf(AMY.email), { target: { value: 'none' } });
  expect(
    screen.getByText('Change amy@example.com from Member to None?'),
  ).toBeTruthy();
  expect(screen.queryByText(ADMIN_WARNING)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(roleOf(AMY.email).value).toBe('member');
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  expect(setUserRole).not.toHaveBeenCalled();
});

it('a pick in another row puts the first row back', () => {
  renderTable();
  fireEvent.change(roleOf(AMY.email), { target: { value: 'admin' } });
  fireEvent.change(roleOf(BOB.email), { target: { value: 'none' } });

  expect(roleOf(AMY.email).value).toBe('member');
  expect(
    screen.queryByText('Change amy@example.com from Member to Admin?'),
  ).toBeNull();
  // The question names its group, so it is read even with focus on Cancel.
  expect(
    screen.getByRole('group', {
      name: 'Change bob@example.com from Creator to None?',
    }),
  ).toBeTruthy();
  expect(setUserRole).not.toHaveBeenCalled();
});

it('picking the saved role again closes the question', () => {
  renderTable();
  fireEvent.change(roleOf(AMY.email), { target: { value: 'admin' } });
  fireEvent.change(roleOf(AMY.email), { target: { value: 'member' } });

  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  expect(setUserRole).not.toHaveBeenCalled();
});

it('a refused save puts the saved role back and says why', async () => {
  (setUserRole as jest.Mock).mockResolvedValueOnce({
    ok: false,
    message: 'Nope.',
  });
  renderTable();
  fireEvent.change(roleOf(AMY.email), { target: { value: 'admin' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await screen.findByText('Nope.');
  expect(setUserRole).toHaveBeenCalledWith(AMY.user_id, 'admin');
  expect(roleOf(AMY.email).value).toBe('member');
});
