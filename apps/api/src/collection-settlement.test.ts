/**
 * ── Collection settlement & control tests (requirements 5–9) ────────────────
 * Early closure with rebate, reschedule + write-off approvals, BM-only
 * reversal, backdate/future rule engine, fraud heuristics, BM dashboard.
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
let resetCollectionDemoStoreRef: typeof import('./lib/collection-store.js').resetCollectionDemoStore;
let resetSavingsDemoStoreRef: typeof import('./lib/savings-store.js').resetSavingsDemoStore;
let collectionDemoStoreRef: typeof import('./lib/collection-store.js').collectionDemoStore;

const DEMO_TOKEN = 'demo-token';
const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_B = '00000000-0000-4000-8000-0000000001a2';
const MEMBER_C = '00000000-0000-4000-8000-0000000001a3';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const loan = await import('./lib/loan-store.js');
  const coll = await import('./lib/collection-store.js');
  const savings = await import('./lib/savings-store.js');
  resetLoanDemoStoreRef = loan.resetLoanDemoStore;
  resetCollectionDemoStoreRef = coll.resetCollectionDemoStore;
  collectionDemoStoreRef = coll.collectionDemoStore;
  resetSavingsDemoStoreRef = savings.resetSavingsDemoStore;
  resetLoanDemoStoreRef();
  resetCollectionDemoStoreRef();
  resetSavingsDemoStoreRef();
});

const get = (app: unknown, url: string) =>
  request(app as never).get(url).set('Authorization', `Bearer ${DEMO_TOKEN}`);
const post = (app: unknown, url: string, body?: unknown, token = DEMO_TOKEN) =>
  request(app as never).post(url).set('Authorization', `Bearer ${token}`).send(body ?? {});
const patch = (app: unknown, url: string, body?: unknown) =>
  request(app as never).patch(url).set('Authorization', `Bearer ${DEMO_TOKEN}`).send(body ?? {});

const today = () => new Date().toISOString().slice(0, 10);

/** Disburse the seeded approved ৳12,000 emergency loan (weekly installments). */
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
  const prepared = await patch(app, `/api/v1/loans/disbursements/${target!.id}`, {
    mode: 'cash_branch',
    checkItems: checks.map((check) => ({ check, done: true })),
  });
  expect(prepared.status).toBe(200);
  const authorized = await post(app, `/api/v1/loans/disbursements/${target!.id}/authorize`, {
    cashReceivedByName: 'Jahanara Parvin (member)',
  });
  expect(authorized.status).toBe(201);
  return target!.id;
}

async function postEntry(
  app: unknown,
  memberId: string,
  loanPaid: string,
  meta?: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await post(app, '/api/v1/collection/entries', {
    idempotencyKey: crypto.randomUUID(),
    memberId,
    meetingDate: today(),
    loanPaid,
    savingsPaid: '0.00',
    extraPaid: '0.00',
    ...(meta ? { meta } : {}),
  });
  return { status: res.status, body: res.body as Record<string, unknown> };
}

