/**
 * ── Accounting live router (Supabase) ────────────────────────────────────────
 * Mirrors accounting.demo.routes.ts against the real tables (migrations 0028,
 * 0030): chart of accounts, voucher workflow, event-map auto-postings,
 * cash book, bank reconciliation, petty cash, fund requisitions, trial
 * balance, budgets and period close. Money stays numeric(14,2) in Postgres
 * and is aliased to camelCase strings for the wire.
 */
import { Router } from 'express';
import {
  bankRecCreateSchema,
  cashBookCloseSchema,
  cashCountSchema,
  eventMappingSchema as eventMappingUpdateSchema,
  glAccountSchema as glAccountInputSchema,
  pettyCashSpendSchema,
  pettyCashTopUpSchema,
  voucherApproveSchema,
  voucherCheckSchema,
  voucherCreateSchema,
  budgetSetSchema,
  periodCloseSchema,
  periodReopenSchema,
  requisitionCreateSchema,
  requisitionDecisionSchema,
} from '@samity/shared';
import { Conflict, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const accountingRouter = Router();
accountingRouter.use(requireAuth);

const todayStr = () => new Date().toISOString().slice(0, 10);
const orgOf = (req: RequestWithAuth) => req.auth!.orgId ?? '';
const scopeOrg = (req: RequestWithAuth) => {
  const auth = req.auth!;
  return Boolean(auth.orgId) && auth.role !== 'super_admin';
};

/** Fetch a GL code → name map for line rendering. */
async function glNames(): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin.from('gl_accounts').select('code, name').is('deleted_at', null).limit(500);
  return new Map((data ?? []).map((a) => [a.code, a.name]));
}

/**
 * The budget/period-close tables live in migration 0030 (gl_budgets,
 * period_closes). If a database predates that migration, detect the PostgREST
 * "table missing" error so those endpoints degrade gracefully instead of 500.
 */
function isMissingTableError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  const code = e.code ?? '';
  const msg = e.message ?? '';
  return code === 'PGRST205' || code === '42P01' || msg.includes('Could not find the table') || msg.includes('schema cache');
}

const PERIOD_TABLES_HINT =
  'Accounting budgets/period-close tables are not installed yet. Run migration 0030_accounting_ops.sql in the Supabase SQL Editor.';

/** Trial-balance totals + voucher count for a period, stored on every close. */
async function periodSnapshot(orgId: string, start: string, end: string) {
  let linesQuery = supabaseAdmin
    .from('voucher_lines')
    .select('debit, credit, vouchers!inner(voucher_date, deleted_at)')
    .gte('vouchers.voucher_date', start)
    .lte('vouchers.voucher_date', end)
    .is('vouchers.deleted_at', null);
  let countQuery = supabaseAdmin
    .from('vouchers')
    .select('id', { count: 'exact', head: true })
    .gte('voucher_date', start)
    .lte('voucher_date', end)
    .is('deleted_at', null);
  if (orgId) {
    linesQuery = linesQuery.eq('org_id', orgId);
    countQuery = countQuery.eq('org_id', orgId);
  }
  const [linesRes, countRes] = await Promise.all([linesQuery, countQuery]);
  if (linesRes.error) throw linesRes.error;
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of linesRes.data ?? []) {
    totalDebit += Number(l.debit);
    totalCredit += Number(l.credit);
  }
  const totalDebitStr = totalDebit.toFixed(2);
  const totalCreditStr = totalCredit.toFixed(2);
  return {
    snapshot_json: {
      totalDebit: totalDebitStr,
      totalCredit: totalCreditStr,
      balanced: totalDebitStr === totalCreditStr,
      voucherCount: countRes.count ?? 0,
    },
  };
}

function voucherNumber(prefix: string, branchCode: string, seq: number): string {
  const yy = String(new Date().getFullYear()).slice(-2);
  return `VCH-${prefix}-${branchCode}-${yy}-${String(seq).padStart(4, '0')}`;
}

async function nextVoucherSeq(orgId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('vouchers')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  return (count ?? 0) + 1;
}

/** Load a voucher with its lines and attachments, aliased to the Voucher wire shape. */
async function loadVoucher(id: string) {
  const [vRes, names] = await Promise.all([
    supabaseAdmin
      .from('vouchers')
      .select('*, branches(code, name), voucher_lines(*), voucher_attachments(*)')
      .eq('id', id)
      .maybeSingle(),
    glNames(),
  ]);
  if (vRes.error) throw vRes.error;
  const v = vRes.data;
  if (!v) throw NotFound('Voucher not found');
  const lines = (v.voucher_lines ?? []).map((l: Record<string, unknown>) => ({
    accountCode: l['account_code'],
    accountName: names.get(String(l['account_code'])) ?? '',
    fundId: l['fund_id'] ?? null,
    projectName: l['project_name'] ?? null,
    partyName: l['party_name'] ?? null,
    note: l['note'] ?? null,
    debit: String(l['debit'] ?? '0'),
    credit: String(l['credit'] ?? '0'),
  }));
  return {
    id: v.id,
    voucherNumber: v.voucher_number,
    branchId: v.branch_id,
    branchName: v.branches?.name ?? '',
    voucherType: v.voucher_type,
    voucherDate: v.voucher_date,
    fundId: v.fund_id ?? null,
    fundName: null,
    projectName: v.project_name ?? null,
    payeePayer: v.payee_payer ?? null,
    memo: v.memo ?? '',
    status: v.status,
    lines,
    attachments: (v.voucher_attachments ?? []).map((a: Record<string, unknown>) => ({
      name: a['name'],
      path: a['storage_path'],
      sizeBytes: a['size_bytes'] ?? 0,
    })),
    autoSource: v.auto_source ?? null,
    preparedBy: v.prepared_by ?? null,
    checkedBy: v.checked_by ?? null,
    checkedAt: v.checked_at ?? null,
    approvedBy: v.approved_by ?? null,
    approvedAt: v.approved_at ?? null,
    createdAt: v.created_at,
  };
}

