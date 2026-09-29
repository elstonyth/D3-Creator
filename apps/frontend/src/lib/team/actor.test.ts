/**
 * Who a shoot or video write runs as. Staff: always their own person, from
 * their session, whatever the browser names. The admin: a handler's steps
 * for anyone on the board, as the person named — never an editor's step,
 * which names nobody, and never without naming someone. All checked on the
 * server, before the database is touched — not just a hidden button.
 */

import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import { getActor } from './actor';
import { onBoard } from './on-board';
import {
  addShoot,
  deleteShoot,
  passVideos,
  setShootStatus,
  updateShoot,
} from './shoot-actions';
import { getStaffContext } from './staff-context';
import {
  deleteVideo,
  finishEdit,
  undoEdit,
  undoVerify,
  updateVideo,
  verifyVideo,
} from './video-actions';

jest.mock('@d3/database', () => ({ getSupabaseAdmin: jest.fn() }));
jest.mock('@gitroom/frontend/lib/auth', () => ({ getAuthContext: jest.fn() }));
jest.mock('./on-board', () => ({ onBoard: jest.fn(async () => true) }));
jest.mock('./staff-context', () => ({
  // Not staff unless a test says so.
  getStaffContext: jest.fn(async () => null),
}));

const ID = 'cccccccc-0000-4000-8000-000000000001';
const ALI = 'aaaaaaaa-0000-4000-8000-000000000009';
const SK = 'aaaaaaaa-0000-4000-8000-000000000004';
const shoot = { date: '2099-01-05', title: 'Hotpot shop' };
const admin = { userId: 'u1', email: 'boss@d3.test', role: 'admin' };
const refused = { ok: false, message: 'Not authorized.' };

beforeEach(() => jest.clearAllMocks());

it('lets the admin act as the person named, if they are on the board', async () => {
  (getAuthContext as jest.Mock).mockResolvedValue(admin);
  await expect(getActor(SK)).resolves.toEqual({ userId: 'u1', memberId: SK });
  expect(onBoard).toHaveBeenCalledWith([SK]);
  // Someone who left, or no one real: refused.
  (onBoard as jest.Mock).mockResolvedValueOnce(false);
  await expect(getActor(SK)).rejects.toThrow('Not authorized.');
  await expect(getActor('nope')).rejects.toThrow('Not authorized.');
  await expect(getActor()).rejects.toThrow('Not authorized.');
});

it('keeps staff to their own person, whoever the browser names', async () => {
  (getAuthContext as jest.Mock).mockResolvedValue({ ...admin, role: 'staff' });
  (getStaffContext as jest.Mock).mockResolvedValueOnce({
    userId: 'u2',
    memberId: ALI,
  });
  await expect(getActor(SK)).resolves.toEqual({ userId: 'u2', memberId: ALI });
  expect(onBoard).not.toHaveBeenCalled();
  // One session read for a staff write: getStaffContext's own.
  expect(getAuthContext).not.toHaveBeenCalled();
});

it('refuses the admin every write that names nobody, and an editor’s steps', async () => {
  (getAuthContext as jest.Mock).mockResolvedValue(admin);
  for (const call of [
    () => addShoot(shoot),
    () => updateShoot(ID, shoot),
    () => setShootStatus(ID, 'cancelled'),
    () => deleteShoot(ID),
    () => passVideos(ID, [{ title: 'Reel 1', editorId: ALI }]),
    () => updateVideo(ID, { title: 'Reel 1', editorId: ALI }),
    () => verifyVideo(ID),
    () => undoVerify(ID),
    // The editor's own steps, and the handler's take-back (the admin has
    // their own Remove): these take no one to act as.
    () => deleteVideo(ID),
    () => finishEdit(ID),
    () => undoEdit(ID),
  ])
    await expect(call()).resolves.toEqual(refused);
  expect(getSupabaseAdmin).not.toHaveBeenCalled();
});

it('refuses anyone who is neither staff nor the admin', async () => {
  (getAuthContext as jest.Mock).mockResolvedValue({ ...admin, role: 'member' });
  await expect(addShoot(shoot, SK)).resolves.toEqual(refused);
  expect(getSupabaseAdmin).not.toHaveBeenCalled();
});
