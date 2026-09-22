/** @jest-environment jsdom */
/**
 * Removing a person must not depend on `window.confirm`: embedded browsers
 * (the Claude desktop pane, automation) auto-dismiss native dialogs and return
 * false, which made the × button a no-op. The confirmation is inline instead.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { StaffingBoard } from './staffing-board';
import { removeMember } from './actions';

jest.mock('./actions', () => ({
  addMember: jest.fn(async () => ({ ok: true, id: 'x' })),
  removeMember: jest.fn(async () => ({ ok: true })),
  setAssignment: jest.fn(async () => ({ ok: true })),
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

const KEE = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  name: 'KEE',
  role: 'Trader',
  sortOrder: 0,
};

function renderBoard() {
  return render(
    <StaffingBoard
      month="2026-09"
      monthLabel="September 2026"
      members={[KEE]}
      creators={[]}
      onFail={jest.fn()}
    />,
  );
}

describe('StaffingBoard remove person', () => {
  beforeEach(() => jest.clearAllMocks());

  it('confirms inline and never calls window.confirm', async () => {
    const confirmSpy = jest
      .spyOn(window, 'confirm')
      .mockImplementation(() => false);
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Remove KEE' }));
    // The inline confirmation, not a native dialog.
    expect(
      screen.getByText('Remove KEE? Their accounts move to Unassigned.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(removeMember).toHaveBeenCalledWith(KEE.id));
    expect(screen.queryByRole('heading', { name: 'KEE' })).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('cancel keeps the person', () => {
    renderBoard();
    fireEvent.click(screen.getByRole('button', { name: 'Remove KEE' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByText('Remove KEE? Their accounts move to Unassigned.'),
    ).toBeNull();
    expect(screen.getByRole('heading', { name: 'KEE' })).toBeTruthy();
    expect(removeMember).not.toHaveBeenCalled();
  });
});