// ── 1) Chart of accounts ─────────────────────────────────────────────────────
accountingRouter.get(
  '/accounts',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from('gl_accounts')
      .select('id, org_id, code, name, name_bn, type, category, is_active, created_at')
      .is('deleted_at', null)
      .order('code');
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    if (req.query['includeInactive'] !== 'true') query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        nameBn: a.name_bn ?? a.name,
        type: a.type,
        category: a.category,
        parentCode: null,
        isActive: a.is_active,
      })),
    });
  }),
);

accountingRouter.post(
  '/accounts',
  requirePermission('org:manage'),
  validate(glAccountInputSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { code: string; name: string; nameBn: string; type: string; category: string; isActive?: boolean };
    const { data, error } = await supabaseAdmin
      .from('gl_accounts')
      .insert({
        org_id: orgOf(req),
        code: body.code,
        name: body.name,
        name_bn: body.nameBn,
        type: body.type,
        category: body.category,
        is_active: body.isActive ?? true,
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) {
      if (String(error.message).includes('duplicate key')) throw Conflict('Account code exists');
      throw error;
    }
    res.status(201).json({ id: data.id, ...body, isActive: body.isActive ?? true });
  }),
);

// ── Trial balance ────────────────────────────────────────────────────────────
accountingRouter.get(
  '/trial-balance',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const [accountsRes, linesRes] = await Promise.all([
      supabaseAdmin.from('gl_accounts').select('code, name, name_bn, type').is('deleted_at', null).eq('is_active', true),
      supabaseAdmin.from('voucher_lines').select('account_code, debit, credit'),
    ]);
    if (accountsRes.error) throw accountsRes.error;
    if (linesRes.error) throw linesRes.error;
    const totals = new Map<string, { debit: number; credit: number }>();
    for (const l of linesRes.data ?? []) {
      const t = totals.get(l.account_code) ?? { debit: 0, credit: 0 };
      t.debit += Number(l.debit);
      t.credit += Number(l.credit);
      totals.set(l.account_code, t);
    }
    const debitNature = new Set(['asset', 'expense']);
    const rows: unknown[] = [];
    let totalDebit = 0;
    let totalCredit = 0;
    for (const a of accountsRes.data ?? []) {
      const t = totals.get(a.code);
      const debit = t?.debit ?? 0;
      const credit = t?.credit ?? 0;
      if (debit === 0 && credit === 0) continue;
      const net = debitNature.has(a.type) ? debit - credit : credit - debit;
      if (net > 0) totalDebit += net;
      else totalCredit += -net;
      rows.push({
        code: a.code,
        name: a.name,
        nameBn: a.name_bn ?? a.name,
        type: a.type,
        totalDebit: debit.toFixed(2),
        totalCredit: credit.toFixed(2),
        balance: Math.abs(net).toFixed(2),
      });
    }
    res.json({ rows, totalDebit: totalDebit.toFixed(2), totalCredit: totalCredit.toFixed(2), balanced: Math.abs(totalDebit - totalCredit) < 0.005 });
  }),
);

// ── 2) Vouchers ──────────────────────────────────────────────────────────────
accountingRouter.get(
  '/vouchers',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from('vouchers')
      .select('id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const status = req.query['status'];
    if (typeof status === 'string' && status) query = query.eq('status', status);
    const voucherType = req.query['voucherType'];
    if (typeof voucherType === 'string' && voucherType) query = query.eq('voucher_type', voucherType);
    const { data, error } = await query;
    if (error) throw error;
    const items = await Promise.all((data ?? []).map((v) => loadVoucher(v.id)));
    res.json({ items });
  }),
);

accountingRouter.post(
  '/vouchers',
  requirePermission('savings:write'),
  validate(voucherCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as {
      branchId: string;
      voucherType: string;
      voucherDate: string;
      fundId?: string | null;
      projectName?: string | null;
      payeePayer?: string;
      memo: string;
      lines: Array<{ accountCode: string; fundId?: string | null; projectName?: string | null; partyName?: string | null; note?: string | null; debit: string; credit: string }>;
      attachments?: Array<{ name: string; path: string; sizeBytes: number }>;
    };
    const { data: branch } = await supabaseAdmin.from('branches').select('code').eq('id', body.branchId).maybeSingle();
    const prefixMap: Record<string, string> = { cash_receipt: 'CR', cash_payment: 'CP', bank_payment: 'BP', journal: 'JV', contra: 'CV' };
    const seq = await nextVoucherSeq(orgOf(req));
    const number = voucherNumber(prefixMap[body.voucherType] ?? 'JV', branch?.code ?? 'HO', seq);

    const { data: voucher, error } = await supabaseAdmin
      .from('vouchers')
      .insert({
        org_id: orgOf(req),
        branch_id: body.branchId,
        voucher_number: number,
        voucher_type: body.voucherType,
        voucher_date: body.voucherDate,
        fund_id: body.fundId ?? null,
        project_name: body.projectName ?? null,
        payee_payer: body.payeePayer ?? null,
        memo: body.memo,
        status: 'draft',
        prepared_by: req.auth!.userId,
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;

    await supabaseAdmin.from('voucher_lines').insert(
      body.lines.map((l) => ({
        voucher_id: voucher.id,
        org_id: orgOf(req),
        account_code: l.accountCode,
        fund_id: l.fundId ?? null,
        project_name: l.projectName ?? null,
        party_name: l.partyName ?? null,
        note: l.note ?? null,
        debit: l.debit,
        credit: l.credit,
      })),
    );
    if (body.attachments?.length) {
      await supabaseAdmin.from('voucher_attachments').insert(
        body.attachments.map((a) => ({ voucher_id: voucher.id, org_id: orgOf(req), name: a.name, storage_path: a.path, size_bytes: a.sizeBytes, created_by: req.auth!.userId })),
      );
    }
    res.status(201).json(await loadVoucher(voucher.id));
  }),
);

/** Shared voucher status transition (check/approve). */
async function transitionVoucher(id: string, from: string, to: string, userId: string, atColumn: string, byColumn: string, note?: string) {
  const patch: Record<string, unknown> = { status: to };
  patch[byColumn] = userId;
  patch[atColumn] = new Date().toISOString();
  if (note) patch['memo'] = undefined; // note is not persisted separately
  const { data, error } = await supabaseAdmin
    .from('vouchers')
    .update(patch)
    .eq('id', id)
    .eq('status', from)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error || !data) throw NotFound(`Voucher not found or not in '${from}' status`);
  return loadVoucher(id);
}

