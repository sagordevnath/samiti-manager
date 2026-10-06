/**
 * ── Insurance & welfare live router (Supabase) ───────────────────────────────
 * Mirrors insurance-welfare.routes.ts (demo) against the real tables
 * (migration 0040): credit life policies with premium journal, the three-level
 * claims ladder (BM → AM → HO, payout or loan waiver), micro-insurance
 * products/enrollments/claims, member + staff welfare funds (rules, cap and
 * balance checks, request ladder, ledger) and the dividend calculator.
 * Money → numeric(14,2) strings; jsonb/text[] carry shared interfaces as-is.
 * Pure rules live in @samity/shared so the DB triggers, this API and the UI
 * share one implementation.
 */
import { Router } from 'express';
import {
  canTransitionClaim,
  canTransitionWelfare,
  claimCanAdvance,
  claimDecisionSchema,
  claimSubmitSchema,
  computeDividend,
  creditLifeCoverage,
  creditLifePremium,
  CREDIT_LIFE_DEFAULTS,
  microClaimSchema,
  microEnrollSchema,
  microProductUpsertSchema,
  welfareCapCheck,
  welfareDecisionSchema,
  welfareNextLevel,
  welfareRequestSchema,
} from '@samity/shared';
import { BadRequest, Conflict, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const insWelfareLiveRouter = Router();
insWelfareLiveRouter.use(requireAuth);

const orgOf = (req: RequestWithAuth) => req.auth!.orgId ?? '';
const nowIso = () => new Date().toISOString();
const todayStr = () => nowIso().slice(0, 10);

function pgError(err: unknown): never {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505' || e?.code === '23P01' || e?.code === '23514') {
    throw Conflict(e.message ?? 'ডেটাবেজ সীমাবদ্ধতা / Database constraint violated');
  }
  if (e?.code === '23503') {
    throw NotFound('সম্পর্কিত রেকর্ড পাওয়া যায়নি / Related record not found');
  }
  throw (err as Error) ?? new Error('unknown');
}

