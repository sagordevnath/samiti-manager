/**
 * ── Cooperative governance: dividend, AGM, member exit, reports ─────────────
 * 5) Dividend & surplus distribution: annual surplus computation, statutory
 *    reserve %, dividend rate approved by the general meeting, distribution
 *    per member by share balance with period-weighted average, posting to
 *    savings or share account, printable dividend list.
 * 6) Annual General Meeting record: notice, agenda, attendance, resolutions,
 *    executive committee election results, minutes in Bangla.
 * 7) Member exit settlement: savings, share, dividend, welfare balances and
 *    dues adjusted into one final settlement voucher.
 * 8) Reports: claim ratio, premium vs payout, fund balances.
 *
 * Money is string numeric(14,2). All helpers are pure so the API, DB triggers
 * and the web UI share one implementation.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';
import { toBanglaDigits } from './format.js';

/* ── GL accounts (matches the default chart of accounts) ──────────────────── */

export const COOP_ACCOUNTS = {
  surplusAppropriation: { code: '3305', name: 'Surplus Appropriation', nameBn: 'উদ্বৃত্ত বণ্টন' },
  statutoryReserve: { code: '3310', name: 'Statutory Reserve Fund', nameBn: 'আইনত সঞ্চিত তহবিল' },
  dividendPayable: { code: '2320', name: 'Dividend Payable', nameBn: 'লভ্যাংশ প্রদেয়' },
  memberShareCapital: { code: '3100', name: 'Member Share Capital', nameBn: 'সদস্য মূলধনী শেয়ার' },
  dividendIncome: { code: '4320', name: 'Dividend Income (member)', nameBn: 'লভ্যাংশ আয় (সদস্য)' },
  cashVault: { code: '1010', name: 'Cash in Vault', nameBn: 'নগদ তহবিল' },
  savingsRefund: { code: '2100', name: 'Member Savings Payable', nameBn: 'সদস্য সঞ্চয় প্রদেয়' },
  welfarePayable: { code: '2340', name: 'Welfare Balance Payable', nameBn: 'কল্যাণ ব্যালেন্স প্রদেয়' },
  duesReceivable: { code: '1210', name: 'Member Dues Receivable', nameBn: 'সদস্য বকেয়া আদায়যোগ্য' },
} as const;

/* ── 5) Dividend & surplus distribution ───────────────────────────────────── */

export const DEFAULT_STATUTORY_RESERVE_PCT = 25;
export const DEFAULT_DIVIDEND_RATE_PCT = 8;

export interface DividendYearInput {
  /** Total member shares as of fiscal year end. */
  totalShares: number;
}

export interface ShareHolding {
  memberId: string;
  memberName: string;
  /** Shares currently held. */
  shares: number;
  /** Months held within the fiscal year (for period-weighted average). */
  monthsHeld: number;
  /** Optional: additional share movements (subscription/deduction) month rows. */
  movements?: { month: number; shares: number }[];
}

export interface DividendRateResult {
  /** Statutory reserve transferred out of the surplus. */
  reserveAmount: string;
  /** Distributable pool = surplus − reserve (100 − reservePct). */
  distributablePool: string;
  /** Retained surplus carried to next year after reserve. */
  retainedAfterReserve: string;
}

/**
 * Split the audited annual surplus into the statutory reserve (default 25%,
 * floor per cooperative act) and the distributable remainder.
 */
export function splitSurplus(surplus: string, reservePct: number = DEFAULT_STATUTORY_RESERVE_PCT): DividendRateResult {
  const s = Number(surplus);
  const pct = Math.min(100, Math.max(0, reservePct));
  const reserve = (s * pct) / 100;
  return {
    reserveAmount: reserve.toFixed(2),
    distributablePool: (s - reserve).toFixed(2),
    retainedAfterReserve: (s - reserve).toFixed(2),
  };
}

/**
 * Period-weighted average shares: months held × shares ÷ 12, so a member who
 * subscribed mid-year does not collect a full year's dividend.
 */
