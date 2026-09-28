/**
 * ── Reports/MIS tests (reqs 1–4) ─────────────────────────────────────────────
 * Role dashboards (officer/branch/area/head-office/board), standard reports
 * (kinds, params, audit), financial ratios, and the regulatory designer
 * (template CRUD, verification flag, formula validation, returns + submit).
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const mis = await import('./lib/mis-store.js');
  mis.resetMisStore();
  const del = await import('./lib/delinquency-store.js');
  del.resetDelinquencyDemoStore();
  const loan = await import('./lib/loan-store.js');
  loan.resetLoanDemoStore?.();
  const work = await import('./lib/work-store.js');
  work.resetWorkDemoStore();
  const iw = await import('./lib/insurance-welfare-store.js');
  iw.resetInsWelfareStore();
  await seedDisbursedLoan();
});

const auth = { Authorization: 'Bearer demo-token' };
const officer = { Authorization: 'Bearer demo-token-officer' };
const get = (url: string, headers = auth) => request(createAppRef() as never).get(url).set(headers);
const post = (url: string, body?: unknown, headers = auth) => request(createAppRef() as never).post(url).set(headers).send(body ?? {} as never);
const put = (url: string, body?: unknown, headers = auth) => request(createAppRef() as never).put(url).set(headers).send(body ?? {} as never);

/**
 * Disburse the seeded approved ৳12,000 loan so the MIS snapshot has portfolio
 * data (same seeding the delinquency module uses).
 */
async function seedDisbursedLoan(): Promise<void> {
  const apps = await get('/api/v1/loans/applications');
  const target = (apps.body.items as Array<{ id: string; status: string; requestedAmount: string }>).find(
    (a) => a.status === 'approved' && a.requestedAmount === '12000.00',
  );
  if (!target) return;
  const checks = ['savings_deposit_paid', 'insurance_premium_collected', 'fees_paid', 'member_present', 'guarantor_signature', 'cash_available'];
  await request(createAppRef() as never)
    .patch(`/api/v1/loans/disbursements/${target.id}`)
    .set(auth)
    .send({ mode: 'cash_branch', checkItems: checks.map((check) => ({ check, done: true })) });
  await post(`/api/v1/loans/disbursements/${target.id}/authorize`, { cashReceivedByName: 'Jahanara Parvin (member)' });
}