accountingRouter.post(
  '/vouchers/:id/check',
  requirePermission('savings:write'),
  validate(voucherCheckSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    res.json(await transitionVoucher(req.params['id'] as string, 'draft', 'checked', req.auth!.userId, 'checked_at', 'checked_by', (req.body as { note?: string }).note));
  }),
);

accountingRouter.post(
  '/vouchers/:id/approve',
  requirePermission('member:approve'),
  validate(voucherApproveSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    res.json(await transitionVoucher(req.params['id'] as string, 'checked', 'approved', req.auth!.userId, 'approved_at', 'approved_by', (req.body as { note?: string }).note));
  }),
);

// ── 3) Event mappings + auto postings ────────────────────────────────────────
accountingRouter.get(
  '/event-mappings',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('event_journal_mappings').select('*').order('event');
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((m) => ({
        id: m.id,
        event: m.event,
        settlementCode: m.settlement_code,
        counterCode: m.counter_code,
        isActive: m.is_active,
      })),
    });
  }),
);

accountingRouter.patch(
  '/event-mappings/:id',
  requirePermission('org:manage'),
  validate(eventMappingUpdateSchema.partial()),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { settlementCode?: string; counterCode?: string; isActive?: boolean };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.settlementCode) patch['settlement_code'] = body.settlementCode;
    if (body.counterCode) patch['counter_code'] = body.counterCode;
    if (body.isActive !== undefined) patch['is_active'] = body.isActive;
    const { data, error } = await supabaseAdmin
      .from('event_journal_mappings')
      .update(patch)
      .eq('id', req.params['id'] as string)
      .select('*')
      .single();
    if (error || !data) throw NotFound('Mapping not found');
    res.json({ id: data.id, event: data.event, settlementCode: data.settlement_code, counterCode: data.counter_code, isActive: data.is_active });
  }),
);

accountingRouter.get(
  '/postings',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from('journal_postings')
      .select('*, vouchers!inner(id, voucher_number, voucher_type, voucher_date, memo, status, branches(code, name))')
      .order('created_at', { ascending: false })
      .limit(200);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    const items = (data ?? []).map((p) => ({
      id: p.vouchers.id,
      voucherNumber: p.vouchers.voucher_number,
      branchId: null,
      branchName: p.vouchers.branches?.name ?? '',
      voucherType: p.vouchers.voucher_type,
      voucherDate: p.vouchers.voucher_date,
      fundId: null,
      fundName: null,
      projectName: null,
      payeePayer: null,
      memo: p.vouchers.memo ?? '',
      status: p.vouchers.status,
      lines: [],
      attachments: [],
      autoSource: p.event,
      preparedBy: null,
      checkedBy: null,
      checkedAt: null,
      approvedBy: null,
      approvedAt: null,
      createdAt: p.created_at,
    }));
    res.json({ items });
  }),
);

