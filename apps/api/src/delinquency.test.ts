/**
 * ── Delinquency & Recovery tests (requirements 1–4) ─────────────────────────
 * Nightly classification with editable settings, PAR rollups at every scope,
 * escalating worklist, and follow-ups that mint reminder tasks.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;
let resetLoanDemoStoreRef: typeof import('./lib/loan-store.js').resetLoanDemoStore;
let resetDelinquencyDemoStoreRef: typeof import('./lib/delinquency-store.js').resetDelinquencyDemoStore;
let loanDemoStoreRef: typeof import('./lib/loan-store.js').loanDemoStore;

const DEMO_TOKEN = 'demo-token';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const loan = await import('./lib/loan-store.js');
  const del = await import('./lib/delinquency-store.js');
  resetLoanDemoStoreRef = loan.resetLoanDemoStore;
  loanDemoStoreRef = loan.loanDemoStore;
  resetDelinquencyDemoStoreRef = del.resetDelinquencyDemoStore;
  resetLoanDemoStoreRef();
  resetDelinquencyDemoStoreRef();
});

const get = (app: unknown, url: string) =>
  request(app as never).get(url).set('Authorization', `Bearer ${DEMO_TOKEN}`);
const post = (app: unknown, url: string, body?: unknown) =>
  request(app as never).post(url).set('Authorization', `Bearer ${DEMO_TOKEN}`).send(body ?? {});
const patch = (app: unknown, url: string, body?: unknown) =>
  request(app as never).patch(url).set('Authorization', `Bearer ${DEMO_TOKEN}`).send(body ?? {});

/** Disburse the seeded approved ৳12,000 emergency loan, then age one installment. */
async function seedDisbursedLoan(app: unknown): Promise<string> {
  const apps = await get(app, '/api/v1/loans/applications');
  const target = (apps.body.items as Array<{ id: string; status: string; requestedAmount: string }>).find(
    (a) => a.status === 'approved' && a.requestedAmount === '12000.00',
  );
  expect(target).toBeDefined();
  const checks = [
    'savings_deposit_paid',
    'insurance_premium_collected',
    'fees_paid',
    'member_present',
    'guarantor_signature',
    'cash_available',
  ];
  const prepared = await request(app as never)
    .patch(`/api/v1/loans/disbursements/${target!.id}`)
    .set('Authorization', `Bearer ${DEMO_TOKEN}`)
    .send({ mode: 'cash_branch', checkItems: checks.map((check) => ({ check, done: true })) });
  expect(prepared.status).toBe(200);
  const authorized = await post(app, `/api/v1/loans/disbursements/${target!.id}/authorize`, {
    cashReceivedByName: 'Jahanara Parvin (member)',
  });
  expect(authorized.status).toBe(201);
  return target!.id;
}

/**
 * Backdate the first two installment due dates by `days` (demo-only aging).
 * Installments start ~7 days after disbursement, so the first aging must
 * exceed that lead for the loan to register any days past due.
 */
