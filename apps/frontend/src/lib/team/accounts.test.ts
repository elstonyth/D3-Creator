import { boardOf, igLive, orderWith, slotBefore } from './accounts';

describe('boardOf', () => {
  const roster = [
    { id: 'a', name: 'Amy', avatarUrl: null, platforms: ['tiktok'], igLive: false },
    { id: 'b', name: 'Bob', avatarUrl: null, platforms: ['instagram'], igLive: true },
    { id: 'c', name: 'Cat', avatarUrl: null, platforms: ['douyin'], igLive: false },
  ];
  const row = (
    creator_id: string,
    handler_id: string | null,
    editor_id: string | null,
    sort_order: number,
  ) => ({ creator_id, handler_id, editor_id, sort_order });

  it('joins assignments and the month output onto every account', () => {
    const cards = boardOf(
      roster,
      [row('a', 'k', 'e', 1), row('b', 'k', null, 0)],
      [{ creator_id: 'a', videos: 3, views: '1200' }],
      new Set(['k', 'e']),
    );
    expect(cards.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(cards[2]).toMatchObject({
      name: 'Amy',
      handlerId: 'k',
      editorId: 'e',
      videos: 3,
      views: 1200,
    });
    // Never assigned, nothing posted: unassigned and zero.
    expect(cards[1]).toMatchObject({
      handlerId: null,
      editorId: null,
      videos: 0,
      views: 0,
    });
  });

  it('shows the slots of someone who left the board as empty', () => {
    const [card] = boardOf(
      roster.slice(0, 1),
      [row('a', 'gone', 'gone', 0)],
      [],
      new Set(['k']),
    );
    expect(card.handlerId).toBeNull();
    expect(card.editorId).toBeNull();
  });
});

describe('where a dragged card lands', () => {
  const at = (id: string, top: number) => ({ id, top, bottom: top + 60 });
  const column = [at('a', 0), at('b', 70), at('c', 140)];

  it('goes before the first card whose middle is below the pointer', () => {
    expect(slotBefore(10, column)).toBe('a');
    expect(slotBefore(31, column)).toBe('b');
    expect(slotBefore(171, column)).toBeNull();
    expect(slotBefore(500, [])).toBeNull();
  });

  it('gives the column its new order', () => {
    expect(orderWith(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(orderWith(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a']);
    // From another column, or before a card that has left: at the end.
    expect(orderWith(['a', 'b'], 'x', 'b')).toEqual(['a', 'x', 'b']);
    expect(orderWith(['a', 'b'], 'x', 'gone')).toEqual(['a', 'b', 'x']);
  });
});

describe('igLive', () => {
  const ig = (scrape_status: string) => ({ platform: 'instagram', scrape_status });

  it('counts an Instagram account that still scrapes, even after a failed run', () => {
    expect(igLive([ig('ok')])).toBe(true);
    expect(igLive([{ platform: 'tiktok', scrape_status: 'ok' }, ig('failed')])).toBe(
      true,
    );
  });

  it('does not count a missing, gone or private Instagram account', () => {
    expect(igLive([])).toBe(false);
    expect(igLive([{ platform: 'tiktok', scrape_status: 'ok' }])).toBe(false);
    expect(igLive([ig('not_found')])).toBe(false);
    expect(igLive([ig('private')])).toBe(false);
  });
});