accountingRouter.post(
  '/postings',
  requirePermission('savings:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { event?: string; amount?: string; branchId?: string; refId?: string };
    if (!body.event || !body.amount) throw new Error('event and amount are required');

    const { data: mapping, error: mapErr } = await supabaseAdmin
      .from('event_journal_mappings')
      .select('*')
      .eq('event', body.event)
      .eq('org_id', orgOf(req))
      .maybeSingle();
    if (mapErr) throw mapErr;
    if (!mapping) throw NotFound(`No event mapping for '${body.event}' — configure one in Event mappings`);

    const names = await glNames();
    const moneyIn = ['savings_deposit', 'loan_collection', 'fee_collected', 'insurance_premium'].includes(body.event);
    const amt = Number(body.amount).toFixed(2);
    const branchId = body.branchId ?? (await supabaseAdmin.from('branches').select('id').limit(1)).data?.[0]?.id;
    if (!branchId) throw NotFound('No branch configured');

    const seq = await nextVoucherSeq(orgOf(req));
    const number = voucherNumber('JV', 'AUTO', seq);
    const { data: voucher, error } = await supabaseAdmin
      .from('vouchers')
      .insert({
        org_id: orgOf(req),
        branch_id: branchId,
        voucher_number: number,
        voucher_type: 'journal',
        voucher_date: todayStr(),
        memo: `Auto: ${body.event} ${amt}`,
        status: 'approved',
        auto_source: body.event,
        prepared_by: req.auth!.userId,
        approved_by: req.auth!.userId,
        approved_at: new Date().toISOString(),
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;

    const lines = moneyIn
      ? [
          { accountCode: mapping.settlement_code, debit: amt, credit: '0.00' },
          { accountCode: mapping.counter_code, debit: '0.00', credit: amt },
        ]
      : [
          { accountCode: mapping.counter_code, debit: amt, credit: '0.00' },
          { accountCode: mapping.settlement_code, debit: '0.00', credit: amt },
        ];
    await supabaseAdmin.from('voucher_lines').insert(
      lines.map((l) => ({ voucher_id: voucher.id, org_id: orgOf(req), account_code: l.accountCode, debit: l.debit, credit: l.credit })),
    );
    await supabaseAdmin.from('journal_postings').insert({
      org_id: orgOf(req),
      event: body.event,
      source_table: 'manual',
      source_id: voucher.id,
      amount: body.amount,
      memo: `Auto posting: ${body.event}`,
      voucher_id: voucher.id,
      idempotency_key: `manual:${body.event}:${voucher.id}`,
      created_by: req.auth!.userId,
    });
    void names;
    res.status(201).json(await loadVoucher(voucher.id));
  }),
);

// ── 4) Cash book ─────────────────────────────────────────────────────────────
accountingRouter.get(
  '/cash-book',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const branchId = (req.query['branchId'] as string) ?? '';
    const date = (req.query['date'] as string) ?? todayStr();
    if (!branchId) throw NotFound('branchId required');
    const [dayRes, linesRes] = await Promise.all([
      supabaseAdmin
        .from('cash_book_days')
        .select('*, branches(name), cash_book_lines(*)')
        .eq('branch_id', branchId)
        .eq('book_date', date)
        .maybeSingle(),
      supabaseAdmin
        .from('vouchers')
        .select('voucher_number, voucher_type, memo, voucher_lines(debit, credit)')
        .eq('branch_id', branchId)
        .eq('voucher_date', date)
        .is('deleted_at', null),
    ]);
    if (dayRes.error) throw dayRes.error;
    if (linesRes.error) throw linesRes.error;
    const day = dayRes.data;
    const lines = (linesRes.data ?? []).map((v) => {
      const cashIn = (v.voucher_lines ?? []).reduce((s: number, l: { credit: string }) => s + Number(l.credit ?? 0), 0);
      const cashOut = (v.voucher_lines ?? []).reduce((s: number, l: { debit: string }) => s + Number(l.debit ?? 0), 0);
      return { voucherNumber: v.voucher_number, voucherType: v.voucher_type, memo: v.memo ?? '', cashIn: cashIn.toFixed(2), cashOut: cashOut.toFixed(2) };
    });
    if (!day) {
      // Synthesize an open day from today's vouchers so the screen works pre-close.
      const opening = '0.00';
      const cashIn = lines.reduce((s, l) => s + Number(l.cashIn), 0);
      const cashOut = lines.reduce((s, l) => s + Number(l.cashOut), 0);
      const expected = (Number(opening) + cashIn - cashOut).toFixed(2);
      res.json({
        id: null,
        branchId,
        branchName: '',
        bookDate: date,
        status: 'open',
        openingBalance: opening,
        totalCashIn: cashIn.toFixed(2),
        totalCashOut: cashOut.toFixed(2),
        expectedClosing: expected,
        countedCash: null,
        difference: null,
        differenceKind: null,
        closingBalance: null,
        locked: false,
        managerSignName: null,
        accountantSignName: null,
        closedAt: null,
        note: null,
        lines,
      });
      return;
    }
    res.json({
      id: day.id,
      branchId: day.branch_id,
      branchName: day.branches?.name ?? '',
      bookDate: day.book_date,
      status: day.status,
      openingBalance: String(day.opening_balance ?? '0'),
      totalCashIn: String(day.total_cash_in ?? '0'),
      totalCashOut: String(day.total_cash_out ?? '0'),
      expectedClosing: String(day.expected_closing ?? '0'),
      countedCash: day.counted_cash != null ? String(day.counted_cash) : null,
      difference: day.difference != null ? String(day.difference) : null,
      differenceKind: day.difference_kind,
      closingBalance: day.closing_balance != null ? String(day.closing_balance) : null,
      locked: day.locked,
      managerSignName: day.manager_sign_name,
      accountantSignName: day.accountant_sign_name,
      closedAt: day.closed_at,
      note: day.note,
      lines: (day.cash_book_lines ?? []).map((l: Record<string, unknown>) => ({
        voucherNumber: l['voucher_number'],
        voucherType: l['voucher_type'],
        memo: '',
        cashIn: String(l['cash_in'] ?? '0'),
        cashOut: String(l['cash_out'] ?? '0'),
      })),
    });
  }),
);

accountingRouter.post(
  '/cash-book/count',
  requirePermission('savings:write'),
  validate(cashCountSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { countedCash: string; note?: string };
    const branchId = (req.query['branchId'] as string) ?? '';
    const date = (req.query['date'] as string) ?? todayStr();
    if (!branchId) throw NotFound('branchId required');
    const { data: day } = await supabaseAdmin
      .from('cash_book_days')
      .select('*')
      .eq('branch_id', branchId)
      .eq('book_date', date)
      .maybeSingle();
    if (!day) throw NotFound('Cash book day not found — close via cash-book/close');
    const counted = Number(body.countedCash);
    const diff = counted - Number(day.expected_closing ?? 0);
    const { data: updated, error } = await supabaseAdmin
      .from('cash_book_days')
      .update({
        counted_cash: body.countedCash,
        difference: diff.toFixed(2),
        difference_kind: Math.abs(diff) < 0.005 ? 'exact' : diff > 0 ? 'excess' : 'shortage',
        note: body.note ?? day.note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', day.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json({ ok: true, differenceKind: updated.difference_kind, difference: String(updated.difference) });
  }),
);

accountingRouter.post(
  '/cash-book/close',
  requirePermission('member:approve'),
  validate(cashBookCloseSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { countedCash: string; managerSignName: string; accountantSignName: string; note?: string };
    const branchId = (req.query['branchId'] as string) ?? '';
    const date = (req.query['date'] as string) ?? todayStr();
    if (!branchId) throw NotFound('branchId required');

    // Roll up the day's vouchers for the totals.
    const { data: vouchers } = await supabaseAdmin
      .from('vouchers')
      .select('voucher_number, voucher_type, voucher_lines(debit, credit)')
      .eq('branch_id', branchId)
      .eq('voucher_date', date)
      .is('deleted_at', null);
    let cashIn = 0;
    let cashOut = 0;
    const lines = (vouchers ?? []).map((v) => {
      const ci = (v.voucher_lines ?? []).reduce((s: number, l: { credit: string }) => s + Number(l.credit ?? 0), 0);
      const co = (v.voucher_lines ?? []).reduce((s: number, l: { debit: string }) => s + Number(l.debit ?? 0), 0);
      cashIn += ci;
      cashOut += co;
      return { voucher_number: v.voucher_number, voucher_type: v.voucher_type, cash_in: ci.toFixed(2), cash_out: co.toFixed(2) };
    });

    const counted = Number(body.countedCash);
    const expected = cashIn - cashOut; // opening 0 for synthesized close
    const diff = counted - expected;
    const kind = Math.abs(diff) < 0.005 ? 'exact' : diff > 0 ? 'excess' : 'shortage';

    const payload = {
      org_id: orgOf(req),
      branch_id: branchId,
      book_date: date,
      status: 'closed',
      opening_balance: '0.00',
      total_cash_in: cashIn.toFixed(2),
      total_cash_out: cashOut.toFixed(2),
      expected_closing: expected.toFixed(2),
      counted_cash: body.countedCash,
      difference: diff.toFixed(2),
      difference_kind: kind,
      closing_balance: body.countedCash,
      locked: true,
      manager_sign_name: body.managerSignName,
      accountant_sign_name: body.accountantSignName,
      closed_at: new Date().toISOString(),
      note: body.note ?? null,
      created_by: req.auth!.userId,
      updated_at: new Date().toISOString(),
    };
    const { data: day, error } = await supabaseAdmin
      .from('cash_book_days')
      .upsert(payload, { onConflict: 'org_id, branch_id, book_date' })
      .select('id')
      .single();
    if (error) throw error;
    // Replace the day's line snapshot.
    await supabaseAdmin.from('cash_book_lines').delete().eq('cash_book_id', day.id);
    if (lines.length > 0) {
      await supabaseAdmin.from('cash_book_lines').insert(lines.map((l) => ({ cash_book_id: day.id, ...l })));
    }
    res.json({ ok: true, differenceKind: kind, difference: diff.toFixed(2) });
  }),
);

