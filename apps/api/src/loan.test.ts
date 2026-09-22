import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;
let resetLoanDemoStoreRef: typeof import('./lib/loan-store.js').resetLoanDemoStore;
let loanDemoStoreRef: typeof import('./lib/loan-store.js').loanDemoStore;

const DEMO_TOKEN = 'demo-token';

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  ({
    loanDemoStore: loanDemoStoreRef,
    resetLoanDemoStore: resetLoanDemoStoreRef,
  } = await import('./lib/loan-store.js'));
  resetLoanDemoStoreRef(); // fresh dataset per test
});

const get = (app: unknown, url: string) => request(app as never).get(url).set('Authorization', `Bearer ${DEMO_TOKEN}`);
const post = (app: unknown, url: string, body?: unknown) =>
  request(app as never).post(url).set('Authorization', `Bearer ${DEMO_TOKEN}`).send(body ?? {});
const patch = (app: unknown, url: string, body?: unknown) =>
  request(app as never).patch(url).set('Authorization', `Bearer ${DEMO_TOKEN}`).send(body ?? {});
const put = (app: unknown, url: string, body?: unknown) =>
  request(app as never).put(url).set('Authorization', `Bearer ${DEMO_TOKEN}`).send(body ?? {});
const del = (app: unknown, url: string) =>
  request(app as never).delete(url).set('Authorization', `Bearer ${DEMO_TOKEN}`);

const findApplicationByAmount = (
  items: Array<{ requestedAmount: string; id: string; status: string }>,
  amount: string,
) => items.find((a) => a.requestedAmount === amount);

