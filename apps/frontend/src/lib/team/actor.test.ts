/**
 * The admin only looks at shoots and videos: every write refuses them on
 * the server, before the database is touched — not just a hidden button.
 */

import { getSupabaseAdmin } from '@d3/database';
import { getAuthContext } from '@gitroom/frontend/lib/auth';
import {
  addShoot,
  deleteShoot,
  passVideos,
  setShootStatus,
  updateShoot,
} from './shoot-actions';
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

const ID = 'cccccccc-0000-4000-8000-000000000001';
const ALI = 'aaaaaaaa-0000-4000-8000-000000000009';
const shoot = { date: '2099-01-05', title: 'Hotpot shop' };

it('refuses an admin every shoot and video write', async () => {
  (getAuthContext as jest.Mock).mockResolvedValue({
    userId: 'u1',
    email: 'admin@d3.test',
    role: 'admin',
  });
  const refused = { ok: false, message: 'Not authorized.' };
  for (const call of [
    () => addShoot(shoot),
    () => updateShoot(ID, shoot),
    () => setShootStatus(ID, 'cancelled'),
    () => deleteShoot(ID),
    () => passVideos(ID, [{ title: 'Reel 1', editorId: ALI }]),
    () => updateVideo(ID, { title: 'Reel 1', editorId: ALI }),
    () => deleteVideo(ID),
    () => finishEdit(ID),
    () => undoEdit(ID),
    () => verifyVideo(ID),
    () => undoVerify(ID),
  ])
    await expect(call()).resolves.toEqual(refused);
  expect(getSupabaseAdmin).not.toHaveBeenCalled();
});