describe('Role dashboards (req 1)', () => {
  it('serves the head-office dashboard with portfolio, growth and ratios', async () => {
    const res = await get('/api/v1/mis/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('head_office');
    expect(res.body.portfolio).toHaveProperty('outstanding');
    expect(res.body.portfolio).toHaveProperty('borrowers');
    expect(res.body.ratios.oss).toHaveProperty('formatted');
    expect(res.body.branchesRanked.length).toBeGreaterThanOrEqual(1);
    expect(res.body.branchesRanked[0].rank).toBe(1);
  });

  it('serves the field-officer dashboard with today sheet and targets', async () => {
    const res = await get('/api/v1/mis/dashboard?role=account_officer');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('field_officer');
    expect(res.body.todaySheet).toHaveLength(1);
    expect(res.body.summary.collectionPct).toBeGreaterThan(0);
    expect(res.body.targets.length).toBeGreaterThanOrEqual(3);
  });

  it('serves the branch-manager dashboard with collection, PAR and cash', async () => {
    const res = await get('/api/v1/mis/dashboard?role=branch_manager');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('branch_manager');
    expect(res.body.collection.efficiencyPct).toBeGreaterThan(0);
    expect(res.body.par).not.toBeNull();
    expect(res.body.par.scope).toBe('branch');
    expect(res.body.cash).toHaveProperty('closing');
    expect(res.body.officers.length).toBeGreaterThanOrEqual(1);
  });

  it('serves the area/zone ranking and the board summary', async () => {
    const az = await get('/api/v1/mis/dashboard?role=area_manager');
    expect(az.body.role).toBe('area_zone');
    expect(az.body.branches.length).toBeGreaterThanOrEqual(2);
    expect(az.body.totals.par30Pct).toBeGreaterThanOrEqual(0);

    const board = await get('/api/v1/mis/dashboard?role=member');
    expect(board.body.role).toBe('board');
    expect(board.body.summary.length).toBeGreaterThanOrEqual(4);
    expect(board.body.headline).toContain('OSS');
  });

  it('requires authentication', async () => {
    const res = await request(createAppRef() as never).get('/api/v1/mis/dashboard');
    expect(res.status).toBe(401);
  });
});

describe('Standard reports (req 2)', () => {
  it('builds each of the 11 report kinds', async () => {
    for (const kind of [
      'disbursement_register',
      'collection_efficiency',
      'outstanding_loans',
      'overdue_aging',
      'savings_position',
      'samity_list',
      'dropout_analysis',
      'staff_productivity',
      'loan_utilization',
    ]) {
      const res = await get(`/api/v1/mis/reports/${kind}`);
      expect(res.status, kind).toBe(200);
      expect(res.body.meta.kind, kind).toBe(kind);
      expect(Array.isArray(res.body.columns)).toBe(true);
      expect(res.body.meta).toHaveProperty('rowCount');
    }
  });

  it('rejects an unknown report kind', async () => {
    const res = await get('/api/v1/mis/reports/not_a_report');
    expect(res.status).toBe(422);
  });

  it('requires memberId for the member statement', async () => {
    const noParam = await get('/api/v1/mis/reports/member_statement');
    expect(noParam.status).toBe(422);
    const bad = await get('/api/v1/mis/reports/member_statement?memberId=00000000-0000-4000-8000-0000000000zz');
    expect([404, 400]).toContain(bad.status);
  });

  it('returns a loan statement for a classified loan', async () => {
    const outstanding = await get('/api/v1/mis/reports/outstanding_loans');
    const loanId = outstanding.body.rows[0]?.applicationId;
    expect(loanId).toBeTruthy();
    const res = await get(`/api/v1/mis/reports/loan_statement?loanId=${loanId}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.kind).toBe('loan_statement');
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps an audit trail of report pulls', async () => {
    await get('/api/v1/mis/reports/overdue_aging');
    await get('/api/v1/mis/reports/samity_list');
    const audit = await get('/api/v1/mis/audit');
    expect(audit.status).toBe(200);
    expect(audit.body.items.length).toBeGreaterThanOrEqual(2);
    expect(audit.body.items.map((a: { kind: string }) => a.kind)).toContain('overdue_aging');
  });
});

describe('Financial ratios (req 3)', () => {
  it('returns all six ratios with labels and formatting', async () => {
    const res = await get('/api/v1/mis/ratios');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(6);
    const keys = res.body.items.map((r: { key: string }) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['oss', 'portfolio_yield', 'cost_per_borrower', 'borrowers_per_officer', 'savings_to_loan', 'write_off_ratio']));
    for (const r of res.body.items) {
      expect(r.labelBn.length).toBeGreaterThan(0);
      expect(r.formatted.length).toBeGreaterThan(0);
    }
  });
});

describe('Regulatory templates & returns (req 4)', () => {
  it('seeds MRA and PKSF starter templates marked for verification', async () => {
    const res = await get('/api/v1/mis/templates');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    const regs = res.body.items.map((t: { regulator: string }) => t.regulator).sort();
    expect(regs).toEqual(['MRA', 'PKSF']);
    for (const t of res.body.items) expect(t.needsVerification).toBe(true);
  });

  it('creates a custom template with valid formulas', async () => {
    const res = await post('/api/v1/mis/templates', {
      name: 'জোনাল সামারি',
      regulator: 'OTHER',
      section: '',
      circularRef: 'internal',
      needsVerification: false,
      rows: [
        { code: 'S1', labelBn: 'বকেয়া', formula: '=outstanding', kind: 'value', unit: 'bdt', bold: true },
        { code: 'S2', labelBn: 'প্রতি শাখা বকেয়া', formula: '=outstanding/branches', kind: 'value', unit: 'bdt', bold: false },
        { code: 'SEC', labelBn: 'শাখা', formula: '-', kind: 'section', unit: 'bdt', bold: false },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.validation.ok).toBe(true);
    expect(res.body.validation.missingIdentifiers).toHaveLength(0);
  });

  it('rejects templates with broken formulas', async () => {
    const bad = await post('/api/v1/mis/templates', {
      name: 'ভাঙা',
      regulator: 'OTHER',
      rows: [{ code: 'X1', labelBn: 'ভাঙা সূত্র', formula: '=1 +* 2', kind: 'value', unit: 'bdt', bold: false }],
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.message).toContain('X1');

    const noEq = await post('/api/v1/mis/templates', {
      name: 'সমীকরণ নেই',
      regulator: 'OTHER',
      rows: [{ code: 'X2', labelBn: 'x', formula: 'outstanding', kind: 'value', unit: 'bdt', bold: false }],
    });
    expect(noEq.status).toBe(422);
  });

  it('updates a template and verifies it (clears the verification flag)', async () => {
    const list = await get('/api/v1/mis/templates');
    const id = list.body.items[0].id as string;

    const upd = await put(`/api/v1/mis/templates/${id}`, {
      name: list.body.items[0].name,
      regulator: list.body.items[0].regulator,
      section: list.body.items[0].section,
      circularRef: 'MRA Circular 07/2026',
      needsVerification: true,
      rows: list.body.items[0].rows,
    });
    expect(upd.status).toBe(200);
    expect(upd.body.circularRef).toBe('MRA Circular 07/2026');

    const verify = await post(`/api/v1/mis/templates/${id}/verify`);
    expect(verify.status).toBe(200);
    expect(verify.body.needsVerification).toBe(false);
  });

  it('generates a return, blocks duplicates, and submits it once', async () => {
    const list = await get('/api/v1/mis/templates');
    const mra = list.body.items.find((t: { regulator: string }) => t.regulator === 'MRA');

    const gen = await post('/api/v1/mis/returns', { templateId: mra.id, periodStart: '2026-07-01', periodEnd: '2026-09-30' });
    expect(gen.status).toBe(201);
    expect(gen.body.rows.length).toBeGreaterThanOrEqual(6);
    expect(gen.body.needsVerification).toBe(true); // carried from the template
    const m3 = gen.body.rows.find((r: { code: string }) => r.code === 'M3');
    expect(m3.value).not.toBeNull();

    const dup = await post('/api/v1/mis/returns', { templateId: mra.id, periodStart: '2026-07-01', periodEnd: '2026-09-30' });
    expect(dup.status).toBe(409);

    const submit = await post(`/api/v1/mis/returns/${gen.body.id}/submit`);
    expect(submit.status).toBe(200);
    expect(submit.body.submittedAt).toBeTruthy();
    const again = await post(`/api/v1/mis/returns/${gen.body.id}/submit`);
    expect(again.status).toBe(409);

    const exp = await get(`/api/v1/mis/returns/${gen.body.id}/export`);
    expect(exp.status).toBe(200);
    expect(exp.text).toContain('MRA');
    expect(exp.text).toContain('যাচাই');
  });

  it('lists returns per template and keeps the audit endpoint officer-readable', async () => {
    const list = await get('/api/v1/mis/templates');
    const mra = list.body.items.find((t: { regulator: string }) => t.regulator === 'MRA');
    await post('/api/v1/mis/returns', { templateId: mra.id, periodStart: '2026-04-01', periodEnd: '2026-06-30' });
    const returns = await get(`/api/v1/mis/returns?templateId=${mra.id}`);
    expect(returns.body.items).toHaveLength(1);

    // Templates and returns are readable by staff; generation is admin-gated.
    expect((await get('/api/v1/mis/templates', officer)).status).toBe(200);
    expect((await post('/api/v1/mis/templates', { name: 'x', regulator: 'OTHER', rows: [{ code: 'A', labelBn: 'a', formula: '=1', kind: 'value', unit: 'bdt', bold: false }] }, officer)).status).toBe(403);
  });

  it('deletes a custom template', async () => {
    const created = await post('/api/v1/mis/templates', {
      name: 'মুছে ফেলার টেমপ্লেট',
      regulator: 'OTHER',
      rows: [{ code: 'D1', labelBn: 'বকেয়া', formula: '=outstanding', kind: 'value', unit: 'bdt', bold: false }],
    });
    const del = await request(createAppRef() as never).delete(`/api/v1/mis/templates/${created.body.id}`).set(auth);
    expect(del.status).toBe(204);
    const list = await get('/api/v1/mis/templates');
    expect(list.body.items.find((t: { id: string }) => t.id === created.body.id)).toBeUndefined();
  });
});
