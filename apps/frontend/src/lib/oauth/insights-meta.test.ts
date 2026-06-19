/** @jest-environment node */
import {
  pickMetric,
  mapIgAccount,
  mapDemographics,
  mapMedia,
} from './insights-meta';

describe('insights-meta mappers', () => {
  it('pickMetric reads total_value then values[0]', () => {
    const data = [
      { name: 'views', total_value: { value: 500 } },
      { name: 'follower_count', values: [{ value: 12 }] },
    ];
    expect(pickMetric(data, 'views')).toBe(500);
    expect(pickMetric(data, 'follower_count')).toBe(12);
    expect(pickMetric(data, 'missing')).toBeNull();
  });

  it('mapIgAccount maps live metrics, never reads dead ones', () => {
    const row = mapIgAccount({
      data: [
        { name: 'reach', total_value: { value: 800 } },
        { name: 'views', total_value: { value: 1500 } },
        { name: 'accounts_engaged', total_value: { value: 90 } },
        { name: 'total_interactions', total_value: { value: 240 } },
        { name: 'follower_count', values: [{ value: 7 }] },
      ],
    });
    expect(row).toEqual({
      reach: 800,
      views: 1500,
      accounts_engaged: 90,
      total_interactions: 240,
      follower_delta: 7,
    });
  });

  it('mapDemographics flattens breakdowns to rows', () => {
    const rows = mapDemographics('country', {
      data: [
        {
          name: 'follower_demographics',
          total_value: {
            breakdowns: [
              {
                dimension_keys: ['country'],
                results: [
                  { dimension_values: ['MY'], value: 300 },
                  { dimension_values: ['SG'], value: 120 },
                ],
              },
            ],
          },
        },
      ],
    });
    expect(rows).toEqual([
      { dimension: 'country', bucket: 'MY', value: 300 },
      { dimension: 'country', bucket: 'SG', value: 120 },
    ]);
  });

  it('mapMedia reads per-media values', () => {
    expect(
      mapMedia({
        data: [
          { name: 'views', values: [{ value: 999 }] },
          { name: 'reach', values: [{ value: 600 }] },
          { name: 'saved', values: [{ value: 22 }] },
          { name: 'total_interactions', values: [{ value: 80 }] },
        ],
      }),
    ).toEqual({ views: 999, reach: 600, saves: 22, interactions: 80 });
  });
});
