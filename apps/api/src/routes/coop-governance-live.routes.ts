/**
 * ── Cooperative governance live router (Supabase) ────────────────────────────
 * Mirrors coop-governance.routes.ts (demo) against the real tables (migration
 * 0042): dividend & surplus distribution (compute → AGM approve → post → pay,
 * per-member lines + payment journals), AGM records (create → notice →
 * attendance/resolutions/elections → minutes) and member exit settlement
 * (request → compute → approve → settle + exit journal). Pure math (surplus
 * split, period-weighted shares, settlement net) lives in @samity/shared so
 * the DB triggers, this API and the UI share one implementation.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  agmAttendanceSchema,
  agmElectionSchema,
  agmResolutionSchema,
  agmUpsertSchema,
  buildDividendJournal,
  buildDividendPaymentJournal,
  buildExitJournal,
  canTransitionDividendStatus,
  canTransitionExit,
  computeExitNet,
  distributeDividend,
  memberExitSchema,
} from '@samity/shared';
import { BadRequest, Conflict, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const coopGovLiveRouter = Router();
coopGovLiveRouter.use(requireAuth);

const orgOf = (req: RequestWithAuth) => req.auth!.orgId ?? '';
const nowIso = () => new Date().toISOString();

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

/** True when PostgREST reports the table itself is missing (PGRST205). */
function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === 'PGRST205' || /Could not find the table|schema cache/i.test(e.message ?? '');
}

/**
 * Governance journal trail (dividend posting/payments + exit journals).
 * The coop_journals table is optional — when it has not been applied, the
 * journal is still returned inline by the decision endpoints and this
 * persistence becomes a no-op instead of a 500.
 */
async function pushJournal(
  orgId: string,
  memo: string,
  lines: { accountCode: string; accountName: string; debit: string; credit: string }[],
): Promise<void> {
  const { error } = await supabaseAdmin.from('coop_journals').insert({
    org_id: orgId,
    memo,
    lines,
  });
  if (error && !isMissingTableError(error)) pgError(error);
}

/* ── 5) Dividend & surplus distribution ───────────────────────────────────── */

async function distributionWire(orgId: string, fiscalYear: string) {
  const { data: row, error } = await supabaseAdmin
    .from('dividend_distributions')
    .select('*')
    .eq('org_id', orgId)
    .eq('fiscal_year', fiscalYear)
    .maybeSingle();
  if (error) pgError(error);
  if (!row) throw NotFound('বণ্টন পাওয়া যায়নি / Distribution not found');
  const { data: lines } = await supabaseAdmin
    .from('dividend_lines')
    .select('*')
    .eq('org_id', orgId)
    .eq('distribution_id', row.id)
    .order('member_name');
  const perMember = (lines ?? []).map((l) => ({
    memberId: l.member_id,
    memberName: l.member_name,
    shares: l.shares,
    monthsHeld: l.months_held,
    weightedShares: Number(l.weighted_shares),
    weightPct: Number(l.weight_pct),
    amount: String(l.amount),
  }));
  const payments = (lines ?? []).filter((l) => l.paid_at !== null).map((l) => ({
    memberId: l.member_id,
    memberName: l.member_name,
    amount: String(l.amount),
    destination: l.destination as 'savings' | 'cash',
    paidAt: l.paid_at as string,
  }));
  return {
    fiscalYear: row.fiscal_year,
    surplus: String(row.surplus),
    reservePct: Number(row.reserve_pct),
    ratePct: Number(row.rate_pct),
    status: row.status,
    distribution: {
      pool: String(row.pool_amount),
      reserveAmount: String(row.reserve_amount),
      ratePct: Number(row.rate_pct),
      totalWeighted: Number(row.total_weighted),
      perMember,
    },
    payments,
  };
}

const dividendComputeSchema = z.object({
  fiscalYear: z.string().regex(/^\d{4}-\d{2}$/),
  surplus: z.string().regex(/^\d+(\.\d{1,2})?$/),
  reservePct: z.coerce.number().min(0).max(100).optional(),
  ratePct: z.coerce.number().min(0).max(100).optional(),
  holders: z
    .array(
      z.object({
        memberId: z.string().trim().min(1),
        memberName: z.string().trim().min(2).max(120),
        shares: z.coerce.number().int().min(0),
        monthsHeld: z.coerce.number().int().min(0).max(12).default(12),
      }),
    )
    .min(1)
    .max(5000),
});

