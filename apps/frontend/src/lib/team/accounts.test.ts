import { boardOf } from './accounts';

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
  ) => ({ creator_id, handler_id, editor_id, sort_order });

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
      videos: 3,
      posts: 5,
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
