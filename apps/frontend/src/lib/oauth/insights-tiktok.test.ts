/** @jest-environment node */
import {
  mapTikTokAccount,
  mapTikTokVideos,
  sumVideoViews,
} from './insights-tiktok';

describe('insights-tiktok mappers', () => {
  it('mapTikTokAccount pulls stats', () => {
    expect(
      mapTikTokAccount({
        data: {
          user: {
            follower_count: 41230,
            following_count: 88,
            likes_count: 990000,
            video_count: 412,
          },
        },
      }),
    ).toEqual({
      follower_total: 41230,
      total_interactions: 990000,
      following_count: 88,
      video_count: 412,
    });
  });
  it('mapTikTokAccount tolerates missing fields', () => {
    expect(mapTikTokAccount({})).toEqual({
      follower_total: null,
      total_interactions: null,
      following_count: null,
      video_count: null,
    });
  });
  it('mapTikTokVideos sums engagement into interactions', () => {
    const rows = mapTikTokVideos([
      {
        id: 'v1',
        view_count: 1000,
        like_count: 80,
        comment_count: 12,
        share_count: 8,
      },
      {
        id: 'v2',
        view_count: 500,
        like_count: 10,
        comment_count: 0,
        share_count: 0,
      },
    ]);
    expect(rows).toEqual([
      {
        external_post_id: 'v1',
        views: 1000,
        interactions: 100,
        raw: rows[0].raw,
      },
      {
        external_post_id: 'v2',
        views: 500,
        interactions: 10,
        raw: rows[1].raw,
      },
    ]);
  });
  it('sumVideoViews adds view_count', () => {
    expect(
      sumVideoViews([
        { view_count: 1000 },
        { view_count: 500 },
        { view_count: undefined },
      ]),
    ).toBe(1500);
  });
});
