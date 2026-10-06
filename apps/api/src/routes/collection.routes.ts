/**
 * ── Collection & Repayment live router (Supabase-backed) ─────────────────────
 * Real-database parity for collection.demo.routes.ts, against:
 *   - 0020: collection_entries, cash_handovers, receipt_counters,
 *           officer_cash_expected(), next_receipt_no()
 *   - 0022: collection_rules, collection_reversals, loan_reschedules,
 *           loan_write_offs, loan_closures, collection_fraud_flags
 *   - 0058: collection_entries.meta, journal source_type fixes, trigger fixes
 *
 * The payment allocation stays in the pure shared engine (same as demo mode);
 * the DB trigger `enforce_collection_allocation_order` re-validates it as
 * defense in depth. Money is string '12.34'; numeric(14,2) in the DB.
 */
import { Router } from 'express';
import {
  allocateCollectionPayment,
  checkCollectionDate,
  computeClosureRebate,
  scanEntriesForFraud,
  cashHandoverConfirmSchema,
  cashHandoverCreateSchema,
  cashHandoverSubmitSchema,
  collectionEntrySchema,
  collectionReversalSchema,
  collectionRulesPatchSchema,
  collectionSheetQuerySchema,
  collectionSyncSchema,
  handoverQuerySchema,
  loanClosureQuoteSchema,
  loanClosureCreateSchema,
  loanRescheduleCreateSchema,
  loanWriteOffCreateSchema,
  rescheduleDecisionSchema,
  writeOffDecisionSchema,
  type AllocationOrder,
  type CashHandover,
  type CollectionAllocation,
  type CollectionReceipt,
  type CollectionSheet,
  type CollectionSheetRow,
} from '@samity/shared';
import { AppError, BadRequest, Conflict, Forbidden, NotFound } from '../lib/errors.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number): string => n.toFixed(2);
const todayStr = (): string => new Date().toISOString().slice(0, 10);

type CollectionEntryRow = {
  id: string;
  org_id: string;
  branch_id: string;
  idempotency_key: string;
  member_id: string;
  application_id: string | null;
  meeting_date: string;
  loan_paid: string;
  savings_paid: string;
  extra_paid: string;
  allocation: CollectionAllocation;
  receipt_no: string;
  collected_by: string | null;
  captured_at: string | null;
  note: string | null;
  meta: { savingsAccountId?: string } | null;
  created_at: string;
};

type HandoverRow = {
  id: string;
  org_id: string;
  branch_id: string;
  officer_id: string;
  handover_date: string;
  expected_amount: string;
  counted_amount: string | null;
  received_amount: string | null;
  difference: string;
  difference_kind: 'none' | 'shortage' | 'excess';
  status: 'draft' | 'submitted' | 'confirmed' | 'rejected';
  officer_note: string | null;
  accountant_note: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const collectionRouter = Router();
collectionRouter.use(requireAuth, requirePermission('loan:read'));

// ── Org rules (0022 collection_rules) ───────────────────────────────────────
async function loadRules(orgId: string): Promise<{
  backdateLimitDays: number;
  futureLimitDays: number;
  allocationOrder: AllocationOrder;
  fraudIdenticalMinMembers: number;
  fraudMeetingRadiusMeters: number;
  fraudSelfPocketMinEntries: number;
}> {
  const { data, error } = await supabaseAdmin
    .from('collection_rules')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return {
    backdateLimitDays: data?.backdate_limit_days ?? 2,
    futureLimitDays: data?.future_limit_days ?? 0,
    allocationOrder: (data?.allocation_order ?? 'overdue_first') as AllocationOrder,
    fraudIdenticalMinMembers: data?.fraud_identical_min_members ?? 5,
    fraudMeetingRadiusMeters: data?.fraud_meeting_radius_meters ?? 500,
    fraudSelfPocketMinEntries: data?.fraud_self_pocket_min_entries ?? 5,
  };
}

collectionRouter.get(
  '/rules',
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    const rules = await loadRules(auth.orgId ?? '');
    res.json({
      backdateLimitDays: rules.backdateLimitDays,
      futureLimitDays: rules.futureLimitDays,
    });
  }),
);

collectionRouter.patch(
  '/rules',
  requirePermission('loan:write'),
  validate(collectionRulesPatchSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const body = req.body as { backdateLimitDays?: number; futureLimitDays?: number };
    const { error } = await supabaseAdmin
      .from('collection_rules')
      .upsert({ org_id: auth.orgId, ...body }, { onConflict: 'org_id' });
    if (error) throw error;
    const rules = await loadRules(auth.orgId);
    res.json({ backdateLimitDays: rules.backdateLimitDays, futureLimitDays: rules.futureLimitDays });
  }),
);