export function periodWeightedShares(h: Pick<ShareHolding, 'shares' | 'monthsHeld'>): number {
  const months = Math.min(12, Math.max(0, h.monthsHeld));
  return (h.shares * months) / 12;
}

export interface DividendDistribution {
  pool: string;
  reserveAmount: string;
  /** Dividend per ৳100 face value (the rate approved by the general meeting). */
  ratePct: number;
  totalWeighted: number;
  perMember: {
    memberId: string;
    memberName: string;
    shares: number;
    monthsHeld: number;
    weightedShares: number;
    /** Weight share of the pool (0–100). */
    weightPct: number;
    amount: string;
  }[];
}

/**
 * Full dividend distribution: statutory reserve → pool → per member by
 * period-weighted shares. `ratePct` is informational (approved by the AGM);
 * the pool is what actually distributes.
 */
export function distributeDividend(input: {
  surplus: string;
  reservePct?: number;
  ratePct?: number;
  holders: ShareHolding[];
}): DividendDistribution {
  const split = splitSurplus(input.surplus, input.reservePct ?? DEFAULT_STATUTORY_RESERVE_PCT);
  const pool = Number(split.distributablePool);
  const weighted = input.holders.map((h) => ({
    h,
    w: periodWeightedShares(h),
  }));
  const totalWeighted = weighted.reduce((s, x) => s + x.w, 0);
  const perMember = weighted.map(({ h, w }) => ({
    memberId: h.memberId,
    memberName: h.memberName,
    shares: h.shares,
    monthsHeld: h.monthsHeld,
    weightedShares: Number(w.toFixed(2)),
    weightPct: totalWeighted > 0 ? Number(((w / totalWeighted) * 100).toFixed(2)) : 0,
    amount: totalWeighted > 0 ? ((pool * w) / totalWeighted).toFixed(2) : '0.00',
  }));
  return {
    pool: split.distributablePool,
    reserveAmount: split.reserveAmount,
    ratePct: input.ratePct ?? DEFAULT_DIVIDEND_RATE_PCT,
    totalWeighted: Number(totalWeighted.toFixed(2)),
    perMember,
  };
}

export type DividendDistributionStatus =
  | 'computed'
  | 'agm_approved'
  | 'posted'
  | 'paid';

export const DIVIDEND_FLOW: Record<DividendDistributionStatus, DividendDistributionStatus[]> = {
  computed: ['agm_approved'],
  agm_approved: ['posted'],
  posted: ['paid'],
  paid: [],
};

export function canTransitionDividendStatus(from: DividendDistributionStatus, to: DividendDistributionStatus): boolean {
  return DIVIDEND_FLOW[from].includes(to);
}

/** Journal when the distribution posts: reserve + payable, pool funded. */
export function buildDividendJournal(input: { surplus: string; reservePct?: number }): {
  memo: string;
  lines: { accountCode: string; accountName: string; debit: string; credit: string }[];
} {
  const split = splitSurplus(input.surplus, input.reservePct ?? DEFAULT_STATUTORY_RESERVE_PCT);
  const s = Number(input.surplus).toFixed(2);
  return {
    memo: 'বার্ষিক লভ্যাংশ বণ্টন',
    lines: [
      { accountCode: COOP_ACCOUNTS.surplusAppropriation.code, accountName: COOP_ACCOUNTS.surplusAppropriation.name, debit: s, credit: '0.00' },
      { accountCode: COOP_ACCOUNTS.statutoryReserve.code, accountName: COOP_ACCOUNTS.statutoryReserve.name, debit: '0.00', credit: split.reserveAmount },
      { accountCode: COOP_ACCOUNTS.dividendPayable.code, accountName: COOP_ACCOUNTS.dividendPayable.name, debit: '0.00', credit: split.distributablePool },
    ],
  };
}