// ── 5) Bank reconciliation ───────────────────────────────────────────────────
accountingRouter.get(
  '/bank-reconciliations',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from('bank_reconciliations')
      .select('*, bank_statement_lines(*)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((r) => {
        const lines = (r.bank_statement_lines ?? []) as Array<Record<string, unknown>>;
        const cleared = lines.filter((l) => l['matched_voucher_number'] != null);
        const uncleared = lines.filter((l) => l['matched_voucher_number'] == null);
        return {
          id: r.id,
          branchId: r.branch_id,
          bankCode: r.bank_code,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          bookBalance: String(r.book_balance ?? '0'),
          statementBalance: String(r.statement_balance ?? '0'),
          status: r.status,
          statementLines: lines.map((l) => ({
            id: String(l['id']),
            valueDate: String(l['value_date']),
            narration: String(l['narration'] ?? ''),
            amount: String(l['amount'] ?? '0'),
            cleared: l['matched_voucher_number'] != null,
            matchedVoucherNumber: (l['matched_voucher_number'] as string) ?? null,
          })),
          clearedCount: cleared.length,
          unclearedTotal: uncleared.reduce((s, l) => s + Number(l['amount'] ?? 0), 0).toFixed(2),
          preparedBy: r.prepared_by ?? null,
          createdAt: r.created_at,
        };
      }),
    });
  }),
);

accountingRouter.post(
  '/bank-reconciliations',
  requirePermission('savings:write'),
  validate(bankRecCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as {
      branchId: string;
      bankCode: string;
      periodStart: string;
      periodEnd: string;
      statementBalance: string;
      statementLines: Array<{ valueDate: string; narration: string; amount: string; matchedVoucherNumber?: string | null }>;
    };
    // Book balance = net of the bank-code GL movements for the period.
    const { data: bookLines } = await supabaseAdmin
      .from('voucher_lines')
      .select('debit, credit, vouchers!inner(voucher_date, deleted_at)')
      .eq('account_code', body.bankCode)
      .gte('vouchers.voucher_date', body.periodStart)
      .lte('vouchers.voucher_date', body.periodEnd)
      .is('vouchers.deleted_at', null);
    const bookBalance = (bookLines ?? []).reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);

    const { data: rec, error } = await supabaseAdmin
      .from('bank_reconciliations')
      .insert({
        org_id: orgOf(req),
        branch_id: body.branchId,
        bank_code: body.bankCode,
        period_start: body.periodStart,
        period_end: body.periodEnd,
        book_balance: bookBalance.toFixed(2),
        statement_balance: body.statementBalance,
        status: 'pending',
        prepared_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    if (body.statementLines.length > 0) {
      await supabaseAdmin.from('bank_statement_lines').insert(
        body.statementLines.map((l) => ({
          reconciliation_id: rec.id,
          value_date: l.valueDate,
          narration: l.narration,
          amount: l.amount,
          matched_voucher_number: l.matchedVoucherNumber ?? null,
        })),
      );
    }
    res.status(201).json({ id: rec.id, ok: true });
  }),
);

accountingRouter.post(
  '/bank-reconciliations/:id/lines/:lineId/clear',
  requirePermission('savings:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = (req.body ?? {}) as { matchedVoucherNumber?: string };
    const { error } = await supabaseAdmin
      .from('bank_statement_lines')
      .update({ matched_voucher_number: body.matchedVoucherNumber ?? `cleared-${req.auth!.userId.slice(0, 8)}` })
      .eq('id', req.params['lineId'] as string)
      .eq('reconciliation_id', req.params['id'] as string);
    if (error) throw error;
    res.json({ ok: true });
  }),
);