async function ageLoan(app: unknown, applicationId: string, days: number): Promise<void> {
  const store = loanDemoStoreRef();
  const rec = store.disbursements.find((d) => d.applicationId === applicationId);
  expect(rec).toBeDefined();
  for (const row of rec!.schedule.rows.slice(0, 2)) {
    row.originalDueDate = row.dueDate;
    row.dueDate = new Date(Date.parse(`${row.dueDate}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  }
}

describe('nightly classification (requirement 1)', () => {
  it('classifies a regular loan and a freshly disbursed loan as regular', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    const res = await post(app, '/api/v1/delinquency/run');
    expect(res.status).toBe(201);
    expect(res.body.classified).toBeGreaterThan(0);
    expect(res.body.run.loansRisk).toBe(0);

    const loans = await get(app, '/api/v1/delinquency/loans');
    for (const l of loans.body.items as Array<{ bucket: string; daysPastDue: number; assetClass: string; provisionAmount: string }>) {
      expect(l.bucket).toBe('regular');
      expect(l.daysPastDue).toBe(0);
      expect(l.assetClass).toBe('standard');
      expect(Number(l.provisionAmount)).toBe(0);
    }
  });

  it('ages into the right bucket, asset class and provisioning', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);
    await ageLoan(app, appId, 45); // 31–90 bucket → substandard, 25%

    await post(app, '/api/v1/delinquency/run');
    const loans = (await get(app, `/api/v1/delinquency/loans`)).body.items as Array<{
      applicationId: string;
      bucket: string;
      assetClass: string;
      provisionPercent: number;
      daysPastDue: number;
      overdueTotal: string;
      outstanding: string;
    }>;
    const aged = loans.find((l) => l.applicationId === appId)!;
    expect(aged.bucket).toBe('d31_90');
    expect(aged.assetClass).toBe('substandard');
    expect(aged.provisionPercent).toBe(25);
    expect(Number(aged.overdueTotal)).toBeGreaterThan(0);
    expect(Number(aged.outstanding)).toBeGreaterThan(0);

    // 200+ days → bad, 100% provision.
    await ageLoan(app, appId, 200);
    await post(app, '/api/v1/delinquency/run');
    const again = ((await get(app, '/api/v1/delinquency/loans')).body.items as Array<{
      applicationId: string;
      bucket: string;
      assetClass: string;
      provisionPercent: number;
    }>).find((l) => l.applicationId === appId)!;
    expect(again.bucket).toBe('d180_plus');
    expect(again.assetClass).toBe('bad');
    expect(again.provisionPercent).toBe(100);
  });

  it('honours edited bucket bounds and provisioning percentages', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);
    await ageLoan(app, appId, 20); // default → d1_30

    const patched = await patch(app, '/api/v1/delinquency/settings', {
      buckets: { d1_30: 10, d31_90: 60, d91_180: 120 },
      assetClassByDpd: { substandard: 11, doubtful: 61, bad: 121 },
      provisioning: { standard: 0, substandard: 40, doubtful: 60, bad: 100 },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.buckets.d1_30).toBe(10);

    await post(app, '/api/v1/delinquency/run');
    const aged = ((await get(app, '/api/v1/delinquency/loans')).body.items as Array<{
      applicationId: string;
      bucket: string;
      assetClass: string;
      provisionPercent: number;
    }>).find((l) => l.applicationId === appId)!;
    // 20 dpd now falls into the second bucket (11–60) → substandard at 40%.
    expect(aged.bucket).toBe('d31_90');
    expect(aged.assetClass).toBe('substandard');
    expect(aged.provisionPercent).toBe(40);
  });
});

describe('PAR metrics (requirement 2)', () => {
  it('aggregates at org, zone, area, branch, samity and officer scopes', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);
    await ageLoan(app, appId, 40);
    await post(app, '/api/v1/delinquency/run');

    for (const scope of ['org', 'zone', 'area', 'branch', 'samity', 'officer']) {
      const res = await get(app, `/api/v1/delinquency/par?scope=${scope}`);
      expect(res.status).toBe(200);
      expect(res.body.scope).toBe(scope);
      expect(res.body.items.length).toBeGreaterThan(0);
      for (const m of res.body.items as Array<{ outstandingTotal: string; par1: number; par30: number; par90: number; loansAtRisk: number }>) {
        expect(Number(m.outstandingTotal)).toBeGreaterThan(0);
        expect(m.par1).toBeGreaterThan(0);
        expect(m.par30).toBeGreaterThan(0);
        expect(m.par90).toBe(0); // 40 dpd < 90
        expect(m.loansAtRisk).toBeGreaterThan(0);
      }
    }

    // Branch summary groups by bucket + class with provision totals.
    const summary = await get(app, `/api/v1/delinquency/branches/${BRANCH_DHAKA}/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body.byBucket.d31_90).toBeDefined();
    expect(Number(summary.body.provisionTotal)).toBeGreaterThan(0);
  });

  it('reports PAR0 for a healthy portfolio', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    await post(app, '/api/v1/delinquency/run');
    const par = await get(app, '/api/v1/delinquency/par?scope=branch');
    for (const m of par.body.items as Array<{ par1: number; onTimeRepaymentRate: number }>) {
      expect(m.par1).toBe(0);
      expect(m.onTimeRepaymentRate).toBe(1);
    }
  });
});