/** Payment journal per member: dividend payable → savings account or cash. */
export function buildDividendPaymentJournal(input: { memberName: string; amount: string; destination: 'savings' | 'cash' }): {
  memo: string;
  lines: { accountCode: string; accountName: string; debit: string; credit: string }[];
} {
  const amount = Number(input.amount).toFixed(2);
  const credit = input.destination === 'savings'
    ? { code: COOP_ACCOUNTS.savingsRefund.code, name: COOP_ACCOUNTS.savingsRefund.name }
    : { code: COOP_ACCOUNTS.cashVault.code, name: COOP_ACCOUNTS.cashVault.name };
  return {
    memo: `লভ্যাংশ প্রদান — ${input.memberName}`,
    lines: [
      { accountCode: COOP_ACCOUNTS.dividendPayable.code, accountName: COOP_ACCOUNTS.dividendPayable.name, debit: amount, credit: '0.00' },
      { accountCode: credit.code, accountName: credit.name, debit: '0.00', credit: amount },
    ],
  };
}

/* ── 6) Annual General Meeting (AGM) ──────────────────────────────────────── */

export type AgmStatus = 'draft' | 'notice_issued' | 'held' | 'minutes_approved';

export const AGM_FLOW: Record<AgmStatus, AgmStatus[]> = {
  draft: ['notice_issued'],
  notice_issued: ['held'],
  held: ['minutes_approved'],
  minutes_approved: [],
};

export function canTransitionAgm(from: AgmStatus, to: AgmStatus): boolean {
  return AGM_FLOW[from].includes(to);
}

export type ResolutionKind = 'ordinary' | 'special';
export type ResolutionResult = 'pending' | 'passed' | 'failed' | 'deferred';

export interface AgmResolution {
  id: string;
  agendaItem: string;
  title: string;
  kind: ResolutionKind;
  result: ResolutionResult;
  inFavor: number;
  against: number;
  abstain: number;
  note: string;
}

export interface AgmAttendee {
  memberId: string;
  memberName: string;
  shares: number;
  present: boolean;
  proxyFor: string | null;
}

export type ElectionMethod = 'show_of_hands' | 'secret_ballot';

export interface AgmElection {
  id: string;
  postBn: string;
  method: ElectionMethod;
  /** Candidate name → votes. */
  candidates: { name: string; votes: number }[];
  /** Winner is computed: highest votes (ties listed). */
  winnerName: string | null;
  note: string;
}

export interface AgmRecord {
  id: string;
  orgId: string;
  fiscalYear: string; // e.g. '2025-26'
  meetingDate: string;
  venue: string;
  noticeDate: string | null;
  noticeDays: number;
  agenda: { id: string; item: string; title: string; note: string }[];
  attendance: AgmAttendee[];
  quorumRequired: number;
  resolutions: AgmResolution[];
  elections: AgmElection[];
  minutesBn: string;
  approvedBy: string | null;
  status: AgmStatus;
  createdAt: string;
  updatedAt: string;
}

export const agmUpsertSchema = z.object({
  fiscalYear: z.string().regex(/^\d{4}-\d{2}$/),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.string().trim().min(2).max(200),
  noticeDays: z.coerce.number().int().min(7).max(60).default(14),
  agenda: z
    .array(z.object({ item: z.string().trim().min(1).max(20), title: z.string().trim().min(2).max(300), note: z.string().trim().max(500).default('') }))
    .min(1)
    .max(20),
  quorumRequired: z.coerce.number().int().min(1).default(10),
});
export type AgmUpsertBody = z.infer<typeof agmUpsertSchema>;

export const agmAttendanceSchema = z.object({
  attendees: z
    .array(
      z.object({
        memberId: uuidSchema,
        memberName: z.string().trim().min(2).max(120),
        shares: z.coerce.number().int().min(0).default(0),
        present: z.boolean(),
        proxyFor: z.string().trim().max(120).nullable().default(null),
      }),
    )
    .max(2000),
});
export type AgmAttendanceBody = z.infer<typeof agmAttendanceSchema>;

