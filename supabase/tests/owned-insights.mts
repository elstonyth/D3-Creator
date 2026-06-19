// supabase/tests/owned-insights.mts  — run: npx tsx supabase/tests/owned-insights.mts
import 'dotenv/config';
import {
  getSupabaseAdmin,
  upsertProfileInsight,
  replaceAudienceDemographics,
  upsertPostInsight,
} from '../../libraries/database/src/index';

const db = getSupabaseAdmin();
const today = new Date().toISOString().slice(0, 10);
let pass = 0,
  fail = 0;
const check = (n: string, c: boolean) =>
  c ? (pass++, console.log(`ok  ${n}`)) : (fail++, console.error(`FAIL ${n}`));
let creatorId = '',
  profileId = '';
try {
  const { data: creator } = await db
    .from('creator')
    .insert({ display_name: 'Insights Test' })
    .select('id')
    .single();
  if (!creator) throw new Error('creator insert');
  creatorId = creator.id;
  const { data: profile } = await db
    .from('profile')
    .insert({
      creator_id: creatorId,
      platform: 'instagram',
      profile_url: `https://www.instagram.com/ins_test_${Date.now()}`,
      handle: 'ins_test',
    })
    .select('id')
    .single();
  if (!profile) throw new Error('profile insert');
  profileId = profile.id;

  const pi = await upsertProfileInsight({
    profile_id: profileId,
    captured_date: today,
    platform: 'instagram',
    reach: 800,
    views: 1500,
    accounts_engaged: 90,
    total_interactions: 240,
    page_engagements: null,
    follower_delta: 7,
    follower_total: 5000,
    raw: { x: 1 },
  });
  check('profile insight upsert', pi.ok === true);

  const dem = await replaceAudienceDemographics(profileId, today, [
    { dimension: 'country', bucket: 'MY', value: 300 },
    { dimension: 'country', bucket: 'SG', value: 120 },
  ]);
  check('demographics replace', dem.ok === true && dem.value === 2);
  // idempotent replace
  const dem2 = await replaceAudienceDemographics(profileId, today, [
    { dimension: 'country', bucket: 'MY', value: 350 },
  ]);
  const { count } = await db
    .from('owned_audience_demographic')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId);
  check('demographics replaced not appended', dem2.ok === true && count === 1);

  const po = await upsertPostInsight({
    profile_id: profileId,
    external_post_id: 'M1',
    captured_date: today,
    views: 999,
    reach: 600,
    saves: 22,
    interactions: 80,
    raw: {},
  });
  check('post insight upsert', po.ok === true);

  const { data: read } = await db
    .from('owned_profile_insight')
    .select('views')
    .eq('profile_id', profileId)
    .single();
  check('readback views', read?.views === 1500);

  // TikTok account row uses the same table (platform check now allows it).
  const tt = await upsertProfileInsight({
    profile_id: profileId,
    captured_date: today,
    platform: 'tiktok',
    reach: null,
    views: 4321,
    accounts_engaged: null,
    total_interactions: 990000,
    page_engagements: null,
    follower_delta: null,
    follower_total: 41230,
    raw: { demo: true },
  });
  check('tiktok profile insight upsert', tt.ok === true);
  const { data: ttRead } = await db
    .from('owned_profile_insight')
    .select('platform, follower_total')
    .eq('profile_id', profileId)
    .eq('platform', 'tiktok')
    .maybeSingle();
  check(
    'tiktok row stored',
    ttRead?.platform === 'tiktok' && ttRead?.follower_total === 41230,
  );
} finally {
  if (profileId) {
    await db.from('owned_post_insight').delete().eq('profile_id', profileId);
    await db
      .from('owned_audience_demographic')
      .delete()
      .eq('profile_id', profileId);
    await db.from('owned_profile_insight').delete().eq('profile_id', profileId);
  }
  if (creatorId) {
    await db.from('profile').delete().eq('creator_id', creatorId);
    await db.from('creator').delete().eq('id', creatorId);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