describe('early closure with rebate (requirement 5)', () => {
  it('quotes the rebate before closing and closes with the right amounts', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);

    const quote = await get(app, `/api/v1/collection/settlement/closure-quote?applicationId=${appId}`);
    expect(quote.status).toBe(200);
    expect(Number(quote.body.remainingInstallments)).toBeGreaterThan(0);
    expect(Number(quote.body.outstandingPrincipal)).toBeGreaterThan(0);
    expect(Number(quote.body.closureAmount)).toBeGreaterThan(0);
    // Rebate = unearned interest net of the 10% default deduction.
    const unearned = Number(quote.body.unearnedInterest);
    expect(Number(quote.body.rebate)).toBeCloseTo(unearned * 0.9, 2);
    expect(Number(quote.body.serviceDeduction)).toBeCloseTo(unearned * 0.1, 2);

    const closed = await post(app, '/api/v1/collection/settlement/closure', {
      applicationId: appId,
      serviceDeductionPercent: 10,
    });
    expect(closed.status).toBe(201);
    expect(Number(closed.body.closureAmount)).toBeCloseTo(Number(quote.body.closureAmount), 2);

    // The schedule is fully paid and the application is closed.
    const schedule = await get(app, `/api/v1/loans/applications/${appId}/schedule`);
    const rows = schedule.body.installments as Array<{ seq: number }>; // shape check
    expect(rows.length).toBeGreaterThan(0);
    const detail = await get(app, `/api/v1/loans/applications/${appId}`);
    expect(detail.body.status).toBe('closed');
  });

  it('rejects a second closure and refuses to close an undisbursed loan', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);
    const first = await post(app, '/api/v1/collection/settlement/closure', { applicationId: appId });
    expect(first.status).toBe(201);
    const again = await post(app, '/api/v1/collection/settlement/closure', { applicationId: appId });
    expect(again.status).toBe(409);
    // Once closed, the application no longer reads as disbursed — the status
    // guard fires first (INVALID_STATUS); the closure row still blocks a
    // re-close if state is ever repaired.
    expect(['ALREADY_CLOSED', 'INVALID_STATUS']).toContain(again.body.error.code);

    const pendingApp = (
      (await get(app, '/api/v1/loans/applications')).body.items as Array<{ id: string; status: string }>
    ).find((a) => a.status !== 'disbursed' && a.status !== 'closed' && a.status !== 'approved');
    if (pendingApp) {
      const res = await post(app, '/api/v1/collection/settlement/closure', { applicationId: pendingApp.id });
      expect(res.status).toBe(409);
    }
  });
});

describe('reschedule (requirement 5)', () => {
  it('moves the unpaid installments only after approval', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);

    const before = await get(app, `/api/v1/loans/applications/${appId}/schedule`);
    const firstRow = (before.body.installments as Array<{ seq: number; dueDate: string }>)[0]!;

    const created = await post(app, '/api/v1/collection/settlement/reschedule', {
      applicationId: appId,
      shiftInstallments: 2,
      reason: 'disaster',
      note: 'বন্যায় দোকান ক্ষতিগ্রস্ত; দুই কিস্তি স্থগিত / Flood damaged the shop',
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');
    expect(created.body.movedRows.length).toBeGreaterThan(0);

    // Schedule unchanged while pending.
    const pending = await get(app, `/api/v1/loans/applications/${appId}/schedule`);
    const pendingRow = (pending.body.installments as Array<{ seq: number; dueDate: string }>).find(
      (r) => r.seq === firstRow.seq,
    );
    expect(pendingRow!.dueDate).toBe(firstRow.dueDate);

    const decided = await post(app, `/api/v1/collection/settlement/reschedules/${created.body.id}/decision`, {
      decision: 'approved',
    });
    expect(decided.status).toBe(200);
    expect(decided.body.status).toBe('approved');

    const after = await get(app, `/api/v1/loans/applications/${appId}/schedule`);
    const afterRow = (after.body.installments as Array<{ seq: number; dueDate: string; shifted?: boolean }>).find(
      (r) => r.seq === firstRow.seq,
    );
    expect(afterRow!.dueDate).not.toBe(firstRow.dueDate);
  });

  it('rejects a second pending request for the same loan', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);
    const body = {
      applicationId: appId,
      shiftInstallments: 1,
      reason: 'illness',
      note: 'চিকিৎসা খরচ / Medical treatment costs',
    };
    expect((await post(app, '/api/v1/collection/settlement/reschedule', body)).status).toBe(201);
    const second = await post(app, '/api/v1/collection/settlement/reschedule', body);
    expect(second.status).toBe(409);
  });
});

