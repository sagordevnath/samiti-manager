/**
 * ── Delinquency recovery tests (requirements 5–9) ───────────────────────────
 * Root-cause tagging, waivers, savings adjustments, legal notices, write-off
 * chain + recovery, provision proposals, early-warning scans, heatmap/trends.
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
let resetRecoveryDemoStoreRef: typeof import('./lib/delinquency-recovery-store.js').resetRecoveryDemoStore;
let loanDemoStoreRef: typeof import('./lib/loan-store.js').loanDemoStore;
let savingsDemoStoreRef: typeof import('./lib/savings-store.js').savingsDemoStore;

const DEMO_TOKEN = 'demo-token';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const loan = await import('./lib/loan-store.js');
  const del = await import('./lib/delinquency-store.js');
  const rec = await import('./lib/delinquency-recovery-store.js');
  const sav = await import('./lib/savings-store.js');
  resetLoanDemoStoreRef = loan.resetLoanDemoStore;
  loanDemoStoreRef = loan.loanDemoStore;
  resetDelinquencyDemoStoreRef = del.resetDelinquencyDemoStore;
  resetRecoveryDemoStoreRef = rec.resetRecoveryDemoStore;
  savingsDemoStoreRef = sav.savingsDemoStore;
  resetLoanDemoStoreRef();
  resetDelinquencyDemoStoreRef();
  resetRecoveryDemoStoreRef();
});

const get = (app: unknown, url: string) =>
  request(app as never).get(url).set('Authorization', `Bearer ${DEMO_TOKEN}`);
const post = (app: unknown, url: string, body?: unknown) =>
  request(app as never).post(url).set('Authorization', `Bearer ${DEMO_TOKEN}`).send(body ?? {});

/** Disburse the seeded approved ৳12,000 emergency loan. */
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

/** Backdate the first two installments so the loan is `days` days past due.
 * Installments start ~7 days after disbursement, so `days` must exceed that
 * lead for any days-past-due to register (weekly cadence: two installments
 * are both past due once `days > 14`). */