// ── Sheet (requirement 1) ────────────────────────────────────────────────────
collectionRouter.get(
  '/sheet',
  validate(collectionSheetQuerySchema, 'query'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    const q = collectionSheetQuerySchema.parse(req.query);
    const meetingDate = q.meetingDate ?? todayStr();
    let branchId = q.branchId ?? auth.branchId ?? null;
    if (!branchId) {
      const { data: b } = await supabaseAdmin.from('branches').select('id').limit(1);
      branchId = b?.[0]?.id ?? null;
    }
    if (!branchId) throw BadRequest('Branch is required (no branch assigned and none configured)');

    const rules = await loadRules(auth.orgId ?? '');

    // Active borrowers of the branch with their stored disbursement schedule.
    const { data: apps, error: appsError } = await supabaseAdmin
      .from('loan_applications')
      .select(
        'id, member_id, branch_id, samity_id, status, loan_products(name), loan_disbursements(loan_number, status)',
      )
      .eq('branch_id', branchId)
      // loan_applications has no soft-delete column (0012) — status filters only.
      .in('status', ['approved', 'disbursed']);
    if (appsError) throw appsError;

    // Savings accounts with a weekly due (compulsory cadence on the product).
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('savings_accounts')
      .select('id, member_id, account_number, status, savings_products(name, auto_link_weekly_amount, is_active)')
      .eq('branch_id', branchId)
      .eq('status', 'active')
      .is('deleted_at', null);
    if (accountsError) throw accountsError;

    // Members display info.
    const memberIds = [
      ...new Set([...(apps ?? []).map((a) => a.member_id), ...(accounts ?? []).map((a) => a.member_id)]),
    ];
    const { data: memberRows } = memberIds.length
      ? await supabaseAdmin
          .from('members')
          .select('id, full_name, member_code, samity_id, samities(name)')
          .in('id', memberIds)
      : { data: [] };
    const memberById = new Map((memberRows ?? []).map((m) => [m.id, m]));

    // Samity names for borrower rows.
    const samityIds = [...new Set((apps ?? []).map((a) => a.samity_id).filter(Boolean))] as string[];
    const { data: samityRows } = samityIds.length
      ? await supabaseAdmin.from('samities').select('id, name').in('id', samityIds)
      : { data: [] };
    const samityName = new Map((samityRows ?? []).map((s) => [s.id, s.name]));

    const ms = Date.parse(`${meetingDate}T00:00:00Z`);
    const appIds = (apps ?? []).map((a) => a.id);
    const { data: schedRows } = appIds.length
      ? await supabaseAdmin
          .from('loan_repayment_schedule')
          .select('id, application_id, seq, due_date, total, paid_amount')
          .in('application_id', appIds)
          .order('seq')
      : { data: [] };
    const schedByApp = new Map<string, typeof schedRows>();
    for (const r of schedRows ?? []) {
      const list = schedByApp.get(r.application_id) ?? [];
      list.push(r);
      schedByApp.set(r.application_id, list);
    }

    // Advance credit: prior over-collection = posted extras not yet consumed.
    // (Read from posted entries: extras beyond dues land as advanceApplied.)
    const { data: todayEntries } = await supabaseAdmin
      .from('collection_entries')
      .select('member_id, allocation')
      .eq('branch_id', branchId)
      .eq('meeting_date', meetingDate)
      .is('deleted_at', null);
    const advanceByMember = new Map<string, number>();
    for (const e of todayEntries ?? []) {
      const adv = num((e.allocation as CollectionAllocation | null)?.advanceApplied ?? '0');
      if (adv > 0) advanceByMember.set(e.member_id, (advanceByMember.get(e.member_id) ?? 0) + adv);
    }

    const rows: CollectionSheetRow[] = [];
    const memberIdsSet = new Set(memberIds);
    for (const memberId of memberIdsSet) {
      const member = memberById.get(memberId);
      const app = (apps ?? []).find((a) => a.member_id === memberId);
      let loan: CollectionSheetRow['loan'] = null;
      if (app) {
        const rec = Array.isArray(app.loan_disbursements) ? app.loan_disbursements[0] : app.loan_disbursements;
        const unpaid = (schedByApp.get(app.id) ?? []).filter((r) => num(r.paid_amount) < num(r.total));
        const overdue = unpaid
          .filter((r) => Date.parse(`${r.due_date}T00:00:00Z`) < ms)
          .map((r) => ({
            installmentId: r.id,
            seq: r.seq as number,
            dueDate: r.due_date as string,
            amount: money(num(r.total) - num(r.paid_amount)),
            daysOverdue: Math.floor((ms - Date.parse(`${r.due_date}T00:00:00Z`)) / 86_400_000),
          }));
        const currentRow = unpaid.find((r) => Date.parse(`${r.due_date}T00:00:00Z`) >= ms) ?? null;
        loan = {
          applicationId: app.id,
          loanNumber: rec?.loan_number ?? null,
          productName: (app.loan_products as unknown as { name: string } | null)?.name ?? null,
          installmentAmount: currentRow ? money(num(currentRow.total)) : '0.00',
          overdue,
          current: currentRow
            ? {
                installmentId: currentRow.id,
                seq: currentRow.seq as number,
                dueDate: currentRow.due_date as string,
                amount: money(num(currentRow.total) - num(currentRow.paid_amount)),
              }
            : null,
        };
      }

      const acc = (accounts ?? []).find((a) => a.member_id === memberId);
      const product = acc
        ? (Array.isArray(acc.savings_products) ? acc.savings_products[0] : acc.savings_products)
        : null;
      const weeklyDue =
        product && product.is_active && num((product as { auto_link_weekly_amount?: unknown }).auto_link_weekly_amount) > 0
          ? money(num((product as { auto_link_weekly_amount: string }).auto_link_weekly_amount))
          : null;

      const advance = advanceByMember.get(memberId) ?? 0;
      const savingsDue =
        acc && weeklyDue
          ? { accountId: acc.id, accountNumber: acc.account_number, productName: (product as { name: string }).name, amount: weeklyDue }
          : null;
      const grossDue = num(loan?.overdue.reduce((s, o) => s + num(o.amount), 0) ?? '0') + num(loan?.current?.amount ?? '0') + num(savingsDue?.amount ?? '0');
      const advanceOffset = Math.min(advance, grossDue);
      const leftoverAdvance = advance - advanceOffset;

      rows.push({
        memberId,
        memberCode: member?.member_code ?? '—',
        memberName: member?.full_name ?? 'Unknown member',
        samityId: member?.samity_id ?? app?.samity_id ?? null,
        samityName: member?.samity_id
          ? (samityName.get(member.samity_id) ?? null)
          : app?.samity_id
            ? (samityName.get(app.samity_id) ?? null)
            : null,
        loan,
        savingsDue,
        advanceBalance: money(leftoverAdvance),
        totalDue: money(grossDue - advanceOffset),
      });
    }
    rows.sort((a, b) => a.memberName.localeCompare(b.memberName, 'bn'));

    const totalDue = rows.reduce((s, r) => s + num(r.totalDue), 0);
    const collected = (todayEntries ?? []).reduce(
      (s: number, e: { allocation: CollectionAllocation | null }) =>
        s +
        num(e.allocation?.savingsApplied ?? '0') +
        (e.allocation?.overdueApplied ?? []).reduce((x: number, o: { amount: string }) => x + num(o.amount), 0) +
        num(e.allocation?.currentApplied?.amount ?? '0'),
      0,
    );

    const { data: branch } = await supabaseAdmin.from('branches').select('name, code').eq('id', branchId).single();
    const sheet: CollectionSheet = {
      meetingDate,
      branchId,
      branchName: branch?.name ?? null,
      officerId: auth.userId,
      allocationOrder: rules.allocationOrder,
      rows,
      totals: { due: money(totalDue), collected: money(collected), members: rows.length },
    };
    res.json(sheet);
  }),
);

