/**
 * The staff tracker reads only the signed-in person's work. Everything the
 * page hands its client component ends up in the page, so a team-wide read
 * filtered in the browser would leak everyone's shoots and videos: every
 * shoot and video read must carry the person, and a blank person must never
 * reach the loaders (which read everyone's when given none).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  loadPlacements,
  loadShoots,
  loadVideos,
  loadVideosDone,
} from '@gitroom/frontend/lib/team/load';
import { loadAdminTracker, loadStaffTracker } from './tracker-data';

jest.mock('@gitroom/frontend/lib/team/load', () => ({
  loadShoots: jest.fn(async () => []),
  loadVideos: jest.fn(async () => []),
  loadVideosDone: jest.fn(async () => []),
  loadPeople: jest.fn(async () => []),
  loadRoster: jest.fn(async () => []),
  loadPlacements: jest.fn(async () => ({ assignments: [], stats: [] })),
  monthDays: (m: string) => ({ from: `${m}-01`, to: `${m}-31` }),
}));

const ME = 'aaaaaaaa-0000-4000-8000-000000000001';

beforeEach(() => jest.clearAllMocks());

it('scopes every shoot and video read to the person', async () => {
  await loadStaffTracker(ME, '2026-09', '2026-09-30');
  const shoots = (loadShoots as jest.Mock).mock.calls;
  const videos = (loadVideos as jest.Mock).mock.calls;
  const done = (loadVideosDone as jest.Mock).mock.calls;
  expect(shoots.length).toBeGreaterThan(0);
  expect(videos.length).toBeGreaterThan(0);
  expect(done.length).toBeGreaterThan(0);
  for (const call of shoots) expect(call[2]).toBe(ME);
  for (const call of videos) expect(call[1]).toBe(ME);
  for (const call of done) expect(call[2]).toBe(ME);
});

it('never hands staff the account board', async () => {
  // Who handles and edits which account is the admin's to see and set.
  const data = await loadStaffTracker(ME, '2026-09', '2026-09-30');
  expect(loadPlacements).not.toHaveBeenCalled();
  expect(data).not.toHaveProperty('board');
});

it('refuses to read without a person', async () => {
  await expect(loadStaffTracker('', '2026-09', '2026-09-30')).rejects.toThrow();
  expect(loadShoots).not.toHaveBeenCalled();
  expect(loadVideos).not.toHaveBeenCalled();
  expect(loadVideosDone).not.toHaveBeenCalled();
});

it('reads today and tomorrow even when they are in the next month', async () => {
  await loadStaffTracker(ME, '2026-09', '2026-09-30');
  expect(loadShoots).toHaveBeenCalledWith('2026-09-30', '2026-10-02', ME);
});

it('keeps the staff page on the scoped loader', () => {
  // The page may not go round it to the team-wide loaders.
  const page = readFileSync(
    join(__dirname, '../../app/(staff)/staff/page.tsx'),
    'utf8',
  );
  expect(page).toContain('loadStaffTracker(');
  expect(page).not.toMatch(/\bloadShoots\b|\bloadVideos\b|\bloadVideosDone\b/);
  expect(page).not.toContain('loadAdminTracker');
});

it('reads everyone’s work for the admin', async () => {
  await loadAdminTracker('2026-09', '2026-09-26');
  for (const call of (loadShoots as jest.Mock).mock.calls)
    expect(call[2]).toBeUndefined();
  expect((loadVideos as jest.Mock).mock.calls[0][1]).toBeUndefined();
  // The account board follows the viewed month.
  expect(loadPlacements).toHaveBeenCalledWith('2026-09');
});