const dividendDecisionSchema = z.object({
  action: z.enum(['agm_approve', 'post', 'pay']),
  memberId: z.string().trim().min(1).optional(),
  destination: z.enum(['savings', 'cash']).optional(),
});

coopGovLiveRouter.get(
  '/dividend',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data, error } = await supabaseAdmin
      .from('dividend_distributions')
      .select('fiscal_year')
      .eq('org_id', orgId)
      .order('fiscal_year', { ascending: false });
    if (error) pgError(error);
    const items = await Promise.all((data ?? []).map((d) => distributionWire(orgId, d.fiscal_year)));
    res.json({ items });
  }),
);

coopGovLiveRouter.post(
  '/dividend/compute',
  requirePermission('branch:manage'),
  validate(dividendComputeSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const b = req.body as { fiscalYear: string; surplus: string; reservePct?: number; ratePct?: number; holders: { memberId: string; memberName: string; shares: number; monthsHeld: number }[] };
    const { data: existing } = await supabaseAdmin
      .from('dividend_distributions')
      .select('id')
      .eq('org_id', orgId)
      .eq('fiscal_year', b.fiscalYear)
      .maybeSingle();
    if (existing) throw Conflict(`${b.fiscalYear} অর্থবছরের বণ্টন আছে / Distribution already exists for this fiscal year`);
    const distribution = distributeDividend({ surplus: b.surplus, reservePct: b.reservePct, ratePct: b.ratePct, holders: b.holders });
    const { data, error } = await supabaseAdmin
      .from('dividend_distributions')
      .insert({
        org_id: orgId,
        fiscal_year: b.fiscalYear,
        surplus: b.surplus,
        reserve_pct: b.reservePct ?? 25,
        rate_pct: b.ratePct ?? 8,
        reserve_amount: distribution.reserveAmount,
        pool_amount: distribution.pool,
        total_weighted: distribution.totalWeighted,
        status: 'computed',
      })
      .select('*')
      .single();
    if (error) pgError(error);
    await supabaseAdmin.from('dividend_lines').insert(
      distribution.perMember.map((m) => ({
        org_id: orgId,
        distribution_id: (data as Record<string, unknown>)['id'],
        member_id: m.memberId,
        member_name: m.memberName,
        shares: m.shares,
        months_held: m.monthsHeld,
        weighted_shares: m.weightedShares,
        weight_pct: m.weightPct,
        amount: m.amount,
        destination: 'savings',
      })),
    );
    res.status(201).json(await distributionWire(orgId, b.fiscalYear));
  }),
);

coopGovLiveRouter.get(
  '/dividend/:fiscalYear',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    res.json(await distributionWire(orgId, req.params['fiscalYear'] as string));
  }),
);

