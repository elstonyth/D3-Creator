/**
 * Unit test for the post-snapshot de-duplication fix (bug hunt 2026-06-01).
 * getSupabaseAdmin is mocked, so this runs offline with no DB connection.
 */
jest.mock('./supabase-server', () => ({ getSupabaseAdmin: jest.fn() }));

import { getSupabaseAdmin } from './supabase-server';
import { upsertPostSnapshots, type PostSnapshotInput } from './snapshots';

const mockAdmin = getSupabaseAdmin as unknown as jest.Mock;

function post(id: string, views: number): PostSnapshotInput {
  return {
    external_post_id: id,
    posted_at: null,
    caption_excerpt: null,
    views,
    likes: null,
    comments: null,
    shares: null,
    media_url: null,
    content_type: 'short',
    raw: {},
  };
}

test('dedupes posts by external_post_id before the batch upsert', async () => {
  // Without dedup, two rows with the same external_post_id share one ON CONFLICT
  // target and Postgres aborts the entire statement (error 21000), losing every
  // post for the profile that day. Capture the rows actually sent to upsert.
  let captured: any[] = [];
  mockAdmin.mockReturnValue({
    from: () => ({
      upsert: (rows: any[]) => {
        captured = rows;
        return { select: () => ({ data: rows.map((_, i) => ({ id: i })), error: null }) };
      },
    }),
  });

  const res = await upsertPostSnapshots('profile-1', [post('X', 1), post('Y', 9), post('X', 2)]);

  // 3 inputs with a duplicate "X" -> only 2 distinct rows reach the upsert.
  expect(captured).toHaveLength(2);
  expect(captured.map((r) => r.external_post_id).sort()).toEqual(['X', 'Y']);
  // Last write wins (matches the writer's documented idempotent intent).
  expect(captured.find((r) => r.external_post_id === 'X').views).toBe(2);
  expect(res.written).toBe(2);
});