/** Coverage end = start + N months − 1 day (demo coveragePeriod semantics). */
function coverageEnd(start: string, months: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function nextSeq(table: string, orgId: string, col: string, prefix: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .like(col, `${prefix}-%`);
  return (count ?? 0) + 1;
}

/** Ledger balance: inflows minus outflows, floored at zero (demo semantics). */
const LEDGER_INFLOW = ['contribution', 'premium', 'loan_repaid', 'adjustment'];
async function ledgerBalance(orgId: string, fund: 'member_welfare' | 'staff_benevolent' | 'insurance'): Promise<string> {
  const { data } = await supabaseAdmin
    .from('welfare_ledger')
    .select('fund, entry_type, amount')
    .eq('org_id', orgId)
    .is('deleted_at', null);
  const balance = (data ?? [])
    .filter((l) => l.fund === fund)
    .reduce((s, l) => s + (LEDGER_INFLOW.includes(l.entry_type) ? Number(l.amount) : -Number(l.amount)), 0);
  return Math.max(0, balance).toFixed(2);
}

/** Append a welfare_ledger row (premium, grant, loan disbursement, claim…). */
async function postLedger(
  orgId: string,
  fund: 'member_welfare' | 'staff_benevolent' | 'insurance',
  entryType: string,
  amount: string,
  memo: string,
  ref?: { type: string; id: string },
): Promise<void> {
  const { error } = await supabaseAdmin.from('welfare_ledger').insert({
    org_id: orgId,
    fund,
    entry_type: entryType,
    ref_type: ref?.type ?? null,
    ref_id: ref?.id ?? null,
    amount,
    memo,
  });
  if (error) pgError(error);
}

/* ── 1) Credit life ───────────────────────────────────────────────────────── */

function policyWire(p: Record<string, unknown>) {
  return {
    id: p['id'], orgId: p['org_id'], branchId: p['branch_id'], applicationId: p['application_id'],
    loanNumber: p['loan_number'], memberId: p['member_id'], memberName: p['member_name'],
    premiumRatePct: Number(p['premium_rate_pct']), premiumAmount: String(p['premium_amount']),
    principal: String(p['principal']), coverageAmount: String(p['coverage_amount']),
    startDate: p['start_date'], endDate: p['end_date'], nomineeName: p['nominee_name'],
    nomineeRelation: p['nominee_relation'], nomineePhone: p['nominee_phone'],
    status: p['status'], createdAt: p['created_at'], updatedAt: p['updated_at'],
  };
}

insWelfareLiveRouter.get(
  '/policies',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('credit_life_policies').select('*').eq('org_id', orgId).is('deleted_at', null).order('created_at', { ascending: false });
    if (req.query['branchId']) q = q.eq('branch_id', req.query['branchId'] as string);
    if (req.query['status']) q = q.eq('status', req.query['status'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({ items: (data ?? []).map((p) => policyWire(p as Record<string, unknown>)) });
  }),
);

insWelfareLiveRouter.post(
  '/policies',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const b = req.body as {
      applicationId: string; loanNumber: string; memberId: string; memberName: string;
      principal: string; termMonths: number; nomineeName: string; nomineeRelation: string;
      nomineePhone?: string; branchId?: string;
    };
    const { data: existing } = await supabaseAdmin
      .from('credit_life_policies')
      .select('id')
      .eq('org_id', orgId)
      .eq('application_id', b.applicationId)
      .eq('status', 'active')
      .maybeSingle();
    if (existing) throw Conflict('এই ঋণে ইতিমধ্যে পলিসি আছে / Policy already exists for this loan');
    const branchId = b.branchId ?? req.auth!.branchId ?? '';
    if (!branchId) throw BadRequest('branchId প্রয়োজন / branch required');
    const today = todayStr();
    const premium = creditLifePremium(b.principal, CREDIT_LIFE_DEFAULTS.premiumRatePct, CREDIT_LIFE_DEFAULTS.minPremiumBdt);
    const { data, error } = await supabaseAdmin
      .from('credit_life_policies')
      .insert({
        org_id: orgId,
        branch_id: branchId,
        application_id: b.applicationId,
        loan_number: b.loanNumber,
        member_id: b.memberId,
        member_name: b.memberName,
        premium_rate_pct: CREDIT_LIFE_DEFAULTS.premiumRatePct,
        premium_amount: premium,
        principal: b.principal,
        coverage_amount: creditLifeCoverage(b.principal, CREDIT_LIFE_DEFAULTS.coverageCapBdt),
        start_date: today,
        end_date: coverageEnd(today, b.termMonths),
        nominee_name: b.nomineeName,
        nominee_relation: b.nomineeRelation,
        nominee_phone: b.nomineePhone ?? null,
        status: 'active',
      })
      .select('*')
      .single();
    if (error) pgError(error);
    await postLedger(orgId, 'insurance', 'premium', premium, `বীমা প্রিমিয়াম (${b.loanNumber})`, { type: 'policy', id: (data as Record<string, unknown>)['id'] as string });
    res.status(201).json(policyWire(data as Record<string, unknown>));
  }),
);

function claimWire(c: Record<string, unknown>) {
  return {
    id: c['id'], orgId: c['org_id'], branchId: c['branch_id'], policyId: c['policy_id'],
    claimNo: c['claim_no'], kind: c['kind'], memberId: c['member_id'], memberName: c['member_name'],
    eventDate: c['event_date'], reportedDate: c['reported_date'], cause: c['cause'],
    documents: c['documents'] ?? [], assessmentNote: c['assessment_note'],
    claimedAmount: String(c['claimed_amount']), approvedAmount: c['approved_amount'] === null ? null : String(c['approved_amount']),
    settlementMode: c['settlement_mode'], status: c['status'], decisionNote: c['decision_note'],
    decidedAt: c['decided_at'], createdAt: c['created_at'], updatedAt: c['updated_at'],
  };
}

insWelfareLiveRouter.get(
  '/claims',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('insurance_claims').select('*').eq('org_id', orgId).is('deleted_at', null).order('created_at', { ascending: false });
    if (req.query['branchId']) q = q.eq('branch_id', req.query['branchId'] as string);
    if (req.query['status']) q = q.eq('status', req.query['status'] as string);
    if (req.query['kind']) q = q.eq('kind', req.query['kind'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({ items: (data ?? []).map((c) => claimWire(c as Record<string, unknown>)) });
  }),
);

