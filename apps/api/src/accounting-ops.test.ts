/**
 * ── Accounting ops tests (requirements 6–10) ─────────────────────────────────
 * Requisition lifecycle with matching entries, savings-restriction rule,
 * financial reports, period close + reopen, bilingual voucher print data.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;
let resetAccountingStoreRef: typeof import('./lib/accounting-store.js').resetAccountingDemoStore;

const HO = '00000000-0000-4000-8000-0000000000a0';
const DHAKA = '00000000-0000-4000-8000-0000000000b1';
const MYM = '00000000-0000-4000-8000-0000000000b2';

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const acc = await import('./lib/accounting-store.js');
  resetAccountingStoreRef = acc.resetAccountingDemoStore;
  resetAccountingStoreRef();
});

const auth = { Authorization: 'Bearer demo-token' };
const today = new Date().toISOString().slice(0, 10);

const post = (app: unknown, url: string, body?: unknown) =>
  request(app as never).post(url).set(auth).send(body ?? {});
const get = (app: unknown, url: string) => request(app as never).get(url).set(auth);

/** Reports read only approved vouchers — create + check + approve in one step. */
async function postApproved(app: unknown, body: Record<string, unknown>) {
  const created = await post(app, '/api/v1/accounting/vouchers', body);
  expect(created.status).toBe(201);
  await post(app, `/api/v1/accounting/vouchers/${created.body.id as string}/check`, { note: 'test' });
  await post(app, `/api/v1/accounting/vouchers/${created.body.id as string}/approve`, { note: 'test' });
  return created;
}

