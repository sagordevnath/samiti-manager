/**
 * ── Savings demo store ───────────────────────────────────────────────────────
 * Preview-first in-memory dataset mirroring 0009–0011 shapes: products,
 * member accounts, immutable ledger, share capital, dividends, and
 * reconciliation. Used when Supabase env values are placeholders (and in
 * tests) so the whole module works with zero cloud setup. NOT for production.
 */
import { randomUUID } from 'node:crypto';
import {
  computeStatement,
  previewDividend,
  type PassbookLine,
  type PassbookStatement,
  type ReconciliationReport,
  type ReconciliationResult,
} from '@samity/shared';

export interface DemoProduct {
  id: string;
  org_id: string;
  code: string;
  name: string;
  name_bn: string | null;
  product_type: 'compulsory' | 'voluntary' | 'dps' | 'fixed' | 'share';
  interest_rate: string;
  compounding: string;
  min_balance: string;
  max_deposit: string | null;
  withdrawal_limit: string;
  withdrawal_limit_period: string;
  withdrawal_rules: string | null;
  lock_while_loan_active: boolean;
  maturity_months: number;
  early_withdrawal_penalty_rate: string;
  auto_link_loan: boolean;
  auto_link_weekly_amount: string;
  requires_manager_approval_above: string;
  dormant_after_months: number;
  is_active: boolean;
  face_value: string | null;
  max_shares: number | null;
  created_by: string | null;
  created_at: string;
}

