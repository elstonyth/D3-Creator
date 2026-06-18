// supabase/tests/oauth-connection.mts
// Run: cd <repo-root> && npx tsx supabase/tests/oauth-connection.mts
// Requires service-role env (.env). Creates a temp creator + user, exercises
// attach-or-create + upsert + revoke, then cleans up.
import 'dotenv/config';
import {
  getSupabaseAdmin,
  attachOwnedProfile,
  upsertOAuthConnection,
  revokeOAuthConnection,
} from '../../libraries/database/src/index';

const db = getSupabaseAdmin();
let pass = 0,
  fail = 0;
function check(name: string, cond: boolean) {
  cond
    ? (pass++, console.log(`ok  ${name}`))
    : (fail++, console.error(`FAIL ${name}`));
}

const { data: creator } = await db
  .from('creator')
  .insert({ display_name: 'OAuth Test' })
  .select('id')
  .single();
const { data: userRow } = await db.auth.admin.createUser({
  email: `oauth-test-${Date.now()}@example.com`,
  email_confirm: true,
});
const userId = userRow!.user!.id;
const creatorId = creator!.id;

try {
  const attach = await attachOwnedProfile({
    user_id: userId,
    creator_id: creatorId,
    platform: 'tiktok',
    handle: 'oauthtestacct',
    external_account_id: 'open_test_1',
  });
  check('attach returns ok', attach.ok === true);
  const profileId = attach.ok ? attach.value.profile_id : '';

  const { data: claim } = await db
    .from('profile_claim')
    .select('claim_kind, claimed_via')
    .eq('user_id', userId)
    .eq('profile_id', profileId)
    .single();
  check(
    'owner claim via oauth',
    claim?.claim_kind === 'owner' && claim?.claimed_via === 'oauth',
  );

  const up = await upsertOAuthConnection({
    user_id: userId,
    profile_id: profileId,
    platform: 'tiktok',
    external_account_id: 'open_test_1',
    account_name: 'oauthtestacct',
    scopes: 'user.info.basic',
    access: { ct: 'a', iv: 'b', tag: 'c' },
    refresh: { ct: 'd', iv: 'e', tag: 'f' },
    access_expires_at: null,
    refresh_expires_at: null,
  });
  check('upsert returns ok', up.ok === true);
  const connId = up.ok ? up.value.id : '';

  const rev = await revokeOAuthConnection({
    user_id: userId,
    connection_id: connId,
  });
  check('revoke returns ok', rev.ok === true);
  const { data: after } = await db
    .from('oauth_connection')
    .select('status, access_ct')
    .eq('id', connId)
    .single();
  check(
    'revoked + token wiped',
    after?.status === 'revoked' && after?.access_ct === '',
  );
} finally {
  await db.from('oauth_connection').delete().eq('user_id', userId);
  await db.from('profile_claim').delete().eq('user_id', userId);
  await db.from('profile').delete().eq('creator_id', creatorId);
  await db.from('creator').delete().eq('id', creatorId);
  await db.auth.admin.deleteUser(userId);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