insWelfareLiveRouter.post(
  '/claims',
  requirePermission('member:write'),
  validate(claimSubmitSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const b = req.body as {
      policyId: string; kind: string; eventDate: string; cause: string;
      documents: { id: string; labelBn: string; path: string }[]; assessmentNote: string; claimedAmount: string;
    };
    let branchId = req.auth!.branchId ?? '';
    let memberId = '';
    let memberName = '';
    if (b.kind === 'death') {
      const { data: policy } = await supabaseAdmin
        .from('credit_life_policies')
        .select('branch_id, member_id, member_name')
        .eq('org_id', orgId)
        .eq('id', b.policyId)
        .maybeSingle();
      if (!policy) throw NotFound('পলিসি পাওয়া যায়নি / Policy not found');
      branchId = policy.branch_id;
      memberId = policy.member_id;
      memberName = policy.member_name;
    } else {
      const { data: enrollment } = await supabaseAdmin
        .from('micro_enrollments')
        .select('branch_id, member_id, member_name, status')
        .eq('org_id', orgId)
        .eq('id', b.policyId)
        .maybeSingle();
      if (!enrollment) throw NotFound('ভর্তি পাওয়া যায়নি / Enrollment not found');
      if (enrollment.status !== 'active') throw Conflict('এই ভর্তি সক্রিয় নয় / Enrollment is not active');
      branchId = enrollment.branch_id;
      memberId = enrollment.member_id;
      memberName = enrollment.member_name;
    }
    const seq = await nextSeq('insurance_claims', orgId, 'claim_no', `CL-${new Date().getUTCFullYear()}`);
    const claimNo = `CL-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
    const { data, error } = await supabaseAdmin
      .from('insurance_claims')
      .insert({
        org_id: orgId, branch_id: branchId, policy_id: b.policyId, claim_no: claimNo, kind: b.kind,
        member_id: memberId, member_name: memberName, event_date: b.eventDate,
        reported_date: todayStr(), cause: b.cause ?? '', documents: b.documents,
        assessment_note: b.assessmentNote, claimed_amount: b.claimedAmount, status: 'submitted',
      })
      .select('*')
      .single();
    if (error) pgError(error);
    res.status(201).json(claimWire(data as Record<string, unknown>));
  }),
);

insWelfareLiveRouter.post(
  '/claims/:id/decision',
  requirePermission('member:write'),
  validate(claimDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { data: row, error } = await supabaseAdmin
      .from('insurance_claims')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) pgError(error);
    if (!row) throw NotFound('দাবি পাওয়া যায়নি / Claim not found');
    const claim = claimWire(row as Record<string, unknown>);
    const body = req.body as { action: 'advance' | 'approve' | 'reject' | 'pay' | 'settle_waiver'; note?: string; approvedAmount?: string };
    const now = nowIso();
    const note = body.note ?? '';

    if (body.action === 'advance') {
      const gate = claimCanAdvance(claim as never);
      if (!gate.ok) throw Conflict(`প্রয়োজনীয় নথি: ${gate.missing.join(', ')}`);
      const flow: Partial<Record<string, string>> = { submitted: 'bm_review', bm_review: 'am_review', am_review: 'ho_review' };
      const next = flow[claim.status as string];
      if (!next) throw Conflict('আর অগ্রিম করা যাবে না / Cannot advance further');
      if (!canTransitionClaim(claim.status as never, next as never)) throw Conflict('অবৈধ অবস্থান্তর / Invalid transition');
      const up = await supabaseAdmin.from('insurance_claims').update({ status: next, updated_at: now }).eq('id', row.id);
      if (up.error) pgError(up.error);
      return res.json(claimWire({ ...row, status: next, updated_at: now }));
    }

    if (body.action === 'reject') {
      if (!canTransitionClaim(claim.status as never, 'rejected')) throw Conflict('এই পর্যায়ে প্রত্যাখ্যান করা যাবে না / Cannot reject at this level');
      const up = await supabaseAdmin.from('insurance_claims').update({ status: 'rejected', decision_note: note, decided_at: now, updated_at: now }).eq('id', row.id);
      if (up.error) pgError(up.error);
      return res.json(claimWire({ ...row, status: 'rejected', decision_note: note, decided_at: now, updated_at: now }));
    }

    if (body.action === 'approve') {
      if (claim.status !== 'ho_review') throw Conflict('প্রধান কার্যালয় পর্যালোচনার পরেই অনুমোদন হবে / Approve only at HO review');
      const amount = body.approvedAmount ?? claim.claimedAmount;
      if (Number(amount) > Number(claim.claimedAmount)) throw Conflict('অনুমোদিত পরিমাণ দাবির বেশি হতে পারে না / Approved above claimed');
      const up = await supabaseAdmin
        .from('insurance_claims')
        .update({ status: 'approved', approved_amount: Number(amount).toFixed(2), decision_note: note, decided_at: now, updated_at: now })
        .eq('id', row.id);
      if (up.error) pgError(up.error);
      return res.json(claimWire({ ...row, status: 'approved', approved_amount: Number(amount).toFixed(2), decision_note: note, decided_at: now, updated_at: now }));
    }

    // pay / settle_waiver
    if (claim.status !== 'approved') throw Conflict('প্রথমে অনুমোদন প্রয়োজন / Approval required first');
    const mode = body.action === 'settle_waiver' ? 'waiver' : 'payout';
    const amount = claim.approvedAmount ?? '0.00';
    const up = await supabaseAdmin
      .from('insurance_claims')
      .update({ status: 'paid', settlement_mode: mode, updated_at: now })
      .eq('id', row.id);
    if (up.error) pgError(up.error);
    await postLedger(orgId, 'insurance', mode === 'waiver' ? 'claim_waiver' : 'claim_paid', amount, `বীমা দাবি ${claim.claimNo}`, { type: 'claim', id: row.id });
    await supabaseAdmin.from('credit_life_policies').update({ status: 'claimed', updated_at: now }).eq('org_id', orgId).eq('id', claim.policyId).eq('status', 'active');
    return res.json(claimWire({ ...row, status: 'paid', settlement_mode: mode, updated_at: now }));
  }),
);

/* ── 2) Micro insurance ───────────────────────────────────────────────────── */

insWelfareLiveRouter.get(
  '/micro/products',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('micro_insurance_products').select('*').eq('org_id', orgId).is('deleted_at', null).eq('active', true);
    if (req.query['kind']) q = q.eq('kind', req.query['kind'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({
      items: (data ?? []).map((p) => ({
        id: p.id, orgId: p.org_id, kind: p.kind, nameBn: p.name_bn, annualPremium: String(p.annual_premium),
        coverageLimit: String(p.coverage_limit), units: p.units, active: p.active,
      })),
    });
  }),
);

insWelfareLiveRouter.post(
  '/micro/products',
  requirePermission('branch:manage'),
  validate(microProductUpsertSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const b = req.body as { kind: string; nameBn: string; annualPremium: string; coverageLimit: string; units: number; active: boolean };
    const { data: existing } = await supabaseAdmin
      .from('micro_insurance_products')
      .select('id')
      .eq('org_id', orgId)
      .eq('kind', b.kind)
      .eq('name_bn', b.nameBn)
      .is('deleted_at', null)
      .maybeSingle();
    if (existing) {
      const up = await supabaseAdmin
        .from('micro_insurance_products')
        .update({ annual_premium: b.annualPremium, coverage_limit: b.coverageLimit, units: b.units, active: b.active, updated_at: nowIso() })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (up.error) pgError(up.error);
      const p = up.data as Record<string, unknown>;
      return res.status(201).json({ id: p['id'], orgId: p['org_id'], kind: p['kind'], nameBn: p['name_bn'], annualPremium: String(p['annual_premium']), coverageLimit: String(p['coverage_limit']), units: p['units'], active: p['active'] });
    }
    const ins = await supabaseAdmin
      .from('micro_insurance_products')
      .insert({ org_id: orgId, kind: b.kind, name_bn: b.nameBn, annual_premium: b.annualPremium, coverage_limit: b.coverageLimit, units: b.units, active: b.active })
      .select('*')
      .single();
    if (ins.error) pgError(ins.error);
    const p = ins.data as Record<string, unknown>;
    return res.status(201).json({ id: p['id'], orgId: p['org_id'], kind: p['kind'], nameBn: p['name_bn'], annualPremium: String(p['annual_premium']), coverageLimit: String(p['coverage_limit']), units: p['units'], active: p['active'] });
  }),
);

insWelfareLiveRouter.get(
  '/micro/enrollments',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('micro_enrollments').select('*').eq('org_id', orgId).is('deleted_at', null).order('created_at', { ascending: false });
    if (req.query['branchId']) q = q.eq('branch_id', req.query['branchId'] as string);
    if (req.query['kind']) q = q.eq('kind', req.query['kind'] as string);
    if (req.query['memberId']) q = q.eq('member_id', req.query['memberId'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({
      items: (data ?? []).map((e) => ({
        id: e.id, orgId: e.org_id, branchId: e.branch_id, productId: e.product_id, kind: e.kind,
        memberId: e.member_id, memberName: e.member_name, units: e.units, subjectRef: e.subject_ref,
        annualPremium: String(e.annual_premium), coverageLimit: String(e.coverage_limit),
        startDate: e.start_date, endDate: e.end_date, status: e.status, createdAt: e.created_at, updatedAt: e.updated_at,
      })),
    });
  }),
);

insWelfareLiveRouter.post(
  '/micro/enrollments',
  requirePermission('member:write'),
  validate(microEnrollSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const b = req.body as { productId: string; memberId: string; memberName: string; units: number; subjectRef?: string; startDate: string };
    const { data: product } = await supabaseAdmin
      .from('micro_insurance_products')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', b.productId)
      .is('deleted_at', null)
      .eq('active', true)
      .maybeSingle();
    if (!product) throw NotFound('পণ্য পাওয়া যায়নি বা নিষ্ক্রিয় / Product not found or inactive');
    const branchId = req.auth!.branchId ?? '';
    if (!branchId) throw BadRequest('branchId প্রয়োজন / branch required');
    const annualPremium = (Number(product.annual_premium) * b.units).toFixed(2);
    const coverageLimit = (Number(product.coverage_limit) * b.units).toFixed(2);
    const { data, error } = await supabaseAdmin
      .from('micro_enrollments')
      .insert({
        org_id: orgId, branch_id: branchId, product_id: product.id, kind: product.kind,
        member_id: b.memberId, member_name: b.memberName, units: b.units, subject_ref: b.subjectRef ?? '',
        annual_premium: annualPremium, coverage_limit: coverageLimit,
        start_date: b.startDate, end_date: coverageEnd(b.startDate, 12), status: 'active',
      })
      .select('*')
      .single();
    if (error) pgError(error);
    const e = data as Record<string, unknown>;
    await postLedger(orgId, 'insurance', 'premium', annualPremium, `${product.name_bn} প্রিমিয়াম`, { type: 'enrollment', id: e['id'] as string });
    res.status(201).json({
      id: e['id'], orgId: e['org_id'], branchId: e['branch_id'], productId: e['product_id'], kind: e['kind'],
      memberId: e['member_id'], memberName: e['member_name'], units: e['units'], subjectRef: e['subject_ref'],
      annualPremium: String(e['annual_premium']), coverageLimit: String(e['coverage_limit']),
      startDate: e['start_date'], endDate: e['end_date'], status: e['status'], createdAt: e['created_at'], updatedAt: e['updated_at'],
    });
  }),
);

insWelfareLiveRouter.post(
  '/micro/claims',
  requirePermission('member:write'),
  validate(microClaimSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const b = req.body as { enrollmentId: string; eventDate: string; cause?: string; photos: { id: string; labelBn: string; path: string }[]; assessmentNote: string; claimedAmount: string };
    const { data: enrollment } = await supabaseAdmin
      .from('micro_enrollments')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', b.enrollmentId)
      .maybeSingle();
    if (!enrollment) throw NotFound('ভর্তি পাওয়া যায়নি / Enrollment not found');
    if (enrollment.status !== 'active') throw Conflict('এই ভর্তি সক্রিয় নয় / Enrollment is not active');
    if ((b.photos ?? []).length === 0) throw BadRequest('মূল্যায়নের ছবি প্রয়োজন / Assessment photos required');
    const seq = await nextSeq('insurance_claims', orgId, 'claim_no', `CL-${new Date().getUTCFullYear()}`);
    const claimNo = `CL-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
    const { data, error } = await supabaseAdmin
      .from('insurance_claims')
      .insert({
        org_id: orgId, branch_id: enrollment.branch_id, policy_id: enrollment.id, claim_no: claimNo,
        kind: enrollment.kind, member_id: enrollment.member_id, member_name: enrollment.member_name,
        event_date: b.eventDate, reported_date: todayStr(), cause: b.cause ?? '', documents: b.photos,
        assessment_note: b.assessmentNote, claimed_amount: b.claimedAmount, status: 'submitted',
      })
      .select('*')
      .single();
    if (error) pgError(error);
    res.status(201).json(claimWire(data as Record<string, unknown>));
  }),
);