// ── Petty cash ───────────────────────────────────────────────────────────────
accountingRouter.get(
  '/petty-cash',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const branchId = (req.query['branchId'] as string) ?? '';
    let query = supabaseAdmin.from('petty_cash_accounts').select('*, branches(name)').limit(1);
    if (branchId) query = query.eq('branch_id', branchId);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data: account } = await query.maybeSingle();
    if (!account) {
      res.json({ branchId, branchName: '', balance: '0.00', limit: '0.00', withinLimit: true, movements: [] });
      return;
    }
    const { data: movements } = await supabaseAdmin
      .from('petty_cash_movements')
      .select('*')
      .eq('branch_id', account.branch_id)
      .order('created_at', { ascending: false })
      .limit(50);
    res.json({
      branchId: account.branch_id,
      branchName: account.branches?.name ?? '',
      balance: String(account.balance ?? '0'),
      limit: String(account.spend_limit ?? '0'),
      withinLimit: Number(account.balance) <= Number(account.spend_limit ?? 0),
      movements: (movements ?? []).map((m) => ({
        id: m.id,
        at: m.created_at,
        kind: m.kind,
        amount: String(m.amount),
        expenseCode: m.expense_code ?? null,
        spentOn: m.spent_on ?? null,
        note: m.note ?? null,
        balanceAfter: String(m.balance_after ?? '0'),
      })),
    });
  }),
);

accountingRouter.post(
  '/petty-cash/top-up',
  requirePermission('savings:write'),
  validate(pettyCashTopUpSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { branchId: string; amount: string; note?: string };
    const { data: account } = await supabaseAdmin
      .from('petty_cash_accounts')
      .select('*')
      .eq('branch_id', body.branchId)
      .maybeSingle();
    const current = account ? Number(account.balance) : 0;
    const after = current + Number(body.amount);
    if (account) {
      await supabaseAdmin
        .from('petty_cash_accounts')
        .update({ balance: after.toFixed(2), updated_at: new Date().toISOString() })
        .eq('id', account.id);
    } else {
      await supabaseAdmin.from('petty_cash_accounts').insert({ org_id: orgOf(req), branch_id: body.branchId, balance: after.toFixed(2) });
    }
    await supabaseAdmin.from('petty_cash_movements').insert({
      org_id: orgOf(req),
      branch_id: body.branchId,
      kind: 'top_up',
      amount: body.amount,
      note: body.note ?? null,
      balance_after: after.toFixed(2),
      created_by: req.auth!.userId,
    });
    res.json({ ok: true, balance: after.toFixed(2) });
  }),
);

accountingRouter.post(
  '/petty-cash/spend',
  requirePermission('savings:write'),
  validate(pettyCashSpendSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { branchId: string; amount: string; expenseCode: string; spentOn: string };
    const { data: account } = await supabaseAdmin
      .from('petty_cash_accounts')
      .select('*')
      .eq('branch_id', body.branchId)
      .maybeSingle();
    if (!account) throw NotFound('Petty cash account not found for this branch');
    if (Number(body.amount) > Number(account.spend_limit ?? 0)) throw Conflict('Amount exceeds the petty cash spend limit');
    const after = Number(account.balance) - Number(body.amount);
    if (after < 0) throw Conflict('Insufficient petty cash balance');
    await supabaseAdmin
      .from('petty_cash_accounts')
      .update({ balance: after.toFixed(2), updated_at: new Date().toISOString() })
      .eq('id', account.id);
    await supabaseAdmin.from('petty_cash_movements').insert({
      org_id: orgOf(req),
      branch_id: body.branchId,
      kind: 'spend',
      amount: body.amount,
      expense_code: body.expenseCode,
      spent_on: body.spentOn,
      balance_after: after.toFixed(2),
      created_by: req.auth!.userId,
    });
    res.json({ ok: true, balance: after.toFixed(2) });
  }),
);

// ── 6) Fund requisitions ─────────────────────────────────────────────────────
accountingRouter.get(
  '/requisitions',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from('fund_requisitions')
      .select('*, out_voucher:vouchers!fund_requisitions_out_voucher_id_fkey(voucher_number)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((r) => ({
        id: r.id,
        kind: r.kind,
        fromNodeId: r.from_node_id,
        toNodeId: r.to_node_id,
        amount: String(r.amount),
        purpose: r.purpose,
        status: r.status,
        settlementCode: r.settlement_code,
        requestedBy: r.requested_by,
        decidedBy: r.decided_by ?? null,
        decidedAt: r.decided_at ?? null,
        outVoucherNumber: r.out_voucher?.voucher_number ?? null,
        inVoucherNumber: null,
        note: r.note ?? null,
        createdAt: r.created_at,
      })),
    });
  }),
);

accountingRouter.post(
  '/requisitions',
  requirePermission('savings:write'),
  validate(requisitionCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { kind: string; fromNodeId: string; toNodeId: string; amount: string; purpose: string; settlementCode: string };
    const { data, error } = await supabaseAdmin
      .from('fund_requisitions')
      .insert({
        org_id: orgOf(req),
        kind: body.kind,
        from_node_id: body.fromNodeId,
        to_node_id: body.toNodeId,
        amount: body.amount,
        purpose: body.purpose,
        settlement_code: body.settlementCode,
        status: 'requested',
        requested_by: req.auth!.userId,
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

accountingRouter.post(
  '/requisitions/:id/decision',
  requirePermission('org:manage'),
  validate(requisitionDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { decision: 'approve' | 'reject'; note?: string };
    const { data, error } = await supabaseAdmin
      .from('fund_requisitions')
      .update({
        status: body.decision === 'approve' ? 'approved' : 'rejected',
        decided_by: req.auth!.userId,
        decided_at: new Date().toISOString(),
        note: body.note ?? null,
      })
      .eq('id', req.params['id'] as string)
      .eq('status', 'requested')
      .select('id')
      .maybeSingle();
    if (error || !data) throw NotFound('Requisition not found or already decided');
    res.json({ ok: true });
  }),
);

accountingRouter.post(
  '/requisitions/:id/disburse',
  requirePermission('savings:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data, error } = await supabaseAdmin
      .from('fund_requisitions')
      .update({ status: 'disbursed' })
      .eq('id', req.params['id'] as string)
      .eq('status', 'approved')
      .select('id')
      .maybeSingle();
    if (error || !data) throw NotFound('Requisition not found or not approved');
    res.json({ ok: true });
  }),
);

accountingRouter.post(
  '/requisitions/:id/receive',
  requirePermission('savings:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data, error } = await supabaseAdmin
      .from('fund_requisitions')
      .update({ status: 'received' })
      .eq('id', req.params['id'] as string)
      .eq('status', 'disbursed')
      .select('id')
      .maybeSingle();
    if (error || !data) throw NotFound('Requisition not found or not disbursed');
    res.json({ ok: true });
  }),
);

// ── 8) Financial reports (from voucher lines) ────────────────────────────────
accountingRouter.get(
  '/ledger/:code',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const code = req.params['code'] as string;
    const { data: lines, error } = await supabaseAdmin
      .from('voucher_lines')
      .select('debit, credit, vouchers!inner(voucher_number, voucher_date, memo, deleted_at)')
      .eq('account_code', code)
      .is('vouchers.deleted_at', null)
      .order('vouchers.voucher_date', { ascending: true })
      .limit(500);
    if (error) throw error;
    let balance = 0;
    const entries = (lines ?? []).map((l) => {
      balance += Number(l.debit) - Number(l.credit);
      const v = (l.vouchers as unknown as { voucher_number: string; voucher_date: string; memo: string | null });
      return {
        voucherNumber: v.voucher_number,
        voucherDate: v.voucher_date,
        memo: v.memo ?? '',
        debit: String(l.debit),
        credit: String(l.credit),
        balance: balance.toFixed(2),
      };
    });
    res.json({ code, entries });
  }),
);

