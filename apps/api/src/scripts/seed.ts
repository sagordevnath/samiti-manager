/**
 * Seed demo data: org, branches, users, one samity and members.
 * Usage: npm run db:seed -w @samity/api
 * Requires SUPABASE_DB and creates auth users via the service-role key.
 */
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const connectionString = process.env['SUPABASE_DB'];
  const supabaseUrl = process.env['SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!connectionString || !supabaseUrl || !serviceKey) {
    console.error('❌ SUPABASE_DB, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const orgId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const samityId = crypto.randomUUID();

  console.log('▶ seeding org, branch, samity…');
  await pool.query(
    `insert into organizations (id, name, name_bn, code) values ($1, 'Demo Development Organization', 'ডেমো উন্নয়ন সংস্থা', 'DDO')
     on conflict (code) do update set name = excluded.name`,
    [orgId],
  );
  await pool.query(
    `insert into branches (id, org_id, name, name_bn, code, district)
     values ($1, $2, 'Dhanmondi Branch', 'ধানমন্ডি শাখা', 'DHK-01', 'Dhaka')
     on conflict (code) do update set name = excluded.name`,
    [branchId, orgId],
  );
  await pool.query(
    `insert into samities (id, org_id, branch_id, name, meeting_day)
     values ($1, $2, $3, 'শুক্রবার সমিতি', 'friday') on conflict do nothing`,
    [samityId, orgId, branchId],
  );

  const seedUsers = [
    { email: 'admin@samity.test', password: 'Admin1234!', role: 'org_admin', fullName: 'Org Admin' },
    { email: 'manager@samity.test', password: 'Manager1234!', role: 'branch_manager', fullName: 'Branch Manager' },
    { email: 'officer@samity.test', password: 'Officer1234!', role: 'account_officer', fullName: 'Account Officer' },
  ];

  for (const u of seedUsers) {
    console.log(`▶ seeding auth user ${u.email} (${u.role})…`);
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      app_metadata: { role: u.role, org_id: orgId, branch_id: branchId },
    });
    if (error) {
      console.warn(`  ⚠ ${u.email}: ${error.message} (continuing)`);
      continue;
    }
    const userId = data.user!.id;
    await pool.query(
      `insert into users_profile (id, org_id, branch_id, role, full_name)
       values ($1, $2, $3, $4, $5) on conflict (id) do update set role = excluded.role`,
      [userId, orgId, branchId, u.role, u.fullName],
    );
  }

  console.log('▶ seeding members…');
  const members = [
    ['রহিমা বেগম', '01711111111'],
    ['আব্দুল করিম', '01822222222'],
    ['সালমা খাতুন', '01933333333'],
  ] as const;

  for (const [name, phone] of members) {
    await pool.query(
      `insert into members (org_id, branch_id, samity_id, full_name, phone, status, created_by)
       values ($1, $2, $3, $4, $5, 'active', null)`,
      [orgId, branchId, samityId, name, phone],
    );
  }

  await pool.end();
  console.log('✅ seed complete — login with admin@samity.test / Admin1234!');
}

main().catch((err) => {
  console.error('❌ seed failed:', err);
  process.exit(1);
});