/* ── 3) Member/staff welfare fund ─────────────────────────────────────────── */

async function rulesWire(orgId: string) {
  const { data } = await supabaseAdmin.from('welfare_fund_rules').select('*').eq('org_id', orgId).maybeSingle();
  return data as Record<string, unknown> | null;
}

function rulesToWire(row: Record<string, unknown>) {
  return {
    id: row['id'] as string,
    orgId: row['org_id'] as string,
    monthlyContribution: String(row['monthly_contribution']),
    staffContribution: String(row['staff_contribution']),
    rules: {
      grantCapBdt: Number(row['grant_cap_bdt']),
      loanCapBdt: Number(row['loan_cap_bdt']),
      loanTermMonths: Number(row['loan_term_months']),
      bmApprovalUpToBdt: Number(row['bm_approval_up_to']),
      amApprovalUpToBdt: Number(row['am_approval_up_to']),
    },
    updatedAt: row['updated_at'] as string,
  };
}

insWelfareLiveRouter.get(
  '/welfare/rules',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const row = await rulesWire(orgId);
    if (!row) throw NotFound('নিয়ম পাওয়া যায়নি / Rules not configured yet');
    res.json(rulesToWire(row));
  }),
);

insWelfareLiveRouter.put(
  '/welfare/rules',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const patch = req.body as {
      monthlyContribution?: string; staffContribution?: string; grantCapBdt?: number; loanCapBdt?: number;
      loanTermMonths?: number; bmApprovalUpToBdt?: number; amApprovalUpToBdt?: number;
    };
    const values = {
      monthly_contribution: patch.monthlyContribution,
      staff_contribution: patch.staffContribution,
      grant_cap_bdt: patch.grantCapBdt,
      loan_cap_bdt: patch.loanCapBdt,
      loan_term_months: patch.loanTermMonths,
      bm_approval_up_to: patch.bmApprovalUpToBdt,
      am_approval_up_to: patch.amApprovalUpToBdt,
      updated_at: nowIso(),
    };
    const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
    const { data, error } = await supabaseAdmin
      .from('welfare_fund_rules')
      .upsert({ org_id: orgId, ...clean }, { onConflict: 'org_id' })
      .select('*')
      .single();
    if (error) pgError(error);
    res.json(rulesToWire(data as Record<string, unknown>));
  }),
);

