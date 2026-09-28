/**
 * ── Insurance & welfare demo store ───────────────────────────────────────────
 * In-memory credit life policies, claims ladder, micro-insurance products and
 * enrollments, member welfare / staff benevolent funds with ledger, and the
 * dividend split. Preview/test only — the Supabase path uses migration 0040
 * with the same shapes and trigger-enforced rules (claim ladder, welfare cap).
 */
import { randomUUID } from 'node:crypto';
import {
  buildClaimJournal,
  buildPremiumJournal,
  canTransitionClaim,
  canTransitionWelfare,
  claimCanAdvance,
  coveragePeriod,
  creditLifeCoverage,
  creditLifePremium,
  microCoverageFor,
  nextClaimNo,
  nextWelfareRequestNo,
  welfareCapCheck,
  welfareNextLevel,
  WELFARE_ACCOUNTS,
  CREDIT_LIFE_DEFAULTS,
  DEFAULT_WELFARE_RULES,
  type ClaimDecisionBody,
  type ClaimStatus,
  type CreditLifePolicy,
  type InsuranceClaim,
  type MicroClaimBody,
  type MicroEnrollBody,
  type MicroEnrollment,
  type MicroInsuranceProduct,
  type MicroProductUpsertBody,
  type ClaimSubmitBody,
  type WelfareDecisionBody,
  type WelfareRequestBody,
  type WelfareRequest,
  type WelfareRequestStatus,
  type WelfareFundRules,
} from '@samity/shared';
import { WorkDemoError } from './work-store.js';

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_B = '00000000-0000-4000-8000-0000000001a2';
const MEMBER_C = '00000000-0000-4000-8000-0000000001a3';

export class InsuranceWelfareError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function err(status: number, code: string, message: string): never {
  throw new InsuranceWelfareError(status, code, message);
}

export interface InsuranceWelfareDemoData {
  orgId: string;
  policies: CreditLifePolicy[];
  claims: InsuranceClaim[];
  microProducts: MicroInsuranceProduct[];
  microEnrollments: MicroEnrollment[];
  welfareRules: WelfareFundRules;
  welfareRequests: WelfareRequest[];
  /** Ledger entries per fund. */
  ledger: {
    id: string;
    fund: 'member_welfare' | 'staff_benevolent' | 'insurance';
    entryType: string;
    refType: string | null;
    refId: string | null;
    amount: string;
    memo: string;
    at: string;
  }[];
  claimSeq: number;
  welfareSeq: number;
}

const globalRef = globalThis as unknown as { __insWelfareDemoData?: InsuranceWelfareDemoData };

