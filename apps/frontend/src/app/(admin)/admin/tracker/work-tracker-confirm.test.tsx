/** @jest-environment jsdom */
/**
 * The × on a task or an event only asks; Delete is what deletes. A row still
 * waiting for its server id has nothing to delete, so its × waits too.
 */

import { fireEvent, render, screen } from '@testing-library/react';

import type { TrackerEvent, TrackerTask } from '@gitroom/frontend/lib/tracker';
import { deleteEvent, deleteTask } from './actions';
import { EventsPanel, TasksPanel } from './work-tracker';

jest.mock('./actions', () => ({
  deleteTask: jest.fn(async () => ({ ok: true })),
  deleteEvent: jest.fn(async () => ({ ok: true })),
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

const TASK: TrackerTask = {
  id: 'cccccccc-0000-4000-8000-000000000001',
  title: 'Call the printer',
  done: false,
  sortOrder: 0,
  assigneeId: null,
};

const EVENT: TrackerEvent = {
  id: 'dddddddd-0000-4000-8000-000000000001',
  date: '2026-09-25',
  title: 'Studio shoot',
};

function renderTasks(tasks: TrackerTask[]) {
  render(
    <TasksPanel
      tasks={tasks}
      setTasks={jest.fn()}
      members={[]}
      onFail={jest.fn()}
    />,
  );
}

function renderEvents(events: TrackerEvent[]) {
  render(
    <EventsPanel
      dateKey="2026-09-25"
      label="Friday, 25 September"
      events={events}
      shoots={[]}
      posts={[]}
      setEvents={jest.fn()}
      onFail={jest.fn()}
    />,
  );
}

beforeEach(() => jest.clearAllMocks());

it('the × on a task only asks; Delete deletes it once', () => {
  renderTasks([TASK]);
  fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
  expect(screen.getByText('Delete “Call the printer”?')).toBeTruthy();
  expect(deleteTask).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(deleteTask).toHaveBeenCalledTimes(1);
  expect(deleteTask).toHaveBeenCalledWith(TASK.id);
});

it('the × on an event only asks; Delete deletes it once', () => {
  renderEvents([EVENT]);
  fireEvent.click(screen.getByRole('button', { name: 'Delete event' }));
  expect(screen.getByText('Delete “Studio shoot”?')).toBeTruthy();
  expect(deleteEvent).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(deleteEvent).toHaveBeenCalledTimes(1);
  expect(deleteEvent).toHaveBeenCalledWith(EVENT.id);
});

it('the × waits while a row has no server id yet', () => {
  renderTasks([{ ...TASK, id: 'temp-1' }]);
  renderEvents([{ ...EVENT, id: 'temp-2' }]);
  expect(
    (screen.getByRole('button', { name: 'Delete task' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Delete event' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
