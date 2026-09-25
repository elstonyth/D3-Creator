/** @jest-environment jsdom */
/**
 * The tracker's one inline confirm: it says what will happen, names its
 * button, and starts on Cancel so a stray Enter destroys nothing.
 */

import { fireEvent, render, screen } from '@testing-library/react';

import { ConfirmRemove } from './confirm-remove';

jest.mock('./tracker.module.scss', () => ({}));

function renderConfirm(confirmLabel?: string) {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(
    <ConfirmRemove
      name="Call the printer"
      message="Delete this task?"
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

it('shows the message, with Remove on the button by default', () => {
  renderConfirm();
  expect(screen.getByText('Delete this task?')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
});

it('puts the confirm label on the button when given', () => {
  renderConfirm('Delete');
  expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
});

it('starts on Cancel', () => {
  renderConfirm();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Cancel' }),
  );
});

it('calls each callback once, from its own button', () => {
  const { onConfirm, onCancel } = renderConfirm('Delete');
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