function seedStore(): InsuranceWelfareDemoData {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const period = coveragePeriod(today, 12);
  const app1 = '00000000-0000-4000-8000-000000000000app1'.slice(0, 36).replace('x', 'a');
  const appId = '00000000-0000-4000-8000-000000000000a1';
  void app1;
  const policy: CreditLifePolicy = {
    id: '00000000-0000-4000-8000-00000000c001',
    orgId: ORG_ID,
    branchId: BRANCH_DHAKA,
    applicationId: appId,
    loanNumber: 'LO-DHK-0001',
    memberId: MEMBER_A,
    memberName: 'রহিমা বেগম',
    premiumRatePct: CREDIT_LIFE_DEFAULTS.premiumRatePct,
    premiumAmount: creditLifePremium('180000', CREDIT_LIFE_DEFAULTS.premiumRatePct, CREDIT_LIFE_DEFAULTS.minPremiumBdt),
    principal: '180000.00',
    coverageAmount: creditLifeCoverage('180000', CREDIT_LIFE_DEFAULTS.coverageCapBdt),
    startDate: today,
    endDate: period.endDate,
    nomineeName: 'মোঃ আব্দুল করিম',
    nomineeRelation: 'husband',
    nomineePhone: '01712345678',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  return {
    orgId: ORG_ID,
    policies: [policy],
    claims: [],
    microProducts: [
      { id: '00000000-0000-4000-8000-00000000d001', orgId: ORG_ID, kind: 'cattle', nameBn: 'গরু বীমা', annualPremium: '550.00', coverageLimit: '30000.00', units: 1, active: true },
      { id: '00000000-0000-4000-8000-00000000d002', orgId: ORG_ID, kind: 'crop', nameBn: 'আমন ফসল বীমা', annualPremium: '400.00', coverageLimit: '20000.00', units: 1, active: true },
      { id: '00000000-0000-4000-8000-00000000d003', orgId: ORG_ID, kind: 'health', nameBn: 'পরিবার স্বাস্থ্য বীমা', annualPremium: '1200.00', coverageLimit: '50000.00', units: 4, active: true },
    ],
    microEnrollments: [
      {
        id: '00000000-0000-4000-8000-00000000e001',
        orgId: ORG_ID,
        branchId: BRANCH_DHAKA,
        productId: '00000000-0000-4000-8000-00000000d001',
        kind: 'cattle',
        memberId: MEMBER_B,
        memberName: 'সালমা খাতুন',
        units: 2,
        subjectRef: 'গরু #১২৮, #১২৯',
        annualPremium: '1100.00',
        coverageLimit: '60000.00',
        startDate: today,
        endDate: period.endDate,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    welfareRules: {
      id: '00000000-0000-4000-8000-00000000wr01',
      orgId: ORG_ID,
      monthlyContribution: '10.00',
      staffContribution: '50.00',
      rules: DEFAULT_WELFARE_RULES,
      updatedAt: now,
    },
    welfareRequests: [],
    ledger: [
      { id: randomUUID(), fund: 'member_welfare', entryType: 'contribution', refType: null, refId: null, amount: '18000.00', memo: 'সদস্য চাঁদা (সঞ্চিত)', at: now },
      { id: randomUUID(), fund: 'staff_benevolent', entryType: 'contribution', refType: null, refId: null, amount: '6000.00', memo: 'কর্মী চাঁদা (সঞ্চিত)', at: now },
      { id: randomUUID(), fund: 'insurance', entryType: 'premium', refType: 'policy', refId: policy.id, amount: policy.premiumAmount, memo: 'বীমা প্রিমিয়াম (পলিসি ইস্যু)', at: now },
    ],
    claimSeq: 0,
    welfareSeq: 0,
  };
}

export function insWelfareStore(): InsuranceWelfareDemoData {
  globalRef.__insWelfareDemoData ??= seedStore();
  return globalRef.__insWelfareDemoData;
}

export function resetInsWelfareStore(): void {
  delete globalRef.__insWelfareDemoData;
}

/* ── Ledger helper ─────────────────────────────────────────────────────────── */

function postLedger(
  store: InsuranceWelfareDemoData,
  fund: 'member_welfare' | 'staff_benevolent' | 'insurance',
  entryType: string,
  amount: string,
  memo: string,
  ref?: { refType: string; refId: string },
): void {
  store.ledger.push({
    id: randomUUID(),
    fund,
    entryType,
    refType: ref?.refType ?? null,
    refId: ref?.refId ?? null,
    amount: Number(amount).toFixed(2),
    memo,
    at: new Date().toISOString(),
  });
}

export function fundBalance(store: InsuranceWelfareDemoData, fund: 'member_welfare' | 'staff_benevolent' | 'insurance'): string {
  const inflow = ['contribution', 'premium', 'loan_repaid', 'adjustment'];
  const balance = store.ledger
    .filter((l) => l.fund === fund)
    .reduce((s, l) => s + (inflow.includes(l.entryType) ? Number(l.amount) : -Number(l.amount)), 0);
  return Math.max(0, balance).toFixed(2);
}

/* ── 1) Credit life ───────────────────────────────────────────────────────── */

export function listPolicies(store: InsuranceWelfareDemoData, filter: { branchId?: string; status?: string } = {}): CreditLifePolicy[] {
  let rows = [...store.policies].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filter.branchId) rows = rows.filter((p) => p.branchId === filter.branchId);
  if (filter.status) rows = rows.filter((p) => p.status === filter.status);
  return rows;
}

/** Issue a credit life policy for a loan at disbursement (posts premium journal). */
export function issueCreditLife(
  store: InsuranceWelfareDemoData,
  input: { applicationId: string; loanNumber: string; memberId: string; memberName: string; principal: string; termMonths: number; nomineeName: string; nomineeRelation: string; nomineePhone?: string; branchId?: string },
): CreditLifePolicy {
  if (store.policies.some((p) => p.applicationId === input.applicationId && p.status === 'active')) {
    err(409, 'CONFLICT', 'এই ঋণে ইতিমধ্যে পলিসি আছে / Policy already exists for this loan');
  }
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const period = coveragePeriod(today, input.termMonths);
  const premium = creditLifePremium(input.principal, CREDIT_LIFE_DEFAULTS.premiumRatePct, CREDIT_LIFE_DEFAULTS.minPremiumBdt);
  const policy: CreditLifePolicy = {
    id: randomUUID(),
    orgId: store.orgId,
    branchId: input.branchId ?? BRANCH_DHAKA,
    applicationId: input.applicationId,
    loanNumber: input.loanNumber,
    memberId: input.memberId,
    memberName: input.memberName,
    premiumRatePct: CREDIT_LIFE_DEFAULTS.premiumRatePct,
    premiumAmount: premium,
    principal: Number(input.principal).toFixed(2),
    coverageAmount: creditLifeCoverage(input.principal, CREDIT_LIFE_DEFAULTS.coverageCapBdt),
    startDate: today,
    endDate: period.endDate,
    nomineeName: input.nomineeName,
    nomineeRelation: input.nomineeRelation,
    nomineePhone: input.nomineePhone ?? null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  store.policies.push(policy);
  postLedger(store, 'insurance', 'premium', premium, `বীমা প্রিমিয়াম (${input.loanNumber})`, { refType: 'policy', refId: policy.id });
  return policy;
}

export function listClaims(store: InsuranceWelfareDemoData, filter: { branchId?: string; status?: string; kind?: string } = {}): InsuranceClaim[] {
  let rows = [...store.claims].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filter.branchId) rows = rows.filter((c) => c.branchId === filter.branchId);
  if (filter.status) rows = rows.filter((c) => c.status === filter.status);
  if (filter.kind) rows = rows.filter((c) => c.kind === filter.kind);
  return rows;
}

export function getClaim(store: InsuranceWelfareDemoData, id: string): InsuranceClaim {
  const c = store.claims.find((x) => x.id === id);
  if (!c) err(404, 'NOT_FOUND', 'দাবি পাওয়া যায়নি / Claim not found');
  return c as InsuranceClaim;
}

export function submitClaim(store: InsuranceWelfareDemoData, body: ClaimSubmitBody, actor: { id: string }): InsuranceClaim {
  const policy = store.policies.find((p) => p.id === body.policyId);
  if (!policy) err(404, 'NOT_FOUND', 'পলিসি পাওয়া যায়নি / Policy not found');
  if (policy.status !== 'active') err(409, 'CONFLICT', 'পলিসি সক্রিয় নয় / Policy is not active');
  if (body.kind === 'death') {
    const gate = claimCanAdvance({ kind: 'death', status: 'submitted', documents: body.documents });
    if (!gate.ok) err(422, 'VALIDATION_ERROR', `প্রয়োজনীয় নথি: ${gate.missing.join(', ')}`);
  }
  store.claimSeq += 1;
  const now = new Date().toISOString();
  const claim: InsuranceClaim = {
    id: randomUUID(),
    orgId: store.orgId,
    branchId: policy.branchId,
    policyId: policy.id,
    claimNo: nextClaimNo(store.claimSeq),
    kind: body.kind,
    memberId: policy.memberId,
    memberName: policy.memberName,
    eventDate: body.eventDate,
    reportedDate: now.slice(0, 10),
    cause: body.cause ?? '',
    documents: body.documents ?? [],
    assessmentNote: body.assessmentNote ?? '',
    claimedAmount: body.claimedAmount,
    approvedAmount: null,
    settlementMode: null,
    status: 'submitted',
    decisionNote: '',
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.claims.push(claim);
  void actor;
  return claim;
}

/** Advance/approve/reject/pay along the three-level review ladder. */
export function decideClaim(store: InsuranceWelfareDemoData, id: string, body: ClaimDecisionBody): InsuranceClaim {
  const claim = getClaim(store, id);
  const now = new Date().toISOString();
  const note = body.note ?? '';

  if (body.action === 'advance') {
    const gate = claimCanAdvance(claim);
    if (!gate.ok) err(422, 'VALIDATION_ERROR', `প্রয়োজনীয় নথি: ${gate.missing.join(', ')}`);
    const flow: Partial<Record<ClaimStatus, ClaimStatus>> = {
      submitted: 'bm_review',
      bm_review: 'am_review',
      am_review: 'ho_review',
    };
    const next = flow[claim.status];
    if (!next) err(409, 'CONFLICT', 'আর অগ্রিম করা যাবে না / Cannot advance further');
    if (!canTransitionClaim(claim.status, next as ClaimStatus)) err(409, 'CONFLICT', 'অবৈধ অবস্থান্তর');
    claim.status = next as ClaimStatus;
    claim.updatedAt = now;
    return claim;
  }

  if (body.action === 'reject') {
    if (!canTransitionClaim(claim.status, 'rejected')) err(409, 'CONFLICT', 'এই পর্যায়ে প্রত্যাখ্যান করা যাবে না');
    claim.status = 'rejected';
    claim.decisionNote = note;
    claim.decidedAt = now;
    claim.updatedAt = now;
    return claim;
  }

  if (body.action === 'approve') {
    if (claim.status !== 'ho_review') err(409, 'CONFLICT', 'প্রধান কার্যালয় পর্যালোচনার পরেই অনুমোদন হবে / Approve only at HO review');
    const amount = body.approvedAmount ?? claim.claimedAmount;
    if (Number(amount) > Number(claim.claimedAmount)) err(422, 'VALIDATION_ERROR', 'অনুমোদিত পরিমাণ দাবির বেশি হতে পারে না');
    claim.status = 'approved';
    claim.approvedAmount = Number(amount).toFixed(2);
    claim.decisionNote = note;
    claim.decidedAt = now;
    claim.updatedAt = now;
    return claim;
  }

  // pay / settle_waiver
  if (claim.status !== 'approved') err(409, 'CONFLICT', 'প্রথমে অনুমোদন প্রয়োজন / Approval required first');
  const mode = body.action === 'settle_waiver' ? 'waiver' : 'payout';
  const amount = claim.approvedAmount ?? '0.00';
  claim.status = 'paid';
  claim.settlementMode = mode;
  claim.updatedAt = now;

  const journal = buildClaimJournal({ claimNo: claim.claimNo, settlementMode: mode, amount });
  postLedger(store, 'insurance', mode === 'waiver' ? 'claim_waiver' : 'claim_paid', amount, journal.memo, { refType: 'claim', refId: claim.id });

  const policy = store.policies.find((p) => p.id === claim.policyId);
  if (policy) {
    policy.status = 'claimed';
    policy.updatedAt = now;
  }
  return claim;
}

/* ── 2) Micro insurance ───────────────────────────────────────────────────── */

export function listMicroProducts(store: InsuranceWelfareDemoData, kind?: string): MicroInsuranceProduct[] {
  let rows = [...store.microProducts];
  if (kind) rows = rows.filter((p) => p.kind === kind);
  return rows;
}

export function upsertMicroProduct(store: InsuranceWelfareDemoData, body: MicroProductUpsertBody): MicroInsuranceProduct {
  const existing = store.microProducts.find((p) => p.kind === body.kind && p.nameBn === body.nameBn);
  const now = new Date().toISOString();
  if (existing) {
    existing.annualPremium = body.annualPremium;
    existing.coverageLimit = body.coverageLimit;
    existing.units = body.units;
    existing.active = body.active;
    return existing;
  }
  const product: MicroInsuranceProduct = { id: randomUUID(), orgId: store.orgId, ...body };
  store.microProducts.push(product);
  return product;
}

export function listMicroEnrollments(store: InsuranceWelfareDemoData, filter: { branchId?: string; kind?: string; memberId?: string } = {}): MicroEnrollment[] {
  let rows = [...store.microEnrollments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filter.branchId) rows = rows.filter((e) => e.branchId === filter.branchId);
  if (filter.kind) rows = rows.filter((e) => e.kind === filter.kind);
  if (filter.memberId) rows = rows.filter((e) => e.memberId === filter.memberId);
  return rows;
}

export function enrollMicro(store: InsuranceWelfareDemoData, body: MicroEnrollBody, branchId: string): MicroEnrollment {
  const product = store.microProducts.find((p) => p.id === body.productId && p.active);
  if (!product) err(404, 'NOT_FOUND', 'পণ্য পাওয়া যায়নি বা নিষ্ক্রিয় / Product not found or inactive');
  const now = new Date().toISOString();
  const period = coveragePeriod(body.startDate, 12);
  const enrollment: MicroEnrollment = {
    id: randomUUID(),
    orgId: store.orgId,
    branchId,
    productId: product!.id,
    kind: product!.kind,
    memberId: body.memberId,
    memberName: body.memberName,
    units: body.units,
    subjectRef: body.subjectRef ?? '',
    annualPremium: (Number(product!.annualPremium) * body.units).toFixed(2),
    coverageLimit: (Number(product!.coverageLimit) * body.units).toFixed(2),
    startDate: body.startDate,
    endDate: period.endDate,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  store.microEnrollments.push(enrollment);
  postLedger(store, 'insurance', 'premium', enrollment.annualPremium, `${product!.nameBn} প্রিমিয়াম`, { refType: 'enrollment', refId: enrollment.id });
  return enrollment;
}

export function submitMicroClaim(store: InsuranceWelfareDemoData, body: MicroClaimBody, actor: { id: string }): InsuranceClaim {
  const enrollment = store.microEnrollments.find((e) => e.id === body.enrollmentId);
  if (!enrollment) err(404, 'NOT_FOUND', 'ভর্তি পাওয়া যায়নি / Enrollment not found');
  if (enrollment!.status !== 'active') err(409, 'CONFLICT', 'এই ভর্তি সক্রিয় নয় / Enrollment is not active');
  if ((body.photos ?? []).length === 0) err(422, 'VALIDATION_ERROR', 'মূল্যায়নের ছবি প্রয়োজন / Assessment photos required');
  if (body.cause && !['death', 'theft', 'injury', 'flood', 'drought', 'pest', 'storm', 'hospitalization', 'surgery', 'critical_illness'].includes(body.cause)) {
    err(422, 'VALIDATION_ERROR', 'অবৈধ কারণ / Invalid cause');
  }
  const covered = microCoverageFor(enrollment!, body.claimedAmount);
  store.claimSeq += 1;
  const now = new Date().toISOString();
  const claim: InsuranceClaim = {
    id: randomUUID(),
    orgId: store.orgId,
    branchId: enrollment!.branchId,
    policyId: enrollment!.id,
    claimNo: nextClaimNo(store.claimSeq),
    kind: enrollment!.kind,
    memberId: enrollment!.memberId,
    memberName: enrollment!.memberName,
    eventDate: body.eventDate,
    reportedDate: now.slice(0, 10),
    cause: body.cause,
    documents: (body.photos ?? []).map((p, i) => ({ id: `photo_${i}`, labelBn: 'মূল্যায়নের ছবি', path: p })),
    assessmentNote: body.assessmentNote ?? '',
    claimedAmount: covered,
    approvedAmount: null,
    settlementMode: null,
    status: 'submitted',
    decisionNote: '',
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.claims.push(claim);
  void actor;
  return claim;
}

/* ── 3) Member welfare fund ───────────────────────────────────────────────── */

export function getWelfareRules(store: InsuranceWelfareDemoData): WelfareFundRules {
  return store.welfareRules;
}

export function updateWelfareRules(store: InsuranceWelfareDemoData, patch: Partial<WelfareFundRules['rules']> & { monthlyContribution?: string; staffContribution?: string }): WelfareFundRules {
  const r = store.welfareRules;
  if (patch.monthlyContribution !== undefined) r.monthlyContribution = patch.monthlyContribution;
  if (patch.staffContribution !== undefined) r.staffContribution = patch.staffContribution;
  if (patch.grantCapBdt !== undefined) r.rules.grantCapBdt = patch.grantCapBdt;
  if (patch.loanCapBdt !== undefined) r.rules.loanCapBdt = patch.loanCapBdt;
  if (patch.loanTermMonths !== undefined) r.rules.loanTermMonths = patch.loanTermMonths;
  if (patch.bmApprovalUpToBdt !== undefined) r.rules.bmApprovalUpToBdt = patch.bmApprovalUpToBdt;
  if (patch.amApprovalUpToBdt !== undefined) r.rules.amApprovalUpToBdt = patch.amApprovalUpToBdt;
  r.updatedAt = new Date().toISOString();
  return r;
}

export function listWelfareRequests(store: InsuranceWelfareDemoData, filter: { fund?: string; status?: string; branchId?: string } = {}): WelfareRequest[] {
  let rows = [...store.welfareRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filter.fund) rows = rows.filter((r) => r.fund === filter.fund);
  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter.branchId) rows = rows.filter((r) => r.branchId === filter.branchId);
  return rows;
}

export function submitWelfareRequest(store: InsuranceWelfareDemoData, body: WelfareRequestBody, branchId: string): WelfareRequest {
  const cap = welfareCapCheck(body.type, body.amount, store.welfareRules.rules);
  if (!cap.ok) err(422, 'VALIDATION_ERROR', cap.messageBn ?? 'সীমা ছাড়িয়েছে');
  // Fund availability: grants and loans commit the fund immediately.
  const fund = body.fund === 'staff' ? 'staff_benevolent' : 'member_welfare';
  const pending = store.welfareRequests
    .filter((r) => r.status !== 'rejected' && r.status !== 'disbursed' && r.fund === body.fund)
    .reduce((s, r) => s + Number(r.amount), 0);
  if (!requireBalance(store, fund, pending, body.amount)) {
    err(422, 'VALIDATION_ERROR', 'তহবিলে পর্যাপ্ত অর্থ নেই / Insufficient fund balance');
  }
  store.welfareSeq += 1;
  const now = new Date().toISOString();
  const request: WelfareRequest = {
    id: randomUUID(),
    orgId: store.orgId,
    branchId,
    fund: body.fund,
    requestId: nextWelfareRequestNo(store.welfareSeq, body.fund),
    requesterId: body.requesterId,
    requesterName: body.requesterName,
    kind: body.kind,
    type: body.type,
    amount: body.amount,
    reason: body.reason,
    photos: body.photos ?? [],
    status: 'submitted',
    decisionNote: '',
    decidedAt: null,
    disbursedAt: null,
    repaymentMonths: body.type === 'interest_free_loan' ? store.welfareRules.rules.loanTermMonths : null,
    createdAt: now,
    updatedAt: now,
  };
  store.welfareRequests.push(request);
  return request;
}

function requireBalance(store: InsuranceWelfareDemoData, fund: 'member_welfare' | 'staff_benevolent' | 'insurance', pending: number, amount: string): boolean {
  const available = Number(fundBalance(store, fund)) - pending;
  return available >= Number(amount) - 0.001;
}

export function decideWelfare(store: InsuranceWelfareDemoData, id: string, body: WelfareDecisionBody): WelfareRequest {
  const request = store.welfareRequests.find((r) => r.id === id);
  if (!request) err(404, 'NOT_FOUND', 'আবেদন পাওয়া যায়নি / Request not found');
  const now = new Date().toISOString();
  const note = body.note ?? '';

  if (body.action === 'advance') {
    const next = welfareNextLevel(request.status, request.amount, store.welfareRules.rules).next;
    if (!next || next === 'approved') err(409, 'CONFLICT', 'পরবর্তী পর্যায় নেই / No further review level');
    if (!canTransitionWelfare(request.status, next)) err(409, 'CONFLICT', 'অবৈধ অবস্থান্তর');
    request.status = next;
    request.updatedAt = now;
    return request;
  }

  if (body.action === 'reject') {
    if (!canTransitionWelfare(request.status, 'rejected')) err(409, 'CONFLICT', 'এই পর্যায়ে প্রত্যাখ্যান করা যাবে না');
    request.status = 'rejected';
    request.decisionNote = note;
    request.decidedAt = now;
    request.updatedAt = now;
    return request;
  }

  if (body.action === 'approve') {
    // Approve is legal from bm_review (within BM limit), am_review, or submitted→bm first.
    const legal = canTransitionWelfare(request.status, 'approved');
    if (!legal) err(409, 'CONFLICT', 'এই পর্যায় থেকে অনুমোদন করা যাবে না / Approve not allowed from this level');
    const gate = welfareNextLevel(request.status, request.amount, store.welfareRules.rules);
    if (gate.next !== 'approved') err(409, 'CONFLICT', `${gate.approverBn} এর অনুমোদন প্রয়োজন / Needs ${gate.approverBn} approval`);
    request.status = 'approved';
    request.decisionNote = note;
    request.decidedAt = now;
    request.updatedAt = now;
    return request;
  }

  // disburse
  if (request.status !== 'approved') err(409, 'CONFLICT', 'প্রথমে অনুমোদন প্রয়োজন / Approval required first');
  request.status = 'disbursed';
  request.disbursedAt = now;
  request.updatedAt = now;
  const fund = request.fund === 'staff' ? 'staff_benevolent' : 'member_welfare';
  postLedger(
    store,
    fund,
    request.type === 'grant' ? 'grant' : 'loan_disbursed',
    request.amount,
    `${request.requestId} — ${request.requesterName}`,
    { refType: 'welfare_request', refId: request.id },
  );
  return request;
}

/* ── Contributions & dividend ─────────────────────────────────────────────── */

/** Post a batch member contribution (e.g., monthly collection sweep). */
export function postWelfareContribution(store: InsuranceWelfareDemoData, fund: 'member_welfare' | 'staff_benevolent', amount: string, memo: string): void {
  postLedger(store, fund, 'contribution', amount, memo);
}

export function welfareSummary(store: InsuranceWelfareDemoData): {
  memberBalance: string;
  staffBalance: string;
  insuranceBalance: string;
  pendingMember: number;
  pendingStaff: number;
} {
  const pending = (fund: 'member' | 'staff') =>
    store.welfareRequests.filter((r) => r.fund === fund && r.status !== 'rejected' && r.status !== 'disbursed').length;
  return {
    memberBalance: fundBalance(store, 'member_welfare'),
    staffBalance: fundBalance(store, 'staff_benevolent'),
    insuranceBalance: fundBalance(store, 'insurance'),
    pendingMember: pending('member'),
    pendingStaff: pending('staff'),
  };
}

export { WELFARE_ACCOUNTS };