function welfareWire(r: Record<string, unknown>) {
  return {
    id: r['id'], orgId: r['org_id'], branchId: r['branch_id'], fund: r['fund'], requestId: r['request_no'],
    requesterId: r['requester_id'], requesterName: r['requester_name'], kind: r['kind'], type: r['type'],
    amount: String(r['amount']), reason: r['reason'], photos: r['photos'] ?? [], status: r['status'],
    decisionNote: r['decision_note'], decidedAt: r['decided_at'], disbursedAt: r['disbursed_at'],
    repaymentMonths: r['repayment_months'], createdAt: r['created_at'], updatedAt: r['updated_at'],
  };
}

insWelfareLiveRouter.get(
  '/welfare/requests',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('welfare_requests').select('*').eq('org_id', orgId).is('deleted_at', null).order('created_at', { ascending: false });
    if (req.query['fund']) q = q.eq('fund', req.query['fund'] as string);
    if (req.query['status']) q = q.eq('status', req.query['status'] as string);
    if (req.query['branchId']) q = q.eq('branch_id', req.query['branchId'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({ items: (data ?? []).map((r) => welfareWire(r as Record<string, unknown>)) });
  }),
);

insWelfareLiveRouter.post(
  '/welfare/requests',
  requirePermission('member:write'),
  validate(welfareRequestSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const b = req.body as {
      fund: 'member' | 'staff'; requesterId: string; requesterName: string; kind: string; type: string;
      amount: string; reason: string; photos?: string[];
    };
    const rulesRow = await rulesWire(orgId);
    const rules = rulesRow
      ? rulesToWire(rulesRow).rules
      : { grantCapBdt: 5000, loanCapBdt: 20000, loanTermMonths: 10, bmApprovalUpToBdt: 3000, amApprovalUpToBdt: 10000 };
    const cap = welfareCapCheck(b.type as never, b.amount, rules);
    if (!cap.ok) throw BadRequest(cap.messageBn ?? 'সীমা ছাড়িয়েছে / Cap exceeded');
    // Fund availability: grants and loans commit the fund immediately.
    const ledgerFund = b.fund === 'staff' ? 'staff_benevolent' : 'member_welfare';
    const { data: pendingRows } = await supabaseAdmin
      .from('welfare_requests')
      .select('amount')
      .eq('org_id', orgId)
      .eq('fund', b.fund)
      .not('status', 'in', '(rejected,disbursed)');
    const pending = (pendingRows ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const available = Number(await ledgerBalance(orgId, ledgerFund)) - pending;
    if (available < Number(b.amount) - 0.001) {
      throw BadRequest('তহবিলে পর্যাপ্ত অর্থ নেই / Insufficient fund balance');
    }
    const branchId = req.auth!.branchId ?? '';
    if (!branchId) throw BadRequest('branchId প্রয়োজন / branch required');
    const year = new Date().getUTCFullYear();
    const seq = await nextSeq('welfare_requests', orgId, 'request_no', b.fund === 'staff' ? `SB-${year}` : `WF-${year}`);
    const requestNo = `${b.fund === 'staff' ? 'SB' : 'WF'}-${year}-${String(seq).padStart(4, '0')}`;
    const { data, error } = await supabaseAdmin
      .from('welfare_requests')
      .insert({
        org_id: orgId, branch_id: branchId, fund: b.fund, request_no: requestNo,
        requester_id: b.requesterId, requester_name: b.requesterName, kind: b.kind, type: b.type,
        amount: b.amount, reason: b.reason, photos: b.photos ?? [], status: 'submitted',
        repayment_months: b.type === 'interest_free_loan' ? rules.loanTermMonths : null,
      })
      .select('*')
      .single();
    if (error) pgError(error);
    res.status(201).json(welfareWire(data as Record<string, unknown>));
  }),
);

