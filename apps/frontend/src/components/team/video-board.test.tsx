/** @jest-environment jsdom */
/**
 * Who may move which step of a video job. The editor clicks Done on the edit
 * (with the link to the cut), the handler schedules and clicks Done on the
 * post (with the link to the live post); nobody else gets those buttons, and
 * only the admin gives out, changes or deletes jobs. The server re-checks all
 * of it — this is about not offering what it would refuse.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { Video } from '@gitroom/frontend/lib/team/videos';
import {
  createVideo,
  finishEdit,
  finishPost,
  undoPost,
} from '@gitroom/frontend/lib/team/video-actions';
import { VideoBoard } from './video-board';

jest.mock('@gitroom/frontend/lib/team/video-actions', () => ({
  createVideo: jest.fn(),
  updateVideo: jest.fn(),
  deleteVideo: jest.fn(),
  finishEdit: jest.fn(),
  undoEdit: jest.fn(),
  schedulePost: jest.fn(),
  finishPost: jest.fn(),
  undoPost: jest.fn(),
}));

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ALI = 'aaaaaaaa-0000-4000-8000-000000000009';
const ACC = 'bbbbbbbb-0000-4000-8000-000000000001';
const people = [
  { id: KEE, name: 'KEE', kind: 'handler' as const, archived: false },
  { id: ALI, name: 'ALI', kind: 'editor' as const, archived: false },
];
const accounts = [{ id: ACC, name: 'Gary' }];

function video(id: string, patch: Partial<Video> = {}): Video {
  return {
    id,
    creatorId: ACC,
    title: id,
    note: null,
    editorId: ALI,
    handlerId: KEE,
    editedAt: null,
    editedBy: null,
    editLink: null,
    postDate: null,
    postTime: null,
    postedAt: null,
    postedBy: null,
    postLink: null,
    createdAt: '2026-09-20T02:00:00Z',
    ...patch,
  };
}

const TO_EDIT = video('Reel 1');
const TO_POST_STAMP = {
  editedAt: '2026-09-21T02:00:00Z',
  editedBy: ALI,
  editLink: 'https://drive.google.com/x',
};
const TO_POST = video('Reel 2', {
  editedAt: '2026-09-21T02:00:00Z',
  editedBy: ALI,
  editLink: 'https://drive.google.com/x',
});

function renderBoard(meId: string | null, videos = [TO_EDIT, TO_POST]) {
  return render(
    <VideoBoard
      videos={videos}
      people={people}
      accounts={accounts}
      meId={meId}
      assignments={{ [ACC]: { handlerId: KEE, editorId: ALI } }}
    />,
  );
}

beforeEach(() => jest.clearAllMocks());

it('gives the editor Done on the edit and nothing on the post', () => {
  renderBoard(ALI);
  expect(
    screen.getByRole('button', { name: 'Done editing: Reel 1' }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Done posting: Reel 2' }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Schedule post: Reel 2' }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: /^Change / })).toBeNull();
  // Their own finished edit can be taken back, with its link on show.
  expect(
    screen.getByRole('button', { name: 'Undo edit: Reel 2' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('link', { name: 'Edited video' }).getAttribute('href'),
  ).toBe('https://drive.google.com/x');
});

it('offers staff no Undo for an edit from an earlier month', () => {
  const { unmount } = render(
    <VideoBoard
      videos={[TO_POST]}
      people={people}
      accounts={accounts}
      meId={ALI}
      month="2026-10"
    />,
  );
  expect(
    screen.queryByRole('button', { name: 'Undo edit: Reel 2' }),
  ).toBeNull();
  unmount();
  render(
    <VideoBoard
      videos={[TO_POST]}
      people={people}
      accounts={accounts}
      meId={ALI}
      month="2026-09"
    />,
  );
  expect(
    screen.getByRole('button', { name: 'Undo edit: Reel 2' }),
  ).toBeTruthy();
});

it('gives the handler Schedule and Done once the edit is done', () => {
  renderBoard(KEE);
  expect(
    screen.queryByRole('button', { name: 'Done editing: Reel 1' }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Schedule post: Reel 2' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Done posting: Reel 2' }),
  ).toBeTruthy();
});

it('sends the pasted link with the editor’s Done', async () => {
  (finishEdit as jest.Mock).mockResolvedValue({
    ok: true,
    video: {
      ...TO_EDIT,
      editedAt: '2026-09-23T02:00:00Z',
      editLink: 'https://drive.google.com/cut',
    },
  });
  renderBoard(ALI);
  fireEvent.click(screen.getByRole('button', { name: 'Done editing: Reel 1' }));
  fireEvent.change(screen.getByLabelText('Link to the edited video'), {
    target: { value: 'https://drive.google.com/cut' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  });
  expect(finishEdit).toHaveBeenCalledWith(
    TO_EDIT.id,
    'https://drive.google.com/cut',
  );
  // It has moved on to the posting column.
  const posting = screen.getByRole('region', { name: 'Ready to post' });
  expect(within(posting).getByText('Reel 1')).toBeTruthy();
});

it('says a staff Done went through, since the job moves to another list', async () => {
  (finishEdit as jest.Mock).mockResolvedValue({
    ok: true,
    video: { ...TO_EDIT, editedAt: '2026-09-23T02:00:00Z', editedBy: ALI },
  });
  renderBoard(ALI);
  fireEvent.click(screen.getByRole('button', { name: 'Done editing: Reel 1' }));
  fireEvent.change(screen.getByLabelText('Link to the edited video'), {
    target: { value: 'https://drive.google.com/cut' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  });
  expect((await screen.findByRole('status')).textContent).toContain(
    'Edit done: “Reel 1” is ready to post.',
  );
});

it('keeps the step open with the reason when the server refuses', async () => {
  (finishPost as jest.Mock).mockResolvedValue({
    ok: false,
    message: 'Paste the link to the live post (starting with https://).',
  });
  renderBoard(KEE);
  fireEvent.click(screen.getByRole('button', { name: 'Done posting: Reel 2' }));
  fireEvent.change(screen.getByLabelText('Link to the live post'), {
    target: { value: 'https://instagram.com/p/1' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  });
  expect(screen.getByRole('alert').textContent).toContain(
    'Paste the link to the live post',
  );
  expect(screen.getByLabelText('Link to the live post')).toBeTruthy();
});

it('never renders a pasted non-web link as a link', () => {
  renderBoard(null, [
    video('Reel 3', {
      editedAt: '2026-09-21T02:00:00Z',
      editLink: 'javascript:alert(1)',
    }),
  ]);
  expect(screen.queryByRole('link', { name: 'Edited video' })).toBeNull();
});

it('lets the admin give out a job with the account’s people filled in', async () => {
  (createVideo as jest.Mock).mockResolvedValue({
    ok: true,
    video: video('CNY promo'),
  });
  renderBoard(null);
  expect(screen.getByRole('button', { name: 'Change Reel 1' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '+ New video' }));
  fireEvent.change(screen.getByLabelText('Creator account'), {
    target: { value: ACC },
  });
  expect((screen.getByLabelText('Editor') as HTMLSelectElement).value).toBe(
    ALI,
  );
  expect((screen.getByLabelText('Handler') as HTMLSelectElement).value).toBe(
    KEE,
  );
  fireEvent.change(screen.getByLabelText('Which video'), {
    target: { value: 'CNY promo' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  });
  expect(createVideo).toHaveBeenCalledWith({
    creatorId: ACC,
    title: 'CNY promo',
    editorId: ALI,
    handlerId: KEE,
    postDate: '',
    postTime: '',
    note: '',
  });
  const editing = screen.getByRole('region', { name: 'Being edited' });
  expect(within(editing).getByText('CNY promo')).toBeTruthy();
});

it('lets the editor post a job that has no handler', () => {
  renderBoard(ALI, [video('Reel 4', { handlerId: null, ...TO_POST_STAMP })]);
  expect(
    screen.getByRole('button', { name: 'Schedule post: Reel 4' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Done posting: Reel 4' }),
  ).toBeTruthy();
});

it('names who a finished step counts for, even after the job moved on', () => {
  const LEFT = 'aaaaaaaa-0000-4000-8000-000000000003';
  render(
    <VideoBoard
      videos={[
        video('Reel 5', {
          editorId: ALI,
          editedAt: '2026-09-21T02:00:00Z',
          editedBy: LEFT,
        }),
      ]}
      people={[
        ...people,
        { id: LEFT, name: 'MEI', kind: 'editor', archived: true },
      ]}
      accounts={accounts}
      meId={null}
    />,
  );
  const card = screen.getByText('Reel 5').closest('li')!;
  expect(within(card).getByText(/MEI \(left\)/)).toBeTruthy();
});

it('shows a refused Undo on its own job', async () => {
  (undoPost as jest.Mock).mockResolvedValue({
    ok: false,
    message:
      'You can only take back your own Done from this month. Ask an admin.',
  });
  const out = video('Reel 6', {
    ...TO_POST_STAMP,
    postedAt: '2026-09-22T02:00:00Z',
    postedBy: KEE,
  });
  renderBoard(KEE, [out, TO_EDIT]);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Undo post: Reel 6' }));
  });
  const done = screen.getByRole('region', { name: 'Done this month' });
  expect(within(done).getByRole('alert').textContent).toContain(
    'from this month',
  );
  const editing = screen.getByRole('region', { name: 'Being edited' });
  expect(within(editing).queryByRole('alert')).toBeNull();
});

it('says why when the connection drops, and frees the board again', async () => {
  (finishPost as jest.Mock).mockRejectedValue(new TypeError('Failed to fetch'));
  renderBoard(KEE);
  fireEvent.click(screen.getByRole('button', { name: 'Done posting: Reel 2' }));
  fireEvent.change(screen.getByLabelText('Link to the live post'), {
    target: { value: 'https://instagram.com/p/1' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  });
  expect(screen.getByRole('alert').textContent).toContain(
    'Could not save. Try again.',
  );
  const done = screen.getByRole('button', {
    name: 'Done',
  }) as HTMLButtonElement;
  expect(done.disabled).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
});

it('refreshes the page after a save, so Back shows it', async () => {
  (finishEdit as jest.Mock).mockResolvedValue({
    ok: true,
    video: { ...TO_EDIT, editedAt: '2026-09-23T02:00:00Z', editedBy: ALI },
  });
  renderBoard(ALI);
  fireEvent.click(screen.getByRole('button', { name: 'Done editing: Reel 1' }));
  fireEvent.change(screen.getByLabelText('Link to the edited video'), {
    target: { value: 'https://drive.google.com/cut' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  });
  expect(refresh).toHaveBeenCalledTimes(1);
});