coopGovLiveRouter.post(
  '/dividend/:fiscalYear/decision',
  requirePermission('branch:manage'),
  validate(dividendDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const fiscalYear = req.params['fiscalYear'] as string;
    const { data: row, error } = await supabaseAdmin
      .from('dividend_distributions')
      .select('*')
      .eq('org_id', orgId)
      .eq('fiscal_year', fiscalYear)
      .maybeSingle();
    if (error) pgError(error);
    if (!row) throw NotFound('বণ্টন পাওয়া যায়নি / Distribution not found');
    const body = req.body as { action: 'agm_approve' | 'post' | 'pay'; memberId?: string; destination?: 'savings' | 'cash' };
    const now = nowIso();

    if (body.action === 'agm_approve') {
      if (!canTransitionDividendStatus(row.status as never, 'agm_approved')) throw Conflict('অবৈধ অবস্থান্তর / Invalid transition');
      const up = await supabaseAdmin.from('dividend_distributions').update({ status: 'agm_approved', updated_at: now }).eq('id', row.id);
      if (up.error) pgError(up.error);
      return res.json(await distributionWire(orgId, fiscalYear));
    }

    if (body.action === 'post') {
      if (!canTransitionDividendStatus(row.status as never, 'posted')) throw Conflict('প্রথমে সাধারণ সভার অনুমোদন প্রয়োজন / AGM approval required first');
      const journal = buildDividendJournal({ surplus: String(row.surplus), reservePct: Number(row.reserve_pct) });
      await pushJournal(orgId, journal.memo, journal.lines);
      const up = await supabaseAdmin.from('dividend_distributions').update({ status: 'posted', updated_at: now }).eq('id', row.id);
      if (up.error) pgError(up.error);
      return res.json(await distributionWire(orgId, fiscalYear));
    }

    // pay — per member line; the distribution may be paid member by member.
    if (row.status !== 'posted' && row.status !== 'paid') throw Conflict('প্রথমে পোস্টিং প্রয়োজন / Post the distribution first');
    if (!body.memberId) throw BadRequest('memberId প্রয়োজন / memberId required');
    const { data: line } = await supabaseAdmin
      .from('dividend_lines')
      .select('*')
      .eq('org_id', orgId)
      .eq('distribution_id', row.id)
      .eq('member_id', body.memberId)
      .maybeSingle();
    if (!line) throw NotFound('সদস্য বণ্টন তালিকায় নেই / Member not in the distribution');
    if (line.paid_at) throw Conflict('ইতিমধ্যে পরিশোধিত / Already paid');
    const destination = body.destination ?? 'savings';
    const journal = buildDividendPaymentJournal({ memberName: line.member_name, amount: String(line.amount), destination });
    await pushJournal(orgId, journal.memo, journal.lines);
    const up = await supabaseAdmin
      .from('dividend_lines')
      .update({ destination, paid_at: now, updated_at: now })
      .eq('id', line.id);
    if (up.error) pgError(up.error);
    await supabaseAdmin.from('dividend_distributions').update({ status: 'paid', updated_at: now }).eq('id', row.id).eq('status', 'posted');
    return res.json(await distributionWire(orgId, fiscalYear));
  }),
);

/* ── 6) AGM ────────────────────────────────────────────────────────────────── */

function agmWire(a: Record<string, unknown>) {
  return {
    id: a['id'], orgId: a['org_id'], fiscalYear: a['fiscal_year'], meetingDate: a['meeting_date'],
    venue: a['venue'], noticeDate: a['notice_date'], noticeDays: a['notice_days'],
    agenda: a['agenda'] ?? [], attendance: a['attendance'] ?? [], quorumRequired: a['quorum_required'],
    resolutions: a['resolutions'] ?? [], elections: a['elections'] ?? [], minutesBn: a['minutes_bn'],
    approvedBy: a['approved_by'], status: a['status'], createdAt: a['created_at'], updatedAt: a['updated_at'],
  };
}

const agmDecisionSchema = z.object({
  action: z.enum(['issue_notice', 'hold', 'approve_minutes']),
});

coopGovLiveRouter.get(
  '/agm',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data, error } = await supabaseAdmin
      .from('agm_records')
      .select('*')
      .eq('org_id', orgId)
      .order('meeting_date', { ascending: false });
    if (error) pgError(error);
    res.json({ items: (data ?? []).map((a) => agmWire(a as Record<string, unknown>)) });
  }),
);

coopGovLiveRouter.post(
  '/agm',
  requirePermission('branch:manage'),
  validate(agmUpsertSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const b = req.body as { fiscalYear: string; meetingDate: string; venue: string; noticeDays: number; agenda: string[] };
    const { data, error } = await supabaseAdmin
      .from('agm_records')
      .insert({
        org_id: orgId, fiscal_year: b.fiscalYear, meeting_date: b.meetingDate, venue: b.venue,
        notice_days: b.noticeDays ?? 14, agenda: b.agenda ?? [], quorum_required: 10, status: 'draft',
      })
      .select('*')
      .single();
    if (error) pgError(error);
    res.status(201).json(agmWire(data as Record<string, unknown>));
  }),
);

coopGovLiveRouter.get(
  '/agm/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data, error } = await supabaseAdmin
      .from('agm_records')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('সভা পাওয়া যায়নি / AGM not found');
    res.json(agmWire(data as Record<string, unknown>));
  }),
);

coopGovLiveRouter.put(
  '/agm/:id/attendance',
  requirePermission('branch:manage'),
  validate(agmAttendanceSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { data, error } = await supabaseAdmin
      .from('agm_records')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('সভা পাওয়া যায়নি / AGM not found');
    const up = await supabaseAdmin
      .from('agm_records')
      .update({ attendance: req.body['attendance'] ?? [], updated_at: nowIso() })
      .eq('id', data.id);
    if (up.error) pgError(up.error);
    res.json(agmWire({ ...data, attendance: req.body['attendance'] ?? [] }));
  }),
);