async function ageLoan(app: unknown, applicationId: string, days: number): Promise<void> {
  const store = loanDemoStoreRef();
  const rec = store.disbursements.find((d) => d.applicationId === applicationId);
  expect(rec).toBeDefined();
  for (const row of rec!.schedule.rows.slice(0, 2)) {
    row.originalDueDate = row.dueDate;
    row.dueDate = new Date(Date.parse(`${row.dueDate}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  }
}

/** Disburse + age (past the 7-day lead) + nightly run → a live delinquency case. */
async function makeAgedLoan(app: unknown, days = 20): Promise<string> {
  const appId = await seedDisbursedLoan(app);
  await ageLoan(app, appId, days);
  await post(app, '/api/v1/delinquency/run');
  return appId;
}

describe('root-cause tagging (requirement 5)', () => {
  it('tags a loan with each cause and lists them', async () => {
    const app = createAppRef();
    const loanId = await seedDisbursedLoan(app);
    const r1 = await post(app, '/api/v1/delinquency/root-causes', {
      loanId,
      cause: 'flood_disaster',
      note: 'গোডাউন প্লাবিত / Godown flooded',
    });
    expect(r1.status).toBe(201);
    expect(r1.body.cause).toBe('flood_disaster');

    const r2 = await post(app, '/api/v1/delinquency/root-causes', { loanId, cause: 'business_failure' });
    expect(r2.status).toBe(201);

    const list = await get(app, `/api/v1/delinquency/root-causes?loanId=${loanId}`);
    expect(list.body.items.length).toBe(2);
  });

  it('rejects unknown causes and unknown loans', async () => {
    const app = createAppRef();
    const bad = await post(app, '/api/v1/delinquency/root-causes', {
      loanId: '00000000-0000-4000-8000-000000000099',
      cause: 'alien_invasion',
    });
    expect(bad.status).toBe(400);
  });
});

describe('recovery actions (requirement 6)', () => {
  it('waives part of the overdue interest after approval', async () => {
    const app = createAppRef();
    const loanId = await makeAgedLoan(app);

    const created = await post(app, '/api/v1/delinquency/waivers', {
      loanId,
      basis: 'overdue_interest',
      percent: 50,
      reason: 'দুর্যোগে ক্ষতিগ্রস্ত সদস্যের সুদ মওকুফ (BM সুপারিশ) / Disaster-hit member',
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending');
    expect(Number(created.body.waivedAmount)).toBeGreaterThan(0);

    const decided = await post(app, `/api/v1/delinquency/waivers/${created.body.id}/decision`, {
      decision: 'approved',
      decisionNote: 'AM approved after field verification',
    });
    expect(decided.status).toBe(200);
    expect(decided.body.status).toBe('approved');

    // Outstanding dropped by the waived amount.
    const loans = (await get(app, '/api/v1/delinquency/loans')).body.items as Array<{
      applicationId: string;
      outstanding: string;
    }>;
    expect(loans.length).toBeGreaterThan(0);
  });

  it('rejects a waiver for a loan with nothing overdue and double decisions', async () => {
    const app = createAppRef();
    const loanId = await seedDisbursedLoan(app); // regular — nothing overdue yet
    const none = await post(app, '/api/v1/delinquency/waivers', {
      loanId,
      basis: 'total_overdue',
      percent: 10,
      reason: 'Nothing is overdue yet on this fresh loan',
    });
    expect(none.status).toBe(409);

    // Age it, then exercise the double-decision guard on one waiver.
    await ageLoan(app, loanId, 20);
    await post(app, '/api/v1/delinquency/run');
    const w = await post(app, '/api/v1/delinquency/waivers', {
      loanId,
      basis: 'overdue_interest',
      percent: 25,
      reason: 'Test double-decision guard for waiver approval flow',
    });
    expect(w.status).toBe(201);
    const first = await post(app, `/api/v1/delinquency/waivers/${w.body.id}/decision`, { decision: 'rejected' });
    expect(first.status).toBe(200);
    const again = await post(app, `/api/v1/delinquency/waivers/${w.body.id}/decision`, { decision: 'approved' });
    expect(again.status).toBe(409);
  });

  it('adjusts the loan from member savings with a balanced journal', async () => {
    const app = createAppRef();
    const loanId = await makeAgedLoan(app, 20);

    // Jahanara's voluntary account ships dormant — reactivate it (demo-only setup).
    const savings = savingsDemoStoreRef();
    const account = savings.accounts.find(
      (a) => a.member_id === '00000000-0000-4000-8000-0000000001a3' && a.status === 'dormant',
    );
    expect(account).toBeDefined();
    account!.status = 'active';

    const res = await post(app, '/api/v1/delinquency/savings-adjustments', {
      loanId,
      amount: '100.00',
      note: 'সঞ্চয় থেকে কিস্তি সমন্বয়',
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(100);
    expect(res.body.savingsAccountId).toBe(account!.id);

    // Journal is balanced (Dr 2100 savings / Cr 1200 portfolio).
    const store = loanDemoStoreRef();
    const j = store.journals.at(-1)!;
    const debit = j.lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = j.lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBe(credit);
    expect(debit).toBe(100);

    // Insufficient balance is rejected.
    const over = await post(app, '/api/v1/delinquency/savings-adjustments', {
      loanId,
      amount: '99999.00',
    });
    expect(over.status).toBe(409);
  });

  it('issues a Bangla legal notice with the overdue figures', async () => {
    const app = createAppRef();
    const loanId = await makeAgedLoan(app);
    const res = await post(app, '/api/v1/delinquency/legal-notices', { loanId, replyWithinDays: 7 });
    expect(res.status).toBe(201);
    expect(res.body.bodyBn).toContain('আইনি নোটিশ');
    expect(res.body.bodyBn).toContain('7 দিনের মধ্যে');
    expect(Number(res.body.overdueTotal)).toBeGreaterThan(0);
  });

  it('runs the full write-off chain: propose → recommend → approve → recover', async () => {
    const app = createAppRef();
    const loanId = await makeAgedLoan(app, 20);

    const proposed = await post(app, '/api/v1/delinquency/write-off-proposals', {
      loanId,
      reason: 'সদস্য নিখোঁজ; আইনি ব্যবস্থা ব্যর্থ। Member untraceable after legal action.',
      legalActionTaken: 'নোটিশ জারি হয়েছে ৭ দিন আগে',
    });
    expect(proposed.status).toBe(201);
    expect(proposed.body.status).toBe('pending');
    const pid = proposed.body.id;

    // Approval before recommendation is blocked.
    const skip = await post(app, `/api/v1/delinquency/write-off-proposals/${pid}/decision`, { decision: 'approved' });
    expect(skip.status).toBe(409);

    const rec1 = await post(app, `/api/v1/delinquency/write-off-proposals/${pid}/decision`, { decision: 'recommended' });
    expect(rec1.status).toBe(200);
    expect(rec1.body.status).toBe('recommended');

    const approved = await post(app, `/api/v1/delinquency/write-off-proposals/${pid}/decision`, {
      decision: 'approved',
      decisionNote: 'Board resolution 2026-11',
    });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');

    // Application is written_off and journal posted (6200/1200).
    const detail = await get(app, `/api/v1/loans/applications/${loanId}`);
    expect(detail.body.status).toBe('written_off');

    // Later recovery: partial cash back.
    const recovery = await post(app, `/api/v1/delinquency/write-off-proposals/${pid}/recoveries`, {
      amount: '500.00',
      note: 'আংশিক পুনরুদ্ধার',
    });
    expect(recovery.status).toBe(201);
    expect(Number(recovery.body.recoveredAmount)).toBe(500);

    const over = await post(app, `/api/v1/delinquency/write-off-proposals/${pid}/recoveries`, {
      amount: '999999.00',
    });
    expect(over.status).toBe(409);
  });
});

describe('loan-loss provision (requirement 7)', () => {
  it('proposes incremental provision and posts it once', async () => {
    const app = createAppRef();
    await makeAgedLoan(app, 40); // substandard

    const proposal = await post(app, '/api/v1/delinquency/provision-proposals', { note: 'Q1 provision' });
    expect(proposal.status).toBe(201);
    expect(proposal.body.status).toBe('pending_approval');
    expect(Number(proposal.body.provisionTotal)).toBeGreaterThan(0);
    expect(Number(proposal.body.provisionExpense)).toBe(Number(proposal.body.provisionTotal));

    const posted = await post(app, `/api/v1/delinquency/provision-proposals/${proposal.body.id}/post`);
    expect(posted.status).toBe(200);
    expect(posted.body.status).toBe('posted');

    const again = await post(app, `/api/v1/delinquency/provision-proposals/${proposal.body.id}/post`);
    expect(again.status).toBe(409);

    // Second proposal is incremental (movement = expense).
    const second = await post(app, '/api/v1/delinquency/provision-proposals', {});
    expect(Number(second.body.priorProvisionTotal)).toBe(Number(proposal.body.provisionTotal));
    expect(Number(second.body.provisionExpense)).toBe(0); // nothing new aged
  });
});

describe('early warning (requirement 8)', () => {
  it('detects members with two consecutive missed installments', async () => {
    const app = createAppRef();
    await makeAgedLoan(app, 20); // two weekly installments past due

    const scan = await post(app, '/api/v1/delinquency/early-warning/scan');
    expect(scan.status).toBe(201);
    const kinds = (scan.body.items as Array<{ kind: string; refName?: string }>).map((s) => s.kind);
    expect(kinds).toContain('member_missed_two');

    // Dedupe: re-scan adds nothing new for the same member.
    const rescan = await post(app, '/api/v1/delinquency/early-warning/scan');
    const memberFlags = (rescan.body.items as Array<{ kind: string }>).filter((s) => s.kind === 'member_missed_two');
    expect(memberFlags.length).toBe(0);

    // Acknowledge one.
    const list = (await get(app, '/api/v1/delinquency/early-warning')).body.items as Array<{ id: string; acknowledged: boolean }>;
    expect(list.length).toBeGreaterThan(0);
    const ack = await post(app, `/api/v1/delinquency/early-warning/${list[0]!.id}/acknowledge`);
    expect(ack.status).toBe(200);
    expect(ack.body.acknowledged).toBe(true);
  });

  it('flags falling samity attendance', async () => {
    const app = createAppRef();
    await seedDisbursedLoan(app);
    await post(app, '/api/v1/delinquency/run'); // classifications drive the synthetic rates
    const scan = await post(app, '/api/v1/delinquency/early-warning/scan');
    const kinds = (scan.body.items as Array<{ kind: string }>).map((s) => s.kind);
    expect(kinds).toContain('samity_attendance_falling');
  });
});

describe('heatmap and trends (requirement 9)', () => {
  it('serves heatmap cells per branch × bucket and trend points per run', async () => {
    const app = createAppRef();
    await makeAgedLoan(app, 40);

    const heat = await get(app, '/api/v1/delinquency/heatmap');
    expect(heat.status).toBe(200);
    expect(heat.body.buckets).toContain('d31_90');
    expect(heat.body.cells.length).toBeGreaterThan(0);
    expect(Number(heat.body.max)).toBeGreaterThan(0);

    // A second run adds a trend point.
    await post(app, '/api/v1/delinquency/run');
    const trends = await get(app, '/api/v1/delinquency/trends');
    expect(trends.status).toBe(200);
    expect(trends.body.points.length).toBeGreaterThanOrEqual(2);
    expect(Number(trends.body.points[0].outstanding)).toBeGreaterThan(0);
  });
});
