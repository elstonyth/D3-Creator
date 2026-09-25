/** @jest-environment jsdom */
/**
 * Who may move which step of a video. The editor clicks Done (a link is
 * optional); the handler — who passed the video on — may change or remove
 * it until then, and verifies the cut after. Nobody else gets those buttons,
 * and the admin's view has no buttons at all. The server re-checks all of
 * it — this is about not offering what it would refuse.
 */

import { act, fireEvent, render, screen, within } from '@testing-library/react';

import type { Video } from '@gitroom/frontend/lib/team/videos';
import {
  deleteVideo,
  finishEdit,
  undoVerify,
  updateVideo,
  verifyVideo,
} from '@gitroom/frontend/lib/team/video-actions';
import { VideoBoard } from './video-board';

jest.mock('@gitroom/frontend/lib/team/video-actions', () => ({
  updateVideo: jest.fn(),
  deleteVideo: jest.fn(),
  finishEdit: jest.fn(),
  undoEdit: jest.fn(),
  verifyVideo: jest.fn(),
  undoVerify: jest.fn(),
}));

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
// No CSS in jest; the class names are chrome, not behaviour.
jest.mock('./tracker.module.scss', () => ({}));

const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ALI = 'aaaaaaaa-0000-4000-8000-000000000009';
const MEI = 'aaaaaaaa-0000-4000-8000-000000000003';
const ACC = 'bbbbbbbb-0000-4000-8000-000000000001';
const people = [
  { id: KEE, name: 'KEE', kind: 'handler' as const, archived: false },
  { id: ALI, name: 'ALI', kind: 'editor' as const, archived: false },
  { id: MEI, name: 'MEI', kind: 'both' as const, archived: false },
];
const accounts = [{ id: ACC, name: 'Gary' }];

function video(id: string, patch: Partial<Video> = {}): Video {
  return {
    id,
    creatorId: ACC,
    shootId: null,
    title: id,
    editorId: ALI,
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

const EDITED = {
  editedAt: '2026-09-21T02:00:00Z',
  editedBy: ALI,
  editLink: 'https://drive.google.com/x',
};
const TO_EDIT = video('Reel 1');
const TO_VERIFY = video('Reel 2', EDITED);

function renderBoard(
  meId: string | null,
  videos = [TO_EDIT, TO_VERIFY],
  { readOnly = false, month = '2026-09' } = {},
) {
  return render(
    <VideoBoard
      videos={videos}
      people={people}
      accounts={accounts}
      meId={meId}
      month={month}
      readOnly={readOnly}
    />,
  );
}

const region = (name: string) => screen.getByRole('region', { name });

beforeEach(() => jest.clearAllMocks());

it('gives the editor Done on their video, and their finished edit under Done', () => {
  renderBoard(ALI);
  expect(
    within(region('To edit')).getByRole('button', {
      name: 'Done editing: Reel 1',
    }),
  ).toBeTruthy();
  const done = region('Done this month');
  expect(within(done).getByText('Reel 2')).toBeTruthy();
  // Their own edit can be taken back until it is verified.
  expect(
    within(done).getByRole('button', { name: 'Undo edit: Reel 2' }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Verify/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^Change / })).toBeNull();
  expect(
    screen.getByRole('link', { name: 'Edited video' }).getAttribute('href'),
  ).toBe('https://drive.google.com/x');
});

it('gives the handler Change and Remove before the edit, Verify after', () => {
  renderBoard(KEE);
  const waiting = region('With the editor');
  expect(
    within(waiting).getByRole('button', { name: 'Change Reel 1' }),
  ).toBeTruthy();
  expect(
    within(waiting).getByRole('button', { name: 'Remove Reel 1' }),
  ).toBeTruthy();
  expect(
    within(region('To verify')).getByRole('button', {
      name: 'Verify: Reel 2',
    }),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Done editing/ })).toBeNull();
});

it('offers no Undo for an edit from an earlier month', () => {
  renderBoard(ALI, [TO_VERIFY], { month: '2026-10' });
  expect(
    screen.queryByRole('button', { name: 'Undo edit: Reel 2' }),
  ).toBeNull();
});