accountingRouter.get(
  '/reports/receipts-payments',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const start = (req.query['start'] as string) ?? todayStr();
    const end = (req.query['end'] as string) ?? todayStr();
    const { data, error } = await supabaseAdmin
      .from('voucher_lines')
      .select('account_code, debit, credit, vouchers!inner(voucher_type, voucher_date, deleted_at)')
      .gte('vouchers.voucher_date', start)
      .lte('vouchers.voucher_date', end)
      .is('vouchers.deleted_at', null);
    if (error) throw error;
    let receipts = 0;
    let payments = 0;
    for (const l of data ?? []) {
      receipts += Number(l.credit);
      payments += Number(l.debit);
    }
    res.json({ start, end, receipts: receipts.toFixed(2), payments: payments.toFixed(2), net: (receipts - payments).toFixed(2) });
  }),
);

accountingRouter.get(
  '/reports/income-expenditure',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const start = (req.query['start'] as string) ?? todayStr();
    const end = (req.query['end'] as string) ?? todayStr();
    const [incomeRes, expenseRes] = await Promise.all([
      supabaseAdmin
        .from('voucher_lines')
        .select('debit, credit, gl_accounts!inner(type), vouchers!inner(voucher_date, deleted_at)')
        .eq('gl_accounts.type', 'income')
        .gte('vouchers.voucher_date', start)
        .lte('vouchers.voucher_date', end)
        .is('vouchers.deleted_at', null),
      supabaseAdmin
        .from('voucher_lines')
        .select('debit, credit, gl_accounts!inner(type), vouchers!inner(voucher_date, deleted_at)')
        .eq('gl_accounts.type', 'expense')
        .gte('vouchers.voucher_date', start)
        .lte('vouchers.voucher_date', end)
        .is('vouchers.deleted_at', null),
    ]);
    if (incomeRes.error) throw incomeRes.error;
    if (expenseRes.error) throw expenseRes.error;
    const income = (incomeRes.data ?? []).reduce((s, l) => s + Number(l.credit) - Number(l.debit), 0);
    const expenditure = (expenseRes.data ?? []).reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    res.json({ start, end, income: income.toFixed(2), expenditure: expenditure.toFixed(2), surplus: (income - expenditure).toFixed(2) });
  }),
);

accountingRouter.get(
  '/reports/balance-sheet',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from('voucher_lines')
      .select('account_code, debit, credit, gl_accounts!inner(name, name_bn, type)')
      .is('vouchers.deleted_at', null);
    if (error) throw error;
    const byAccount = new Map<string, { name: string; nameBn: string; type: string; net: number }>();
    for (const l of data ?? []) {
      const gl = l.gl_accounts as unknown as { name: string; name_bn: string | null; type: string };
      const key = l.account_code;
      const row = byAccount.get(key) ?? { name: gl.name, nameBn: gl.name_bn ?? gl.name, type: gl.type, net: 0 };
      row.net += Number(l.debit) - Number(l.credit);
      byAccount.set(key, row);
    }
    const assets: unknown[] = [];
    const liabilities: unknown[] = [];
    const funds: unknown[] = [];
    let assetTotal = 0;
    let liabTotal = 0;
    let fundTotal = 0;
    for (const [code, row] of byAccount) {
      const entry = { code, name: row.name, nameBn: row.nameBn, balance: Math.abs(row.net).toFixed(2) };
      if (row.type === 'asset') {
        assets.push(entry);
        assetTotal += row.net;
      } else if (row.type === 'liability') {
        liabilities.push(entry);
        liabTotal += row.net;
      } else if (row.type === 'fund') {
        funds.push(entry);
        fundTotal += row.net;
      }
    }
    res.json({
      asOf: todayStr(),
      assets,
      liabilities,
      funds,
      totals: { assets: assetTotal.toFixed(2), liabilities: liabTotal.toFixed(2), funds: fundTotal.toFixed(2) },
    });
  }),
);

accountingRouter.get(
  '/reports/fund-statement',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const start = (req.query['start'] as string) ?? todayStr();
    const end = (req.query['end'] as string) ?? todayStr();
    const { data, error } = await supabaseAdmin
      .from('voucher_lines')
      .select('fund_id, debit, credit, vouchers!inner(voucher_date, memo, deleted_at)')
      .gte('vouchers.voucher_date', start)
      .lte('vouchers.voucher_date', end)
      .is('vouchers.deleted_at', null);
    if (error) throw error;
    const byFund = new Map<string, number>();
    for (const l of data ?? []) {
      const key = l.fund_id ?? 'general';
      byFund.set(key, (byFund.get(key) ?? 0) + Number(l.credit) - Number(l.debit));
    }
    res.json({
      start,
      end,
      funds: [...byFund.entries()].map(([fundId, net]) => ({ fundId, netMovement: net.toFixed(2) })),
    });
  }),
);

