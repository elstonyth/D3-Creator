/** @jest-environment jsdom */
/**
 * The pencil-to-input swap on tasks and events. Enter or blur saves once,
 * Escape walks away, and nothing is saved that would not change the title.
 */

import { fireEvent, render, screen } from '@testing-library/react';

import { EditableTitle } from './editable-title';

jest.mock('./tracker.module.scss', () => ({}));

function setup(value = 'Cut 3 reels') {
  const onSave = jest.fn();
  const onEditingChange = jest.fn();
  render(
    <EditableTitle
      value={value}
      onSave={onSave}
      editLabel="Edit task"
      inputLabel="Task title"
      onEditingChange={onEditingChange}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit task' }));
  const input = screen.getByRole('textbox', {
    name: 'Task title',
  }) as HTMLInputElement;
  return { input, onSave, onEditingChange };
}

describe('EditableTitle', () => {
  it('opens prefilled, with browser autocomplete off', () => {
    const { input, onEditingChange } = setup();
    expect(input.value).toBe('Cut 3 reels');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(onEditingChange).toHaveBeenCalledWith(true);
  });

  it('saves the tidied text once on Enter', () => {
    const { input, onSave, onEditingChange } = setup();
    fireEvent.change(input, { target: { value: '  Cut   4 reels ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Cut 4 reels');
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('saves on blur', () => {
    const { input, onSave } = setup();
    fireEvent.change(input, { target: { value: 'Call Gary' } });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledWith('Call Gary');
  });

  it('Escape cancels', () => {
    const { input, onSave } = setup();
    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Cut 3 reels')).toBeTruthy();
  });

  it('never saves a blank or unchanged title', () => {
    const blank = setup();
    fireEvent.change(blank.input, { target: { value: '   ' } });
    fireEvent.keyDown(blank.input, { key: 'Enter' });
    expect(blank.onSave).not.toHaveBeenCalled();
  });

  it('reopens cleanly after a save', () => {
    const { input, onSave } = setup();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit task' }));
    const again = screen.getByRole('textbox', { name: 'Task title' });
    fireEvent.change(again, { target: { value: 'Second edit' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith('Second edit');
  });
});
