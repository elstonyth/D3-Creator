import {
  boardOf,
  placeCard,
  placementChanges,
  restorePlacement,
} from './accounts';

describe('boardOf', () => {
  const roster = [
    { id: 'a', name: 'Amy', avatarUrl: null, platforms: ['tiktok'] },
    { id: 'b', name: 'Bob', avatarUrl: null, platforms: ['instagram'] },
    { id: 'c', name: 'Cat', avatarUrl: null, platforms: ['douyin'] },
  ];
  const row = (
    creator_id: string,
    handler_id: string | null,
    editor_id: string | null,
    sort_order: number,
  ) => ({
    creator_id,
    handler_id,
    editor_id,
    scheduled_posting: creator_id === 'b',
    sort_order,
  });

  it('joins assignments and the month output onto every account', () => {
    const cards = boardOf(
      roster,
      [row('a', 'k', 'e', 1), row('b', 'k', null, 0)],
      [{ creator_id: 'a', videos: 3, posts: 5, views: '1200' }],
      new Set(['k', 'e']),
    );
    expect(cards.map((c) => c.id)).toEqual(['b', 'c', 'a']);
    expect(cards[2]).toMatchObject({
      name: 'Amy',
      handlerId: 'k',
      editorId: 'e',
      scheduledPosting: false,
      videos: 3,
      posts: 5,
      views: 1200,
    });
    // Never assigned, nothing posted: unassigned and zero.
    expect(cards[1]).toMatchObject({
      handlerId: null,
      editorId: null,
      scheduledPosting: false,
      videos: 0,
      views: 0,
    });
    expect(cards[0].scheduledPosting).toBe(true);
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

describe('card placement', () => {
  const c = (id: string, handlerId: string | null) => ({ id, handlerId });
  // Board order: column k = a, c, d; column z = b.
  const L = [c('a', 'k'), c('b', 'z'), c('c', 'k'), c('d', 'k')];
  const ids = (l: { id: string }[]) => l.map((x) => x.id).join('');

  it('drops before a card and takes its column', () => {
    const r = placeCard(L, 'b', 'k', 'c');
    expect(ids(r)).toBe('abcd');
    expect(r[1].handlerId).toBe('k');
    expect(L[1].handlerId).toBe('z'); // not mutated
  });

  it('reorders inside a column', () => {
    expect(ids(placeCard(L, 'd', 'k', 'a'))).toBe('dabc');
  });

  it('goes last when there is nothing to drop before', () => {
    expect(ids(placeCard(L, 'a', 'k', null))).toBe('bcda');
    expect(ids(placeCard(L, 'a', 'k', 'gone'))).toBe('bcda');
    expect(placeCard(L, 'b', null, null)[3]).toEqual({
      id: 'b',
      handlerId: null,
    });
  });

  it('returns the same list when nothing moves', () => {
    expect(placeCard(L, 'c', 'k', 'd')).toBe(L);
    expect(placeCard(L, 'c', 'k', 'c')).toBe(L);
    expect(placeCard(L, 'd', 'k', null)).toBe(L);
    expect(placeCard(L, 'x', 'k', null)).toBe(L);
  });
});

describe('placement saves', () => {
  const c = (id: string, handlerId: string | null, extra = '') => ({
    id,
    handlerId,
    extra,
  });
  const cols = new Set(['k', 'z']);

  it('saves a column whose order changed, with nothing moved in', () => {
    const base = [c('a', 'k'), c('b', 'z'), c('c', 'k')];
    const now = [c('c', 'k'), c('b', 'z'), c('a', 'k')];
    expect(placementChanges(base, now, cols)).toEqual([
      { handlerId: 'k', ids: ['c', 'a'], moved: [] },
    ]);
  });

  it('saves the column a card arrived in, not the one it left', () => {
    const base = [c('a', 'k'), c('b', 'z'), c('c', 'k')];
    const now = [c('a', 'k'), c('b', 'k'), c('c', 'k')];
    expect(placementChanges(base, now, cols)).toEqual([
      { handlerId: 'k', ids: ['a', 'b', 'c'], moved: ['b'] },
    ]);
  });

  it('has nothing to save when only other fields changed', () => {
    const base = [c('a', 'k'), c('b', null)];
    const now = [c('a', 'k', 'edited'), c('b', null)];
    expect(placementChanges(base, now, cols)).toEqual([]);
  });

  it('treats a handler that is not a column as unassigned', () => {
    const base = [c('a', 'gone'), c('b', null)];
    const now = [c('a', null), c('b', null)];
    expect(placementChanges(base, now, cols)).toEqual([
      { handlerId: null, ids: ['a', 'b'], moved: ['a'] },
    ]);
    // Displayed in the same place already: only the stored handler differs.
    expect(placementChanges(base, base, cols)).toEqual([]);
  });

  it('puts back order and handlers, keeping every other edit', () => {
    const base = [c('a', 'k'), c('b', 'z'), c('c', 'k')];
    const current = [c('c', 'z', 'edited'), c('b', 'z'), c('a', 'k')];
    expect(restorePlacement(current, base)).toEqual([
      c('a', 'k'),
      c('b', 'z'),
      c('c', 'k', 'edited'),
    ]);
  });
});