insWelfareLiveRouter.post(
  '/welfare/requests/:id/decision',
  requirePermission('member:write'),
  validate(welfareDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { data: row, error } = await supabaseAdmin
      .from('welfare_requests')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) pgError(error);
    if (!row) throw NotFound('আবেদন পাওয়া যায়নি / Request not found');
    const request = welfareWire(row as Record<string, unknown>);
    const body = req.body as { action: 'advance' | 'approve' | 'reject' | 'disburse'; note?: string };
    const now = nowIso();
    const note = body.note ?? '';
    const rulesRow = await rulesWire(orgId);
    const rules = rulesRow ? rulesToWire(rulesRow).rules : undefined;

    if (body.action === 'advance') {
      const next = welfareNextLevel(request.status as never, request.amount, rules).next;
      if (!next || next === 'approved') throw Conflict('পরবর্তী পর্যায় নেই / No further review level');
      if (!canTransitionWelfare(request.status as never, next)) throw Conflict('অবৈধ অবস্থান্তর / Invalid transition');
      const up = await supabaseAdmin.from('welfare_requests').update({ status: next, updated_at: now }).eq('id', row.id);
      if (up.error) pgError(up.error);
      return res.json(welfareWire({ ...row, status: next, updated_at: now }));
    }

    if (body.action === 'reject') {
      if (!canTransitionWelfare(request.status as never, 'rejected')) throw Conflict('এই পর্যায়ে প্রত্যাখ্যান করা যাবে না / Cannot reject at this level');
      const up = await supabaseAdmin.from('welfare_requests').update({ status: 'rejected', decision_note: note, decided_at: now, updated_at: now }).eq('id', row.id);
      if (up.error) pgError(up.error);
      return res.json(welfareWire({ ...row, status: 'rejected', decision_note: note, decided_at: now, updated_at: now }));
    }

    if (body.action === 'approve') {
      if (!canTransitionWelfare(request.status as never, 'approved')) throw Conflict('এই পর্যায় থেকে অনুমোদন করা যাবে না / Approve not allowed from this level');
      const gate = welfareNextLevel(request.status as never, request.amount, rules);
      if (gate.next !== 'approved') throw Conflict(`${gate.approverBn} এর অনুমোদন প্রয়োজন / Needs ${gate.approverBn} approval`);
      const up = await supabaseAdmin.from('welfare_requests').update({ status: 'approved', decision_note: note, decided_at: now, updated_at: now }).eq('id', row.id);
      if (up.error) pgError(up.error);
      return res.json(welfareWire({ ...row, status: 'approved', decision_note: note, decided_at: now, updated_at: now }));
    }

    // disburse
    if (request.status !== 'approved') throw Conflict('প্রথমে অনুমোদন প্রয়োজন / Approval required first');
    const up = await supabaseAdmin.from('welfare_requests').update({ status: 'disbursed', disbursed_at: now, updated_at: now }).eq('id', row.id);
    if (up.error) pgError(up.error);
    const fund = request.fund === 'staff' ? 'staff_benevolent' : 'member_welfare';
    await postLedger(orgId, fund as never, request.type === 'grant' ? 'grant' : 'loan_disbursed', request.amount, `${request.requestId} — ${request.requesterName}`, { type: 'welfare_request', id: row.id });
    return res.json(welfareWire({ ...row, status: 'disbursed', disbursed_at: now, updated_at: now }));
  }),
);