export interface DemoAccount {
  id: string;
  org_id: string;
  branch_id: string;
  member_id: string;
  product_id: string;
  account_number: string;
  opening_date: string;
  status: 'active' | 'dormant' | 'frozen' | 'closed';
  nominee_id: string | null;
  maturity_date: string | null;
  balance: string;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DemoTx {
  id: string;
  org_id: string;
  account_id: string;
  to_account_id: string | null;
  transaction_type: 'deposit' | 'withdrawal' | 'interest' | 'transfer' | 'adjustment' | 'closure';
  amount: string;
  balance_after: string;
  reference: string | null;
  note: string | null;
  reversal_of: string | null;
  reversal_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  interest_period: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DemoShareAllotment {
  id: string;
  org_id: string;
  member_id: string;
  product_id: string;
  shares: number;
  face_value: string;
  paid_amount: string;
  paid_shares: number;
  reference: string | null;
  reversal_of: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DemoDividendDeclaration {
  id: string;
  org_id: string;
  product_id: string;
  financial_year: string;
  surplus: string;
  payout_rate: string;
  dividend_pool: string;
  retained: string;
  approved_by_meeting_ref: string;
  approved_at: string;
  status: 'draft' | 'approved';
  approved_by: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DemoDividendPayment {
  id: string;
  org_id: string;
  declaration_id: string;
  member_id: string;
  paid_shares: number;
  face_value: string;
  amount: string;
  paid_at: string | null;
  created_at: string;
}

export interface DemoReconciliationRun {
  id: string;
  org_id: string;
  run_at: string;
  checked: number;
  mismatches: number;
  results: ReconciliationResult[];
  created_by: string | null;
}

export interface SavingsDemoData {
  orgId: string;
  products: DemoProduct[];
  accounts: DemoAccount[];
  transactions: DemoTx[];
  shareAllotments: DemoShareAllotment[];
  dividendDeclarations: DemoDividendDeclaration[];
  dividendPayments: DemoDividendPayment[];
  reconciliationRuns: DemoReconciliationRun[];
}

const ORG = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_MYMENSINGH = '00000000-0000-4000-8000-0000000000b2';
const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_B = '00000000-0000-4000-8000-0000000001a2';
const MEMBER_C = '00000000-0000-4000-8000-0000000001a3';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function buildDemoData(): SavingsDemoData {
  const now = new Date().toISOString();
  const products: DemoProduct[] = [
    {
      id: randomUUID(), org_id: ORG, code: 'COMP', name: 'Compulsory weekly', name_bn: 'বাধ্যতামূলক সাপ্তাহিক',
      product_type: 'compulsory', interest_rate: '0.00', compounding: 'none', min_balance: '0.00', max_deposit: null,
      withdrawal_limit: '0.00', withdrawal_limit_period: 'per_tx', withdrawal_rules: 'Locked while a loan is active',
      lock_while_loan_active: true, maturity_months: 0, early_withdrawal_penalty_rate: '0.00', auto_link_loan: false,
      auto_link_weekly_amount: '20.00', requires_manager_approval_above: '0.00', dormant_after_months: 0,
      is_active: true, face_value: null, max_shares: null, created_by: null, created_at: now,
    },
    {
      id: randomUUID(), org_id: ORG, code: 'VOL', name: 'Voluntary savings', name_bn: 'স্বেচ্ছাসঞ্চয়',
      product_type: 'voluntary', interest_rate: '6.00', compounding: 'simple', min_balance: '50.00', max_deposit: '200000.00',
      withdrawal_limit: '10000.00', withdrawal_limit_period: 'monthly', withdrawal_rules: null,
      lock_while_loan_active: false, maturity_months: 0, early_withdrawal_penalty_rate: '0.00', auto_link_loan: false,
      auto_link_weekly_amount: '0.00', requires_manager_approval_above: '5000.00', dormant_after_months: 6,
      is_active: true, face_value: null, max_shares: null, created_by: null, created_at: now,
    },
    {
      id: randomUUID(), org_id: ORG, code: 'DPS24', name: 'DPS 24 months', name_bn: 'ডিপিএস ২৪ মাস',
      product_type: 'dps', interest_rate: '8.50', compounding: 'monthly', min_balance: '0.00', max_deposit: null,
      withdrawal_limit: '0.00', withdrawal_limit_period: 'per_tx', withdrawal_rules: 'Premature closure penalty 2%',
      lock_while_loan_active: false, maturity_months: 24, early_withdrawal_penalty_rate: '2.00', auto_link_loan: false,
      auto_link_weekly_amount: '0.00', requires_manager_approval_above: '0.00', dormant_after_months: 6,
      is_active: true, face_value: null, max_shares: null, created_by: null, created_at: now,
    },
    {
      id: randomUUID(), org_id: ORG, code: 'SHARE', name: 'Cooperative share', name_bn: 'সমবায় শেয়ার',
      product_type: 'share', interest_rate: '0.00', compounding: 'none', min_balance: '0.00', max_deposit: null,
      withdrawal_limit: '0.00', withdrawal_limit_period: 'per_tx', withdrawal_rules: 'Redeemable on exit approval',
      lock_while_loan_active: false, maturity_months: 0, early_withdrawal_penalty_rate: '0.00', auto_link_loan: false,
      auto_link_weekly_amount: '0.00', requires_manager_approval_above: '0.00', dormant_after_months: 0,
      is_active: true, face_value: '1000.00', max_shares: 50, created_by: null, created_at: now,
    },
  ];
  const productByCode = (code: string) => products.find((p) => p.code === code)!;

  // Accounts open at zero; the seeded ledger below builds the real balances
  // so stored balance always equals the ledger recomputation.
  const accounts: DemoAccount[] = [
    {
      id: randomUUID(), org_id: ORG, branch_id: BRANCH_DHAKA, member_id: MEMBER_A, product_id: productByCode('VOL').id,
      account_number: 'SA-100000000001', opening_date: '2025-06-01', status: 'active', nominee_id: null,
      maturity_date: null, balance: '0.00', closed_at: null, created_by: null, created_at: daysAgo(120),
    },
    {
      id: randomUUID(), org_id: ORG, branch_id: BRANCH_DHAKA, member_id: MEMBER_A, product_id: productByCode('COMP').id,
      account_number: 'SA-100000000002', opening_date: '2025-06-01', status: 'active', nominee_id: null,
      maturity_date: null, balance: '0.00', closed_at: null, created_by: null, created_at: daysAgo(120),
    },
    {
      id: randomUUID(), org_id: ORG, branch_id: BRANCH_MYMENSINGH, member_id: MEMBER_B, product_id: productByCode('DPS24').id,
      account_number: 'SA-200000000001', opening_date: '2025-03-15', status: 'active', nominee_id: null,
      maturity_date: '2027-03-15', balance: '0.00', closed_at: null, created_by: null, created_at: daysAgo(90),
    },
    {
      id: randomUUID(), org_id: ORG, branch_id: BRANCH_DHAKA, member_id: MEMBER_C, product_id: productByCode('VOL').id,
      account_number: 'SA-100000000003', opening_date: '2025-08-10', status: 'dormant', nominee_id: null,
      maturity_date: null, balance: '0.00', closed_at: null, created_by: null, created_at: daysAgo(60),
    },
  ];

  const transactions: DemoTx[] = [];
  let seq = 0;
  const post = (
    accountIdx: number,
    type: DemoTx['transaction_type'],
    amount: string,
    opts: { daysAgo?: number; reference?: string | null; note?: string | null; toAccountId?: string | null } = {},
  ) => {
    const account = accounts[accountIdx]!;
    const prev = Number(account.balance);
    const delta = type === 'deposit' || type === 'interest' ? Number(amount) : -Number(amount);
    const balanceAfter = (prev + delta).toFixed(2);
    account.balance = balanceAfter;
    transactions.push({
      id: randomUUID(), org_id: ORG, account_id: account.id, to_account_id: opts.toAccountId ?? null,
      transaction_type: type, amount, balance_after: balanceAfter, reference: opts.reference ?? null,
      note: opts.note ?? null, reversal_of: null, reversal_reason: null, approved_by: null, approved_at: null,
      interest_period: type === 'interest' ? `demo-${++seq}` : null, created_by: null,
      created_at: daysAgo(opts.daysAgo ?? 30),
    });
  };

  // Member A voluntary: 12,400 → built from deposits/withdrawals/interest
  post(0, 'deposit', '5000.00', { daysAgo: 110, reference: 'Weekly collection' });
  post(0, 'deposit', '8000.00', { daysAgo: 80, reference: 'Harvest income' });
  post(0, 'withdrawal', '1500.00', { daysAgo: 45, reference: 'School fees' });
  post(0, 'interest', '900.00', { daysAgo: 30, reference: 'Interest 2026-07' });
  // Member A compulsory: 2,460
  post(1, 'deposit', '2460.00', { daysAgo: 60, reference: 'Weekly auto 20 × 123' });
  // Member B DPS: 18,200
  post(2, 'deposit', '18000.00', { daysAgo: 85, reference: 'DPS installment × 12' });
  post(2, 'interest', '200.00', { daysAgo: 30, reference: 'Interest 2026-07' });
  // Member C voluntary: 800 (dormant)
  post(3, 'deposit', '800.00', { daysAgo: 200, reference: 'Opening deposit' });

  const shareAllotments: DemoShareAllotment[] = [
    { id: randomUUID(), org_id: ORG, member_id: MEMBER_A, product_id: productByCode('SHARE').id, shares: 5, face_value: '1000.00', paid_amount: '5000.00', paid_shares: 5, reference: 'AGM 2025', reversal_of: null, created_by: null, created_at: daysAgo(200) },
    { id: randomUUID(), org_id: ORG, member_id: MEMBER_B, product_id: productByCode('SHARE').id, shares: 3, face_value: '1000.00', paid_amount: '3000.00', paid_shares: 3, reference: 'AGM 2025', reversal_of: null, created_by: null, created_at: daysAgo(200) },
    { id: randomUUID(), org_id: ORG, member_id: MEMBER_C, product_id: productByCode('SHARE').id, shares: 2, face_value: '1000.00', paid_amount: '1000.00', paid_shares: 1, reference: 'Partial payment', reversal_of: null, created_by: null, created_at: daysAgo(150) },
  ];

  return {
    orgId: ORG,
    products,
    accounts,
    transactions,
    shareAllotments,
    dividendDeclarations: [],
    dividendPayments: [],
    reconciliationRuns: [],
  };
}

const globalRef = globalThis as unknown as { __savingsDemoData?: SavingsDemoData };

export function savingsDemoStore(): SavingsDemoData {
  globalRef.__savingsDemoData ??= buildDemoData();
  return globalRef.__savingsDemoData;
}

/** Test isolation: rebuild the dataset from scratch. */
export function resetSavingsDemoStore(): void {
  delete globalRef.__savingsDemoData;
}

// ── Store operations (mirroring the DB functions) ───────────────────────────

export class SavingsDemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function postDemoTx(
  store: SavingsDemoData,
  input: {
    accountId: string;
    type: DemoTx['transaction_type'];
    amount: string;
    toAccountId?: string | null;
    reference?: string | null;
    note?: string | null;
    reversalOf?: string | null;
    reversalReason?: string | null;
    approvedBy?: string | null;
    interestPeriod?: string | null;
    userId: string | null;
  },
): DemoTx {
  const account = store.accounts.find((a) => a.id === input.accountId);
  if (!account) throw new SavingsDemoError(404, 'NOT_FOUND', 'Savings account not found');
  if (account.status === 'closed') throw new SavingsDemoError(409, 'CONFLICT', 'Savings account is closed');
  const product = store.products.find((p) => p.id === account.product_id);
  if (!product) throw new SavingsDemoError(404, 'NOT_FOUND', 'Savings product not found');
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new SavingsDemoError(400, 'VALIDATION_ERROR', 'Transaction amount must be positive');
  if (input.type === 'transfer' && !input.toAccountId) throw new SavingsDemoError(400, 'VALIDATION_ERROR', 'Transfer destination is required');

  let delta: number;
  if (input.reversalOf) {
    const original = store.transactions.find((t) => t.id === input.reversalOf && t.account_id === input.accountId);
    if (!original || original.reversal_of) throw new SavingsDemoError(400, 'VALIDATION_ERROR', 'Only original transactions can be reversed');
    if (store.transactions.some((t) => t.reversal_of === input.reversalOf)) {
      throw new SavingsDemoError(400, 'VALIDATION_ERROR', 'Transaction has already been reversed');
    }
    if (!input.reversalReason || !input.approvedBy) throw new SavingsDemoError(400, 'VALIDATION_ERROR', 'Reversal reason and approval are required');
    delta = ['withdrawal', 'adjustment', 'closure'].includes(original.transaction_type) ? amount : -amount;
  } else {
    delta = ['withdrawal', 'adjustment', 'closure', 'transfer'].includes(input.type) ? -amount : amount;
  }

  const balance = Number(account.balance) + delta;
  if (balance < 0) throw new SavingsDemoError(409, 'CONFLICT', 'Insufficient savings balance');
  if (balance < Number(product.min_balance)) throw new SavingsDemoError(409, 'CONFLICT', 'Minimum balance would be breached');
  if (input.type !== 'interest' && product.lock_while_loan_active) {
    // Compulsory savings stay locked (demo has no loan store here).
  }
  if (input.type === 'interest' && !input.interestPeriod) {
    throw new SavingsDemoError(400, 'VALIDATION_ERROR', 'Interest period is required');
  }
  if (
    input.type === 'interest' &&
    store.transactions.some((t) => t.account_id === input.accountId && t.transaction_type === 'interest' && t.interest_period === input.interestPeriod)
  ) {
    throw new SavingsDemoError(409, 'CONFLICT', `Interest already posted for period ${input.interestPeriod}`);
  }

  const tx: DemoTx = {
    id: randomUUID(), org_id: account.org_id, account_id: input.accountId, to_account_id: input.toAccountId ?? null,
    transaction_type: input.type, amount: amount.toFixed(2), balance_after: balance.toFixed(2),
    reference: input.reference ?? null, note: input.note ?? null, reversal_of: input.reversalOf ?? null,
    reversal_reason: input.reversalReason ?? null, approved_by: input.approvedBy ?? null,
    approved_at: input.approvedBy ? new Date().toISOString() : null, interest_period: input.interestPeriod ?? null,
    created_by: input.userId, created_at: new Date().toISOString(),
  };
  store.transactions.push(tx);
  account.balance = balance.toFixed(2);
  account.status = input.type === 'closure' ? 'closed' : account.status === 'dormant' ? 'active' : account.status;
  account.closed_at = input.type === 'closure' ? new Date().toISOString() : account.closed_at;
  if (input.type === 'transfer' && input.toAccountId) {
    const dest = store.accounts.find((a) => a.id === input.toAccountId);
    if (!dest) throw new SavingsDemoError(404, 'NOT_FOUND', 'Transfer destination account not found');
    dest.balance = (Number(dest.balance) + amount).toFixed(2);
  }
  return tx;
}

/** Ledger-recomputed balance (mirrors DB recompute_balance). */
export function ledgerBalance(store: SavingsDemoData, accountId: string): string {
  let sum = 0;
  for (const tx of store.transactions) {
    if (store.transactions.some((r) => r.reversal_of === tx.id)) continue; // reversed entries excluded
    const isSource = tx.account_id === accountId;
    const isDest = tx.to_account_id === accountId;
    if (!isSource && !isDest) continue;
    const signed =
      tx.transaction_type === 'deposit' || tx.transaction_type === 'interest'
        ? Number(tx.amount)
        : tx.transaction_type === 'transfer'
          ? isDest
            ? Number(tx.amount)
            : -Number(tx.amount)
          : -Number(tx.amount);
    sum += signed;
  }
  return sum.toFixed(2);
}

export function runDemoReconciliation(store: SavingsDemoData, userId: string | null): DemoReconciliationRun {
  const results: ReconciliationResult[] = store.accounts.map((account) => {
    const stored = Number(account.balance);
    const recomputed = ledgerBalance(store, account.id);
    const entryCount = store.transactions.filter((t) => t.account_id === account.id).length;
    const lastEntryAt = store.transactions
      .filter((t) => t.account_id === account.id)
      .map((t) => t.created_at)
      .sort()
      .at(-1) ?? null;
    return {
      accountId: account.id,
      accountNumber: account.account_number,
      storedBalance: stored.toFixed(2),
      ledgerBalance: recomputed,
      difference: (stored - Number(recomputed)).toFixed(2),
      entryCount,
      lastEntryAt,
      status: stored === Number(recomputed) ? ('ok' as const) : ('mismatch' as const),
    };
  });
  const run: DemoReconciliationRun = {
    id: randomUUID(), org_id: store.orgId, run_at: new Date().toISOString(),
    checked: results.length, mismatches: results.filter((r) => r.status === 'mismatch').length,
    results, created_by: userId,
  };
  store.reconciliationRuns.unshift(run);
  return run;
}

export function buildDemoPassbook(
  store: SavingsDemoData,
  accountId: string,
  from: string,
  to: string,
): PassbookStatement {
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account) throw new SavingsDemoError(404, 'NOT_FOUND', 'Savings account not found');
  const product = store.products.find((p) => p.id === account.product_id)!;
  const lines: PassbookLine[] = store.transactions
    .filter((t) => t.account_id === accountId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((t) => ({
      id: t.id,
      date: t.created_at,
      type: t.transaction_type,
      deposit: ['deposit', 'interest'].includes(t.transaction_type) ? t.amount : '0.00',
      withdrawal: ['withdrawal', 'adjustment', 'closure', 'transfer'].includes(t.transaction_type) ? t.amount : '0.00',
      balanceAfter: t.balance_after,
      reference: t.reference,
      note: t.note,
    }));
  return computeStatement(
    {
      id: account.id,
      accountNumber: account.account_number,
      memberName: demoMemberName(account.member_id),
      memberNameBn: null,
      memberCode: demoMemberCode(account.member_id),
      productName: product.name,
      productNameBn: product.name_bn,
      branchName: account.branch_id === BRANCH_DHAKA ? 'Dhanmondi' : 'Mymensingh Sadar',
      orgName: 'Samity Demo Cooperative',
      status: account.status,
    },
    from,
    to,
    lines,
    account.balance,
  );
}

// Demo identity helpers (branch/member names resolved for display).
const demoMemberNames: Record<string, { name: string; code: string }> = {
  [MEMBER_A]: { name: 'Rahima Begum', code: 'DHK-26-00001' },
  [MEMBER_B]: { name: 'Salma Khatun', code: 'MYM-26-00014' },
  [MEMBER_C]: { name: 'Jahanara Parvin', code: 'DHK-26-00042' },
};
export function demoMemberName(memberId: string): string {
  return demoMemberNames[memberId]?.name ?? 'Unknown member';
}
export function demoMemberCode(memberId: string): string {
  return demoMemberNames[memberId]?.code ?? null as unknown as string;
}

export function paidSharesFor(store: SavingsDemoData, memberId: string, productId: string): number {
  return store.shareAllotments
    .filter((a) => a.member_id === memberId && a.product_id === productId && !a.reversal_of)
    .reduce((s, a) => s + a.paid_shares, 0);
}

export function demoDividendPreview(
  store: SavingsDemoData,
  productId: string,
  surplus: string,
  payoutRate: number,
  faceValue: string,
) {
  const allotments = store.shareAllotments
    .filter((a) => a.product_id === productId && !a.reversal_of)
    .reduce<Array<{ memberId: string; paidShares: number }>>((acc, a) => {
      const found = acc.find((x) => x.memberId === a.member_id);
      if (found) found.paidShares += a.paid_shares;
      else acc.push({ memberId: a.member_id, paidShares: a.paid_shares });
      return acc;
    }, []);
  return previewDividend(allotments, { surplus, payoutRate, faceValue });
}
