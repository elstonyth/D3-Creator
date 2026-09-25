/**
 * tracker_shoot rows <-> the app's Shoot. Kept out of shoot-actions.ts:
 * everything exported from a 'use server' file becomes a callable endpoint.
 */

import { isShootStatus, type Shoot } from './shoots';

export const SHOOT_COLS =
  'id, member_id, shoot_date, start_time, title, creator_id, videos_shot, status, note';

export interface ShootRow {
  id: string;
  member_id: string;
  shoot_date: string;
  start_time: string | null;
  title: string;
  creator_id: string | null;
  videos_shot: number | null;
  status: string;
  note: string | null;
}

/** Postgres `time` reads back as HH:MM:SS; the app works in HH:MM. */
export function rowToShoot(r: ShootRow): Shoot {
  return {
    id: r.id,
    memberId: r.member_id,
    date: r.shoot_date,
    time: r.start_time ? r.start_time.slice(0, 5) : null,
    title: r.title,
    creatorId: r.creator_id,
    videosShot: r.videos_shot,
    status: isShootStatus(r.status) ? r.status : 'planned',
    note: r.note,
  };
}
