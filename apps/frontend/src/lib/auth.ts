/**
 * Server-side auth helpers used by Server Components and route guards.
 * Reads the session from the cookie-aware client and joins with user_role
 * and creator_link so callers get a single AuthContext object.
 *
 * Memoised per request via React's `cache()` — many Server Components in a
 * single render tree call this (the public layout, the (creator) layout,
 * the page itself, etc.). Without `cache()` each call would re-issue the
 * getUser + user_role + creator_link round trips. With it, the first call
 * does the work and the rest of the tree gets the same result for free.
 */

import { cache } from 'react';
import { getSupabaseRoute } from './supabase-route';

export type UserRole = 'admin' | 'creator' | 'member' | 'none';

export interface CreatorLink {
  user_id: string;
  creator_id: string | null;
  dashboard_url: string | null;
  leaderboard_url: string | null;
  onboarding_completed: boolean;
}

export interface AuthContext {
  userId: string;
  email: string | null;
  role: UserRole;
  /**
   * Whether a `public.user_role` row actually exists. `role` below fails OPEN to
   * 'creator' when it does not, which is right for the showcase pages — but
   * `public.has_studio_access()` (20260819120000) fails CLOSED on the same
   * state, so the two disagree for exactly this user and the only symptom is a
   * generic 500 on their first save. `isStudioMember` reads this to match RLS.
   */
  hasRoleRow: boolean;
  creatorLink: CreatorLink | null;
}

export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const supabase = await getSupabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [roleRes, linkRes] = await Promise.all([
    supabase
      .from('user_role')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('creator_link')
      .select(
        'user_id, creator_id, dashboard_url, leaderboard_url, onboarding_completed',
      )
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  // A failed role lookup must NOT be silently read as "no role -> creator":
  // that would demote a real admin (and bounce them out of /admin) during a
  // transient DB error. Surface the error so the caller fails closed, the
  // same way the edge middleware (proxy.ts) does. Only a successful query
  // with no row falls through to the 'creator' default below.
  if (roleRes.error) throw roleRes.error;

  const role: UserRole = (roleRes.data?.role as UserRole) ?? 'creator';
  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    hasRoleRow: roleRes.data != null,
    creatorLink: (linkRes.data as CreatorLink | null) ?? null,
  };
});

/**
 * Admin guard for Server Actions / Route Handlers — throws "Not authorized."
 * unless the caller is a verified admin (role === 'admin'). Single source of
 * truth so no admin action can ship without the check (AC-ADMIN-5).
 */
export async function requireAdmin(): Promise<void> {
  const auth = await getAuthContext();
  if (!auth || auth.role !== 'admin') {
    throw new Error('Not authorized.');
  }
}

/**
 * Studio membership. `getAuthContext()` returns a non-null AuthContext for
 * EVERY signed-in user including role 'none' (revoked), so `!!auth` is not the
 * test. This is the same rule /classes uses for member copy
 * (app/(public)/classes/page.tsx:29) and the same role set the class_video RLS
 * policy admits (supabase/migrations/20260629000002_class_video_none_excluded.sql:
 * role in ('member','creator','admin')).
 */
export function isStudioMember(auth: AuthContext | null): boolean {
  // `hasRoleRow` mirrors public.has_studio_access()'s `exists (select 1 from
  // public.user_role ...)`. Without it a user whose role row is missing passes
  // here on the 'creator' fail-open default, is shown the Studio, and then has
  // every write refused by RLS as an undiagnosable 500.
  return auth !== null && auth.hasRoleRow && auth.role !== 'none';
}
