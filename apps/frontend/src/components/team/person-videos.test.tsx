/** @jest-environment jsdom */
/**
 * A person's page: what they finished this month, and — on this month's
 * page — what is in their hands now, so the admin sees a video given to an
 * editor who has not opened it yet.
 */

import { render, screen, within } from '@testing-library/react';

import { getI18n } from '@gitroom/frontend/lib/i18n-server';
import type { Video } from '@gitroom/frontend/lib/team/videos';
import { PersonVideos } from './person-videos';

jest.mock('@gitroom/frontend/lib/i18n-server', () => ({ getI18n: jest.fn() }));

const SHAREEN = 'aaaaaaaa-0000-4000-8000-000000000005';
const KEE = 'aaaaaaaa-0000-4000-8000-000000000001';
const ACC = 'bbbbbbbb-0000-4000-8000-000000000001';

function video(title: string, patch: Partial<Video> = {}): Video {
  return {
    id: `dddddddd-0000-4000-8000-${title.length.toString().padStart(12, '0')}`,
    creatorId: ACC,
    shootId: null,
    title,
    editorId: SHAREEN,
    handlerId: KEE,
    editedAt: null,
    editedBy: null,
    editLink: null,
    verifiedAt: null,
    verifiedBy: null,
    createdAt: '2026-09-29T07:09:31Z',
    ...patch,
  };
}

beforeEach(() => {
  (getI18n as jest.Mock).mockResolvedValue({
    t: (key: string, vars?: Record<string, string | number>) =>
      key.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? '')),
    locale: 'en',
  });
});

const accountName = new Map([[ACC, 'Gary']]);

it('shows what is in their hands now, when asked to', async () => {
  render(
    await PersonVideos({
      edited: [],
      verified: [],
      inHand: {
        toEdit: [video('Reel for SHAREEN')],
        toVerify: [],
        withEditor: [],
      },
      accountName,
    }),
  );
  const now = within(screen.getByRole('region', { name: 'In hand now' }));
  const toEdit = within(now.getByRole('region', { name: 'To edit' }));
  expect(toEdit.getByText('Reel for SHAREEN')).toBeTruthy();
  expect(now.getByText('Nothing to verify right now.')).toBeTruthy();
  // What they finished is still listed below it.
  expect(screen.getByRole('region', { name: 'Videos done' })).toBeTruthy();
});

it('leaves it out on a past month', async () => {
  render(await PersonVideos({ edited: [], verified: [], accountName }));
  expect(screen.queryByRole('region', { name: 'In hand now' })).toBeNull();
  expect(screen.getByRole('region', { name: 'Videos done' })).toBeTruthy();
});