coopGovLiveRouter.post(
  '/agm/:id/resolutions',
  requirePermission('branch:manage'),
  validate(agmResolutionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { data, error } = await supabaseAdmin
      .from('agm_records')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('সভা পাওয়া যায়নি / AGM not found');
    const resolutions = [...((data.resolutions as unknown[]) ?? []), req.body];
    const up = await supabaseAdmin.from('agm_records').update({ resolutions, updated_at: nowIso() }).eq('id', data.id);
    if (up.error) pgError(up.error);
    res.status(201).json(agmWire({ ...data, resolutions }));
  }),
);

coopGovLiveRouter.post(
  '/agm/:id/elections',
  requirePermission('branch:manage'),
  validate(agmElectionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { data, error } = await supabaseAdmin
      .from('agm_records')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('সভা পাওয়া যায়নি / AGM not found');
    const elections = [...((data.elections as unknown[]) ?? []), req.body];
    const up = await supabaseAdmin.from('agm_records').update({ elections, updated_at: nowIso() }).eq('id', data.id);
    if (up.error) pgError(up.error);
    res.status(201).json(agmWire({ ...data, elections }));
  }),
);

coopGovLiveRouter.post(
  '/agm/:id/decision',
  requirePermission('branch:manage'),
  validate(agmDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { data, error } = await supabaseAdmin
      .from('agm_records')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('সভা পাওয়া যায়নি / AGM not found');
    const action = req.body['action'] as 'issue_notice' | 'hold' | 'approve_minutes';
    const now = nowIso();
    let patch: Record<string, unknown> = { updated_at: now };
    if (action === 'issue_notice') {
      patch = { ...patch, status: 'notice_issued', notice_date: now.slice(0, 10) };
    } else if (action === 'hold') {
      patch = { ...patch, status: 'held' };
    } else {
      patch = { ...patch, status: 'minutes_approved' };
    }
    const up = await supabaseAdmin.from('agm_records').update(patch).eq('id', data.id);
    if (up.error) pgError(up.error);
    res.json(agmWire({ ...data, ...patch }));
  }),
);

/* ── 7) Member exit settlement ────────────────────────────────────────────── */

function exitWire(x: Record<string, unknown>) {
  return {
    id: x['id'], orgId: x['org_id'], branchId: x['branch_id'], memberId: x['member_id'],
    memberName: x['member_name'], requestDate: x['request_date'], exitNo: x['exit_no'],
    lines: x['lines'] ?? [], savingsBalance: String(x['savings_balance']),
    shareValue: String(x['share_value']), dividendDue: String(x['dividend_due']),
    welfareBalance: String(x['welfare_balance']), duesOutstanding: String(x['dues_outstanding']),
    netPayable: String(x['net_payable']), status: x['status'], decisionNote: x['decision_note'],
    settledAt: x['settled_at'], createdAt: x['created_at'], updatedAt: x['updated_at'],
  };
}

const exitDecisionSchema = z.object({
  action: z.enum(['compute', 'approve', 'reject', 'settle']),
  note: z.string().trim().max(500).default(''),
});

coopGovLiveRouter.get(
  '/exits',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('member_exits').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (req.query['branchId']) q = q.eq('branch_id', req.query['branchId'] as string);
    if (req.query['status']) q = q.eq('status', req.query['status'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({ items: (data ?? []).map((x) => exitWire(x as Record<string, unknown>)) });
  }),
);

coopGovLiveRouter.post(
  '/exits',
  requirePermission('member:write'),
  validate(memberExitSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const b = req.body as {
      memberId: string; memberName: string; requestDate: string; savingsBalance: string;
      shareValue: string; dividendDue: string; welfareBalance: string; duesOutstanding: string; note?: string;
    };
    const branchId = req.auth!.branchId ?? '';
    if (!branchId) throw BadRequest('branchId প্রয়োজন / branch required');
    const { netPayable, lines } = computeExitNet(b);
    const { count } = await supabaseAdmin.from('member_exits').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    const exitNo = `EX-${nowIso().slice(0, 4)}-${String((count ?? 0) + 1).padStart(4, '0')}`;
    const { data, error } = await supabaseAdmin
      .from('member_exits')
      .insert({
        org_id: orgId, branch_id: branchId, member_id: b.memberId, member_name: b.memberName,
        request_date: b.requestDate, exit_no: exitNo,
        savings_balance: b.savingsBalance, share_value: b.shareValue, dividend_due: b.dividendDue,
        welfare_balance: b.welfareBalance, dues_outstanding: b.duesOutstanding,
        net_payable: netPayable, lines, status: 'requested', decision_note: b.note ?? '',
      })
      .select('*')
      .single();
    if (error) pgError(error);
    res.status(201).json(exitWire(data as Record<string, unknown>));
  }),
);