accountingRouter.get(
  '/reports/budget-vs-actual',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const start = (req.query['start'] as string) ?? todayStr();
    const end = (req.query['end'] as string) ?? todayStr();
    const [budgetsRes, actualRes] = await Promise.all([
      supabaseAdmin.from('gl_budgets').select('account_code, amount').gte('period_start', start).lte('period_end', end).is('deleted_at', null),
      supabaseAdmin
        .from('voucher_lines')
        .select('account_code, debit, credit, gl_accounts!inner(type), vouchers!inner(voucher_date, deleted_at)')
        .eq('gl_accounts.type', 'expense')
        .gte('vouchers.voucher_date', start)
        .lte('vouchers.voucher_date', end)
        .is('vouchers.deleted_at', null),
    ]);
    if (budgetsRes.error && !isMissingTableError(budgetsRes.error)) throw budgetsRes.error;
    if (actualRes.error) throw actualRes.error;
    const actuals = new Map<string, number>();
    for (const l of actualRes.data ?? []) {
      actuals.set(l.account_code, (actuals.get(l.account_code) ?? 0) + Number(l.debit) - Number(l.credit));
    }
    res.json({
      start,
      end,
      items: (budgetsRes.data ?? []).map((b) => {
        const actual = actuals.get(b.account_code) ?? 0;
        const budget = Number(b.amount);
        return {
          accountCode: b.account_code,
          budget: budget.toFixed(2),
          actual: actual.toFixed(2),
          variance: (budget - actual).toFixed(2),
          pct: budget > 0 ? Math.round((actual / budget) * 100) : null,
        };
      }),
    });
  }),
);

accountingRouter.put(
  '/budgets',
  requirePermission('org:manage'),
  validate(budgetSetSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { periodStart: string; periodEnd: string; lines: Array<{ accountCode: string; amount: string }> };
    const orgId = orgOf(req);
    // Replace semantics (same as demo): drop the period's lines, insert fresh.
    const del = await supabaseAdmin
      .from('gl_budgets')
      .delete()
      .eq('org_id', orgId)
      .eq('period_start', body.periodStart)
      .eq('period_end', body.periodEnd)
      .is('branch_id', null);
    if (del.error) {
      if (isMissingTableError(del.error)) throw Conflict(PERIOD_TABLES_HINT);
      throw del.error;
    }
    const rows = body.lines.map((l) => ({
      org_id: orgId,
      period_start: body.periodStart,
      period_end: body.periodEnd,
      account_code: l.accountCode,
      amount: l.amount,
      created_by: req.auth!.userId,
    }));
    const { error } = await supabaseAdmin.from('gl_budgets').insert(rows);
    if (error) throw error;
    res.json({
      items: body.lines.map((l) => ({
        accountCode: l.accountCode,
        amount: l.amount,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
      })),
    });
  }),
);

// ── 9) Period close ──────────────────────────────────────────────────────────
accountingRouter.get(
  '/period-closes',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from('period_closes')
      .select('*')
      .is('deleted_at', null)
      .order('period_start', { ascending: false })
      .limit(100);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) {
      if (isMissingTableError(error)) return res.json({ items: [] });
      throw error;
    }
    res.json({
      items: (data ?? []).map((p) => ({
        id: p.id,
        orgId: p.org_id,
        kind: p.kind,
        periodStart: p.period_start,
        periodEnd: p.period_end,
        closedBy: p.closed_by,
        closedAt: p.closed_at,
        snapshot: (p.snapshot_json ?? {}) as {
          totalDebit: string;
          totalCredit: string;
          balanced: boolean;
          voucherCount: number;
        },
        note: p.note ?? null,
      })),
    });
  }),
);

accountingRouter.post(
  '/period-closes',
  requirePermission('org:manage'),
  validate(periodCloseSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { kind: string; periodStart: string; periodEnd: string; note?: string };
    const orgId = orgOf(req);
    const snap = await periodSnapshot(orgId, body.periodStart, body.periodEnd);
    const { data, error } = await supabaseAdmin
      .from('period_closes')
      .insert({
        org_id: orgId,
        kind: body.kind,
        period_start: body.periodStart,
        period_end: body.periodEnd,
        note: body.note ?? null,
        closed_by: req.auth!.userId,
        snapshot_json: snap.snapshot_json,
      })
      .select('*')
      .single();
    if (error) {
      if (isMissingTableError(error)) throw Conflict(PERIOD_TABLES_HINT);
      if (String(error.message).includes('duplicate key')) throw Conflict('This period is already closed');
      throw error;
    }
    res.status(201).json({
      id: data.id,
      orgId: data.org_id,
      kind: data.kind,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      closedBy: data.closed_by,
      closedAt: data.closed_at,
      snapshot: (data.snapshot_json ?? {}) as {
        totalDebit: string;
        totalCredit: string;
        balanced: boolean;
        voucherCount: number;
      },
      note: data.note ?? null,
    });
  }),
);

accountingRouter.post(
  '/period-closes/:id/reopen',
  requirePermission('org:manage'),
  validate(periodReopenSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { note: string };
    // Reopen = delete the close row (migration 0030 semantics: the
    // fn_period_locked trigger ignores deleted rows, unlocking the period).
    const del = await supabaseAdmin
      .from('period_closes')
      .delete()
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (del.error && isMissingTableError(del.error)) throw Conflict(PERIOD_TABLES_HINT);
    if (del.error || !del.data) throw NotFound('Period close not found');
    res.json({ ok: true, note: body.note });
  }),
);
