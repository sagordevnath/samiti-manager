/**
 * ── Cooperative governance demo store ────────────────────────────────────────
 * In-memory dividend distributions (statutory reserve → weighted pool),
 * AGM records (notice → held → minutes), member exit settlements and the
 * report aggregations. Preview/test only — the Supabase path uses migration
 * 0042 with the same shapes and trigger-enforced state machines.
 */
import { randomUUID } from 'node:crypto';
import {
  canTransitionAgm,
  canTransitionDividendStatus,
  canTransitionExit,
  claimRatio,
  computeExitNet,
  distributeDividend,
  electionWinner,
  buildDividendJournal,
  buildDividendPaymentJournal,
  buildExitJournal,
  buildMinutesTextBn,
  buildNoticeTextBn,
  premiumVsPayout,
  quorumMet,
  resolutionPasses,
  type AgmAttendee,
  type AgmElection,
  type AgmElectionBody,
  type AgmRecord,
  type AgmResolution,
  type AgmResolutionBody,
  type AgmStatus,
  type AgmUpsertBody,
  type DividendDistribution,
  type DividendDistributionStatus,
  type ExitSettlementLine,
  type ExitStatus,
  type MemberExitBody,
  type MemberExitSettlement,
  type ShareHolding,
} from '@samity/shared';
import { WorkDemoError } from './work-store.js';

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_B = '00000000-0000-4000-8000-0000000001a2';
const MEMBER_C = '00000000-0000-4000-8000-0000000001a3';

export class CoopGovernanceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function err(status: number, code: string, message: string): never {
  throw new CoopGovernanceError(status, code, message);
}

export interface CoopGovernanceDemoData {
  orgId: string;
  /** Fiscal year → distribution. */
  distributions: Map<string, DistributionRow>;
  /** Journal entries (memo + lines) for the UI ledger. */
  journals: { id: string; memo: string; lines: { accountCode: string; accountName: string; debit: string; credit: string }[]; at: string }[];
  agms: AgmRecord[];
  exits: MemberExitSettlement[];
  exitSeq: number;
}

const globalRef = globalThis as unknown as { __coopGovDemoData?: CoopGovernanceDemoData };

function seedStore(): CoopGovernanceDemoData {
  const now = new Date().toISOString();
  return {
    orgId: ORG_ID,
    distributions: new Map(),
    journals: [],
    agms: [],
    exits: [],
    exitSeq: 0,
  };
}

export function coopGovStore(): CoopGovernanceDemoData {
  globalRef.__coopGovDemoData ??= seedStore();
  return globalRef.__coopGovDemoData;
}

export function resetCoopGovStore(): void {
  delete globalRef.__coopGovDemoData;
}

function pushJournal(store: CoopGovernanceDemoData, memo: string, lines: { accountCode: string; accountName: string; debit: string; credit: string }[]): void {
  store.journals.unshift({ id: randomUUID(), memo, lines, at: new Date().toISOString() });
}

/* ── 5) Dividend & surplus ────────────────────────────────────────────────── */

export interface DistributionRow {
  fiscalYear: string;
  surplus: string;
  reservePct: number;
  ratePct: number;
  status: DividendDistributionStatus;
  distribution: DividendDistribution;
  journal?: ReturnType<typeof buildDividendJournal>;
  payments: { memberId: string; memberName: string; amount: string; destination: 'savings' | 'cash'; paidAt: string }[];
}

export function computeDistribution(
  store: CoopGovernanceDemoData,
  input: { fiscalYear: string; surplus: string; reservePct?: number; ratePct?: number; holders: ShareHolding[] },
): DistributionRow {
  if (store.distributions.has(input.fiscalYear)) {
    err(409, 'CONFLICT', `${input.fiscalYear} অর্থবছরের বণ্টন আছে / Distribution already exists for this fiscal year`);
  }
  if (input.holders.length === 0) err(422, 'VALIDATION_ERROR', 'শেয়ারহোল্ডার তালিকা প্রয়োজন / Holders required');
  const distribution = distributeDividend(input);
  const row: DistributionRow = {
    fiscalYear: input.fiscalYear,
    surplus: Number(input.surplus).toFixed(2),
    reservePct: input.reservePct ?? 25,
    ratePct: input.ratePct ?? 8,
    status: 'computed',
    distribution,
    payments: [],
  };
  store.distributions.set(input.fiscalYear, row);
  return row;
}

export function listDistributions(store: CoopGovernanceDemoData): DistributionRow[] {
  return [...store.distributions.values()].sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear));
}

export function getDistribution(store: CoopGovernanceDemoData, fiscalYear: string): DistributionRow {
  const row = store.distributions.get(fiscalYear);
  if (!row) err(404, 'NOT_FOUND', 'বণ্টন পাওয়া যায়নি / Distribution not found');
  return row as DistributionRow;
}