// ── Single entry (offline-safe, idempotent) ─────────────────────────────────
async function buildSheetRowForMember(
  memberId: string,
  meetingDate: string,
  rules: Awaited<ReturnType<typeof loadRules>>,
): Promise<CollectionSheetRow | null> {
  const ms = Date.parse(`${meetingDate}T00:00:00Z`);
  const { data: apps } = await supabaseAdmin
    .from('loan_applications')
    .select('id, member_id, samity_id, loan_products(name), loan_disbursements(loan_number)')
    .eq('member_id', memberId)
    .in('status', ['approved', 'disbursed'])
    .limit(1);
  const app = apps?.[0] ?? null;

  const { data: accounts } = await supabaseAdmin
    .from('savings_accounts')
    .select('id, account_number, savings_products(name, auto_link_weekly_amount, is_active)')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(1);
  const acc = accounts?.[0] ?? null;

  let loan: CollectionSheetRow['loan'] = null;
  if (app) {
    const rec = Array.isArray(app.loan_disbursements) ? app.loan_disbursements[0] : app.loan_disbursements;
    const { data: sched } = await supabaseAdmin
      .from('loan_repayment_schedule')
      .select('id, seq, due_date, total, paid_amount')
      .eq('application_id', app.id)
      .order('seq');
    const unpaid = (sched ?? []).filter((r) => num(r.paid_amount) < num(r.total));
    const overdue = unpaid
      .filter((r) => Date.parse(`${r.due_date}T00:00:00Z`) < ms)
      .map((r) => ({
        installmentId: r.id,
        seq: r.seq as number,
        dueDate: r.due_date as string,
        amount: money(num(r.total) - num(r.paid_amount)),
        daysOverdue: Math.floor((ms - Date.parse(`${r.due_date}T00:00:00Z`)) / 86_400_000),
      }));
    const currentRow = unpaid.find((r) => Date.parse(`${r.due_date}T00:00:00Z`) >= ms) ?? null;
    loan = {
      applicationId: app.id,
      loanNumber: rec?.loan_number ?? null,
      productName: (app.loan_products as unknown as { name: string } | null)?.name ?? null,
      installmentAmount: currentRow ? money(num(currentRow.total)) : money(0),
      overdue,
      current: currentRow
        ? {
            installmentId: currentRow.id,
            seq: currentRow.seq as number,
            dueDate: currentRow.due_date as string,
            amount: money(num(currentRow.total) - num(currentRow.paid_amount)),
          }
        : null,
    };
  }

  const product = acc ? (Array.isArray(acc.savings_products) ? acc.savings_products[0] : acc.savings_products) : null;
  const weekly =
    product && product.is_active && num((product as { auto_link_weekly_amount?: unknown }).auto_link_weekly_amount) > 0
      ? money(num((product as { auto_link_weekly_amount: string }).auto_link_weekly_amount))
      : null;

  // Prior advance credit from earlier posted extras (same as sheet view).
  let advance = 0;
  const { data: prior } = await supabaseAdmin
    .from('collection_entries')
    .select('allocation, meeting_date')
    .eq('member_id', memberId)
    .is('deleted_at', null)
    .order('meeting_date', { ascending: false })
    .limit(30);
  for (const e of prior ?? []) {
    if ((e as { meeting_date: string }).meeting_date >= meetingDate) continue;
    advance += num((e.allocation as CollectionAllocation | null)?.advanceApplied ?? '0');
  }

  const savingsDue =
    acc && weekly
      ? { accountId: acc.id, accountNumber: acc.account_number, productName: (product as { name: string }).name, amount: weekly }
      : null;
  const grossDue =
    num(loan?.overdue.reduce((s, o) => s + num(o.amount), 0) ?? '0') + num(loan?.current?.amount ?? '0') + num(savingsDue?.amount ?? '0');
  const advanceOffset = Math.min(advance, grossDue);

  return {
    memberId,
    memberCode: '—',
    memberName: '—',
    samityId: app?.samity_id ?? null,
    samityName: null,
    loan,
    savingsDue,
    advanceBalance: money(advance - advanceOffset),
    totalDue: money(grossDue - advanceOffset),
  };
}

