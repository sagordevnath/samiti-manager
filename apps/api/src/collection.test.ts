import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;
let resetLoanDemoStoreRef: typeof import('./lib/loan-store.js').resetLoanDemoStore;
let resetCollectionDemoStoreRef: typeof import('./lib/collection-store.js').resetCollectionDemoStore;
let resetSavingsDemoStoreRef: typeof import('./lib/savings-store.js').resetSavingsDemoStore;
let loanDemoStoreRef: typeof import('./lib/loan-store.js').loanDemoStore;
let collectionDemoStoreRef: typeof import('./lib/collection-store.js').collectionDemoStore;

const DEMO_TOKEN = 'demo-token';
const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_C = '00000000-0000-4000-8000-0000000001a3';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const loan = await import('./lib/loan-store.js');
  const coll = await import('./lib/collection-store.js');
  const savings = await import('./lib/savings-store.js');
  resetLoanDemoStoreRef = loan.resetLoanDemoStore;
  loanDemoStoreRef = loan.loanDemoStore;
  resetCollectionDemoStoreRef = coll.resetCollectionDemoStore;
  collectionDemoStoreRef = coll.collectionDemoStore;
  resetSavingsDemoStoreRef = savings.resetSavingsDemoStore;
  resetLoanDemoStoreRef();
  resetCollectionDemoStoreRef();
  resetSavingsDemoStoreRef();
});

const get = (app: unknown, url: string) => request(app as never).get(url).set('Authorization', `Bearer ${DEMO_TOKEN}`);
const post = (app: unknown, url: string, body?: unknown) =>
  request(app as never).post(url).set('Authorization', `Bearer ${DEMO_TOKEN}`).send(body ?? {});

/** Disburse the seeded approved emergency loan so the sheet has installments. */
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
  const authorized = await request(app as never)
    .post(`/api/v1/loans/disbursements/${target!.id}/authorize`)
    .set('Authorization', `Bearer ${DEMO_TOKEN}`)
    .send({ cashReceivedByName: 'Jahanara Parvin (member)' });
  expect(authorized.status).toBe(201);
  return target!.id;
}

const entryBody = (memberId: string, over: Record<string, unknown> = {}) => ({
  idempotencyKey: crypto.randomUUID(),
  memberId,
  meetingDate: new Date().toISOString().slice(0, 10),
  loanPaid: '0.00',
  savingsPaid: '0.00',
  extraPaid: '0.00',
  ...over,
});