export const agmResolutionSchema = z.object({
  agendaItem: z.string().trim().min(1).max(20),
  title: z.string().trim().min(2).max(300),
  kind: z.enum(['ordinary', 'special']).default('ordinary'),
  result: z.enum(['pending', 'passed', 'failed', 'deferred']).default('pending'),
  inFavor: z.coerce.number().int().min(0).default(0),
  against: z.coerce.number().int().min(0).default(0),
  abstain: z.coerce.number().int().min(0).default(0),
  note: z.string().trim().max(500).default(''),
});
export type AgmResolutionBody = z.infer<typeof agmResolutionSchema>;

export const agmElectionSchema = z.object({
  postBn: z.string().trim().min(2).max(120),
  method: z.enum(['show_of_hands', 'secret_ballot']).default('secret_ballot'),
  candidates: z
    .array(z.object({ name: z.string().trim().min(2).max(120), votes: z.coerce.number().int().min(0).default(0) }))
    .min(1)
    .max(30),
  note: z.string().trim().max(500).default(''),
});
export type AgmElectionBody = z.infer<typeof agmElectionSchema>;

/** Quorum check: present members (incl. proxies) vs required. */
export function quorumMet(attendance: AgmAttendee[], required: number): boolean {
  const present = attendance.filter((a) => a.present).length;
  return present >= required;
}

/** Election winner: strictly highest votes; ties yield null. */
export function electionWinner(candidates: { name: string; votes: number }[]): { winner: string | null; tie: boolean } {
  if (candidates.length === 0) return { winner: null, tie: false };
  const sorted = [...candidates].sort((a, b) => b.votes - a.votes);
  const top = sorted[0]!;
  const second = sorted[1];
  if (second && second.votes === top.votes) return { winner: null, tie: true };
  return { winner: top.name, tie: false };
}

/** A resolution passes when inFavor > against (ordinary) or 2/3 majority (special). */
export function resolutionPasses(kind: ResolutionKind, inFavor: number, against: number, abstain: number): boolean {
  if (kind === 'special') {
    const valid = inFavor + against;
    return valid > 0 && inFavor / valid >= 2 / 3;
  }
  return inFavor > against;
}

/** Bangla notice text with the statutory notice period. */
export function buildNoticeTextBn(input: { orgNameBn: string; fiscalYear: string; meetingDate: string; venue: string; noticeDays: number; agenda: string[] }): string {
  const agendaLines = input.agenda.map((a, i) => `${i + 1}. ${a}`).join('\n');
  return [
    `${input.orgNameBn} এর বার্ষিক সাধারণ সভা`,
    '',
    `অর্থবছর: ${input.fiscalYear}`,
    `তারিখ: ${input.meetingDate} | স্থান: ${input.venue}`,
    '',
    'আলোচ্যসূচি:',
    agendaLines,
    '',
    `অত্যন্ত জরুরি: সকল সদস্যকে সভায় উপস্থিত থাকার জন্য অনুরোধ করা হচ্ছে। ${toBanglaDigits(String(input.noticeDays))} দিনের নোটিশ প্রদান করা হলো।`,
  ].join('\n');
}