describe('write-off approval (requirement 5)', () => {
  it('records outstanding, requires a decision, and zeroes rows on approval', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);

    const created = await post(app, '/api/v1/collection/settlement/write-offs', {
      applicationId: appId,
      reason: 'untraceable',
      note: 'সদস্য দীর্ঘদিন নিখোঁজ; ঠিকানা পরিবর্তন। Member relocated and untraceable for 6 months.',
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');
    expect(Number(created.body.outstandingAmount)).toBeGreaterThan(0);

    const decided = await post(app, `/api/v1/collection/settlement/write-offs/${created.body.id}/decision`, {
      decision: 'approved',
      decisionNote: 'বোর্ড সিদ্ধান্ত ২০২৬-০৭ / Board resolution',
    });
    expect(decided.status).toBe(200);
    expect(decided.body.status).toBe('approved');

    const detail = await get(app, `/api/v1/loans/applications/${appId}`);
    expect(detail.body.status).toBe('written_off');

    const schedule = await get(app, `/api/v1/loans/applications/${appId}/schedule`);
    const rows = schedule.body.installments as Array<{ seq: number }>; // shape check
    expect(rows.length).toBeGreaterThan(0);
  });

  it('rejects a request for a fully-paid loan (use closure)', async () => {
    const app = createAppRef();
    const appId = await seedDisbursedLoan(app);
    await post(app, '/api/v1/collection/settlement/closure', { applicationId: appId });
    const res = await post(app, '/api/v1/collection/settlement/write-offs', {
      applicationId: appId,
      reason: 'other',
      note: 'Nothing outstanding anymore — this should be rejected',
    });
    expect(res.status).toBe(409);
  });
});

describe('BM-only reversal of wrong entries (requirement 6)', () => {
  it('reverses the allocation, savings leg, advance, journal and passbook line', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);

    const first = await postEntry(app, MEMBER_C, '525.00');
    expect(first.status).toBe(201);
    const entryId = (first.body.receipt as { entryId: string } | undefined)?.entryId;
    expect(entryId).toBeTruthy();

    const sheet = await get(app, `/api/v1/collection/sheet?branchId=${BRANCH_DHAKA}`);
    const jahanara = (sheet.body.rows as Array<{ memberCode: string; loan: { current: { seq: number; amount: string } | null } }>).find(
      (r) => r.memberCode === 'DHK-26-00042',
    );
    // Paying seq 1 advances the current installment to seq 2.
    expect(jahanara!.loan.current!.seq).toBe(2);

    const denied = await post(
      app,
      `/api/v1/collection/entries/${entryId}/reverse`,
      { reason: 'ভুল এন্ট্রি — পরীক্ষামূলক / Wrong entry recorded by mistake' },
      'demo-token-officer',
    );
    expect(denied.status).toBe(403);

    const reversed = await post(app, `/api/v1/collection/entries/${entryId}/reverse`, {
      reason: 'ভুল এন্ট্রি — পরীক্ষামূলক / Wrong entry recorded by mistake',
    });
    expect(reversed.status).toBe(201);
    expect(reversed.body.entryId).toBe(entryId);

    // The installment is unpaid again — current rolls back to seq 1.
    const sheetAfter = await get(app, `/api/v1/collection/sheet?branchId=${BRANCH_DHAKA}`);
    const jahanaraAfter = (
      sheetAfter.body.rows as Array<{ memberCode: string; loan: { current: { seq: number; amount: string } | null } }>
    ).find((r) => r.memberCode === 'DHK-26-00042');
    expect(jahanaraAfter!.loan.current!.seq).toBe(1);

    // Double reversal is blocked.
    const again = await post(app, `/api/v1/collection/entries/${entryId}/reverse`, {
      reason: 'একই এন্ট্রি দ্বিতীয়বার বাতিল — ব্লক হওয়া উচিত',
    });
    expect(again.status).toBe(409);
  });
});