describe('worklist escalation (requirement 3)', () => {
  it('assigns to the officer, then BM, then AM as days past due grow', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);

    await ageLoan(app, appId, 9); // installment 1 was +7d → now 2 dpd
    await post(app, '/api/v1/delinquency/run');
    let items = (await get(app, '/api/v1/delinquency/worklist')).body.items as Array<{
      loanId: string;
      assignedLevel: string;
      assignedToName: string | null;
    }>;
    let mine = items.find((i) => i.loanId === appId)!;
    expect(mine.assignedLevel).toBe('field_officer');

    await ageLoan(app, appId, 3); // cumulative 12d → 5 dpd > BM threshold (3)
    await post(app, '/api/v1/delinquency/run');
    items = (await get(app, '/api/v1/delinquency/worklist')).body.items;
    mine = items.find((i) => i.loanId === appId)!;
    expect(mine.assignedLevel).toBe('branch_manager');

    await ageLoan(app, appId, 12); // cumulative 24d → 17 dpd > AM threshold (15)
    await post(app, '/api/v1/delinquency/run');
    items = (await get(app, '/api/v1/delinquency/worklist')).body.items;
    mine = items.find((i) => i.loanId === appId)!;
    expect(mine.assignedLevel).toBe('area_manager');
    expect(mine.assignedToName).toBeTruthy();

    // Level filter works.
    const am = await get(app, '/api/v1/delinquency/worklist?level=area_manager');
    for (const i of am.body.items as Array<{ assignedLevel: string }>) {
      expect(i.assignedLevel).toBe('area_manager');
    }
  });

  it('closes the case when the loan becomes regular again', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);
    await ageLoan(app, appId, 9);
    await post(app, '/api/v1/delinquency/run');
    expect(((await get(app, '/api/v1/delinquency/worklist')).body.items as unknown[]).length).toBe(1);

    // Pay the overdue installments via a collection entry → loan regular.
    const sheet = await get(app, `/api/v1/collection/sheet?branchId=${BRANCH_DHAKA}`);
    const row = (sheet.body.rows as Array<{ memberId: string; loan: { applicationId: string; overdue: unknown[] } | null }>).find(
      (r) => r.loan && r.loan.applicationId === appId,
    );
    expect(row).toBeDefined();
    const overdue = (row!.loan as { overdue: Array<{ amount: string }> }).overdue;
    const total = overdue.reduce((s, o) => s + Number(o.amount), 0).toFixed(2);
    await post(app, '/api/v1/collection/entries', {
      idempotencyKey: crypto.randomUUID(),
      memberId: row!.memberId,
      meetingDate: new Date().toISOString().slice(0, 10),
      loanPaid: total,
      savingsPaid: '0.00',
      extraPaid: '0.00',
    });
    await post(app, '/api/v1/delinquency/run');
    const items = (await get(app, '/api/v1/delinquency/worklist')).body.items as unknown[];
    expect(items.length).toBe(0);
  });
});

describe('follow-ups and reminder tasks (requirement 4)', () => {
  async function makeCase(app: unknown): Promise<string> {
    const appId = await seedDisbursedLoan(app);
    await ageLoan(app, appId, 9);
    await post(app, '/api/v1/delinquency/run');
    return appId;
  }

  it('records a visit with promise-to-pay and auto-creates a reminder task', async () => {
    const app = createAppRef();
    const appId = await makeCase(app);

    const promiseDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const created = await post(app, '/api/v1/delinquency/follow-ups', {
      loanId: appId,
      type: 'visit',
      outcome: 'promise_to_pay',
      promiseDate,
      promiseAmount: '525.00',
      note: 'সদস্য পরিদর্শন করা হয়েছে; আগামী সপ্তাহে পরিশোধের প্রতিশ্রুতি।',
    });
    expect(created.status).toBe(201);
    expect(created.body.reminderTaskId).toBeTruthy();

    const tasks = (await get(app, '/api/v1/delinquency/tasks')).body.items as Array<{
      id: string;
      dueDate: string;
      status: string;
      source: string;
    }>;
    const task = tasks.find((t) => t.id === created.body.reminderTaskId)!;
    expect(task).toBeDefined();
    expect(task.dueDate).toBe(promiseDate);
    expect(task.status).toBe('open');
    expect(task.source).toBe('delinquency');

    // Complete the reminder.
    const done = await post(app, `/api/v1/delinquency/tasks/${task.id}/complete`);
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('done');
    const openTasks = (await get(app, '/api/v1/delinquency/tasks')).body.items as unknown[];
    expect(openTasks.length).toBe(0);
  });

  it('rejects a promise-to-pay without a date and follow-ups for loans without cases', async () => {
    const app = createAppRef();
    const appId = await makeCase(app);
    const bad = await post(app, '/api/v1/delinquency/follow-ups', {
      loanId: appId,
      type: 'phone_call',
      outcome: 'promise_to_pay',
    });
    expect(bad.status).toBe(400);

    const noCase = await post(app, '/api/v1/delinquency/follow-ups', {
      loanId: '00000000-0000-4000-8000-000000000099',
      type: 'visit',
      outcome: 'refused',
    });
    expect(noCase.status).toBe(404);
  });

  it('lists follow-up history per loan', async () => {
    const app = createAppRef();
    const appId = await makeCase(app);
    await post(app, '/api/v1/delinquency/follow-ups', {
      loanId: appId,
      type: 'phone_call',
      outcome: 'refused',
      note: 'কলে সাড়া মেলেনি',
    });
    await post(app, '/api/v1/delinquency/follow-ups', {
      loanId: appId,
      type: 'visit',
      outcome: 'partial_paid',
      promiseAmount: '200.00',
      nextVisitDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
    });
    const list = await get(app, `/api/v1/delinquency/follow-ups?loanId=${appId}`);
    expect(list.body.items.length).toBe(2);
    // Worklist shows the follow-up context.
    const worklist = (await get(app, '/api/v1/delinquency/worklist')).body.items as Array<{ loanId: string; followUpsCount: number }>;
    expect(worklist.find((i) => i.loanId === appId)!.followUpsCount).toBe(2);
  });
});
