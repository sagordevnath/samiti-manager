/**
 * ── Accounting module tests ──────────────────────────────────────────────────
 * Chart of accounts CRUD + coding conflicts, voucher workflow (draft → checked
 * → approved, auto-numbering, balance validation), event-map auto-postings,
 * daily cash book with counting + day-end locking, bank reconciliation, and
 * the petty-cash register with limits.
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
let accountingStoreRef: typeof import('./lib/accounting-store.js').accountingDemoStore;

const DEMO_TOKEN = 'demo-token';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const acc = await import('./lib/accounting-store.js');
  resetAccountingStoreRef = acc.resetAccountingDemoStore;
  accountingStoreRef = acc.accountingDemoStore;
  resetAccountingStoreRef();
});

const get = (app: unknown, url: string) => request(app as never).get(url).set('Authorization', `Bearer ${DEMO_TOKEN}`);
const post = (app: unknown, url: string, body?: unknown) =>
  request(app as never).post(url).set('Authorization', `Bearer ${DEMO_TOKEN}`).send(body ?? {});
const patch = (app: unknown, url: string, body?: unknown) =>
  request(app as never).patch(url).set('Authorization', `Bearer ${DEMO_TOKEN}`).send(body ?? {});

describe('accounting — chart of accounts', () => {
  it('lists the seeded default chart', async () => {
    const app = createAppRef();
    const res = await get(app, '/api/v1/accounting/accounts');
    expect(res.status).toBe(200);
    const codes = (res.body.items as Array<{ code: string }>).map((a) => a.code);
    expect(codes).toContain('1010'); // cash
    expect(codes).toContain('2100'); // member savings
    expect(codes).toContain('1200'); // loan portfolio
  });

  it('creates and updates an account; blocks duplicate codes', async () => {
    const app = createAppRef();
    const created = await post(app, '/api/v1/accounting/accounts', {
      code: '6140',
      name: 'Marketing Expense',
      nameBn: 'বিপণন ব্যয়',
      type: 'expense',
      category: 'expense',
    });
    expect(created.status).toBe(201);
    const dup = await post(app, '/api/v1/accounting/accounts', {
      code: '6140',
      name: 'Duplicate',
      nameBn: 'ডুপ্লিকেট',
      type: 'expense',
      category: 'expense',
    });
    expect(dup.status).toBe(409);
    const renamed = await patch(app, `/api/v1/accounting/accounts/${created.body.id}`, { nameBn: 'প্রচার ব্যয়' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.nameBn).toBe('প্রচার ব্যয়');
  });
});

describe('accounting — vouchers', () => {
  const balancedVoucher = {
    branchId: BRANCH_DHAKA,
    voucherType: 'cash_payment',
    voucherDate: '2026-09-23',
    payeePayer: 'Anwar Office Supply',
    memo: 'Stationery purchase for branch office',
    lines: [
      { accountCode: '1400', debit: '450.00', credit: '0.00' },
      { accountCode: '1010', debit: '0.00', credit: '450.00' },
    ],
  };

  it('walks draft → checked → approved with auto-numbering', async () => {
    const app = createAppRef();
    const created = await post(app, '/api/v1/accounting/vouchers', balancedVoucher);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('draft');
    expect(created.body.voucherNumber).toMatch(/^CP-DHK-01-26-\d{4}$/);

    const approvedEarly = await post(app, `/api/v1/accounting/vouchers/${created.body.id}/approve`);
    expect(approvedEarly.status).toBe(409); // must be checked first

    const checked = await post(app, `/api/v1/accounting/vouchers/${created.body.id}/check`, { note: 'receipts seen' });
    expect(checked.status).toBe(200);
    expect(checked.body.status).toBe('checked');

    const approved = await post(app, `/api/v1/accounting/vouchers/${created.body.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');
  });

  it('rejects unbalanced vouchers', async () => {
    const app = createAppRef();
    const res = await post(app, '/api/v1/accounting/vouchers', {
      ...balancedVoucher,
      lines: [
        { accountCode: '1400', debit: '500.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '450.00' },
      ],
    });
    expect(res.status).toBe(400);
  });

  it('numbers consecutive vouchers per branch/type/year', async () => {
    const app = createAppRef();
    const a = await post(app, '/api/v1/accounting/vouchers', balancedVoucher);
    const b = await post(app, '/api/v1/accounting/vouchers', balancedVoucher);
    const tailA = Number((a.body.voucherNumber as string).slice(-4));
    const tailB = Number((b.body.voucherNumber as string).slice(-4));
    expect(tailB).toBe(tailA + 1);
  });
});

describe('accounting — event-map auto-postings', () => {
  it('posts a savings deposit through the mapping and shows it in the cash book', async () => {
    const app = createAppRef();
    const posted = await post(app, '/api/v1/accounting/postings', {
      event: 'savings_deposit',
      amount: '1250.00',
      branchId: BRANCH_DHAKA,
      refId: 'sav-txn-001',
    });
    expect(posted.status).toBe(201);
    expect(posted.body.autoSource).toBe('savings_deposit');
    expect(posted.body.status).toBe('approved');
    const lines = posted.body.lines as Array<{ accountCode: string; debit: string; credit: string }>;
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountCode: '1010', debit: '1250.00' });
    expect(lines[1]).toMatchObject({ accountCode: '2100', credit: '1250.00' });

    const postings = await get(app, '/api/v1/accounting/postings');
    expect(postings.body.items).toHaveLength(1);
    expect(postings.body.items[0]).toMatchObject({ event: 'savings_deposit', direction: 'in' });

    const book = await get(app, `/api/v1/accounting/cash-book?branchId=${BRANCH_DHAKA}`);
    expect(book.body.totalCashIn).toBe('1250.00');
  });

  it('re-maps an event and the next posting follows the new codes', async () => {
    const app = createAppRef();
    const mappings = await get(app, '/api/v1/accounting/event-mappings');
    const fee = (mappings.body.items as Array<{ id: string; event: string }>).find((m) => m.event === 'fee_collected');
    expect(fee).toBeDefined();
    const remapped = await patch(app, `/api/v1/accounting/event-mappings/${fee!.id}`, { counterCode: '4500' });
    expect(remapped.status).toBe(200);
    expect(remapped.body.counterCode).toBe('4500');

    const posted = await post(app, '/api/v1/accounting/postings', { event: 'fee_collected', amount: '100.00' });
    const lines = posted.body.lines as Array<{ accountCode: string }>;
    expect(lines[1]!.accountCode).toBe('4500');
  });
});

describe('accounting — daily cash book', () => {
  it('counts physical cash and flags shortage/excess', async () => {
    const app = createAppRef();
    await post(app, '/api/v1/accounting/postings', { event: 'savings_deposit', amount: '2000.00', branchId: BRANCH_DHAKA });

    const short = await post(app, `/api/v1/accounting/cash-book/count?branchId=${BRANCH_DHAKA}`, { countedCash: '1900.00' });
    expect(short.status).toBe(200);
    expect(short.body.differenceKind).toBe('shortage');
    expect(short.body.difference).toBe('-100.00');

    const exact = await post(app, `/api/v1/accounting/cash-book/count?branchId=${BRANCH_DHAKA}`, { countedCash: '2000.00' });
    expect(exact.body.differenceKind).toBe('exact');
  });

  it('closes the day with both signatures and locks it', async () => {
    const app = createAppRef();
    await post(app, '/api/v1/accounting/postings', { event: 'savings_deposit', amount: '2000.00', branchId: BRANCH_DHAKA });
    const closed = await post(app, `/api/v1/accounting/cash-book/close?branchId=${BRANCH_DHAKA}`, {
      countedCash: '2000.00',
      managerSignName: 'Md. Rafiqul Islam',
      accountantSignName: 'Ms. Nusrat Jahan',
    });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.locked).toBe(true);
    expect(closed.body.closingBalance).toBe('2000.00');

    const recount = await post(app, `/api/v1/accounting/cash-book/count?branchId=${BRANCH_DHAKA}`, { countedCash: '1.00' });
    expect(recount.status).toBe(409);
    expect(recount.body.error.code).toBe('DAY_LOCKED');

    // Locked day is frozen even after new activity.
    await post(app, '/api/v1/accounting/postings', { event: 'savings_deposit', amount: '500.00', branchId: BRANCH_DHAKA });
    const frozen = await get(app, `/api/v1/accounting/cash-book?branchId=${BRANCH_DHAKA}`);
    expect(frozen.body.totalCashIn).toBe('2000.00');
  });
});

describe('accounting — bank reconciliation', () => {
  it('creates a rec, clears lines, and completes when all are cleared', async () => {
    const app = createAppRef();
    const created = await post(app, '/api/v1/accounting/bank-reconciliations', {
      branchId: BRANCH_DHAKA,
      bankCode: '1020',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      statementBalance: '15000.00',
      statementLines: [
        { valueDate: '2026-09-03', narration: 'Deposit slip', amount: '5000.00' },
        { valueDate: '2026-09-15', narration: 'Cheque 100234', amount: '-2000.00' },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.bookBalance).toBe('0.00'); // no bank vouchers yet
    const recId = created.body.id as string;
    const lines = created.body.statementLines as Array<{ id: string }>;

    const cleared1 = await post(app, `/api/v1/accounting/bank-reconciliations/${recId}/lines/${lines[0]!.id}/clear`, {
      matchedVoucherNumber: 'BP-DHK-01-26-0001',
    });
    expect(cleared1.body.status).toBe('pending');
    const cleared2 = await post(app, `/api/v1/accounting/bank-reconciliations/${recId}/lines/${lines[1]!.id}/clear`);
    expect(cleared2.body.status).toBe('cleared');
    expect(cleared2.body.unclearedTotal).toBe('0.00');
  });
});

describe('accounting — petty cash', () => {
  it('tops up, spends within limit, and blocks overspend', async () => {
    const app = createAppRef();
    const initial = await get(app, `/api/v1/accounting/petty-cash?branchId=${BRANCH_DHAKA}`);
    expect(initial.body.balance).toBe('3000.00');

    const topUp = await post(app, '/api/v1/accounting/petty-cash/top-up', {
      branchId: BRANCH_DHAKA,
      amount: '1000.00',
      note: 'Replenishment',
    });
    expect(topUp.status).toBe(200);
    expect(topUp.body.balance).toBe('4000.00');

    const spend = await post(app, '/api/v1/accounting/petty-cash/spend', {
      branchId: BRANCH_DHAKA,
      amount: '250.00',
      expenseCode: '6130',
      spentOn: 'Bus fares for field visits',
    });
    expect(spend.status).toBe(200);
    expect(spend.body.balance).toBe('3750.00');
    expect(spend.body.movements[0]).toMatchObject({ kind: 'spend', expenseCode: '6130' });

    const over = await post(app, '/api/v1/accounting/petty-cash/spend', {
      branchId: BRANCH_DHAKA,
      amount: '99999.00',
      expenseCode: '6130',
      spentOn: 'Attempt to overspend',
    });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('PETTY_LIMIT');
  });
});