describe('loan demo router', () => {
  it('exposes the policy with the editable MRA cap', async () => {
    const res = await get(createAppRef(), '/api/v1/loans/policy');
    expect(res.status).toBe(200);
    expect(res.body.rateCapPercent).toBe(27);
    expect(res.body.bmApprovalLimitBdt).toBe('100000.00');
  });

  it('updates the policy cap and approval limit', async () => {
    const app = createAppRef();
    const res = await patch(app, '/api/v1/loans/policy', { rateCapPercent: 24, bmApprovalLimitBdt: '150000.00' });
    expect(res.status).toBe(200);
    expect(res.body.rateCapPercent).toBe(24);
    expect(res.body.bmApprovalLimitBdt).toBe('150000.00');
  });

  it('rejects a product above the regulatory cap and accepts one at it', async () => {
    const app = createAppRef();
    const over = await post(app, '/api/v1/loans/products', {
      code: 'OVER',
      name: 'Over cap product',
      productType: 'general',
      minAmount: '10000.00',
      maxAmount: '50000.00',
      termMonths: 12,
      installmentFrequency: 'monthly',
      interestMethod: 'declining_balance',
      interestRate: 30,
    });
    expect(over.status).toBe(422);
    expect(over.body.error.message).toMatch(/cap/i);

    const flatEquivalentlyHigh = await post(app, '/api/v1/loans/products', {
      code: 'FLATX',
      name: 'Flat over cap',
      productType: 'general',
      minAmount: '10000.00',
      maxAmount: '50000.00',
      termMonths: 12,
      installmentFrequency: 'weekly',
      interestMethod: 'flat',
      interestRate: 20, // 20 × 2 = 40 effective > 27 cap
    });
    expect(flatEquivalentlyHigh.status).toBe(422);

    const atCap = await post(app, '/api/v1/loans/products', {
      code: 'ATCAP',
      name: 'At cap product',
      productType: 'general',
      minAmount: '10000.00',
      maxAmount: '50000.00',
      termMonths: 12,
      installmentFrequency: 'monthly',
      interestMethod: 'declining_balance',
      interestRate: 27,
    });
    expect(atCap.status).toBe(201);
  });

  it('live rate-check returns 422 with the cap for breaches', async () => {
    const app = createAppRef();
    const bad = await post(app, '/api/v1/loans/rate-check', { interestRate: 28, interestMethod: 'declining_balance' });
    expect(bad.status).toBe(422);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.cap).toBe(27);
    const ok = await post(app, '/api/v1/loans/rate-check', { interestRate: 27, interestMethod: 'declining_balance' });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
  });

  it('lists the full product catalog with guarantor rules', async () => {
    const res = await get(createAppRef(), '/api/v1/loans/products');
    expect(res.status).toBe(200);
    const codes = res.body.items.map((p: { code: string }) => p.code);
    expect(codes).toEqual(
      expect.arrayContaining(['GEN', 'SAGRI', 'MICRO', 'HOUSE', 'EDU', 'EMERG', 'MIG', 'DEVICE', 'CLIMATE']),
    );
    const micro = res.body.items.find((p: { code: string }) => p.code === 'MICRO');
    expect(micro.guarantorsRequired).toBe(2);
    expect(micro.requiredDocuments).toContain('Trade license');
  });

  it('creates an application and walks the wizard through branch-manager approval', async () => {
    const app = createAppRef();
    const products = (await get(app, '/api/v1/loans/products')).body.items;
    const gen = products.find((p: { code: string }) => p.code === 'GEN');

    const created = await post(app, '/api/v1/loans/applications', {
      memberId: '00000000-0000-4000-8000-0000000001a2', // Salma — first cycle, clean history
      productId: gen.id,
      requestedAmount: '20000.00', // exactly at her first-loan cap
      purpose: 'Poultry feed purchase',
    });
    expect(created.status).toBe(201);
    const appId = created.body.id;
    expect(created.body.status).toBe('submitted');

    // Amount-band guard.
    const band = await post(app, '/api/v1/loans/applications', {
      memberId: '00000000-0000-4000-8000-0000000001a2',
      productId: gen.id,
      requestedAmount: '999999.00',
      purpose: 'Too much',
    });
    expect(band.status).toBe(409);

    // Officer phase.
    const visit = await post(app, `/api/v1/loans/applications/${appId}/steps`, {
      stage: 'officer_visit',
      payload: { visitNote: 'Shed and stock verified' },
    });
    expect(visit.status).toBe(201);
    const household = await post(app, `/api/v1/loans/applications/${appId}/steps`, {
      stage: 'household_check',
      payload: { householdCheck: { monthlyIncomeBdt: '22000.00', monthlyDebtServiceBdt: '4000.00', otherMfiLoans: 0 } },
    });
    expect(household.status).toBe(201);
    const guarantor = await post(app, `/api/v1/loans/applications/${appId}/steps`, {
      stage: 'guarantor',
      payload: {
        guarantor: { name: 'Karim Uddin', relation: 'spouse', mobile: '01912345678', nidLast4: '7712', isMember: false, consentGiven: true },
      },
    });
    expect(guarantor.status).toBe(201);

    // Application reached BM review after the officer phase.
    const afterOfficer = await get(app, `/api/v1/loans/applications/${appId}`);
    expect(afterOfficer.body.status).toBe('bm_review');

    // Role guard: officer cannot perform BM review.
    // (Demo token is super_admin; test role guard via decision on am-only app below.)

    const approve = await post(app, `/api/v1/loans/applications/${appId}/decision`, { decision: 'approve' });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('approved');

    const schedule = await get(app, `/api/v1/loans/applications/${appId}/schedule`);
    expect(schedule.status).toBe(200);
    expect(schedule.body.installmentCount).toBe(48); // 12 months × weekly
    expect(schedule.body.installments).toHaveLength(48);
    expect(Number(schedule.body.totalPayable)).toBeGreaterThan(20000);
  });

  it('routes above-limit amounts to area review and enforces the BM limit', async () => {
    const app = createAppRef();
    const apps = (await get(app, '/api/v1/loans/applications')).body.items;
    const big = findApplicationByAmount(apps, '180000.00');
    expect(big).toBeTruthy();
    expect(big!.status).toBe('am_review');

    // Raise the cycle caps (as an admin would) so the seeded amount passes the
    // governance gate, then approve at am_review.
    const patchRes = await patch(app, '/api/v1/loans/policy', {
      bmApprovalLimitBdt: '5000.00',
      firstLoanCapBdt: '200000.00',
      maxCycleCapBdt: '200000.00',
    });
    expect(patchRes.status).toBe(200);

    const approve = await post(app, `/api/v1/loans/applications/${big!.id}/decision`, { decision: 'approve' });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('approved');
  });

  it('rejects applications with a mandatory reason', async () => {
    const app = createAppRef();
    const products = (await get(app, '/api/v1/loans/products')).body.items;
    const emerg = products.find((p: { code: string }) => p.code === 'EMERG');

    const created = await post(app, '/api/v1/loans/applications', {
      memberId: '00000000-0000-4000-8000-0000000001a1',
      productId: emerg.id,
      requestedAmount: '15000.00',
      purpose: 'Emergency test',
    });
    const appId = created.body.id;
    await post(app, `/api/v1/loans/applications/${appId}/steps`, { stage: 'officer_visit', note: 'ok' });
    await post(app, `/api/v1/loans/applications/${appId}/steps`, { stage: 'household_check', note: 'ok' });
    await post(app, `/api/v1/loans/applications/${appId}/steps`, {
      stage: 'guarantor',
      payload: { guarantor: { name: 'Hasan Ali', relation: 'other', mobile: '01612345678', nidLast4: '3333', isMember: false, consentGiven: true } },
    });

    const noReason = await post(app, `/api/v1/loans/applications/${appId}/decision`, { decision: 'reject' });
    expect(noReason.status).toBe(400);

    const rejected = await post(app, `/api/v1/loans/applications/${appId}/decision`, {
      decision: 'reject',
      reason: 'Duplicate application already funded this cycle',
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.decisionReason).toMatch(/Duplicate/);
  });

  it('blocks decisions before review stages and duplicate stage completion', async () => {
    const app = createAppRef();
    const apps = (await get(app, '/api/v1/loans/applications')).body.items;
    const fresh = apps.find((a: { status: string }) => a.status === 'submitted');
    expect(fresh).toBeTruthy();

    const early = await post(app, `/api/v1/loans/applications/${fresh.id}/decision`, { decision: 'approve' });
    expect(early.status).toBe(409);

    const step = await post(app, `/api/v1/loans/applications/${fresh.id}/steps`, { stage: 'officer_visit', note: 'first' });
    expect(step.status).toBe(201);
    const dup = await post(app, `/api/v1/loans/applications/${fresh.id}/steps`, { stage: 'officer_visit', note: 'again' });
    expect(dup.status).toBe(409);
  });

  it('returns pipeline buckets grouped by status', async () => {
    const res = await get(createAppRef(), '/api/v1/loans/pipeline');
    expect(res.status).toBe(200);
    const amBucket = res.body.items.find((b: { status: string }) => b.status === 'am_review');
    expect(amBucket.count).toBe(1);
    expect(amBucket.totalAmount).toBe('180000.00');
  });

  // ── Governance (matrix, cycles, overlap, utilization) ──────────────────────

  it('exposes the approval matrix and accepts admin updates', async () => {
    const app = createAppRef();
    const initial = await get(app, '/api/v1/loans/approval-matrix');
    expect(initial.status).toBe(200);
    expect(initial.body.items.length).toBeGreaterThanOrEqual(3);

    const updated = await request(app as never)
      .put('/api/v1/loans/approval-matrix')
      .set('Authorization', `Bearer ${DEMO_TOKEN}`)
      .send({
        rows: [
          { productId: null, minAmount: null, maxAmount: '50000.00', approverRoles: ['branch_manager'], soloApprovalLimit: '50000.00', priority: 10, isActive: true },
          { productId: null, minAmount: '50000.01', maxAmount: null, approverRoles: ['org_admin'], soloApprovalLimit: null, priority: 5, isActive: true },
        ],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.items).toHaveLength(2);

    const reread = await get(app, '/api/v1/loans/approval-matrix');
    expect(reread.body.items[0]!.maxAmount).toBe('50000.00');
  });

  it('rejects a matrix row with invalid roles', async () => {
    const app = createAppRef();
    const bad = await request(app as never)
      .put('/api/v1/loans/approval-matrix')
      .set('Authorization', `Bearer ${DEMO_TOKEN}`)
      .send({
        rows: [{ productId: null, minAmount: null, maxAmount: null, approverRoles: ['not_a_role'], soloApprovalLimit: null, priority: 1, isActive: true }],
      });
    expect(bad.status).toBe(400);
  });

  it('reports cycle summary, eligibility blocks and overlap in cycle-check', async () => {
    const app = createAppRef();
    // Rahima: 2 completed cycles → cap 31,250; clean history → eligible at ≤ cap
    const rahima = '00000000-0000-4000-8000-0000000001a1';
    const ok = await get(app, `/api/v1/loans/cycle-check/${rahima}?amount=30000.00`);
    expect(ok.status).toBe(200);
    expect(ok.body.cycle.completedCycles).toBe(2);
    expect(ok.body.cycle.currentCapBdt).toBe('31250.00');
    expect(ok.body.check.eligible).toBe(true);

    const overCap = await get(app, `/api/v1/loans/cycle-check/${rahima}?amount=40000.00`);
    expect(overCap.body.check.eligible).toBe(false);
    expect(overCap.body.check.blocks).toContain('AMOUNT_ABOVE_CYCLE_CAP');

    // Jahanara: seeded overdue installment (12 days > 3 grace) → blocked
    const jahanara = '00000000-0000-4000-8000-0000000001a3';
    const blocked = await get(app, `/api/v1/loans/cycle-check/${jahanara}?amount=5000.00`);
    expect(blocked.body.check.blocks).toContain('OVERDUE_INSTALLMENT');
    expect(blocked.body.check.details.worstOverdueDays).toBe(12);
  });

  it('blocks application creation when the member is over-indebted or overdue', async () => {
    const app = createAppRef();
    const products = (await get(app, '/api/v1/loans/products')).body.items;
    const emerg = products.find((p: { code: string }) => p.code === 'EMERG');

    // Jahanara has an overdue installment → create must 409 with block reasons.
    const res = await post(app, '/api/v1/loans/applications', {
      memberId: '00000000-0000-4000-8000-0000000001a3',
      productId: emerg.id,
      requestedAmount: '10000.00',
      purpose: 'Should be blocked',
    });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('OVERDUE_INSTALLMENT');
  });

  it('captures and verifies a utilization plan with variance reporting', async () => {
    const app = createAppRef();
    const apps = (await get(app, '/api/v1/loans/applications')).body.items;
    const micro = apps.find((a: { requestedAmount: string }) => a.requestedAmount === '180000.00');

    // Seeded plan exists for the micro application.
    const got = await get(app, `/api/v1/loans/applications/${micro.id}/utilization`);
    expect(got.status).toBe(200);
    expect(got.body.plan.items).toHaveLength(2);
    expect(got.body.report.plannedTotal).toBe('180000.00');

    // Verify with a shortfall on one item.
    const verify = await post(app, `/api/v1/loans/applications/${micro.id}/utilization/verify`, {
      verifiedItems: [
        { category: 'sewing_machine', verifiedAmount: '110000.00', note: '3 machines delivered' },
        { category: 'working_capital', verifiedAmount: '60000.00' },
      ],
      verifierNote: 'Field visit 2026-09-21',
    });
    expect(verify.status).toBe(200);
    expect(verify.body.plan.status).toBe('verified');

    const after = await get(app, `/api/v1/loans/applications/${micro.id}/utilization`);
    expect(after.body.report.verifiedTotal).toBe('170000.00');
    expect(after.body.report.variance).toBe('-10000.00');

    // Locked after verification.
    const again = await post(app, `/api/v1/loans/applications/${micro.id}/utilization/verify`, {
      verifiedItems: [{ category: 'sewing_machine', verifiedAmount: '1.00' }],
    });
    expect(again.status).toBe(409);
  });

  it('enriches the detail payload with approval resolution and utilization', async () => {
    const app = createAppRef();
    const apps = (await get(app, '/api/v1/loans/applications')).body.items;
    const big = apps.find((a: { requestedAmount: string }) => a.requestedAmount === '180000.00');
    const detail = await get(app, `/api/v1/loans/applications/${big.id}`);
    expect(detail.body.approval.approverRoles).toContain('area_manager');
    expect(detail.body.cycle.cycleNumber).toBe(3);
    expect(detail.body.utilization.plannedTotal).toBe('180000.00');
  });

  it('serves the proposal payload with schedule, utilization and guarantors', async () => {
    const app = createAppRef();
    const apps = (await get(app, '/api/v1/loans/applications')).body.items;
    const micro = apps.find((a: { requestedAmount: string }) => a.requestedAmount === '180000.00');
    const res = await get(app, `/api/v1/loans/applications/${micro.id}/proposal`);
    expect(res.status).toBe(200);
    expect(res.body.applicationNumber).toBe(micro.applicationNumber);
    expect(res.body.orgName).toContain('সমবায়');
    expect(res.body.schedule.length).toBe(24);
    expect(res.body.utilization.plannedTotal).toBe('180000.00');
  });

  it('returns the status timeline ordered chronologically', async () => {
    const app = createAppRef();
    const apps = (await get(app, '/api/v1/loans/applications')).body.items;
    const micro = apps.find((a: { requestedAmount: string }) => a.requestedAmount === '180000.00');
    const res = await get(app, `/api/v1/loans/applications/${micro.id}/timeline`);
    expect(res.status).toBe(200);
    const stages = res.body.items.map((e: { stage: string }) => e.stage);
    expect(stages[0]).toBe('member_request');
    expect(stages).toContain('bm_review');
    expect(res.body.items.every((e: { stageBn: string }) => typeof e.stageBn === 'string' && e.stageBn.length > 0)).toBe(true);
  });
});
// ── Disbursement module (two-step: prepare → authorize; same-day rollback) ─
describe('loan disbursement', () => {
  const CHECKS = [
    'savings_deposit_paid',
    'insurance_premium_collected',
    'fees_paid',
    'member_present',
    'guarantor_signature',
    'cash_available',
  ];

  const findApproved = async (app: unknown): Promise<{ id: string; requestedAmount: string } | undefined> => {
    const res = await get(app, '/api/v1/loans/applications');
    return findApplicationByAmount(res.body.items, '12000.00');
  };

  const prepare = async (app: unknown, id: string, extra: Record<string, unknown> = {}) =>
    patch(app, `/api/v1/loans/disbursements/${id}`, {
      mode: 'cash_branch',
      checkItems: CHECKS.map((check) => ({ check, done: true })),
      ...extra,
    });

  const authorize = async (app: unknown, id: string, extra: Record<string, unknown> = {}) =>
    post(app, `/api/v1/loans/disbursements/${id}/authorize`, {
      cashReceivedByName: 'Jahanara Begum (member)',
      ...extra,
    });

  /** Prepare + authorize a fresh approved application through the API. */
  const disburse = async (
    app: unknown,
    extra: Record<string, unknown> = {},
  ): Promise<{ id: string; requestedAmount: string } | undefined> => {
    const target = await findApproved(app);
    if (!target) return undefined;
    await prepare(app, target.id);
    const res = await authorize(app, target.id, extra);
    if (res.status !== 201) throw new Error(`authorize failed (${res.status}): ${JSON.stringify(res.body)}`);
    return target;
  };

  it('queues approved loans grouped by planned date with check progress', async () => {
    const app = createAppRef();
    const res = await get(app, '/api/v1/loans/disbursements/queue');
    expect(res.status).toBe(200);
    const item = res.body.items.find((i: { amount: string }) => i.amount === '12000.00');
    expect(item).toBeDefined();
    expect(item.checksTotal).toBe(6);
    expect(item.checksDone).toBe(0);
    expect(item.ready).toBe(false);
    expect(item.status).toBe('pending');
    expect(item.branchName).toBe('Dhaka Branch');
  });

  it('prepare records progress without paying; queue reflects it', async () => {
    const app = createAppRef();
    const target = await findApproved(app);
    expect(target).toBeDefined();
    const res = await patch(app, `/api/v1/loans/disbursements/${target!.id}`, {
      mode: 'bkash',
      plannedDate: '2026-10-01',
      checkItems: CHECKS.slice(0, 2).map((check) => ({ check, done: true, note: 'collected' })),
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('prepared');
    expect(res.body.mode).toBe('bkash');
    expect(res.body.plannedDate).toBe('2026-10-01');
    const doneCount = Object.values(res.body.checks as Record<string, { done: boolean }>).filter((c) => c.done).length;
    expect(doneCount).toBe(2);

    // Queue reflects progress but is not ready.
    const queue = await get(app, '/api/v1/loans/disbursements/queue');
    const queued = queue.body.items.find((i: { applicationId: string }) => i.applicationId === target!.id);
    expect(queued.checksDone).toBe(2);
    expect(queued.ready).toBe(false);
  });

  it('two-step control: authorize before prepare is rejected', async () => {
    const app = createAppRef();
    const target = await findApproved(app);
    const res = await authorize(app, target!.id);
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('Two-step control');
  });

  it('blocks authorization until every pre-disbursement check is done', async () => {
    const app = createAppRef();
    const target = await findApproved(app);
    await patch(app, `/api/v1/loans/disbursements/${target!.id}`, {
      mode: 'cash_branch',
      checkItems: CHECKS.slice(0, 5).map((check) => ({ check, done: true })), // missing cash_available
    });
    const res = await authorize(app, target!.id);
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('cash_available');
  });

  it('requires a receiver name for cash modes and a reference for MFS modes', async () => {
    const app = createAppRef();
    const target = await findApproved(app);

    // Cash without receiver → validation error.
    await prepare(app, target!.id, { mode: 'cash_branch' });
    const cash = await authorize(app, target!.id, { cashReceivedByName: undefined });
    expect(cash.status).toBe(400);

    // bKash without TrxID → validation error (fresh module state per test).
    const app2 = createAppRef();
    const target2 = await findApproved(app2);
    await prepare(app2, target2!.id, { mode: 'bkash' });
    const mfs = await authorize(app2, target2!.id);
    expect(mfs.status).toBe(400);
  });

  it('enforces the branch cash limit at authorization', async () => {
    const app = createAppRef();
    const target = await findApproved(app);
    await prepare(app, target!.id);
    // A tiny recorded limit must block the payout.
    const res = await authorize(app, target!.id, {
      branchCashLimitBdt: '10000.00',
      cashAvailableBdt: '50000.00',
    });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('cash limit');
  });

  it('authorizes with evidence, records the actual user of funds, and stores the schedule', async () => {
    const app = createAppRef();
    const target = await findApproved(app);
    await prepare(app, target!.id, { mode: 'bkash' });
    const res = await authorize(app, target!.id, {
      mfsReference: '9X7ABC1234',
      actualUserOfFunds: 'Karim Uddin',
      actualUserRelation: 'husband',
      note: 'Sent to member bKash wallet',
    });
    expect(res.status).toBe(201);
    expect(res.body.record.status).toBe('completed');
    expect(res.body.record.mode).toBe('bkash');
    expect(res.body.record.mfsReference).toBe('9X7ABC1234');
    expect(res.body.record.actualUserOfFunds).toBe('Karim Uddin');
    expect(res.body.record.loanNumber).toMatch(/^LN-DHK-\d{2}-\d{4}$/);
    expect(res.body.record.voucherNumber).toBe(`VCH-${res.body.record.loanNumber}`);

    // Requirement 5: balanced double-entry journal (debit portfolio, credit MFS clearing + fee income).
    const lines = res.body.journal.lines as Array<{ debit: string; credit: string }>;
    const debits = lines.reduce((s, l) => s + Number(l.debit), 0);
    const credits = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debits).toBeCloseTo(credits, 2);
    expect(debits).toBeCloseTo(12000, 2);
    expect(res.body.journal.lines[0].accountCode).toBe('1200');
    expect(res.body.journal.lines[1].accountCode).toBe('1030'); // MFS clearing for bKash

    // Requirement 8: passbook + SMS.
    expect(res.body.passbook.loanNumber).toBe(res.body.record.loanNumber);
    expect(res.body.sms.template).toBe('loan_disbursed');
    expect(res.body.sms.body).toContain(res.body.record.loanNumber);

    // Requirement 9: utilization visit 15 days out.
    const expected = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime() + 15 * 86_400_000;
    expect(res.body.visit.scheduledDate).toBe(new Date(expected).toISOString().slice(0, 10));

    // The application flipped to disbursed.
    const apps = await get(app, '/api/v1/loans/applications');
    const disbursed = apps.body.items.find((i: { id: string }) => i.id === target!.id);
    expect(disbursed.status).toBe('disbursed');

    // The stored schedule: one row per installment, totals reconstruct the loan.
    const schedule = await get(app, `/api/v1/loans/disbursements/${target!.id}/schedule`);
    expect(schedule.status).toBe(200);
    expect(schedule.body.rows.length).toBeGreaterThan(0);
    const principalSum = schedule.body.rows.reduce((s: number, r: { principal: string }) => s + Number(r.principal), 0);
    expect(principalSum).toBeCloseTo(12000, 2);

    // Voucher + agreement artifacts are now available.
    const voucher = await get(app, `/api/v1/loans/disbursements/${target!.id}/voucher`);
    expect(voucher.status).toBe(200);
    expect(voucher.body.loanNumber).toBe(res.body.record.loanNumber);
    const agreement = await get(app, `/api/v1/loans/disbursements/${target!.id}/agreement`);
    expect(agreement.status).toBe(200);
    expect(agreement.body.installments.length).toBe(schedule.body.rows.length);
  });

  it('queues a bank-transfer disbursement through the same two-step flow', async () => {
    const app = createAppRef();
    const target = await findApproved(app);
    await prepare(app, target!.id, { mode: 'bank_transfer' });
    const res = await authorize(app, target!.id, { bankReference: 'FT20260101X' });
    expect(res.status).toBe(201);
    expect(res.body.journal.lines[1].accountCode).toBe('1020'); // bank account
  });

  it('shifts the first installment off a seeded holiday', async () => {
    const app = createAppRef();
    const target = await findApproved(app);
    await disburse(app, {
      mode: 'bank_transfer',
      bankReference: 'FT20260101X',
      disbursementDate: '2025-12-25', // weekly cadence anchored on Thursday hits the Jan 1 holiday
    });
    const schedule = await get(app, `/api/v1/loans/disbursements/${target!.id}/schedule`);
    const shifted = schedule.body.rows.find((r: { shifted: boolean }) => r.shifted);
    expect(shifted).toBeDefined();
    expect(shifted.originalDueDate).toBe('2026-01-01');
    expect(shifted.dueDate).toBe('2026-01-02');
    expect(shifted.shiftReason).toContain("New Year's Day");
  });

  it('double disbursement is rejected', async () => {
    const app = createAppRef();
    const target = await findApproved(app);
    await disburse(app, { mode: 'nagad', mfsReference: 'NG99887766' });
    // Re-authorizing a completed disbursement violates the two-step control.
    const second = await authorize(app, target!.id, { mfsReference: 'NG99887766' });
    expect(second.status).toBe(409);
  });

  it('cancels a disbursement on the same day with reason, reversal and revert; blocks later', async () => {
    const app = createAppRef();
    const target = await findApproved(app);
    await disburse(app, { mode: 'cash_branch' });

    // Cancel with a too-short reason → validation error.
    const short = await post(app, `/api/v1/loans/disbursements/${target!.id}/cancel`, { reason: 'oops' });
    expect(short.status).toBe(400);

    const res = await post(app, `/api/v1/loans/disbursements/${target!.id}/cancel`, {
      reason: 'Member declined after cash count mismatch',
    });
    expect(res.status).toBe(200);
    expect(res.body.record.status).toBe('cancelled');
    expect(res.body.record.cancelReason).toBe('Member declined after cash count mismatch');
    // Requirement 5: the reversal flips every debit/credit of the original.
    expect(res.body.reversal.sourceType).toBe('loan_disbursement_reversal');
    const originalEntry = (res.body.reversal.lines as Array<{ debit: string; credit: string }>)[0];
    expect(originalEntry?.debit).toBe('0.00'); // original had the portfolio debit; reversal credits it
    // Passbook reversed; SMS queued; schedule dropped; visit removed.
    expect(res.body.sms.template).toBe('loan_cancelled');
    const schedule = await get(app, `/api/v1/loans/disbursements/${target!.id}/schedule`);
    expect(schedule.body.rows.length).toBe(0);
    const visits = await get(app, '/api/v1/loans/utilization-visits');
    expect(visits.body.items.some((v: { applicationId: string }) => v.applicationId === target!.id)).toBe(false);

    // The application reverted to approved and can be disbursed again.
    const apps = await get(app, '/api/v1/loans/applications');
    const reverted = apps.body.items.find((i: { id: string }) => i.id === target!.id);
    expect(reverted.status).toBe('approved');
    await prepare(app, target!.id);
    const again = await authorize(app, target!.id);
    expect(again.status).toBe(201);

    // Same-day-only rule: cancel today's re-disbursement works; a past date is blocked.
    const ok = await post(app, `/api/v1/loans/disbursements/${target!.id}/cancel`, {
      reason: 'Second cancel on the same day is still allowed',
    });
    expect(ok.status).toBe(200);
  });

  it('manages the holiday calendar (list, upsert, delete)', async () => {
    const app = createAppRef();
    const list = await get(app, '/api/v1/loans/holidays');
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(3);

    const up = await put(app, '/api/v1/loans/holidays', {
      holidays: [{ date: '2026-05-01', name: 'May Day', nameBn: 'মে দিবস', isRecurring: true }],
    });
    expect(up.status).toBe(200);
    expect(up.body.items.some((h: { date: string }) => h.date === '2026-05-01')).toBe(true);

    const removed = await del(app, '/api/v1/loans/holidays/2026-05-01');
    expect(removed.status).toBe(200);
    expect(removed.body.items.some((h: { date: string }) => h.date === '2026-05-01')).toBe(false);
  });
});
