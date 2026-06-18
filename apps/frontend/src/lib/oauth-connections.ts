// apps/frontend/src/lib/oauth-connections.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export interface MyConnection {
  id: string;
  platform: 'instagram' | 'facebook' | 'tiktok';
  accountName: string | null;
  status: 'active' | 'revoked' | 'expired';
  accessExpiresAt: string | null;
}

export async function getMyConnections(
  client: SupabaseClient,
): Promise<MyConnection[]> {
  const { data, error } = await client.rpc('get_my_oauth_connections');
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    platform: r.platform as MyConnection['platform'],
    accountName: (r.account_name as string | null) ?? null,
    status: r.status as MyConnection['status'],
    accessExpiresAt: (r.access_expires_at as string | null) ?? null,
  }));
}

export interface AdminConnection {
  creatorId: string;
  displayName: string | null;
  platform: string;
  accountName: string | null;
  status: string;
  accessExpiresAt: string | null;
}

export async function getAdminConnections(
  client: SupabaseClient,
  creatorId: string,
): Promise<AdminConnection[]> {
  const { data, error } = await client.rpc('get_admin_oauth_connections', {
    p_creator_id: creatorId,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    creatorId: r.creator_id as string,
    displayName: (r.display_name as string | null) ?? null,
    platform: r.platform as string,
    accountName: (r.account_name as string | null) ?? null,
    status: r.status as string,
    accessExpiresAt: (r.access_expires_at as string | null) ?? null,
  }));
}