async function postEntry(
  input: {
    idempotencyKey: string;
    memberId: string;
    meetingDate: string;
    loanPaid?: string;
    savingsPaid?: string;
    extraPaid?: string;
    note?: string;
    capturedAt?: string;
    meta?: { lat?: number; lng?: number };
  },
  ctx: { officerId: string; officerRole: string; orgId: string },
): Promise<{ duplicate: boolean; receipt: CollectionReceipt }> {
  const loanTotal = num(input.loanPaid);
  const savingsTotal = num(input.savingsPaid);
  const extraTotal = num(input.extraPaid);
  if (loanTotal + savingsTotal + extraTotal <= 0) {
    throw BadRequest('At least one paid amount is required');
  }

  // Idempotency: same key ⇒ same stored reply (offline retry-safe).
  const { data: existing } = await supabaseAdmin
    .from('collection_entries')
    .select('*')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();
  if (existing) return { duplicate: true, receipt: receiptFromRow(existing as CollectionEntryRow) };

  // Date rule engine (org-configurable via collection_rules).
  const rules = await loadRules(ctx.orgId);
  const dateCheck = checkCollectionDate(input.meetingDate, todayStr(), rules.backdateLimitDays);
  if (!dateCheck.allowed) {
    throw new AppError(
      422,
      dateCheck.reason === 'future_dated' ? 'FUTURE_DATED' : 'BACKDATED',
      dateCheck.reason === 'future_dated'
        ? 'ভবিষ্যতের তারিখ দেওয়া যাবে না / Future-dated collections are blocked'
        : `ব্যাকডেট সীমা ${dateCheck.maxDays} দিন / Backdating beyond ${dateCheck.maxDays} day(s) is blocked`,
    );
  }

  const row = await buildSheetRowForMember(input.memberId, input.meetingDate, rules);
  if (!row || (!row.loan && !row.savingsDue)) {
    throw NotFound('Member not found on the collection sheet');
  }
  let branchId: string | null = null;
  if (row.loan?.applicationId) {
    const { data: appRow } = await supabaseAdmin
      .from('loan_applications')
      .select('branch_id')
      .eq('id', row.loan.applicationId)
      .single();
    branchId = appRow?.branch_id ?? null;
  }
  if (!branchId) {
    const { data: accRow } = await supabaseAdmin
      .from('savings_accounts')
      .select('branch_id')
      .eq('member_id', input.memberId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    branchId = accRow?.branch_id ?? null;
  }
  if (!branchId) throw NotFound('Member not found on the collection sheet');

  const pool = loanTotal + savingsTotal + extraTotal;
  const allocation = allocateCollectionPayment(row, { loanPaid: pool, savingsPaid: 0, extraPaid: 0 }, rules.allocationOrder);

  const { data: member } = await supabaseAdmin
    .from('members')
    .select('id, full_name, member_code, org_id')
    .eq('id', input.memberId)
    .maybeSingle();
  if (!member) throw NotFound('Member not found');

  // 1) Installment allocations → mark paid on the stored schedule.
  const touched = [...allocation.overdueApplied, ...(allocation.currentApplied ? [allocation.currentApplied] : [])];
  for (const t of touched) {
    const { data: inst, error } = await supabaseAdmin
      .from('loan_repayment_schedule')
      .select('id, total, paid_amount')
      .eq('id', t.installmentId)
      .single();
    if (error || !inst) throw NotFound(`Installment ${t.seq} not found`);
    if (num(inst.paid_amount) + num(t.amount) > num(inst.total) + 0.005) {
      throw Conflict(`Allocation exceeds the amount due on installment ${t.seq}`);
    }
    const { error: upErr } = await supabaseAdmin
      .from('loan_repayment_schedule')
      .update({
        paid_amount: money(Math.min(num(inst.paid_amount) + num(t.amount), num(inst.total))),
        paid_at: input.meetingDate,
      })
      .eq('id', t.installmentId);
    if (upErr) throw upErr;
  }

  // 2) Savings deposit via the DB RPC (immutable ledger + balance update).
  if (num(allocation.savingsApplied) > 0 && row.savingsDue) {
    const { error: txError } = await supabaseAdmin.rpc('post_savings_transaction', {
      p_account_id: row.savingsDue.accountId,
      p_transaction_type: 'deposit',
      p_amount: allocation.savingsApplied,
      p_created_by: ctx.officerId,
      p_reference: `collection:${input.idempotencyKey.slice(0, 8)}`,
      p_note: 'সমিতি চাঁদা / Meeting collection',
    });
    if (txError) throw txError;
  }

  // 3) Receipt number via the concurrency-safe DB function (0020).
  const { data: receiptNo, error: receiptError } = await supabaseAdmin.rpc('next_receipt_no', {
    p_org_id: member.org_id,
    p_branch_id: branchId,
  });
  if (receiptError || !receiptNo) throw receiptError ?? new Error('Receipt numbering failed');

  // 4) Journal (cash debit / loan+savings credit) — allowed by 0058 fix (b).
  const loanApplied =
    allocation.overdueApplied.reduce((s, o) => s + num(o.amount), 0) + num(allocation.currentApplied?.amount ?? '0');
  const entryDate = input.meetingDate;
  if (loanApplied + num(allocation.savingsApplied) > 0) {
    const { data: journal, error: jError } = await supabaseAdmin
      .from('journal_entries')
      .insert({
        org_id: member.org_id,
        branch_id: branchId,
        entry_date: entryDate,
        source_type: 'collection',
        source_id: input.memberId,
        memo: `Collection ${receiptNo} — ${member.full_name}`,
        created_by: ctx.officerId,
      })
      .select('id')
      .single();
    if (jError) throw jError;
    const lines: Array<{ entry_id: string; account_code: string; account_name: string; debit: string; credit: string }> = [];
    if (loanApplied > 0) {
      lines.push({ entry_id: journal.id, account_code: '1010', account_name: 'Cash in Vault', debit: money(loanApplied), credit: '0.00' });
      lines.push({ entry_id: journal.id, account_code: '1200', account_name: 'Loan Portfolio', debit: '0.00', credit: money(loanApplied) });
    }
    if (num(allocation.savingsApplied) > 0) {
      lines.push({ entry_id: journal.id, account_code: '1010', account_name: 'Cash in Vault', debit: allocation.savingsApplied, credit: '0.00' });
      lines.push({ entry_id: journal.id, account_code: '2100', account_name: 'Member Savings Deposits', debit: '0.00', credit: allocation.savingsApplied });
    }
    const { error: linesError } = await supabaseAdmin.from('journal_lines').insert(lines);
    if (linesError) throw linesError;
  }

  // 5) Loan passbook credit line (0018 loan_passbook_entries).
  if (row.loan?.applicationId && loanApplied > 0) {
    const { data: priorBal } = await supabaseAdmin
      .from('loan_passbook_entries')
      .select('balance_after')
      .eq('application_id', row.loan.applicationId)
      .order('created_at', { ascending: false })
      .limit(1);
    const prev = priorBal?.[0] ? num(priorBal[0].balance_after ?? 0) : 0;
    await supabaseAdmin.from('loan_passbook_entries').insert({
      org_id: member.org_id,
      application_id: row.loan.applicationId,
      member_id: input.memberId,
      loan_number: row.loan.loanNumber ?? '',
      entry_date: entryDate,
      description: `কিস্তি আদায় / Installment collected (${receiptNo})`,
      debit: '0.00',
      credit: money(loanApplied),
      balance_after: money(prev + loanApplied),
      created_by: ctx.officerId,
    });
  }

  // 6) The entry itself (allocation guard trigger re-validates: 0020).
  const { data: entry, error: entryError } = await supabaseAdmin
    .from('collection_entries')
    .insert({
      org_id: member.org_id,
      branch_id: branchId,
      idempotency_key: input.idempotencyKey,
      member_id: input.memberId,
      application_id: row.loan?.applicationId ?? null,
      meeting_date: input.meetingDate,
      loan_paid: money(loanTotal),
      savings_paid: money(savingsTotal),
      extra_paid: money(extraTotal),
      allocation,
      receipt_no: receiptNo,
      collected_by: ctx.officerId,
      captured_at: input.capturedAt ?? null,
      note: input.note ?? null,
      meta: { ...(input.meta ?? {}), savingsAccountId: row.savingsDue?.accountId ?? undefined },
    })
    .select('*')
    .single();
  if (entryError) throw entryError;

  // 7) Fraud heuristics (0022) over today's stream for this officer.
  await runFraudScan(member.org_id, branchId, ctx.officerId, input.meetingDate, rules);

  return { duplicate: false, receipt: receiptFromRow(entry as CollectionEntryRow, member.full_name, member.member_code) };
}

function receiptFromRow(
  e: CollectionEntryRow,
  memberName = 'সদস্য',
  memberCode = '—',
): CollectionReceipt {
  const loanApplied =
    e.allocation.overdueApplied.reduce((s, o) => s + num(o.amount), 0) + num(e.allocation.currentApplied?.amount ?? '0');
  const total = loanApplied + num(e.allocation.savingsApplied) + num(e.allocation.advanceApplied);
  const passbookLines: CollectionReceipt['passbookLines'] = [];
  if (loanApplied > 0) passbookLines.push({ book: 'loan', description: 'কিস্তি আদায় / Installment', amount: money(loanApplied) });
  if (num(e.allocation.savingsApplied) > 0)
    passbookLines.push({ book: 'savings', description: 'সঞ্চয় জমা / Savings deposit', amount: e.allocation.savingsApplied });
  if (num(e.allocation.advanceApplied) > 0)
    passbookLines.push({ book: 'savings', description: 'অগ্রিম জমা / Advance', amount: e.allocation.advanceApplied });
  return {
    receiptNo: e.receipt_no,
    entryId: e.id,
    idempotencyKey: e.idempotency_key,
    meetingDate: e.meeting_date,
    memberName,
    memberCode,
    loanNumber: null,
    allocation: e.allocation,
    totalCollected: money(total),
    passbookLines,
    collectedBy: e.collected_by,
    createdAt: e.created_at,
  };
}

async function runFraudScan(
  orgId: string,
  branchId: string,
  officerId: string,
  meetingDate: string,
  rules: Awaited<ReturnType<typeof loadRules>>,
): Promise<void> {
  const { data: entries } = await supabaseAdmin
    .from('collection_entries')
    .select('id, receipt_no, member_id, allocation, meta, created_at')
    .eq('org_id', orgId)
    .eq('branch_id', branchId)
    .eq('meeting_date', meetingDate)
    .eq('collected_by', officerId)
    .is('deleted_at', null);
  const rows = (entries ?? []).map((e) => {
    const a = e.allocation as CollectionAllocation | null;
    return {
      entryId: e.id as string,
      receiptNo: e.receipt_no as string,
      officerId,
      memberId: e.member_id as string,
      totalCollected: money(
        (a?.overdueApplied ?? []).reduce((s, o) => s + num(o.amount), 0) +
          num(a?.currentApplied?.amount ?? '0') +
          num(a?.savingsApplied ?? '0'),
      ),
      meta: (e.meta ?? null) as { lat?: number; lng?: number } | null,
      createdAt: e.created_at as string,
    };
  });
  if (!rows.length) return;
  const flags = scanEntriesForFraud({
    entries: rows,
    peerTotalsByMember: {},
    meetingPoint: null,
    config: {
      identicalAmountMinMembers: rules.fraudIdenticalMinMembers,
      meetingRadiusMeters: rules.fraudMeetingRadiusMeters,
      selfPocketMinEntries: rules.fraudSelfPocketMinEntries,
    },
  });
  if (!flags.length) return;
  const { data: existing } = await supabaseAdmin
    .from('collection_fraud_flags')
    .select('entry_id, rule')
    .eq('org_id', orgId)
    .eq('branch_id', branchId);
  const seen = new Set((existing ?? []).map((f) => `${f.entry_id}:${f.rule}`));
  const fresh = flags.filter((f) => !seen.has(`${f.entryId}:${f.rule}`));
  if (!fresh.length) return;
  await supabaseAdmin.from('collection_fraud_flags').insert(
    fresh.map((f) => ({
      org_id: orgId,
      branch_id: branchId,
      entry_id: f.entryId,
      receipt_no: f.receiptNo,
      rule: f.rule,
      severity: f.severity,
      detail: f.detail,
      detail_bn: f.detailBn,
    })),
  );
}

collectionRouter.post(
  '/entries',
  requirePermission('loan:write'),
  validate(collectionEntrySchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const response = await postEntry(req.body, { officerId: auth.userId, officerRole: auth.role, orgId: auth.orgId });
    res.status(response.duplicate ? 200 : 201).json(response);
  }),
);