/** Bangla minutes draft from the record. */
export function buildMinutesTextBn(input: {
  orgNameBn: string;
  fiscalYear: string;
  meetingDate: string;
  venue: string;
  attendance: AgmAttendee[];
  quorumRequired: number;
  resolutions: AgmResolution[];
  elections: AgmElection[];
}): string {
  const present = input.attendance.filter((a) => a.present);
  const resLines = input.resolutions.map(
    (r, i) =>
      `  ${i + 1}. ${r.title} (${r.kind === 'special' ? 'বিশেষ' : 'সাধারণ'}) — ${r.result === 'passed' ? 'গৃহীত' : r.result === 'failed' ? 'বাতিল' : r.result === 'deferred' ? 'স্থগিত' : 'অমীমাংসিত'} (পক্ষে ${r.inFavor}, বিপক্ষে ${r.against}, ভোটদান পরিহার ${r.abstain})`,
  );
  const electionLines = input.elections.map((e) => {
    const { winner } = electionWinner(e.candidates);
    return `  • ${e.postBn}: ${winner ? `${winner} নির্বাচিত (${e.method === 'secret_ballot' ? 'গোপন ভোট' : 'হাত তোলা'})` : 'ভোট সমান — পুনর্নির্বাচন প্রয়োজন'}`;
  });
  return [
    `${input.orgNameBn} — বার্ষিক সাধারণ সভার কার্যবিবরণী`,
    `অর্থবছর: ${input.fiscalYear} | তারিখ: ${input.meetingDate} | স্থান: ${input.venue}`,
    '',
    `উপস্থিতি: ${present.length} জন (কোরাম ${input.quorumRequired}) — ${quorumMet(input.attendance, input.quorumRequired) ? 'কোরাম পূর্ণ' : 'কোরাম অপূর্ণ'}`,
    '',
    'প্রস্তাবাবলি:',
    ...(resLines.length ? resLines : ['  (কোনো প্রস্তাব নেই)']),
    '',
    'নির্বাচন:',
    ...(electionLines.length ? electionLines : ['  (এবার নির্বাচন হয়নি)']),
    '',
    'সভা সভাপতির সম্মতিতে শুরু ও সমাপ্ত হয়।',
  ].join('\n');
}

/* ── 7) Member exit settlement ────────────────────────────────────────────── */

export type ExitStatus = 'requested' | 'computed' | 'approved' | 'settled' | 'rejected';

export const EXIT_FLOW: Record<ExitStatus, ExitStatus[]> = {
  requested: ['computed', 'rejected'],
  computed: ['approved', 'rejected'],
  approved: ['settled'],
  settled: [],
  rejected: [],
};

export function canTransitionExit(from: ExitStatus, to: ExitStatus): boolean {
  return EXIT_FLOW[from].includes(to);
}

export interface ExitSettlementLine {
  labelBn: string;
  /** Positive = payable to member, negative = due from member. */
  amount: string;
}