export function decideDistribution(
  store: CoopGovernanceDemoData,
  fiscalYear: string,
  body: { action: 'agm_approve' | 'post' | 'pay'; memberId?: string; destination?: 'savings' | 'cash' },
): DistributionRow {
  const row = getDistribution(store, fiscalYear);
  const now = new Date().toISOString();

  if (body.action === 'agm_approve') {
    if (!canTransitionDividendStatus(row.status, 'agm_approved')) err(409, 'CONFLICT', 'অবৈধ অবস্থান্তর / Invalid transition');
    row.status = 'agm_approved';
    return row;
  }

  if (body.action === 'post') {
    if (!canTransitionDividendStatus(row.status, 'posted')) err(409, 'CONFLICT', 'প্রথমে সাধারণ সভার অনুমোদন প্রয়োজন / AGM approval required first');
    row.journal = buildDividendJournal({ surplus: row.surplus, reservePct: row.reservePct });
    pushJournal(store, row.journal.memo, row.journal.lines);
    row.status = 'posted';
    return row;
  }

  // pay — per member line; the distribution may be paid member by member.
  if (row.status !== 'posted' && row.status !== 'paid') err(409, 'CONFLICT', 'প্রথমে পোস্টিং প্রয়োজন / Post the distribution first');
  if (!body.memberId) err(422, 'VALIDATION_ERROR', 'memberId প্রয়োজন / memberId required');
  const line = row.distribution.perMember.find((m) => m.memberId === body.memberId);
  if (!line) err(404, 'NOT_FOUND', 'সদস্য বণ্টন তালিকায় নেই / Member not in the distribution');
  if (row.payments.some((p) => p.memberId === body.memberId)) err(409, 'CONFLICT', 'ইতিমধ্যে পরিশোধিত / Already paid');
  const destination = body.destination ?? 'savings';
  const journal = buildDividendPaymentJournal({ memberName: line.memberName, amount: line.amount, destination });
  pushJournal(store, journal.memo, journal.lines);
  row.payments.push({ memberId: line.memberId, memberName: line.memberName, amount: line.amount, destination, paidAt: now });
  if (row.status === 'posted') row.status = 'paid';
  return row;
}

/* ── 6) AGM ───────────────────────────────────────────────────────────────── */

export function listAgms(store: CoopGovernanceDemoData): AgmRecord[] {
  return [...store.agms].sort((a, b) => b.fiscalYear.localeCompare(a.fiscalYear));
}

export function getAgm(store: CoopGovernanceDemoData, id: string): AgmRecord {
  const agm = store.agms.find((a) => a.id === id);
  if (!agm) err(404, 'NOT_FOUND', 'সভা পাওয়া যায়নি / AGM not found');
  return agm as AgmRecord;
}

export function createAgm(store: CoopGovernanceDemoData, body: AgmUpsertBody, orgNameBn: string): AgmRecord {
  if (store.agms.some((a) => a.fiscalYear === body.fiscalYear)) {
    err(409, 'CONFLICT', `${body.fiscalYear} অর্থবছরের সভা আছে / AGM already exists for this fiscal year`);
  }
  const now = new Date().toISOString();
  const notice = buildNoticeTextBn({
    orgNameBn,
    fiscalYear: body.fiscalYear,
    meetingDate: body.meetingDate,
    venue: body.venue,
    noticeDays: body.noticeDays,
    agenda: body.agenda.map((a) => a.title),
  });
  const agm: AgmRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    fiscalYear: body.fiscalYear,
    meetingDate: body.meetingDate,
    venue: body.venue,
    noticeDate: now.slice(0, 10),
    noticeDays: body.noticeDays,
    agenda: body.agenda.map((a, i) => ({ id: `agenda-${i + 1}`, item: a.item, title: a.title, note: a.note })),
    attendance: [],
    quorumRequired: body.quorumRequired,
    resolutions: [],
    elections: [],
    minutesBn: '',
    approvedBy: null,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
  agm.minutesBn = notice; // notice text initially; replaced by minutes on approval
  store.agms.push(agm);
  return agm;
}

export function setAgmAttendance(store: CoopGovernanceDemoData, id: string, body: { attendees: AgmAttendee[] }): AgmRecord {
  const agm = getAgm(store, id);
  agm.attendance = body.attendees;
  agm.updatedAt = new Date().toISOString();
  return agm;
}

export function addResolution(store: CoopGovernanceDemoData, id: string, body: AgmResolutionBody): AgmRecord {
  const agm = getAgm(store, id);
  const passes = resolutionPasses(body.kind, body.inFavor, body.against, body.abstain);
  const result = body.result === 'pending' && body.inFavor + body.against > 0 ? (passes ? 'passed' : 'failed') : body.result;
  const resolution: AgmResolution = {
    id: randomUUID(),
    agendaItem: body.agendaItem,
    title: body.title,
    kind: body.kind,
    result,
    inFavor: body.inFavor,
    against: body.against,
    abstain: body.abstain,
    note: body.note,
  };
  agm.resolutions.push(resolution);
  agm.updatedAt = new Date().toISOString();
  return agm;
}