describe('fund requisitions & inter-branch transfers (req 6)', () => {
  it('walks the full lifecycle: request → approve → disburse → receive', async () => {
    const created = await post(createAppRef(), '/api/v1/accounting/requisitions', {
      kind: 'branch_to_ho',
      fromNodeId: DHAKA,
      toNodeId: HO,
      amount: '5000.00',
      purpose: 'Weekly cash sweep to head office',
      settlementCode: '1010',
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body.status).toBe('requested');

    const approved = await post(createAppRef(), `/api/v1/accounting/requisitions/${id}/decision`, { decision: 'approve' });
    expect(approved.body.status).toBe('approved');

    const disbursed = await post(createAppRef(), `/api/v1/accounting/requisitions/${id}/disburse`);
    expect(disbursed.body.status).toBe('disbursed');
    expect(disbursed.body.outVoucherNumber).toMatch(/^JV-/);

    // Matching entries booked: the disbursement voucher must be balanced.
    const number = disbursed.body.outVoucherNumber as string;
    const vouchers = await get(createAppRef(), '/api/v1/accounting/vouchers');
    const voucher = vouchers.body.items.find((v: { voucherNumber: string }) => v.voucherNumber === number);
    expect(voucher).toBeTruthy();
    const debit = voucher.lines.reduce((s: number, l: { debit: string }) => s + Number(l.debit), 0);
    const credit = voucher.lines.reduce((s: number, l: { credit: string }) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(credit, 2);
    expect(debit).toBeCloseTo(5000 * 2, 2); // double-sided booking

    const received = await post(createAppRef(), `/api/v1/accounting/requisitions/${id}/receive`);
    expect(received.body.status).toBe('received');
  });

  it('rejects disbursement before approval and duplicate decisions', async () => {
    const created = await post(createAppRef(), '/api/v1/accounting/requisitions', {
      kind: 'ho_to_branch',
      fromNodeId: HO,
      toNodeId: MYM,
      amount: '1200.00',
      purpose: 'Branch cash top-up',
      settlementCode: '1010',
    });
    const id = created.body.id as string;
    const early = await post(createAppRef(), `/api/v1/accounting/requisitions/${id}/disburse`);
    expect(early.status).toBe(409);

    await post(createAppRef(), `/api/v1/accounting/requisitions/${id}/decision`, { decision: 'approve' });
    const again = await post(createAppRef(), `/api/v1/accounting/requisitions/${id}/decision`, { decision: 'reject' });
    expect(again.status).toBe(409);
  });

  it('rejects self-requisition', async () => {
    const r = await post(createAppRef(), '/api/v1/accounting/requisitions', {
      kind: 'inter_branch',
      fromNodeId: DHAKA,
      toNodeId: DHAKA,
      amount: '100.00',
      purpose: 'Invalid self transfer',
      settlementCode: '1010',
    });
    expect(r.status).toBe(400);
  });
});

describe('savings posting rule (req 7)', () => {
  it('blocks a voucher crediting savings to fund an expense', async () => {
    const r = await post(createAppRef(), '/api/v1/accounting/vouchers', {
      branchId: DHAKA,
      voucherType: 'journal',
      voucherDate: today,
      memo: 'Buy office rent from member savings',
      lines: [
        { accountCode: '6110', debit: '800.00', credit: '0.00' },
        { accountCode: '2100', debit: '0.00', credit: '800.00' },
      ],
    });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('POSTING_RULE_VIOLATION');
  });

  it('blocks a voucher crediting savings to fund a fixed asset', async () => {
    const r = await post(createAppRef(), '/api/v1/accounting/vouchers', {
      branchId: DHAKA,
      voucherType: 'journal',
      voucherDate: today,
      memo: 'Buy computer with member savings',
      lines: [
        { accountCode: '1500', debit: '30000.00', credit: '0.00' },
        { accountCode: '2100', debit: '0.00', credit: '30000.00' },
      ],
    });
    expect(r.status).toBe(422);
  });

  it('allows a normal deposit settlement (cash debit / savings credit)', async () => {
    const r = await post(createAppRef(), '/api/v1/accounting/vouchers', {
      branchId: DHAKA,
      voucherType: 'cash_receipt',
      voucherDate: today,
      memo: 'Member savings deposit at counter',
      lines: [
        { accountCode: '1010', debit: '500.00', credit: '0.00' },
        { accountCode: '2100', debit: '0.00', credit: '500.00' },
      ],
    });
    expect(r.status).toBe(201);
  });
});

describe('financial reports (req 8)', () => {
  it('exposes ledger with a running balance after activity', async () => {
    await postApproved(createAppRef(), {
      branchId: DHAKA,
      voucherType: 'cash_receipt',
      voucherDate: today,
      memo: 'Fee collected',
      lines: [
        { accountCode: '1010', debit: '400.00', credit: '0.00' },
        { accountCode: '4200', debit: '0.00', credit: '400.00' },
      ],
    });
    const r = await get(createAppRef(), '/api/v1/accounting/ledger/1010');
    expect(r.status).toBe(200);
    expect(r.body.account.code).toBe('1010');
    expect(r.body.rows.length).toBeGreaterThan(0);
    expect(r.body.closing).toBe('400.00');
  });

  it('builds receipts & payments and income & expenditure from the same activity', async () => {
    await postApproved(createAppRef(), {
      branchId: DHAKA,
      voucherType: 'cash_receipt',
      voucherDate: today,
      memo: 'Fee collected',
      lines: [
        { accountCode: '1010', debit: '400.00', credit: '0.00' },
        { accountCode: '4200', debit: '0.00', credit: '400.00' },
      ],
    });
    await postApproved(createAppRef(), {
      branchId: DHAKA,
      voucherType: 'cash_payment',
      voucherDate: today,
      memo: 'Travel advance settled',
      lines: [
        { accountCode: '6130', debit: '150.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '150.00' },
      ],
    });
    const rp = await get(createAppRef(), `/api/v1/accounting/reports/receipts-payments?start=${today}&end=${today}`);
    expect(rp.body.totalIn).toBe('400.00');
    expect(rp.body.totalOut).toBe('150.00');
    expect(rp.body.closingCash).toBe('250.00');

    const ie = await get(createAppRef(), `/api/v1/accounting/reports/income-expenditure?start=${today}&end=${today}`);
    expect(ie.body.totalIncome).toBe('400.00');
    expect(ie.body.totalExpenditure).toBe('150.00');
    expect(ie.body.surplus).toBe('250.00');
  });

  it('balance sheet balances with retained surplus', async () => {
    await postApproved(createAppRef(), {
      branchId: DHAKA,
      voucherType: 'cash_receipt',
      voucherDate: today,
      memo: 'Fee collected',
      lines: [
        { accountCode: '1010', debit: '400.00', credit: '0.00' },
        { accountCode: '4200', debit: '0.00', credit: '400.00' },
      ],
    });
    const bs = await get(createAppRef(), `/api/v1/accounting/reports/balance-sheet?asOf=${today}`);
    expect(bs.body.balanced).toBe(true);
    expect(Number(bs.body.totalAssets)).toBeCloseTo(Number(bs.body.totalLiabilities) + Number(bs.body.totalFunds), 2);
  });

  it('budget vs actual compares seeded budgets with actual spend', async () => {
    await postApproved(createAppRef(), {
      branchId: DHAKA,
      voucherType: 'cash_payment',
      voucherDate: today,
      memo: 'Salary paid',
      lines: [
        { accountCode: '6100', debit: '1200.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '1200.00' },
      ],
    });
    const month = today.slice(0, 7);
    const r = await get(createAppRef(), `/api/v1/accounting/reports/budget-vs-actual?start=${month}-01&end=${today}`);
    const salary = r.body.lines.find((l: { accountCode: string }) => l.accountCode === '6100');
    expect(salary).toBeTruthy();
    expect(salary.budgeted).toBe('5000.00');
    expect(salary.actual).toBe('1200.00');
    expect(salary.variance).toBe('3800.00');
  });

  it('stores and replaces budget lines per period', async () => {
    const put = await request(createAppRef() as never)
      .put('/api/v1/accounting/budgets')
      .set(auth)
      .send({ periodStart: '2026-09-01', periodEnd: '2026-09-30', lines: [{ accountCode: '6130', amount: '900.00' }] });
    expect(put.status).toBe(200);
    expect(put.body.items).toHaveLength(1);
    const bad = await request(createAppRef() as never)
      .put('/api/v1/accounting/budgets')
      .set(auth)
      .send({ periodStart: '2026-09-01', periodEnd: '2026-09-30', lines: [{ accountCode: '9999', amount: '900.00' }] });
    expect(bad.status).toBe(400);
  });
});

describe('period close (req 9)', () => {
  it('closes a period, locks new vouchers into it, then reopens with note', async () => {
    await post(createAppRef(), '/api/v1/accounting/vouchers', {
      branchId: DHAKA,
      voucherType: 'cash_receipt',
      voucherDate: today,
      memo: 'Fee collected',
      lines: [
        { accountCode: '1010', debit: '100.00', credit: '0.00' },
        { accountCode: '4200', debit: '0.00', credit: '100.00' },
      ],
    });
    const month = today.slice(0, 7);
    const close = await post(createAppRef(), '/api/v1/accounting/period-closes', {
      kind: 'monthly',
      periodStart: `${month}-01`,
      periodEnd: today,
    });
    expect(close.status).toBe(201);
    expect(close.body.snapshot.balanced).toBe(true);

    // Locked: a voucher dated inside the closed period is rejected.
    const blocked = await post(createAppRef(), '/api/v1/accounting/vouchers', {
      branchId: DHAKA,
      voucherType: 'cash_payment',
      voucherDate: today,
      memo: 'Blocked after close',
      lines: [
        { accountCode: '6130', debit: '10.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '10.00' },
      ],
    });
    expect(blocked.status).toBe(423);
    expect(blocked.body.error.code).toBe('PERIOD_LOCKED');

    // A voucher outside the period still posts.
    const outside = await post(createAppRef(), '/api/v1/accounting/vouchers', {
      branchId: DHAKA,
      voucherType: 'cash_payment',
      voucherDate: '2030-01-15',
      memo: 'Future period still open',
      lines: [
        { accountCode: '6130', debit: '10.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '10.00' },
      ],
    });
    expect(outside.status).toBe(201);

    // Reopen requires a note; then the locked date posts again.
    const list = await get(createAppRef(), '/api/v1/accounting/period-closes');
    const id = list.body.items[0].id as string;
    const noNote = await post(createAppRef(), `/api/v1/accounting/period-closes/${id}/reopen`, { note: '' });
    expect(noNote.status).toBe(400);
    const reopen = await post(createAppRef(), `/api/v1/accounting/period-closes/${id}/reopen`, { note: 'Audit requested adjustments' });
    expect(reopen.status).toBe(200);
    const after = await post(createAppRef(), '/api/v1/accounting/vouchers', {
      branchId: DHAKA,
      voucherType: 'cash_payment',
      voucherDate: today,
      memo: 'Allowed after reopen',
      lines: [
        { accountCode: '6130', debit: '10.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '10.00' },
      ],
    });
    expect(after.status).toBe(201);
  });

  it('rejects duplicate close of the same period', async () => {
    const body = { kind: 'monthly', periodStart: '2026-08-01', periodEnd: '2026-08-31' };
    await post(createAppRef(), '/api/v1/accounting/period-closes', body);
    const second = await post(createAppRef(), '/api/v1/accounting/period-closes', body);
    expect(second.status).toBe(409);
  });
});

describe('bilingual voucher print data (req 10)', () => {
  it('voucher payload carries all fields the print views need', async () => {
    const created = await post(createAppRef(), '/api/v1/accounting/vouchers', {
      branchId: DHAKA,
      voucherType: 'cash_payment',
      voucherDate: today,
      payeePayer: 'Sonali Bank Ltd',
      memo: 'Utility bill payment',
      lines: [
        { accountCode: '6120', debit: '650.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '650.00' },
      ],
    });
    expect(created.status).toBe(201);
    const v = created.body;
    expect(v.voucherNumber).toMatch(/^CP-DHK-01-\d{2}-\d{4}$/);
    expect(v.payeePayer).toBe('Sonali Bank Ltd');
    expect(v.lines).toHaveLength(2);
    // check → approve so the print shows the signature blocks
    await post(createAppRef(), `/api/v1/accounting/vouchers/${v.id}/check`, { note: 'ok' });
    await post(createAppRef(), `/api/v1/accounting/vouchers/${v.id}/approve`, { note: 'ok' });
    const vouchers = await get(createAppRef(), '/api/v1/accounting/vouchers');
    const approved = vouchers.body.items.find((x: { id: string }) => x.id === v.id);
    expect(approved.status).toBe('approved');
    expect(approved.checkedBy).toBeTruthy();
    expect(approved.approvedBy).toBeTruthy();
  });
});