export interface MemberExitSettlement {
  id: string;
  orgId: string;
  branchId: string;
  memberId: string;
  memberName: string;
  requestDate: string;
  exitNo: string; // EX-YYYY-NNNN
  lines: ExitSettlementLine[];
  savingsBalance: string;
  shareValue: string;
  dividendDue: string;
  welfareBalance: string;
  duesOutstanding: string;
  netPayable: string;
  status: ExitStatus;
  decisionNote: string;
  settledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const memberExitSchema = z.object({
  memberId: uuidSchema,
  memberName: z.string().trim().min(2).max(120),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  savingsBalance: moneySchema,
  shareValue: moneySchema,
  dividendDue: moneySchema.default('0'),
  welfareBalance: moneySchema.default('0'),
  duesOutstanding: moneySchema.default('0'),
  note: z.string().trim().max(500).default(''),
});
export type MemberExitBody = z.infer<typeof memberExitSchema>;

/** Net payable = (savings + share + dividend + welfare) − dues; never negative (floored). */
export function computeExitNet(input: {
  savingsBalance: string;
  shareValue: string;
  dividendDue: string;
  welfareBalance: string;
  duesOutstanding: string;
}): { netPayable: string; lines: ExitSettlementLine[] } {
  const lines: ExitSettlementLine[] = [
    { labelBn: 'সঞ্চয় ফেরত', amount: Number(input.savingsBalance).toFixed(2) },
    { labelBn: 'শেয়ার মূল্য', amount: Number(input.shareValue).toFixed(2) },
    { labelBn: 'প্রাপ্য লভ্যাংশ', amount: Number(input.dividendDue).toFixed(2) },
    { labelBn: 'কল্যাণ তহবিল জমা', amount: Number(input.welfareBalance).toFixed(2) },
    { labelBn: 'বকেয়া ঋণ/দেনা (কাটা)', amount: (-Number(input.duesOutstanding)).toFixed(2) },
  ];
  const net =
    Number(input.savingsBalance) +
    Number(input.shareValue) +
    Number(input.dividendDue) +
    Number(input.welfareBalance) -
    Number(input.duesOutstanding);
  return { netPayable: Math.max(0, net).toFixed(2), lines };
}

/**
 * Final settlement voucher: the member's payables are debited, dues receivable
 * is credited up to the payable total (any remainder stays a receivable), and
 * the net goes out in cash. Always balanced.
 */
export function buildExitJournal(input: {
  exitNo: string;
  savingsBalance: string;
  shareValue: string;
  dividendDue: string;
  welfareBalance: string;
  duesOutstanding: string;
  netPayable: string;
}): {
  memo: string;
  lines: { accountCode: string; accountName: string; debit: string; credit: string }[];
} {
  const dr = (code: string, name: string, amount: string) => ({ accountCode: code, accountName: name, debit: Number(amount).toFixed(2), credit: '0.00' });
  const cr = (code: string, name: string, amount: string) => ({ accountCode: code, accountName: name, debit: '0.00', credit: Number(amount).toFixed(2) });
  const payableTotal =
    Number(input.savingsBalance) + Number(input.shareValue) + Number(input.dividendDue) + Number(input.welfareBalance);
  const duesApplied = Math.min(Number(input.duesOutstanding), payableTotal);
  const lines = [
    dr(COOP_ACCOUNTS.savingsRefund.code, COOP_ACCOUNTS.savingsRefund.name, input.savingsBalance),
    dr(COOP_ACCOUNTS.memberShareCapital.code, COOP_ACCOUNTS.memberShareCapital.name, input.shareValue),
    dr(COOP_ACCOUNTS.dividendPayable.code, COOP_ACCOUNTS.dividendPayable.name, input.dividendDue),
    dr(COOP_ACCOUNTS.welfarePayable.code, COOP_ACCOUNTS.welfarePayable.name, input.welfareBalance),
  ];
  if (duesApplied > 0) {
    lines.push(cr(COOP_ACCOUNTS.duesReceivable.code, COOP_ACCOUNTS.duesReceivable.name, duesApplied.toFixed(2)));
  }
  lines.push(cr(COOP_ACCOUNTS.cashVault.code, COOP_ACCOUNTS.cashVault.name, input.netPayable));
  return { memo: `চূড়ান্ত নিষ্পত্তি ${input.exitNo}`, lines };
}

export function nextExitNo(seq: number): string {
  return `EX-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
}

/* ── 8) Insurance / welfare reports ───────────────────────────────────────── */

export interface ClaimRatioInput {
  premiums: string;
  claimsPaid: string;
  claimsWaived: string;
}

/** Claim ratio = (paid + waived) ÷ premiums × 100. */
export function claimRatio(input: ClaimRatioInput): { pct: number; incidents: string; premiums: string } {
  const premiums = Number(input.premiums);
  const incidents = Number(input.claimsPaid) + Number(input.claimsWaived);
  const pct = premiums > 0 ? (incidents / premiums) * 100 : 0;
  return { pct: Number(pct.toFixed(2)), incidents: incidents.toFixed(2), premiums: premiums.toFixed(2) };
}

export interface FundBalanceRow {
  fund: 'member_welfare' | 'staff_benevolent' | 'insurance';
  labelBn: string;
  balance: string;
  inflow: string;
  outflow: string;
}

/** Premium-vs-payout rows per year/period for the report table. */
export function premiumVsPayout(rows: { period: string; premiums: string; payouts: string }[]): {
  period: string;
  premiums: string;
  payouts: string;
  net: string;
  ratioPct: number;
}[] {
  return rows.map((r) => ({
    period: r.period,
    premiums: Number(r.premiums).toFixed(2),
    payouts: Number(r.payouts).toFixed(2),
    net: (Number(r.premiums) - Number(r.payouts)).toFixed(2),
    ratioPct: Number(r.premiums) > 0 ? Number((((Number(r.payouts) / Number(r.premiums)) * 100)).toFixed(2)) : 0,
  }));
}