it('sends Done without a link, since a link is optional', async () => {
  (finishEdit as jest.Mock).mockResolvedValue({
    ok: true,
    video: { ...TO_EDIT, editedAt: '2026-09-23T02:00:00Z', editedBy: ALI },
  });
  renderBoard(ALI);
  // The live region is there, empty, before anything is said in it.
  expect(screen.getByRole('status').textContent).toBe('');
  fireEvent.click(screen.getByRole('button', { name: 'Done editing: Reel 1' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  });
  expect(finishEdit).toHaveBeenCalledWith(TO_EDIT.id, '');
  expect(within(region('Done this month')).getByText('Reel 1')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain(
    'Edit done: “Reel 1” is waiting to be verified.',
  );
  expect(refresh).toHaveBeenCalledTimes(1);
});

it('sends share text pasted from an app, words and all', async () => {
  const share =
    '7.43 复制打开抖音，看看【作品】https://v.douyin.com/iRNBho6H/ 再次打开';
  (finishEdit as jest.Mock).mockResolvedValue({
    ok: true,
    video: { ...TO_EDIT, editedAt: '2026-09-23T02:00:00Z', editedBy: ALI },
  });
  renderBoard(ALI);
  fireEvent.click(screen.getByRole('button', { name: 'Done editing: Reel 1' }));
  fireEvent.change(screen.getByLabelText(/Link to the edited video/), {
    target: { value: share },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  });
  // The server takes the link out of the words around it.
  expect(finishEdit).toHaveBeenCalledWith(TO_EDIT.id, share);
});

it('keeps the step open with the reason when the server refuses', async () => {
  (finishEdit as jest.Mock).mockResolvedValue({
    ok: false,
    message:
      'That link does not look right. Paste one starting with https://, or leave it empty.',
  });
  renderBoard(ALI);
  fireEvent.click(screen.getByRole('button', { name: 'Done editing: Reel 1' }));
  fireEvent.change(screen.getByLabelText(/Link to the edited video/), {
    target: { value: 'drive.google.com/x' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  });
  expect(screen.getByRole('alert').textContent).toContain(
    'That link does not look right.',
  );
  expect(screen.getByLabelText(/Link to the edited video/)).toBeTruthy();
});

it('verifies with one click and moves the video to done', async () => {
  (verifyVideo as jest.Mock).mockResolvedValue({
    ok: true,
    video: {
      ...TO_VERIFY,
      verifiedAt: '2026-09-23T02:00:00Z',
      verifiedBy: KEE,
    },
  });
  renderBoard(KEE);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Verify: Reel 2' }));
  });
  expect(verifyVideo).toHaveBeenCalledWith(TO_VERIFY.id);
  const done = region('Done this month');
  expect(within(done).getByText('Reel 2')).toBeTruthy();
  expect(
    within(done).getByRole('button', { name: 'Undo verify: Reel 2' }),
  ).toBeTruthy();
});

it('lets the handler change the title and editor, sending what it started from', async () => {
  (updateVideo as jest.Mock).mockResolvedValue({
    ok: true,
    video: { ...TO_EDIT, title: 'Reel 1b', editorId: MEI },
  });
  renderBoard(KEE);
  fireEvent.click(screen.getByRole('button', { name: 'Change Reel 1' }));
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'Reel 1b' },
  });
  const editor = screen.getByLabelText('Editor') as HTMLSelectElement;
  // Only people who cut video can be picked.
  expect([...editor.options].map((o) => o.text)).toEqual(['ALI', 'MEI']);
  fireEvent.change(editor, { target: { value: MEI } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  });
  expect(updateVideo).toHaveBeenCalledWith(
    TO_EDIT.id,
    { title: 'Reel 1b', editorId: MEI },
    { title: 'Reel 1', editorId: ALI },
  );
  expect(screen.getByText('Reel 1b')).toBeTruthy();
});

it('keeps the current editor pickable, marking only someone who left', () => {
  const ZED = 'aaaaaaaa-0000-4000-8000-000000000010';
  const GONE = 'aaaaaaaa-0000-4000-8000-000000000011';
  render(
    <VideoBoard
      videos={[
        // ZED's job changed to handler; GONE was removed from the team.
        video('Reel 5', { editorId: ZED }),
        video('Reel 6', { editorId: GONE }),
      ]}
      people={[
        ...people,
        { id: ZED, name: 'ZED', kind: 'handler', archived: false },
        { id: GONE, name: 'GONE', kind: 'editor', archived: true },
      ]}
      accounts={accounts}
      meId={KEE}
      month="2026-09"
    />,
  );
  const picks = (title: string) => {
    fireEvent.click(screen.getByRole('button', { name: `Change ${title}` }));
    const editor = screen.getByLabelText('Editor') as HTMLSelectElement;
    const texts = [...editor.options].map((o) => o.text);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    return texts;
  };
  expect(picks('Reel 5')).toEqual(['ALI', 'MEI', 'ZED']);
  expect(picks('Reel 6')).toEqual(['ALI', 'MEI', 'GONE (left)']);
});

it('asks before removing a video, and removes it only on Remove', async () => {
  (deleteVideo as jest.Mock).mockResolvedValue({ ok: true });
  renderBoard(KEE);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Reel 1' }));
  const ask = screen.getByRole('group', { name: 'Remove Reel 1' });
  fireEvent.click(within(ask).getByRole('button', { name: 'Keep' }));
  expect(deleteVideo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Reel 1' }));
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Remove Reel 1' })).getByRole(
        'button',
        { name: 'Remove' },
      ),
    );
  });
  expect(deleteVideo).toHaveBeenCalledWith(TO_EDIT.id);
  expect(screen.queryByText('Reel 1')).toBeNull();
});