// ── Batch sync (offline queue flush, requirement 2) ─────────────────────────
collectionRouter.post(
  '/sync',
  requirePermission('loan:write'),
  validate(collectionSyncSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const input = req.body as { entries: Array<{ idempotencyKey: string } & Record<string, unknown>> };
    const results: Array<{ idempotencyKey: string; status: 'posted' | 'duplicate' | 'failed'; receiptNo?: string; error?: string }> = [];
    let posted = 0;
    let duplicates = 0;
    let failed = 0;
    for (const item of input.entries) {
      try {
        const r = await postEntry(item as Parameters<typeof postEntry>[0], { officerId: auth.userId, officerRole: auth.role, orgId: auth.orgId });
        if (r.duplicate) {
          duplicates += 1;
          results.push({ idempotencyKey: item.idempotencyKey, status: 'duplicate', receiptNo: r.receipt.receiptNo });
        } else {
          posted += 1;
          results.push({ idempotencyKey: item.idempotencyKey, status: 'posted', receiptNo: r.receipt.receiptNo });
        }
      } catch (err) {
        failed += 1;
        results.push({
          idempotencyKey: item.idempotencyKey,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
    res.json({ results, posted, duplicates, failed });
  }),
);

// ── Receipt lookup (re-print, requirement 3) ────────────────────────────────
collectionRouter.get(
  '/entries/:idempotencyKey/receipt',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data: entry } = await supabaseAdmin
      .from('collection_entries')
      .select('*')
      .eq('idempotency_key', req.params['idempotencyKey'])
      .maybeSingle();
    if (!entry) throw NotFound('Receipt not found');
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('full_name, member_code')
      .eq('id', (entry as CollectionEntryRow).member_id)
      .maybeSingle();
    res.json({ entry: receiptFromRow(entry as CollectionEntryRow, member?.full_name, member?.member_code) });
  }),
);

