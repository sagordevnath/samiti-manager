// probe-requirements.mjs — live end-to-end check of the 7 reported issues.
//
//   node scripts/probe-requirements.mjs
//
// Requires the API to be running (default http://localhost:4000) and a seeded
// demo login user (admin@samity.test / Samity@2026). Several steps create real
// rows and soft-delete them again, so the DB is left as it was found.
const BASE = process.env.PROBE_BASE ?? 'http://localhost:4000';
const EMAIL = process.env.PROBE_EMAIL ?? 'admin@samity.test';
const PASS = process.env.PROBE_PASS ?? 'Samity@2026';

let pass = 0;
let fail = 0;
const ok = (label, extra = '') => {
  pass += 1;
  console.log(`  \u2713 ${label}${extra ? ` — ${extra}` : ''}`);
};
const bad = (label, why) => {
  fail += 1;
  console.log(`  \u2717 ${label} — ${why}`);
};

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Browser-originated mutations must carry this header (CSRF guard).
      'X-Requested-With': 'XMLHttpRequest',
      Origin: BASE,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`\nprobe ${BASE}\n`);

// ── auth ────────────────────────────────────────────────────────────────────
const login = await call('/api/v1/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
if (login.status !== 200 || !login.json?.accessToken) {
  console.log(`login failed (${login.status}): ${login.text.slice(0, 200)}`);
  process.exit(1);
}
const token = login.json.accessToken;
ok('login', `role=${login.json.user?.role} org=${login.json.user?.orgId ?? 'null'}`);

const me = await call('/api/v1/auth/me', { token });
if (me.status !== 200) bad('GET /auth/me', me.status);
else {
  // The token carries `app_permissions: []`; the role defaults must still land.
  const perms = me.json?.user?.permissions ?? [];
  perms.length > 0
    ? ok('GET /auth/me exposes role permissions', `role=${me.json.user.role} perms=${perms.length}`)
    : bad('GET /auth/me permissions', 'empty for super_admin');
}

// The server-side nav endpoint filters groups by auth.permissions, so an empty
// permission set would silently render an empty sidebar.
const nav = await call('/api/v1/nav', { token });
const navGroups = nav.json?.groups ?? [];
navGroups.length > 0
  ? ok('GET /nav returns sidebar groups', `groups=${navGroups.length} items=${navGroups.reduce((n, g) => n + (g.items?.length ?? 0), 0)}`)
  : bad('GET /nav groups', `empty (${nav.status})`);

// ── 2. dashboard cards → real endpoints ─────────────────────────────────────
console.log('\n[2] dashboard summary + card targets');
const summary = await call('/api/v1/dashboard/summary', { token });
if (summary.status === 200) ok('GET /dashboard/summary', `keys=${Object.keys(summary.json ?? {}).join(',')}`);
else bad('GET /dashboard/summary', summary.status);

for (const [label, path] of [
  ['members', '/api/v1/members?page=1&pageSize=1'],
  ['samities', '/api/v1/samities'],
  ['loans', '/api/v1/loans/applications?page=1&pageSize=1'],
  ['org tree', '/api/v1/org/tree'],
]) {
  const r = await call(path, { token });
  r.status === 200 ? ok(`card target ${label}`) : bad(`card target ${label}`, r.status);
}

// ── 3. member admission → review status → approve ───────────────────────────
console.log('\n[3] admission lands in DB as review (lifecycle=pending)');
const branches = await call('/api/v1/org/branches', { token });
const branchId = branches.json?.items?.[0]?.id ?? branches.json?.[0]?.id;
if (!branchId) {
  bad('resolve branch', `no branch rows (${branches.status})`);
} else {
  const stamp = Date.now();
  const draft = {
    fullName: `Probe Member ${stamp}`,
    fullNameBn: 'প্রোব সদস্য',
    fatherOrHusbandName: 'Probe Father',
    motherName: 'Probe Mother',
    idType: 'nid',
    idNumber: String(stamp).slice(-10),
    dob: '1990-05-10',
    mobile: `018${String(stamp).slice(-8)}`,
    address: 'Probe address, Dhaka',
    occupation: 'Tailor',
    monthlyHouseholdIncome: '12000.00',
    landOwnedDecimals: 0,
    familyMembers: 4,
    // nomineesSchema requires 1–4 nominees whose shares total 100%.
    nominees: [{ name: 'Probe Nominee', relation: 'husband', sharePct: 100 }],
  };
  const created = await call('/api/v1/members/admissions', { method: 'POST', token, body: { branchId, draft } });
  const memberId = created.json?.id ?? created.json?.admission?.id ?? null;
  if (created.status !== 201 && created.status !== 200) {
    bad('POST /members/admissions', `${created.status} ${created.text.slice(0, 180)}`);
  } else {
    ok('POST /members/admissions', `admission=${memberId ?? '(no id)'}`);
    await sleep(400);
    const pending = await call('/api/v1/members?page=1&pageSize=50&status=pending', { token });
    const row = (pending.json?.items ?? []).find((m) => m.full_name === draft.fullName);
    if (row) ok('new member listed under status=pending', `lifecycle=${row.lifecycle} status=${row.status}`);
    else bad('new member listed under status=pending', `not found (total=${pending.json?.total})`);

    const active = await call('/api/v1/members?page=1&pageSize=50&status=active', { token });
    (active.json?.items ?? []).some((m) => m.full_name === draft.fullName)
      ? bad('pending member leaks into status=active', 'found in active list')
      : ok('pending member excluded from status=active');

    if (row) {
      const approved = await call(`/api/v1/members/${row.id}/status`, {
        method: 'POST',
        token,
        // The UI's approve action posts the same pairing (STATUS_REASON_CODES).
        body: { status: 'active', reasonCode: 'new_admission', effectiveDate: new Date().toISOString().slice(0, 10) },
      });
      approved.status === 200 ? ok('POST /members/:id/status review→active') : bad('review→active', `${approved.status} ${approved.text.slice(0, 160)}`);
      // clean up: soft delete the probe member
      const del = await call(`/api/v1/members/${row.id}`, { method: 'DELETE', token });
      del.status === 204 ? ok('cleanup: probe member soft-deleted') : bad('cleanup member', del.status);
    }
  }
}

// ── 4. samity create → appears in list ──────────────────────────────────────
console.log('\n[4] new samity persists and lists');
if (branchId) {
  const code = `PRB-${String(Date.now()).slice(-6)}`;
  const createdSamity = await call('/api/v1/samities', {
    method: 'POST',
    token,
    body: {
      branchId,
      code,
      name: `Probe Samity ${code}`,
      village: 'Probe Village',
      meetingDay: 'friday',
      meetingTime: '17:30',
      meetingPlace: 'Probe School',
      status: 'forming',
    },
  });
  const samityId = createdSamity.json?.samity?.id ?? createdSamity.json?.id ?? null;
  if (createdSamity.status !== 201) bad('POST /samities', `${createdSamity.status} ${createdSamity.text.slice(0, 200)}`);
  else {
    ok('POST /samities', `code=${code}`);
    const list = await call('/api/v1/samities', { token });
    const row = (list.json?.items ?? []).find((s) => s.code === code);
    if (row) ok('new samity appears in GET /samities', `id=${row.id} branch=${row.branches?.code ?? 'n/a'}`);
    else bad('new samity in list', 'not found');
    // duplicate code must be a friendly 409, not a raw 500
    const dup = await call('/api/v1/samities', {
      method: 'POST',
      token,
      // Valid apart from the duplicate code, so the 409 must come from the
      // unique-index path rather than schema validation.
      body: { branchId, code, name: 'Duplicate Samity', village: 'Probe Village', meetingDay: 'friday', meetingTime: '10:00', meetingPlace: 'Probe School' },
    });
    dup.status === 409 ? ok('duplicate samity code → 409', dup.json?.error?.message?.slice(0, 60) ?? '') : bad('duplicate samity code', `expected 409, got ${dup.status}`);
    if (samityId) {
      const del = await call(`/api/v1/samities/${samityId}`, { method: 'DELETE', token });
      del.status === 204 ? ok('cleanup: probe samity soft-deleted') : bad('cleanup samity', del.status);
    }
  }
}

// ── 5. loans page data ──────────────────────────────────────────────────────
console.log('\n[5] loans list + detail/steps/timeline');
const apps = await call('/api/v1/loans/applications?page=1&pageSize=10', { token });
if (apps.status !== 200) bad('GET /loans/applications', `${apps.status} ${apps.text.slice(0, 180)}`);
else {
  const items = apps.json?.items ?? apps.json?.applications ?? [];
  ok('GET /loans/applications', `total=${apps.json?.total ?? items.length} items=${items.length}`);
  const first = items[0];
  if (!first) bad('applications list empty', 'no rows to inspect detail');
  else {
    const keys = Object.keys(first);
    const camel = keys.filter((k) => /[a-z][A-Z]/.test(k));
    camel.length ? ok('list is camelCase', camel.slice(0, 6).join(',')) : bad('list is camelCase', `keys=${keys.slice(0, 10).join(',')}`);
    for (const k of ['applicationNumber', 'memberName', 'productName', 'requestedAmount', 'status']) {
      keys.includes(k) ? ok(`list row has ${k}`) : bad(`list row has ${k}`, `keys=${keys.join(',')}`);
    }
    const id = first.id;
    // Only the endpoints the Loans UI actually calls: detail, schedule, timeline
    // (`/steps` is POST-only API surface, not a GET).
    for (const suffix of ['', '/schedule', '/timeline']) {
      const r = await call(`/api/v1/loans/applications/${id}${suffix}`, { token });
      r.status === 200 ? ok(`GET /loans/applications/:id${suffix}`) : bad(`GET /loans/applications/:id${suffix}`, `${r.status} ${r.text.slice(0, 160)}`);
    }
    const detail = await call(`/api/v1/loans/applications/${id}`, { token });
    const d = detail.json?.application ?? detail.json;
    d?.member?.fullName || d?.memberName ? ok('detail embeds member') : bad('detail embeds member', `keys=${Object.keys(d ?? {}).slice(0, 12).join(',')}`);
    d?.product?.name || d?.productName ? ok('detail embeds product') : bad('detail embeds product', `keys=${Object.keys(d ?? {}).slice(0, 12).join(',')}`);
  }
  const pipeline = await call('/api/v1/loans/pipeline', { token });
  pipeline.status === 200 ? ok('GET /loans/pipeline') : bad('GET /loans/pipeline', `${pipeline.status} ${pipeline.text.slice(0, 140)}`);
}

// ── 6. NGO-MFI org structure ────────────────────────────────────────────────
console.log('\n[6] NGO-MFI hierarchy');
const tree = await call('/api/v1/org/tree', { token });
if (tree.status !== 200) bad('GET /org/tree', `${tree.status} ${tree.text.slice(0, 200)}`);
else {
  const t = tree.json?.tree ?? tree.json ?? {};
  ok('GET /org/tree', `root=${t.kind} children=${(t.children ?? []).length}`);
  const kinds = [];
  const walk = (n) => {
    kinds.push(n.kind);
    (n.children ?? []).forEach(walk);
  };
  walk(t);
  const unique = [...new Set(kinds)];
  console.log(`  · levels present: ${unique.join(' → ') || '(none)'}`);
  // NGO-MFI management hierarchy: Organization → Zone → Area → Branch → Samity → Group
  ['organization', 'zone', 'area', 'branch', 'samity', 'group'].every((k) => unique.includes(k))
    ? ok('all NGO-MFI levels present (org → zone → area → branch → samity → group)')
    : bad('NGO-MFI levels', `only ${unique.join(',')}`);
  // Ordering check on the first path down the tree.
  const path = [];
  let node = t;
  while (node) {
    path.push(node.kind);
    node = (node.children ?? [])[0];
  }
  const expected = ['organization', 'zone', 'area', 'branch', 'samity', 'group'];
  path.join('>') === expected.join('>')
    ? ok('hierarchy order is correct', path.join(' → '))
    : bad('hierarchy order', path.join(' → '));
}
const mapPoints = await call('/api/v1/org/map-points', { token });
mapPoints.status === 200 ? ok('GET /org/map-points') : bad('GET /org/map-points', mapPoints.status);

// ── summary ─────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — pass=${pass} fail=${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