export function addElection(store: CoopGovernanceDemoData, id: string, body: AgmElectionBody): AgmRecord {
  const agm = getAgm(store, id);
  const { winner, tie } = electionWinner(body.candidates);
  if (tie) err(422, 'VALIDATION_ERROR', 'ভোট সমান — ফলাফল ঘোষণা করা যায় না / Tie vote — recount required');
  const election: AgmElection = {
    id: randomUUID(),
    postBn: body.postBn,
    method: body.method,
    candidates: body.candidates,
    winnerName: winner,
    note: body.note,
  };
  agm.elections.push(election);
  agm.updatedAt = new Date().toISOString();
  return agm;
}

export function decideAgm(store: CoopGovernanceDemoData, id: string, body: { action: 'issue_notice' | 'hold' | 'approve_minutes' }): AgmRecord {
  const agm = getAgm(store, id);
  const now = new Date().toISOString();
  const next: Record<typeof body.action, AgmStatus> = {
    issue_notice: 'notice_issued',
    hold: 'held',
    approve_minutes: 'minutes_approved',
  };
  const to = next[body.action];
  if (!canTransitionAgm(agm.status, to)) err(409, 'CONFLICT', `অবৈধ সভা অবস্থান্তর ${agm.status} → ${to}`);
  if (body.action === 'hold') {
    if (!quorumMet(agm.attendance, agm.quorumRequired)) {
      err(422, 'VALIDATION_ERROR', 'কোরাম অপূর্ণ — সভা শুরু হতে পারে না / Quorum not met');
    }
    agm.status = 'held';
  } else {
    agm.status = to;
  }
  if (body.action === 'approve_minutes') {
    agm.approvedBy = 'org_admin';
    agm.minutesBn = buildMinutesTextBn({
      orgNameBn: 'স্যামিটি ম্যানেজার সমবায় সমিতি',
      fiscalYear: agm.fiscalYear,
      meetingDate: agm.meetingDate,
      venue: agm.venue,
      attendance: agm.attendance,
      quorumRequired: agm.quorumRequired,
      resolutions: agm.resolutions,
      elections: agm.elections,
    });
  }
  agm.updatedAt = now;
  return agm;
}

/* ── 7) Member exit ───────────────────────────────────────────────────────── */

export function listExits(store: CoopGovernanceDemoData, filter: { branchId?: string; status?: string } = {}): MemberExitSettlement[] {
  let rows = [...store.exits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filter.branchId) rows = rows.filter((e) => e.branchId === filter.branchId);
  if (filter.status) rows = rows.filter((e) => e.status === filter.status);
  return rows;
}

export function getExit(store: CoopGovernanceDemoData, id: string): MemberExitSettlement {
  const e = store.exits.find((x) => x.id === id);
  if (!e) err(404, 'NOT_FOUND', 'নিষ্পত্তি পাওয়া যায়নি / Exit settlement not found');
  return e as MemberExitSettlement;
}

