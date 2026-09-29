/**
 * The public pages' cached reads: a good read is handed through (and
 * cached by Next), and a failed or empty one throws, so it is never cached
 * and the page's own fallback shows.
 */

import { getDashboardViewTotalsWindowed } from './metrics-windowed';
import {
  cachedDashboardTotals,
  cachedLiveCreatorRows,
  cachedTopContent,
} from './public-data';
import { getLiveCreatorRows, getTopContentRankingsWindowed } from './queries';

// Outside Next there is no cache: the wrapped function runs as it is.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
jest.mock('./queries', () => ({
  getLiveCreatorRows: jest.fn(),
  getTopContentRankingsWindowed: jest.fn(),
}));
jest.mock('./metrics-windowed', () => ({
  getDashboardViewTotalsWindowed: jest.fn(),
}));

const window = (n: number) => ({
  byViews: Array.from({ length: n }, (_, i) => ({ id: String(i) })),
  byInteractions: [],
});

it('hands a good read through', async () => {
  (getLiveCreatorRows as jest.Mock).mockResolvedValue([{ creatorId: 'c1' }]);
  await expect(cachedLiveCreatorRows()).resolves.toEqual([{ creatorId: 'c1' }]);
  (getTopContentRankingsWindowed as jest.Mock).mockResolvedValue({
    '7d': window(0),
    '30d': window(2),
  });
  await expect(cachedTopContent(50)).resolves.toMatchObject({
    '30d': { byViews: [{ id: '0' }, { id: '1' }] },
  });
  expect(getTopContentRankingsWindowed).toHaveBeenCalledWith(50);
  (getDashboardViewTotalsWindowed as jest.Mock).mockResolvedValue({
    byPlatform: { tiktok: {} },
    byCreator: {},
  });
  await expect(cachedDashboardTotals()).resolves.toBeTruthy();
});

it('throws on a failed or empty read, so nothing is cached', async () => {
  (getLiveCreatorRows as jest.Mock).mockResolvedValue(null);
  await expect(cachedLiveCreatorRows()).rejects.toThrow('no creator rows');
  (getLiveCreatorRows as jest.Mock).mockResolvedValue([]);
  await expect(cachedLiveCreatorRows()).rejects.toThrow('no creator rows');
  (getTopContentRankingsWindowed as jest.Mock).mockResolvedValue({
    '7d': window(0),
    '30d': window(0),
  });
  await expect(cachedTopContent(50)).rejects.toThrow('no content rows');
  (getDashboardViewTotalsWindowed as jest.Mock).mockResolvedValue({
    byPlatform: {},
    byCreator: {},
  });
  await expect(cachedDashboardTotals()).rejects.toThrow('no view totals');
});