/* ── Ledger, summary, contribution, dividend ─────────────────────────────── */

insWelfareLiveRouter.get(
  '/welfare/ledger',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('welfare_ledger').select('*').eq('org_id', orgId).is('deleted_at', null).order('created_at', { ascending: false });
    if (req.query['fund']) q = q.eq('fund', req.query['fund'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({
      items: (data ?? []).map((l) => ({
        id: l.id, orgId: l.org_id, branchId: l.branch_id, fund: l.fund, entryType: l.entry_type,
        refType: l.ref_type, refId: l.ref_id, amount: String(l.amount), memo: l.memo, at: l.created_at,
      })),
      balances: {
        member: await ledgerBalance(orgId, 'member_welfare'),
        staff: await ledgerBalance(orgId, 'staff_benevolent'),
        insurance: await ledgerBalance(orgId, 'insurance'),
      },
    });
  }),
);

insWelfareLiveRouter.get(
  '/welfare/summary',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data } = await supabaseAdmin
      .from('welfare_requests')
      .select('fund, status')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .not('status', 'in', '(rejected,disbursed)');
    const rows = data ?? [];
    res.json({
      memberBalance: await ledgerBalance(orgId, 'member_welfare'),
      staffBalance: await ledgerBalance(orgId, 'staff_benevolent'),
      insuranceBalance: await ledgerBalance(orgId, 'insurance'),
      pendingMember: rows.filter((r) => r.fund === 'member').length,
      pendingStaff: rows.filter((r) => r.fund === 'staff').length,
    });
  }),
);

insWelfareLiveRouter.post(
  '/welfare/contribution',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { fund, amount, memo } = req.body as { fund: 'member_welfare' | 'staff_benevolent'; amount: string; memo?: string };
    if (!['member_welfare', 'staff_benevolent'].includes(fund) || !amount) {
      throw BadRequest('fund এবং amount প্রয়োজন / fund and amount required');
    }
    await postLedger(orgId, fund, 'contribution', amount, memo ?? 'চাঁদা জমা');
    res.status(201).json({ ok: true });
  }),
);

insWelfareLiveRouter.post(
  '/dividend/compute',
  requirePermission('branch:manage'),
  asyncHandler(async (_req, res) => {
    const { surplus, payoutPct, totalShares, holders } = _req.body as {
      surplus: string; payoutPct: number; totalShares?: number;
      holders: { memberId: string; memberName: string; shares: number }[];
    };
    if (!surplus || typeof payoutPct !== 'number' || !Array.isArray(holders)) {
      throw BadRequest('surplus, payoutPct, holders প্রয়োজন');
    }
    res.json(computeDividend({ surplus, payoutPct, totalShares: totalShares ?? holders.reduce((s, h) => s + h.shares, 0) }, holders));
  }),
);