it('shows a video once when one person is both its editor and handler', () => {
  renderBoard(MEI, [video('Reel 3', { editorId: MEI, handlerId: MEI })]);
  expect(screen.getAllByText('Reel 3')).toHaveLength(1);
  const toEdit = region('To edit');
  // Theirs to edit, and theirs to change while it is.
  expect(
    within(toEdit).getByRole('button', { name: 'Done editing: Reel 3' }),
  ).toBeTruthy();
  expect(
    within(toEdit).getByRole('button', { name: 'Change Reel 3' }),
  ).toBeTruthy();
});

it('never renders a pasted non-web link as a link', () => {
  renderBoard(ALI, [video('Reel 4', { ...EDITED, editLink: 'javascript:x' })]);
  expect(screen.queryByRole('link', { name: 'Edited video' })).toBeNull();
});

it('shows a refused Undo on its own video', async () => {
  (undoVerify as jest.Mock).mockResolvedValue({
    ok: false,
    message: 'You can only take back your own Verify from this month.',
  });
  const out = video('Reel 6', {
    ...EDITED,
    verifiedAt: '2026-09-22T02:00:00Z',
    verifiedBy: KEE,
  });
  renderBoard(KEE, [out, TO_EDIT]);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Undo verify: Reel 6' }),
    );
  });
  expect(
    within(region('Done this month')).getByRole('alert').textContent,
  ).toContain('from this month');
  expect(within(region('With the editor')).queryByRole('alert')).toBeNull();
});

it('says why when the connection drops, and frees the board again', async () => {
  (verifyVideo as jest.Mock).mockRejectedValue(
    new TypeError('Failed to fetch'),
  );
  renderBoard(KEE);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Verify: Reel 2' }));
  });
  expect(screen.getByRole('alert').textContent).toContain(
    'Could not save. Try again.',
  );
  const verify = screen.getByRole('button', {
    name: 'Verify: Reel 2',
  }) as HTMLButtonElement;
  expect(verify.disabled).toBe(false);
  expect(refresh).not.toHaveBeenCalled();
});

it('names who verifies each video, and whether it is verified yet', () => {
  const out = video('Reel 9', {
    ...EDITED,
    verifiedAt: '2026-09-22T02:00:00Z',
    verifiedBy: KEE,
  });
  renderBoard(KEE, [TO_EDIT, TO_VERIFY, out]);
  for (const title of ['Reel 1', 'Reel 2']) {
    const card = screen.getByText(title).closest('li')!;
    expect(within(card).getByText(/not verified yet/)).toBeTruthy();
  }
  const done = screen.getByText('Reel 9').closest('li')!;
  expect(within(done).queryByText(/not verified yet/)).toBeNull();
  expect(within(done).getByText(/verified /)).toBeTruthy();
});

it('takes the server’s list again when the page is re-read', () => {
  // A shoot passed on elsewhere on the page adds a video to this list.
  const { rerender } = renderBoard(KEE, [TO_EDIT]);
  rerender(
    <VideoBoard
      videos={[TO_EDIT, video('Reel 10')]}
      people={people}
      accounts={accounts}
      meId={KEE}
      month="2026-09"
    />,
  );
  expect(within(region('With the editor')).getByText('Reel 10')).toBeTruthy();
});

describe('the admin’s view', () => {
  const verified = video('Reel 5', {
    ...EDITED,
    verifiedAt: '2026-09-22T02:00:00Z',
    verifiedBy: KEE,
  });

  it('shows who is editing and who verifies, with nothing to press', () => {
    renderBoard(null, [TO_EDIT, TO_VERIFY, verified], { readOnly: true });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(within(region('Being edited')).getByText('Reel 1')).toBeTruthy();
    const card = within(region('Being edited'))
      .getByText('Reel 1')
      .closest('li')!;
    expect(within(card).getByText(/ALI/)).toBeTruthy();
    expect(
      within(region('Waiting to verify')).getByText('Reel 2'),
    ).toBeTruthy();
    expect(
      within(region('Verified this month')).getByText('Reel 5'),
    ).toBeTruthy();
  });

  it('stays read-only even when given a person', () => {
    renderBoard(KEE, [TO_EDIT, TO_VERIFY], { readOnly: true });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('filters to one person, as editor or handler', () => {
    renderBoard(
      null,
      [TO_EDIT, video('Reel 7', { editorId: MEI, handlerId: MEI })],
      { readOnly: true },
    );
    fireEvent.change(screen.getByLabelText('Show whose videos'), {
      target: { value: MEI },
    });
    expect(screen.queryByText('Reel 1')).toBeNull();
    expect(screen.getByText('Reel 7')).toBeTruthy();
  });

  it('names who a finished step counts for, even after they left', () => {
    render(
      <VideoBoard
        videos={[video('Reel 8', { ...EDITED, editedBy: 'gone' })]}
        people={[
          ...people,
          { id: 'gone', name: 'ZU', kind: 'editor', archived: true },
        ]}
        accounts={accounts}
        meId={null}
        month="2026-09"
        readOnly
      />,
    );
    const card = screen.getByText('Reel 8').closest('li')!;
    expect(within(card).getByText(/ZU \(left\)/)).toBeTruthy();
  });
});
