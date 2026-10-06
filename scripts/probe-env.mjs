// probe-env.mjs — classify which Supabase key in the environment is invalid.
// Run:  node --env-file=.env scripts/probe-env.mjs
// Prints only verdicts and HTTP status codes — never the key values.
const url = process.env.SUPABASE_URL ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? '';
const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? '';

const mask = (k) => (k ? `${k.slice(0, 7)}…(${k.length} chars)` : 'MISSING');

if (!url || url.includes('placeholder')) {
  console.log('SUPABASE_URL: MISSING or placeholder — cannot probe.');
  process.exit(3);
}
console.log(`SUPABASE_URL: ${url}`);
console.log(`service key : ${mask(serviceKey)}`);
console.log(`anon key    : ${anonKey ? mask(anonKey) : 'MISSING (optional)'}`);
console.log(`jwt secret  : ${mask(jwtSecret)}`);

async function probe(label, key) {
  if (!key) {
    console.log(`${label}: skipped (not set)`);
    return;
  }
  try {
    const res = await fetch(`${url}/rest/v1/members?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    const text = await res.text();
    let detail = text.slice(0, 120);
    try {
      const j = JSON.parse(text);
      detail = j.message ?? j.error ?? detail;
    } catch { /* keep raw slice */ }
    console.log(`${label}: HTTP ${res.status} — ${detail}`);
  } catch (err) {
    console.log(`${label}: network error — ${err.message}`);
  }
}

await probe('service_role', serviceKey);
await probe('anon      ', anonKey);
