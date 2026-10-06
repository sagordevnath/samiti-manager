// probe-counts.mjs — count rows in key tables (verdicts only, no secrets).
// Run: node --env-file=.env scripts/probe-counts.mjs
const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!url || !serviceKey) {
  console.log('SUPABASE_URL or service key missing — cannot probe.');
  process.exit(3);
}

const TABLES = [
  'organizations',
  'branches',
  'zones',
  'areas',
  'samities',
  'members',
  'savings_products',
  'savings_accounts',
  'savings_transactions',
  'loan_products',
  'loan_applications',
  'loan_disbursements',
  'loan_repayment_schedule',
  'member_admissions',
];

for (const t of TABLES) {
  try {
    const res = await fetch(`${url}/rest/v1/${t}?select=*`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: 'count=exact',
        Range: '0-0',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.log(`${t}: HTTP ${res.status} — ${body.slice(0, 100)}`);
      continue;
    }
    const range = res.headers.get('content-range') ?? '*/0';
    const total = range.split('/')[1] ?? '0';
    console.log(`${t}: ${total} row(s)`);
  } catch (err) {
    console.log(`${t}: network error — ${err.message}`);
  }
}