// ── Entry list (per branch/date, for the receipt register) ──────────────────
collectionRouter.get(
  '/entries',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    let query = supabaseAdmin
      .from('collection_entries')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    const branchId = req.query['branchId'];
    if (typeof branchId === 'string' && branchId) query = query.eq('branch_id', branchId);
    const date = req.query['date'];
    if (typeof date === 'string' && date) query = query.eq('meeting_date', date);
    const memberId = req.query['memberId'];
    if (typeof memberId === 'string' && memberId) query = query.eq('member_id', memberId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

// ── Cash summary (requirement 4, uses the 0020 SQL function) ────────────────
function mapHandover(h: HandoverRow, officerName = '—'): CashHandover {
  return {
    id: h.id,
    officerId: h.officer_id,
    officerName,
    branchId: h.branch_id,
    handoverDate: h.handover_date,
    expectedAmount: money(num(h.expected_amount)),
    countedAmount: h.counted_amount === null ? null : money(num(h.counted_amount)),
    receivedAmount: h.received_amount === null ? null : money(num(h.received_amount)),
    difference: money(num(h.difference)),
    differenceKind: h.difference_kind,
    status: h.status,
    officerNote: h.officer_note,
    accountantNote: h.accountant_note,
    confirmedBy: h.confirmed_by,
    confirmedAt: h.confirmed_at,
    createdAt: h.created_at,
    updatedAt: h.updated_at,
  };
}

collectionRouter.get(
  '/cash-summary',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const handoverDate = (req.query['date'] as string) ?? todayStr();
    const officerId = (req.query['officerId'] as string) ?? auth.userId;

    const { data: expected, error } = await supabaseAdmin.rpc('officer_cash_expected', {
      p_org_id: auth.orgId,
      p_officer_id: officerId,
      p_handover_date: handoverDate,
    });
    if (error) throw error;

    const { data: handovers } = await supabaseAdmin
      .from('cash_handovers')
      .select('*')
      .eq('org_id', auth.orgId)
      .eq('officer_id', officerId)
      .order('handover_date', { ascending: false })
      .limit(30);
    const handedOver = (handovers ?? [])
      .filter((h) => h.handover_date === handoverDate && ['submitted', 'confirmed'].includes(h.status))
      .reduce((s, h) => s + num(h.counted_amount), 0);
    const last = (handovers ?? [])[0] ?? null;
    const collectedToday = money(num(expected));
    const res2 = {
      officerId,
      handoverDate,
      collectedToday,
      handedOver: money(handedOver),
      cashInHand: money(Math.max(num(expected) - handedOver, 0)),
      lastHandover: last ? mapHandover(last as HandoverRow) : null,
    };
    res.json(res2);
  }),
);

// ── Handovers (requirement 4) ────────────────────────────────────────────────
collectionRouter.get(
  '/handovers',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    const q = handoverQuerySchema.parse(req.query);
    let query = supabaseAdmin
      .from('cash_handovers')
      .select('*, users_profile!cash_handovers_officer_id_fkey(full_name)')
      .order('handover_date', { ascending: false })
      .limit(200);
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    if (auth.branchId && !['branch_manager', 'org_admin', 'super_admin'].includes(auth.role)) {
      query = query.eq('officer_id', auth.userId);
    }
    if (q.from) query = query.gte('handover_date', q.from);
    if (q.to) query = query.lte('handover_date', q.to);
    if (q.status) query = query.eq('status', q.status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((row) => {
        const profile = (row as { users_profile?: { full_name?: string } | null }).users_profile;
        return mapHandover(row as HandoverRow, profile?.full_name ?? '—');
      }),
    });
  }),
);

collectionRouter.post(
  '/handovers',
  requirePermission('loan:write'),
  validate(cashHandoverCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const body = req.body as { handoverDate: string; officerNote?: string };
    let branchId = auth.branchId;
    if (!branchId) {
      const { data: b } = await supabaseAdmin.from('branches').select('id').limit(1);
      branchId = b?.[0]?.id ?? null;
    }
    if (!branchId) throw BadRequest('Branch is required');
    const { data: expected } = await supabaseAdmin.rpc('officer_cash_expected', {
      p_org_id: auth.orgId,
      p_officer_id: auth.userId,
      p_handover_date: body.handoverDate,
    });
    const { data, error } = await supabaseAdmin
      .from('cash_handovers')
      .insert({
        org_id: auth.orgId,
        branch_id: branchId,
        officer_id: auth.userId,
        handover_date: body.handoverDate,
        expected_amount: money(num(expected)),
        officer_note: body.officerNote ?? null,
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(mapHandover(data as HandoverRow));
  }),
);

collectionRouter.post(
  '/handovers/:id/submit',
  requirePermission('loan:write'),
  validate(cashHandoverSubmitSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    const body = req.body as { countedAmount: string; officerNote?: string };
    const { data: existing } = await supabaseAdmin
      .from('cash_handovers')
      .select('*')
      .eq('id', req.params['id'])
      .single();
    if (!existing) throw NotFound('Handover not found');
    if (existing.status !== 'draft') throw Conflict(`Only a draft handover can be submitted (status: ${existing.status})`);
    const { data, error } = await supabaseAdmin
      .from('cash_handovers')
      .update({
        counted_amount: body.countedAmount,
        officer_note: body.officerNote ?? existing.officer_note,
        status: 'submitted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params['id'])
      .select('*')
      .single();
    if (error) throw error;
    res.json(mapHandover(data as HandoverRow));
  }),
);

collectionRouter.post(
  '/handovers/:id/confirm',
  requirePermission('loan:write'),
  validate(cashHandoverConfirmSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!['branch_manager', 'org_admin', 'super_admin'].includes(auth.role)) {
      throw Forbidden('Only a Branch Manager can confirm or reject a handover');
    }
    const body = req.body as { decision: 'confirm' | 'reject'; receivedAmount?: string; accountantNote?: string };
    const { data: existing } = await supabaseAdmin
      .from('cash_handovers')
      .select('*')
      .eq('id', req.params['id'])
      .single();
    if (!existing) throw NotFound('Handover not found');
    if (existing.status !== 'submitted') throw Conflict(`Only a submitted handover can be confirmed (status: ${existing.status})`);
    const { data, error } = await supabaseAdmin
      .from('cash_handovers')
      .update({
        status: body.decision === 'confirm' ? 'confirmed' : 'rejected',
        received_amount: body.receivedAmount ?? (body.decision === 'confirm' ? existing.counted_amount : null),
        accountant_note: body.accountantNote ?? null,
        confirmed_by: auth.userId,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params['id'])
      .select('*')
      .single();
    if (error) throw error;
    res.json(mapHandover(data as HandoverRow));
  }),
);

// ── 5) Early closure: quote then close ──────────────────────────────────────
collectionRouter.get(
  '/settlement/closure-quote',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const q = loanClosureQuoteSchema.parse({ applicationId: req.query['applicationId'] });
    const { data: rows } = await supabaseAdmin
      .from('loan_repayment_schedule')
      .select('seq, total, interest, paid_amount')
      .eq('application_id', q.applicationId)
      .order('seq');
    if (!rows?.length) throw NotFound('Loan schedule not found');
    const quote = computeClosureRebate({
      rows: rows.map((r) => ({ seq: r.seq, total: money(num(r.total)), interest: money(num(r.interest)), paidAmount: money(num(r.paid_amount)) })),
    });
    const { data: rec } = await supabaseAdmin
      .from('loan_disbursements')
      .select('loan_number')
      .eq('application_id', q.applicationId)
      .maybeSingle();
    res.json({ applicationId: q.applicationId, loanNumber: rec?.loan_number ?? null, ...quote });
  }),
);