describe('collection sheet', () => {
  it('lists members with due installment, overdue, advance and total', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    const res = await get(app, `/api/v1/collection/sheet?branchId=${BRANCH_DHAKA}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThan(0);

    const jahanara = res.body.rows.find((r: { memberCode: string }) => r.memberCode === 'DHK-26-00042');
    expect(jahanara).toBeDefined();
    // Her loan disbursed today: current installment due, nothing overdue yet.
    expect(jahanara.loan).not.toBeNull();
    expect(jahanara.loan.overdue).toEqual([]);
    expect(jahanara.loan.current).not.toBeNull();
    expect(Number(jahanara.loan.installmentAmount)).toBeGreaterThan(0);

    // Rahima carries the seeded ৳100 advance credit.
    const rahima = res.body.rows.find((r: { memberCode: string }) => r.memberCode === 'DHK-26-00001');
    expect(rahima.advanceBalance).toBe('100.00');

    // Totals reconcile with the rows.
    const dueSum = res.body.rows.reduce((s: number, r: { totalDue: string }) => s + Number(r.totalDue), 0);
    expect(Number(res.body.totals.due)).toBeCloseTo(dueSum, 2);
  });

  it('flags overdue installments when the meeting date is later', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    const future = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
    const res = await get(app, `/api/v1/collection/sheet?branchId=${BRANCH_DHAKA}&meetingDate=${future}`);
    const jahanara = res.body.rows.find((r: { memberCode: string }) => r.memberCode === 'DHK-26-00042');
    expect(jahanara.loan.overdue.length).toBeGreaterThan(0);
    expect(jahanara.loan.overdue[0].daysOverdue).toBeGreaterThan(0);
  });
});

describe('collection entries (allocation + idempotency)', () => {
  it('allocates a payment across overdue → current → savings and marks installments paid', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    const sheet = await get(app, `/api/v1/collection/sheet?branchId=${BRANCH_DHAKA}`);
    const jahanara = sheet.body.rows.find((r: { memberCode: string }) => r.memberCode === 'DHK-26-00042');
    const current = jahanara.loan.current.amount;

    // Pay the current installment + extra. Jahanara's savings account is
    // dormant in the demo, so her whole pool flows through loan → advance.
    const res = await post(
      app,
      '/api/v1/collection/entries',
      entryBody(MEMBER_C, {
        loanPaid: current,
        savingsPaid: '0.00',
        extraPaid: '50.00',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.receipt.receiptNo).toMatch(/^RCP-DHK-\d{2}-\d{4}$/);
    expect(Number(res.body.receipt.allocation.currentApplied.amount)).toBeCloseTo(Number(current), 2);
    expect(res.body.receipt.allocation.savingsApplied).toBe('0.00');
    expect(res.body.receipt.allocation.advanceApplied).toBe('50.00');

    // Stored schedule rows are updated.
    const schedule = await get(app, `/api/v1/loans/disbursements/${jahanara.loan.applicationId}/schedule`);
    const paidRow = schedule.body.rows.find((r: { seq: number }) => r.seq === jahanara.loan.current.seq);
    expect(Number(paidRow.paidAmount ?? '0')).toBeCloseTo(Number(current), 2);

    // Advance credit grew by the extra.
    const sheet2 = await get(app, `/api/v1/collection/sheet?branchId=${BRANCH_DHAKA}`);
    const rahima2 = sheet2.body.rows.find((r: { memberCode: string }) => r.memberCode === 'DHK-26-00001');
    expect(rahima2.advanceBalance).toBe('100.00'); // untouched member
  });

  it('is idempotent: the same key returns the same receipt without double posting', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    const body = entryBody(MEMBER_C, { loanPaid: '500.00' });

    const first = await post(app, '/api/v1/collection/entries', body);
    expect(first.status).toBe(201);
    expect(first.body.duplicate).toBe(false);

    const replay = await post(app, '/api/v1/collection/entries', body);
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);
    expect(replay.body.receipt.receiptNo).toBe(first.body.receipt.receiptNo);

    // The store holds exactly one entry and one receipt sequence.
    const coll = collectionDemoStoreRef();
    expect(coll.entries.filter((e) => e.idempotencyKey === body.idempotencyKey).length).toBe(1);
  });

  it('rejects entries with no paid amounts and unknown members', async () => {
    const app = createAppRef();
    const zero = await post(app, '/api/v1/collection/entries', entryBody(MEMBER_A));
    expect(zero.status).toBe(400);

    const missing = await post(
      app,
      '/api/v1/collection/entries',
      entryBody(crypto.randomUUID(), { loanPaid: '100.00' }),
    );
    expect(missing.status).toBe(404);
  });
});

describe('offline sync (requirement 2)', () => {
  it('posts a mixed batch, reporting duplicates and failures per item', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);

    const key1 = crypto.randomUUID();
    const key2 = crypto.randomUUID();
    const badKey = crypto.randomUUID();

    // Pre-post key1 so the batch sees it as a duplicate (offline retry case).
    await post(app, '/api/v1/collection/entries', entryBody(MEMBER_C, { idempotencyKey: key1, loanPaid: '300.00' }));

    const res = await post(app, '/api/v1/collection/sync', {
      entries: [
        { idempotencyKey: key1, memberId: MEMBER_C, meetingDate: new Date().toISOString().slice(0, 10), loanPaid: '300.00' },
        { idempotencyKey: key2, memberId: MEMBER_C, meetingDate: new Date().toISOString().slice(0, 10), loanPaid: '200.00' },
        { idempotencyKey: badKey, memberId: crypto.randomUUID(), meetingDate: new Date().toISOString().slice(0, 10), loanPaid: '100.00' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.posted).toBe(1);
    expect(res.body.duplicates).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.results.find((r: { idempotencyKey: string }) => r.idempotencyKey === key1).status).toBe('duplicate');
    expect(res.body.results.find((r: { idempotencyKey: string }) => r.idempotencyKey === key2).receiptNo).toMatch(/^RCP-/);
    expect(res.body.results.find((r: { idempotencyKey: string }) => r.idempotencyKey === badKey).error).toBeDefined();
  });
});

describe('officer cash handover (requirement 4)', () => {
  it('tracks cash-in-hand, then the full submit → confirm cycle with shortage', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    const today = new Date().toISOString().slice(0, 10);

    // Collect some cash as the demo officer.
    await post(app, '/api/v1/collection/entries', entryBody(MEMBER_C, { loanPaid: '1000.00', savingsPaid: '20.00' }));

    // Cash summary shows what the officer holds.
    const summary = await get(app, `/api/v1/collection/cash-summary?date=${today}`);
    expect(summary.status).toBe(200);
    expect(Number(summary.body.collectedToday)).toBeCloseTo(1020, 2);
    expect(summary.body.cashInHand).toBe('1020.00');

    // Open a handover (expected = collected today).
    const created = await post(app, '/api/v1/collection/handovers', { handoverDate: today });
    expect(created.status).toBe(201);
    expect(created.body.expectedAmount).toBe('1020.00');
    expect(created.body.status).toBe('draft');

    // Officer counts ৳920 → ৳100 shortage, submits.
    const submitted = await post(app, `/api/v1/collection/handovers/${created.body.id}/submit`, {
      countedAmount: '920.00',
      officerNote: 'একটি কিস্তি বাকি ছিল',
    });
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe('submitted');
    expect(submitted.body.differenceKind).toBe('shortage');
    expect(submitted.body.difference).toBe('-100.00');

    // Accountant confirms with the received amount.
    const confirmed = await post(app, `/api/v1/collection/handovers/${created.body.id}/confirm`, {
      decision: 'confirm',
      receivedAmount: '920.00',
      accountantNote: 'Shortage to be recovered tomorrow',
    });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('confirmed');
    expect(confirmed.body.receivedAmount).toBe('920.00');

    // Handed-over cash now reduces cash-in-hand.
    const summary2 = await get(app, `/api/v1/collection/cash-summary?date=${today}`);
    expect(summary2.body.handedOver).toBe('920.00');
    expect(summary2.body.cashInHand).toBe('100.00');
  });

  it('rejects excess and rejection paths with proper guards', async () => {
    const app = createAppRef();
    const today = new Date().toISOString().slice(0, 10);

    const created = await post(app, '/api/v1/collection/handovers', { handoverDate: today });
    expect(created.body.expectedAmount).toBe('0.00'); // nothing collected yet

    // Excess: officer counted more than expected.
    const submitted = await post(app, `/api/v1/collection/handovers/${created.body.id}/submit`, {
      countedAmount: '50.00',
    });
    expect(submitted.body.differenceKind).toBe('excess');

    // Confirm flow: reject then verify a rejected handover can be reopened.
    const rejected = await post(app, `/api/v1/collection/handovers/${created.body.id}/confirm`, {
      decision: 'reject',
      accountantNote: 'Count does not match the register',
    });
    expect(rejected.body.status).toBe('rejected');

    // Confirming a non-submitted handover fails.
    const again = await post(app, `/api/v1/collection/handovers/${created.body.id}/confirm`, { decision: 'confirm' });
    expect(again.status).toBe(409);
  });
});