export function requestExit(store: CoopGovernanceDemoData, body: MemberExitBody, branchId: string): MemberExitSettlement {
  const now = new Date().toISOString();
  const { netPayable, lines } = computeExitNet(body);
  store.exitSeq += 1;
  const exit: MemberExitSettlement = {
    id: randomUUID(),
    orgId: store.orgId,
    branchId,
    memberId: body.memberId,
    memberName: body.memberName,
    requestDate: body.requestDate,
    exitNo: `EX-${now.slice(0, 4)}-${String(store.exitSeq).padStart(4, '0')}`,
    lines,
    savingsBalance: Number(body.savingsBalance).toFixed(2),
    shareValue: Number(body.shareValue).toFixed(2),
    dividendDue: Number(body.dividendDue).toFixed(2),
    welfareBalance: Number(body.welfareBalance).toFixed(2),
    duesOutstanding: Number(body.duesOutstanding).toFixed(2),
    netPayable,
    status: 'requested',
    decisionNote: body.note ?? '',
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.exits.push(exit);
  return exit;
}

export function decideExit(store: CoopGovernanceDemoData, id: string, body: { action: 'compute' | 'approve' | 'reject' | 'settle'; note?: string }): MemberExitSettlement {
  const exit = getExit(store, id);
  const now = new Date().toISOString();

  if (body.action === 'compute') {
    if (!canTransitionExit(exit.status, 'computed')) err(409, 'CONFLICT', 'অবৈধ অবস্থান্তর / Invalid transition');
    const { netPayable, lines } = computeExitNet({
      savingsBalance: exit.savingsBalance,
      shareValue: exit.shareValue,
      dividendDue: exit.dividendDue,
      welfareBalance: exit.welfareBalance,
      duesOutstanding: exit.duesOutstanding,
    });
    exit.netPayable = netPayable;
    exit.lines = lines;
    exit.status = 'computed';
    exit.updatedAt = now;
    return exit;
  }

  if (body.action === 'approve') {
    if (!canTransitionExit(exit.status, 'approved')) err(409, 'CONFLICT', 'প্রথমে গণনা প্রয়োজন / Compute first');
    exit.status = 'approved';
    exit.decisionNote = body.note ?? exit.decisionNote;
    exit.updatedAt = now;
    return exit;
  }

  if (body.action === 'reject') {
    if (!canTransitionExit(exit.status, 'rejected')) err(409, 'CONFLICT', 'এই পর্যায়ে বাতিল করা যাবে না');
    exit.status = 'rejected';
    exit.decisionNote = body.note ?? '';
    exit.updatedAt = now;
    return exit;
  }

  // settle
  if (!canTransitionExit(exit.status, 'settled')) err(409, 'CONFLICT', 'প্রথমে অনুমোদন প্রয়োজন / Approval required first');
  exit.status = 'settled';
  exit.settledAt = now;
  const journal = buildExitJournal({
    exitNo: exit.exitNo,
    savingsBalance: exit.savingsBalance,
    shareValue: exit.shareValue,
    dividendDue: exit.dividendDue,
    welfareBalance: exit.welfareBalance,
    duesOutstanding: exit.duesOutstanding,
    netPayable: exit.netPayable,
  });
  pushJournal(store, journal.memo, journal.lines);
  exit.updatedAt = now;
  return exit;
}

/* ── 8) Reports ───────────────────────────────────────────────────────────── */

export function governanceReports(
  store: CoopGovernanceDemoData,
  insLedger: { fund: string; entryType: string; amount: string; at: string }[],
): {
  claimRatio: ReturnType<typeof claimRatio>;
  premiumVsPayout: ReturnType<typeof premiumVsPayout>;
  funds: { fund: string; labelBn: string; balance: string }[];
  dividendStatus: { fiscalYear: string; status: DividendDistributionStatus; pool: string; reserve: string; paidCount: number; total: number }[];
} {
  const premiumRows = insLedger.filter((l) => l.entryType === 'premium');
  const claimPaid = insLedger.filter((l) => l.entryType === 'claim_paid');
  const claimWaived = insLedger.filter((l) => l.entryType === 'claim_waiver');

  const sum = (rows: { amount: string }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

  // Premium vs payout by year from the insurance ledger.
  const byYear = new Map<string, { premiums: number; payouts: number }>();
  for (const l of premiumRows) {
    const y = l.at.slice(0, 4);
    const row = byYear.get(y) ?? { premiums: 0, payouts: 0 };
    row.premiums += Number(l.amount);
    byYear.set(y, row);
  }
  for (const l of [...claimPaid, ...claimWaived]) {
    const y = l.at.slice(0, 4);
    const row = byYear.get(y) ?? { premiums: 0, payouts: 0 };
    row.payouts += Number(l.amount);
    byYear.set(y, row);
  }
  const pvp = premiumVsPayout(
    [...byYear.entries()].sort().map(([period, v]) => ({ period, premiums: String(v.premiums), payouts: String(v.payouts) })),
  );

  const fundBal = (fund: string) => {
    const inflow = ['contribution', 'premium', 'loan_repaid', 'adjustment'];
    return Math.max(0, insLedger.filter((l) => l.fund === fund).reduce((s, l) => s + (inflow.includes(l.entryType) ? Number(l.amount) : -Number(l.amount)), 0)).toFixed(2);
  };

  const distributions = listDistributions(store).map((d) => ({
    fiscalYear: d.fiscalYear,
    status: d.status,
    pool: d.distribution.pool,
    reserve: d.distribution.reserveAmount,
    paidCount: d.payments.length,
    total: d.distribution.perMember.length,
  }));

  return {
    claimRatio: claimRatio({ premiums: String(sum(premiumRows)), claimsPaid: String(sum(claimPaid)), claimsWaived: String(sum(claimWaived)) }),
    premiumVsPayout: pvp,
    funds: [
      { fund: 'member_welfare', labelBn: 'সদস্য কল্যাণ', balance: fundBal('member_welfare') },
      { fund: 'staff_benevolent', labelBn: 'কর্মী সদয়', balance: fundBal('staff_benevolent') },
      { fund: 'insurance', labelBn: 'বীমা', balance: fundBal('insurance') },
    ],
    dividendStatus: distributions,
  };
}