coopGovLiveRouter.post(
  '/exits/:id/decision',
  requirePermission('member:write'),
  validate(exitDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { data, error } = await supabaseAdmin
      .from('member_exits')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('নিষ্ক্রিয়করণ আবেদন পাওয়া যায়নি / Exit not found');
    const exit = exitWire(data as Record<string, unknown>);
    const body = req.body as { action: 'compute' | 'approve' | 'reject' | 'settle'; note?: string };
    const now = nowIso();

    if (body.action === 'compute') {
      if (!canTransitionExit(exit.status as never, 'computed')) throw Conflict('অবৈধ অবস্থান্তর / Invalid transition');
      const { netPayable, lines } = computeExitNet({
        savingsBalance: exit.savingsBalance, shareValue: exit.shareValue, dividendDue: exit.dividendDue,
        welfareBalance: exit.welfareBalance, duesOutstanding: exit.duesOutstanding,
      });
      const up = await supabaseAdmin
        .from('member_exits')
        .update({ net_payable: netPayable, lines, status: 'computed', updated_at: now })
        .eq('id', data.id);
      if (up.error) pgError(up.error);
      return res.json(exitWire({ ...data, net_payable: netPayable, lines, status: 'computed', updated_at: now }));
    }

    if (body.action === 'approve') {
      if (!canTransitionExit(exit.status as never, 'approved')) throw Conflict('প্রথমে গণনা প্রয়োজন / Compute first');
      const up = await supabaseAdmin
        .from('member_exits')
        .update({ status: 'approved', decision_note: body.note ?? exit.decisionNote, updated_at: now })
        .eq('id', data.id);
      if (up.error) pgError(up.error);
      return res.json(exitWire({ ...data, status: 'approved', decision_note: body.note ?? exit.decisionNote, updated_at: now }));
    }

    if (body.action === 'reject') {
      if (!canTransitionExit(exit.status as never, 'rejected')) throw Conflict('এই পর্যায়ে বাতিল করা যাবে না / Cannot reject at this level');
      const up = await supabaseAdmin
        .from('member_exits')
        .update({ status: 'rejected', decision_note: body.note ?? '', updated_at: now })
        .eq('id', data.id);
      if (up.error) pgError(up.error);
      return res.json(exitWire({ ...data, status: 'rejected', decision_note: body.note ?? '', updated_at: now }));
    }

    // settle
    if (!canTransitionExit(exit.status as never, 'settled')) throw Conflict('প্রথমে অনুমোদন প্রয়োজন / Approval required first');
    const journal = buildExitJournal({
      exitNo: exit.exitNo as string, savingsBalance: exit.savingsBalance, shareValue: exit.shareValue,
      dividendDue: exit.dividendDue, welfareBalance: exit.welfareBalance,
      duesOutstanding: exit.duesOutstanding, netPayable: exit.netPayable,
    });
    await pushJournal(orgId, journal.memo, journal.lines);
    const up = await supabaseAdmin
      .from('member_exits')
      .update({ status: 'settled', settled_at: now, updated_at: now })
      .eq('id', data.id);
    if (up.error) pgError(up.error);
    return res.json(exitWire({ ...data, status: 'settled', settled_at: now, updated_at: now }));
  }),
);

/* ── 8) Reports ───────────────────────────────────────────────────────────── */

coopGovLiveRouter.get(
  '/journals',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data, error } = await supabaseAdmin
      .from('coop_journals')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error && isMissingTableError(error)) {
      // coop_journals not applied in this project — nothing persisted yet.
      res.json({ items: [], note: 'coop_journals table not present — journals are preview-only' });
      return;
    }
    if (error) pgError(error);
    res.json({
      items: (data ?? []).map((j) => ({
        id: j.id, orgId: j.org_id, memo: j.memo, lines: j.lines, at: j.created_at,
      })),
    });
  }),
);