collectionRouter.post(
  '/settlement/closure',
  requirePermission('loan:write'),
  validate(loanClosureCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    const body = req.body as { applicationId: string; serviceDeductionPercent?: number };
    const { data: rows } = await supabaseAdmin
      .from('loan_repayment_schedule')
      .select('seq, total, interest, paid_amount')
      .eq('application_id', body.applicationId)
      .order('seq');
    if (!rows?.length) throw NotFound('Loan schedule not found');
    const quote = computeClosureRebate({
      rows: rows.map((r) => ({ seq: r.seq, total: money(num(r.total)), interest: money(num(r.interest)), paidAmount: money(num(r.paid_amount)) })),
      serviceDeductionPercent: body.serviceDeductionPercent,
    });
    const { data: app } = await supabaseAdmin
      .from('loan_applications')
      .select('org_id, branch_id, member_id, status')
      .eq('id', body.applicationId)
      .single();
    if (!app) throw NotFound('Loan application not found');
    if (app.status !== 'disbursed') throw Conflict(`Only a disbursed loan can be closed early (status: ${app.status})`);
    const { data: rec } = await supabaseAdmin
      .from('loan_disbursements')
      .select('loan_number')
      .eq('application_id', body.applicationId)
      .maybeSingle();
    const { data: closure, error } = await supabaseAdmin
      .from('loan_closures')
      .insert({
        org_id: app.org_id,
        branch_id: app.branch_id,
        application_id: body.applicationId,
        outstanding_principal: quote.outstandingPrincipal,
        unearned_interest: quote.unearnedInterest,
        rebate: quote.rebate,
        service_deduction: quote.serviceDeduction,
        closure_amount: quote.closureAmount,
        remaining_installments: quote.remainingInstallments,
        closed_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    await supabaseAdmin
      .from('loan_applications')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', body.applicationId)
      .eq('status', 'disbursed');
    const { data: member } = await supabaseAdmin.from('members').select('full_name').eq('id', app.member_id).maybeSingle();
    res.status(201).json({
      id: closure.id,
      applicationId: closure.application_id,
      loanNumber: rec?.loan_number ?? null,
      memberName: member?.full_name ?? '—',
      outstandingPrincipal: money(num(closure.outstanding_principal)),
      unearnedInterest: money(num(closure.unearned_interest)),
      rebate: money(num(closure.rebate)),
      serviceDeduction: money(num(closure.service_deduction)),
      closureAmount: money(num(closure.closure_amount)),
      remainingInstallments: closure.remaining_installments,
      closedAt: closure.closed_at,
      closedBy: closure.closed_by,
    });
  }),
);

// ── 5) Reschedule: request → decision (DB trigger applies the shift) ────────
collectionRouter.post(
  '/settlement/reschedule',
  requirePermission('loan:write'),
  validate(loanRescheduleCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const body = req.body as { applicationId: string; shiftInstallments: number; reason: string; note: string };
    const { data: app } = await supabaseAdmin
      .from('loan_applications')
      .select('org_id, branch_id')
      .eq('id', body.applicationId)
      .single();
    if (!app) throw NotFound('Loan application not found');
    const { data: existing } = await supabaseAdmin
      .from('loan_reschedules')
      .select('id')
      .eq('application_id', body.applicationId)
      .eq('status', 'approved')
      .maybeSingle();
    if (existing) throw Conflict('Loan already rescheduled once');
    const { data, error } = await supabaseAdmin
      .from('loan_reschedules')
      .insert({
        org_id: app.org_id,
        branch_id: app.branch_id,
        application_id: body.applicationId,
        shift_installments: body.shiftInstallments,
        reason: body.reason,
        note: body.note,
        requested_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({
      id: data.id,
      applicationId: data.application_id,
      loanNumber: null,
      memberName: '—',
      shiftInstallments: data.shift_installments,
      reason: data.reason,
      note: data.note,
      movedRows: data.moved_rows ?? [],
      requestedBy: data.requested_by,
      requestedAt: data.requested_at,
      status: data.status,
      decidedBy: data.decided_by,
      decidedAt: data.decided_at,
    });
  }),
);

collectionRouter.get(
  '/settlement/reschedules',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    let query = supabaseAdmin.from('loan_reschedules').select('*').is('deleted_at', null).order('requested_at', { ascending: false });
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

collectionRouter.post(
  '/settlement/reschedules/:id/decision',
  requirePermission('loan:write'),
  validate(rescheduleDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!['branch_manager', 'org_admin', 'super_admin'].includes(auth.role)) {
      throw Forbidden('Only a Branch Manager can decide a reschedule');
    }
    const body = req.body as { decision: 'approved' | 'rejected' };
    // Apply the concrete shift when approving: push unpaid installments out by
    // N installments, keeping their day-of-week; record moved_rows.
    const { data: rec } = await supabaseAdmin
      .from('loan_reschedules')
      .select('*')
      .eq('id', req.params['id'])
      .single();
    if (!rec) throw NotFound('Reschedule not found');
    if (rec.status !== 'pending') throw Conflict(`Reschedule already decided (status: ${rec.status})`);
    const movedRows: Array<{ seq: number; oldDueDate: string; newDueDate: string }> = [];
    if (body.decision === 'approved') {
      const { data: sched } = await supabaseAdmin
        .from('loan_repayment_schedule')
        .select('id, seq, due_date, total, paid_amount')
        .eq('application_id', rec.application_id)
        .order('seq');
      const rows = (sched ?? []).filter((r) => num(r.paid_amount) < num(r.total)) as Array<{
        id: string;
        seq: number;
        due_date: string;
      }>;
      for (const [i, r] of rows.slice(0, rec.shift_installments).entries()) {
        const old = new Date(`${r.due_date}T00:00:00Z`);
        const next = new Date(old.getTime() + (i + 1) * 7 * 86_400_000);
        movedRows.push({ seq: r.seq, oldDueDate: r.due_date, newDueDate: next.toISOString().slice(0, 10) });
        await supabaseAdmin
          .from('loan_repayment_schedule')
          .update({ due_date: next.toISOString().slice(0, 10), shifted: true, shift_reason: `reschedule:${rec.id}` })
          .eq('id', r.id);
      }
    }
    const { data, error } = await supabaseAdmin
      .from('loan_reschedules')
      .update({
        status: body.decision,
        decided_by: auth.userId,
        decided_at: new Date().toISOString(),
        moved_rows: movedRows,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rec.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  }),
);

// ── 5) Write-off: request → decision (DB trigger posts the journal) ─────────
collectionRouter.post(
  '/settlement/write-offs',
  requirePermission('loan:write'),
  validate(loanWriteOffCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const body = req.body as { applicationId: string; reason: string; note: string };
    const { data: app } = await supabaseAdmin
      .from('loan_applications')
      .select('org_id, branch_id')
      .eq('id', body.applicationId)
      .single();
    if (!app) throw NotFound('Loan application not found');
    const { data: sched } = await supabaseAdmin
      .from('loan_repayment_schedule')
      .select('total, paid_amount')
      .eq('application_id', body.applicationId);
    const outstanding = (sched ?? []).reduce((s, r) => s + Math.max(num(r.total) - num(r.paid_amount), 0), 0);
    const { data, error } = await supabaseAdmin
      .from('loan_write_offs')
      .insert({
        org_id: app.org_id,
        branch_id: app.branch_id,
        application_id: body.applicationId,
        outstanding_amount: money(outstanding),
        reason: body.reason,
        note: body.note,
        requested_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  }),
);

collectionRouter.get(
  '/settlement/write-offs',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    let query = supabaseAdmin.from('loan_write_offs').select('*').is('deleted_at', null).order('requested_at', { ascending: false });
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

collectionRouter.post(
  '/settlement/write-offs/:id/decision',
  requirePermission('loan:write'),
  validate(writeOffDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!['org_admin', 'super_admin'].includes(auth.role)) {
      throw Forbidden('Only a Director of Operations / org admin can decide a write-off');
    }
    const body = req.body as { decision: 'recommended' | 'approved' | 'rejected'; decisionNote?: string };
    const { data, error } = await supabaseAdmin
      .from('loan_write_offs')
      .update({
        status: body.decision,
        decided_by: auth.userId,
        decided_at: new Date().toISOString(),
        decision_note: body.decisionNote ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params['id'])
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  }),
);

// ── 6) BM-only reversal of a wrong entry ────────────────────────────────────
collectionRouter.post(
  '/entries/:id/reverse',
  requirePermission('loan:write'),
  validate(collectionReversalSchema.omit({ entryId: true })),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    if (!['branch_manager', 'org_admin', 'super_admin'].includes(auth.role)) {
      throw Forbidden('Only a Branch Manager can reverse a wrong entry');
    }
    const body = req.body as { reason: string };
    const { data: entry } = await supabaseAdmin
      .from('collection_entries')
      .select('*')
      .eq('id', req.params['id'])
      .is('deleted_at', null)
      .single();
    if (!entry) throw NotFound('Entry not found');
    const { data: existing } = await supabaseAdmin
      .from('collection_reversals')
      .select('id')
      .eq('entry_id', entry.id)
      .maybeSingle();
    if (existing) throw Conflict('This entry has already been reversed');

    const a = (entry as CollectionEntryRow).allocation;
    const unapplied = {
      overdue: (a.overdueApplied ?? []).map((o) => ({ seq: o.seq, amount: o.amount })),
      current: a.currentApplied ? { seq: a.currentApplied.seq, amount: a.currentApplied.amount } : null,
      savings: a.savingsApplied,
      advance: a.advanceApplied,
    };
    // Insert the reversal row — the 0058 trigger un-applies the schedule and
    // reverses the savings leg inside one DB transaction.
    const { data: rev, error } = await supabaseAdmin
      .from('collection_reversals')
      .insert({
        org_id: (entry as CollectionEntryRow).org_id,
        branch_id: (entry as CollectionEntryRow).branch_id,
        entry_id: entry.id,
        receipt_no: (entry as CollectionEntryRow).receipt_no,
        reason: body.reason,
        reversed_by: auth.userId,
        unapplied,
      })
      .select('*')
      .single();
    if (error) throw error;
    await supabaseAdmin
      .from('collection_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', entry.id);
    res.status(201).json({
      id: rev.id,
      entryId: rev.entry_id,
      receiptNo: rev.receipt_no,
      reason: rev.reason,
      reversedBy: rev.reversed_by,
      reversedAt: rev.created_at,
      unapplied,
    });
  }),
);

// ── 8) Rule engine config (org-level) ───────────────────────────────────────
// GET/PATCH /rules implemented above next to loadRules().

// ── 9) Fraud flags ──────────────────────────────────────────────────────────
collectionRouter.get(
  '/fraud-flags',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    let query = supabaseAdmin
      .from('collection_fraud_flags')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    const reviewed = req.query['reviewed'];
    if (reviewed === 'true') query = query.eq('reviewed', true);
    if (reviewed === 'false') query = query.eq('reviewed', false);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

collectionRouter.post(
  '/fraud-flags/:id/review',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    const { data, error } = await supabaseAdmin
      .from('collection_fraud_flags')
      .update({ reviewed: true, reviewed_by: auth.userId })
      .eq('id', req.params['id'])
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  }),
);

// ── 7) BM realtime dashboard (expected vs collected) ────────────────────────
collectionRouter.get(
  '/dashboard',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    const meetingDate = (req.query['date'] as string) ?? todayStr();
    let branchId = (req.query['branchId'] as string) ?? auth.branchId ?? null;
    if (!branchId) {
      const { data: b } = await supabaseAdmin.from('branches').select('id').limit(1);
      branchId = b?.[0]?.id ?? null;
    }
    if (!branchId) throw BadRequest('Branch is required');

    const { data: view, error } = await supabaseAdmin
      .from('v_collection_dashboard')
      .select('officer_id, entries_count, collected')
      .eq('branch_id', branchId)
      .eq('meeting_date', meetingDate);
    if (error) throw error;

    const { data: staff } = await supabaseAdmin
      .from('users_profile')
      .select('id, full_name')
      .in('id', (view ?? []).map((v) => v.officer_id).filter(Boolean));
    const nameByOfficer = new Map((staff ?? []).map((s) => [s.id, s.full_name]));

    const collected = (view ?? []).reduce((s, v) => s + num(v.collected), 0);
    const entriesCount = (view ?? []).reduce((s, v) => s + num(v.entries_count), 0);
    const byOfficer = (view ?? []).map((v) => ({
      officerId: v.officer_id,
      officerName: nameByOfficer.get(v.officer_id) ?? '—',
      expected: '0.00', // Sheet-level expectation is derived per meeting in the sheet endpoint.
      collected: money(num(v.collected)),
      entriesCount: num(v.entries_count),
      collectionRate: collected > 0 ? 1 : 0,
    }));

    res.json({
      meetingDate,
      branchId,
      generatedAt: new Date().toISOString(),
      totals: {
        expected: '0.00',
        collected: money(collected),
        entriesCount,
        collectionRate: collected > 0 ? 1 : 0,
      },
      byOfficer,
      bySamity: [],
    });
  }),
);