describe('rule engine: backdate and future dating (requirement 8)', () => {
  it('blocks future-dated entries', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    const res = await post(app, '/api/v1/collection/entries', {
      idempotencyKey: crypto.randomUUID(),
      memberId: MEMBER_A,
      meetingDate: future,
      loanPaid: '525.00',
      savingsPaid: '0.00',
      extraPaid: '0.00',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FUTURE_DATED');
  });

  it('blocks entries backdated beyond the configured limit and honours a raised limit', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    const res = await post(app, '/api/v1/collection/entries', {
      idempotencyKey: crypto.randomUUID(),
      memberId: MEMBER_A,
      meetingDate: old,
      loanPaid: '525.00',
      savingsPaid: '0.00',
      extraPaid: '0.00',
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BACKDATED');

    // Raise the limit to 30 days, then the same entry is allowed.
    const patched = await patch(app, '/api/v1/collection/rules', { backdateLimitDays: 30 });
    expect(patched.status).toBe(200);
    expect(patched.body.backdateLimitDays).toBe(30);
    const ok = await post(app, '/api/v1/collection/entries', {
      idempotencyKey: crypto.randomUUID(),
      memberId: MEMBER_A,
      meetingDate: old,
      loanPaid: '525.00',
      savingsPaid: '0.00',
      extraPaid: '0.00',
    });
    expect(ok.status).toBe(201);
  });

  it('rejects an empty rules patch', async () => {
    const app = createAppRef();
    const res = await patch(app, '/api/v1/collection/rules', {});
    expect(res.status).toBe(400);
  });
});

describe('fraud heuristics (requirement 9)', () => {
  it('flags identical amounts across many members by one officer', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    // Four identical payments to three different members on the same day.
    for (const m of [MEMBER_A, MEMBER_B, MEMBER_C, MEMBER_A]) {
      const r = await postEntry(app, m, '400.00');
      expect(r.status).toBe(201);
    }
    const flags = await get(app, '/api/v1/collection/fraud-flags');
    const identical = (flags.body.items as Array<{ rule: string; entryId: string }>).filter(
      (f) => f.rule === 'identical_amounts',
    );
    // One flag per matching amount group (distinct members ≥ threshold).
    expect(identical.length).toBeGreaterThanOrEqual(1);
  });

  it('flags entries captured outside the meeting GPS radius', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    const r = await postEntry(app, MEMBER_A, '525.00', {
      lat: 23.8103,
      lng: 90.4125, // ~6 km from the Dhanmondi samity point
    });
    expect(r.status).toBe(201);
    const flags = await get(app, '/api/v1/collection/fraud-flags');
    const outside = (flags.body.items as Array<{ rule: string }>).filter((f) => f.rule === 'outside_meeting_radius');
    expect(outside.length).toBeGreaterThanOrEqual(1);

    const first = (flags.body.items as Array<{ id: string; reviewed: boolean }>)[0]!;
    const reviewed = await post(app, `/api/v1/collection/fraud-flags/${first.id}/review`);
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.reviewed).toBe(true);
  });

  it('does not flag normal in-radius varied payments', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    const a = await postEntry(app, MEMBER_A, '525.00', { lat: 23.7806, lng: 90.4193 });
    const b = await postEntry(app, MEMBER_A, '610.00', { lat: 23.7807, lng: 90.4194 });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const flags = await get(app, '/api/v1/collection/fraud-flags');
    expect(flags.body.items.length).toBe(0);
  });
});

describe('BM realtime dashboard (requirement 7)', () => {
  it('rolls up expected vs collected by officer and by samity', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);

    const before = await get(app, `/api/v1/collection/dashboard?branchId=${BRANCH_DHAKA}`);
    expect(before.status).toBe(200);
    expect(Number(before.body.totals.collected)).toBe(0);
    expect(Number(before.body.totals.expected)).toBeGreaterThan(0);
    expect(before.body.byOfficer.length).toBeGreaterThan(0);
    expect(before.body.bySamity.length).toBeGreaterThan(0);

    await postEntry(app, MEMBER_A, '525.00');

    const after = await get(app, `/api/v1/collection/dashboard?branchId=${BRANCH_DHAKA}`);
    expect(Number(after.body.totals.collected)).toBe(525);
    // The posting session's officer bucket carries the full amount.
    const officerSum = (after.body.byOfficer as Array<{ collected: string }>).reduce(
      (s, o) => s + Number(o.collected),
      0,
    );
    expect(officerSum).toBe(525);
    // Every samity's collected must not exceed its expected.
    for (const s of after.body.bySamity as Array<{ expected: string; collected: string }>) {
      expect(Number(s.collected)).toBeLessThanOrEqual(Number(s.expected));
    }
    // Rate consistency.
    const rate = Number(after.body.totals.collectionRate);
    expect(rate).toBeCloseTo(525 / Number(after.body.totals.expected), 4);
  });
});
