import { Router } from 'express';
import {
  LIFECYCLE_TRANSITIONS,
  admissionCreateSchema,
  checkDuplicateMembership,
  duplicateCheckQuerySchema,
  memberCreateSchema,
  memberSearchQuerySchema,
  memberStatusChangeSchema,
  memberUpdateSchema,
  type AdmissionCreateInput,
  type AdmissionStage,
  type AdmissionView,
  type DuplicateCheckResult,
  type MemberLifecycle,
} from '@samity/shared';
import { Conflict, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { scopesOrg } from '../lib/tenant.js';

export const membersRouter = Router();

// All member routes require a valid token.
membersRouter.use(requireAuth);

/**
 * GET /api/v1/members?branchId=&page=&pageSize=
 * Permission-gated, org-scoped, soft-delete-aware list endpoint.
 * Replace supabaseAdmin with a request-scoped client (user JWT) when RLS
 * policies are finalized, so Postgres enforces scoping as defense in depth.
 */
membersRouter.get(
  '/',
  requirePermission('member:read'),
  // memberSearchQuerySchema (not bare pagination): `validate` REPLACES req.query
  // with the parsed object, so a narrower schema silently dropped q/status/
  // branchId and the list could never be searched or filtered by review status.
  validate(memberSearchQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const branchId = (req.query as Record<string, unknown>).branchId;

    const q = (req.query as Record<string, unknown>).q;
    const status = (req.query as Record<string, unknown>).status;

    // NOTE: `members` has samity_id / member_code / lifecycle — there is no
    // samity_name column (that exists only on member_attendance); samity and
    // branch display names come from the FK embeds below.
    let query = supabaseAdmin
      .from('members')
      .select(
        'id, org_id, branch_id, samity_id, member_code, full_name, phone, national_id, status, lifecycle, created_at, samities(name), branches(code)',
        { count: 'exact' },
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (typeof branchId === 'string' && branchId) {
      query = query.eq('branch_id', branchId);
    }
    // Free-text search over name / member number / phone (parity with demo router).
    if (typeof q === 'string' && q.trim()) {
      const needle = q.trim().replace(/[,()%\\]/g, '');
      if (needle) {
        query = query.or(`full_name.ilike.%${needle}%,member_code.ilike.%${needle}%,phone.ilike.%${needle}%`);
      }
    }
    // Lifecycle is authoritative since migration 0005.
    if (typeof status === 'string' && status) {
      query = query.eq('lifecycle', status);
    }
    // Non-super users are scoped to their own org.
    const auth = (req as RequestWithAuth).auth;
    if (scopesOrg(auth)) {
      query = query.eq('org_id', auth.orgId);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ items: data ?? [], page, pageSize, total: count ?? 0 });
  }),
);

/** POST /api/v1/members — create a member (branch/area/office staff). */
membersRouter.post(
  '/',
  requirePermission('member:write'),
  validate(memberCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { fullName: string; phone: string; branchId: string; samityId?: string; nationalId?: string };

    const { data, error } = await supabaseAdmin
      .from('members')
      .insert({
        org_id: auth.orgId,
        branch_id: body.branchId,
        full_name: body.fullName,
        phone: body.phone,
        samity_id: body.samityId ?? null,
        national_id: body.nationalId ?? null,
        status: 'active',
        created_by: auth.userId,
      })
      .select('id, full_name, created_at')
      .single();

    if (error) throw error;
    res.status(201).json({ member: data });
  }),
);

// ── Admission wizard (live) ──────────────────────────────────────────────────
// Registered before GET /:id so 'duplicate-check' / 'admissions' are never
// captured by the id route.

/** Institution-wide duplicate screening against the real members table. */
async function screenDuplicates(
  auth: { orgId: string | null; role: string },
  input: { fullName?: string; mobile?: string; idNumber?: string; workingAreaId?: string },
  branchId?: string,
): Promise<DuplicateCheckResult> {
  const needles: string[] = [];
  if (input.idNumber) needles.push(`national_id.eq.${input.idNumber}`);
  if (input.mobile) {
    const normalized = input.mobile.replace(/\D/g, '').replace(/^88/, '');
    needles.push(`phone.eq.${normalized}`);
  }
  if (input.fullName && input.fullName.trim()) {
    const safe = input.fullName.trim().replace(/[,()%\\]/g, '');
    if (safe) needles.push(`full_name.ilike.%${safe}%`);
  }
  if (needles.length === 0) return { matches: [], blocked: false, overlapRisk: false };

  let query = supabaseAdmin
    .from('members')
    .select(
      'id, member_code, full_name, phone, national_id, working_area_id, address, branch_id, lifecycle, branches(code)',
    )
    .is('deleted_at', null)
    .or(needles.join(','))
    .limit(200);
  if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);

  const { data, error } = await query;
  if (error) throw error;

  type DupRow = {
    id: string;
    member_code: string | null;
    full_name: string;
    phone: string;
    national_id: string | null;
    working_area_id: string | null;
    address: string | null;
    branch_id: string;
    lifecycle: string;
    branches: { code: string } | { code: string }[] | null;
  };
  return checkDuplicateMembership(
    {
      fullName: input.fullName,
      mobile: input.mobile,
      idNumber: input.idNumber,
      workingAreaId: input.workingAreaId,
      branchId,
    },
    ((data ?? []) as unknown as DupRow[]).map((m) => ({
      memberId: m.id,
      memberNumber: m.member_code ?? '',
      fullName: m.full_name,
      phone: m.phone,
      idNumber: m.national_id,
      workingAreaId: m.working_area_id,
      address: m.address,
      branchId: m.branch_id,
      branchCode: (Array.isArray(m.branches) ? m.branches[0]?.code : m.branches?.code) ?? '',
      status: m.lifecycle as MemberLifecycle,
    })),
  );
}

/** GET /api/v1/members/duplicate-check — NID/mobile/name screening (wizard step 2). */
membersRouter.get(
  '/duplicate-check',
  requirePermission('member:write'),
  validate(duplicateCheckQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth;
    const q = req.query as unknown as {
      idNumber?: string;
      mobile?: string;
      fullName?: string;
      workingAreaId?: string;
      branchId?: string;
    };
    res.json(await screenDuplicates(auth ?? { orgId: null, role: 'member' }, q, q.branchId));
  }),
);

/** GET /api/v1/members/admissions — recent admission records. */
membersRouter.get(
  '/admissions',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth;
    let query = supabaseAdmin
      .from('member_admissions')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

/**
 * POST /api/v1/members/admissions — completion of the admission wizard.
 * Creates the real member row (member number + passbook number), the
 * member_admissions audit row and nominee records, then returns the
 * AdmissionView the web wizard expects. Members section and Dashboard pick the
 * new member up automatically through their existing queries.
 */
membersRouter.post(
  '/admissions',
  requirePermission('member:write'),
  validate(admissionCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as AdmissionCreateInput;
    const draft = body.draft;

    // 1) Institution-wide duplicate screening — hard duplicates are blocked.
    const duplicates = await screenDuplicates(
      { orgId: auth.orgId, role: auth.role },
      { fullName: draft.fullName, mobile: draft.mobile, idNumber: draft.idNumber, workingAreaId: draft.workingAreaId },
      body.branchId,
    );
    if (duplicates.blocked) throw Conflict('দ্বৈত সদস্যপদ নিষিদ্ধ / Duplicate membership blocked');

    // 2) Resolve the samity by name within the branch (optional link — the
    //    draft's samityName is optional, so skip the lookup entirely when
    //    absent rather than matching the wrong row).
    const { data: samity } = draft.samityName
      ? await supabaseAdmin
          .from('samities')
          .select('id')
          .eq('branch_id', body.branchId)
          .eq('name', draft.samityName)
          .is('deleted_at', null)
          .maybeSingle()
      : { data: null };

    // 3) Branch code for the response view.
    const { data: branch } = await supabaseAdmin.from('branches').select('code').eq('id', body.branchId).maybeSingle();

    // 4) Member number + passbook number (org-wide yearly sequence).
    const year = new Date().getFullYear();
    const { count } = await supabaseAdmin.from('members').select('id', { count: 'exact', head: true });
    const pad = (n: number) => String(n).padStart(4, '0');
    let seq = (count ?? 0) + 1;
    let memberCode = `MEM-${year}-${pad(seq)}`;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const { data: exists } = await supabaseAdmin.from('members').select('id').eq('member_code', memberCode).maybeSingle();
      if (!exists) break;
      seq += 1;
      memberCode = `MEM-${year}-${pad(seq)}`;
    }
    const passbookNo = `PB-${year}-${pad(seq)}`;

    // 5) Create the member.
    const { data: member, error: memberError } = await supabaseAdmin
      .from('members')
      .insert({
        org_id: auth.orgId,
        branch_id: body.branchId,
        samity_id: samity?.id ?? null,
        member_code: memberCode,
        passbook_no: passbookNo,
        full_name: draft.fullName,
        full_name_bn: draft.fullNameBn,
        father_or_husband_name: draft.fatherOrHusbandName,
        mother_name: draft.motherName,
        phone: draft.mobile,
        national_id: draft.idNumber,
        dob: draft.dob,
        address: draft.address,
        working_area_id: draft.workingAreaId ?? null,
        occupation: draft.occupation,
        monthly_household_income: draft.monthlyHouseholdIncome,
        land_owned_decimals: draft.landOwnedDecimals,
        family_members: draft.familyMembers,
        photo_path: draft.photoPath ?? null,
        signature_path: draft.signaturePath ?? null,
        // A fresh admission lands in `pending` — the Members page surfaces it as
        // "পর্যালোচনা / Review" until a manager approves it (`/members/:id/status`).
        // member_status has no pending value, so the coarse column stays active
        // while `lifecycle` (authoritative since 0005) carries the review state.
        status: 'active',
        lifecycle: 'pending',
        join_date: new Date().toISOString().slice(0, 10),
        created_by: auth.userId,
      })
      .select('id')
      .single();
    if (memberError || !member) throw memberError ?? new Error('member insert failed');

    // 6) Admission audit row with the wizard's stage history.
    const now = new Date().toISOString();
    const stageHistory: AdmissionView['stageHistory'] = [
      { stage: 'member_issued' as AdmissionStage, result: 'pass' as const, at: now, by: auth.userId },
    ];
    const { data: admission, error: admissionError } = await supabaseAdmin
      .from('member_admissions')
      .insert({
        org_id: auth.orgId,
        branch_id: body.branchId,
        draft,
        stage: 'passbook_generated',
        stage_history: stageHistory,
        member_number: memberCode,
        passbook_no: passbookNo,
        member_id: member.id,
        created_by: auth.userId,
      })
      .select('id')
      .single();
    if (admissionError || !admission) throw admissionError ?? new Error('admission insert failed');

    // 7) Nominees.
    if (draft.nominees.length > 0) {
      const { error: nomineesError } = await supabaseAdmin.from('member_nominees').insert(
        draft.nominees.map((n) => ({
          org_id: auth.orgId,
          member_id: member.id,
          name: n.name,
          relation: n.relation,
          share_pct: n.sharePct,
          created_by: auth.userId,
        })),
      );
      if (nomineesError) throw nomineesError;
    }

    const view: AdmissionView = {
      id: admission.id,
      branchId: body.branchId,
      branchCode: branch?.code ?? '',
      stage: 'passbook_generated',
      stageHistory,
      draft,
      duplicates,
      eligibility: null,
      memberNumber: memberCode,
      passbookNo,
      status: 'pending',
    };
    res.status(201).json({ admission: view });
  }),
);

/** GET /api/v1/members/:id — single member. */
membersRouter.get(
  '/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth;
    let query = supabaseAdmin
      .from('members')
      .select('*')
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    // id-addressed read: without the tenant predicate the service client would
    // happily return another organization's member row.
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);
    const { data, error } = await query.single();

    if (error || !data) throw NotFound('সদস্য পাওয়া যায়নি / Member not found');
    res.json({ member: data });
  }),
);

/** PATCH /api/v1/members/:id — partial update of contact / assignment fields. */
membersRouter.patch(
  '/:id',
  requirePermission('member:write'),
  validate(memberUpdateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as {
      fullName?: string;
      phone?: string;
      branchId?: string;
      samityId?: string;
      nationalId?: string;
    };

    const patch: Record<string, unknown> = {};
    if (body.fullName !== undefined) patch['full_name'] = body.fullName;
    if (body.phone !== undefined) patch['phone'] = body.phone;
    if (body.branchId !== undefined) patch['branch_id'] = body.branchId;
    if (body.samityId !== undefined) patch['samity_id'] = body.samityId;
    if (body.nationalId !== undefined) patch['national_id'] = body.nationalId;

    let query = supabaseAdmin
      .from('members')
      .update(patch)
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    // Non-super users may only update rows inside their own org.
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);

    const { data, error } = await query
      .select(
        'id, org_id, branch_id, samity_id, member_code, full_name, phone, national_id, status, lifecycle, created_at, samities(name), branches(code)',
      )
      .single();

    if (error || !data) throw NotFound('সদস্য পাওয়া যায়নি / Member not found');
    res.json({ member: data });
  }),
);

/**
 * member_status has no `pending` value, so lifecycle drives the UI badge while
 * the coarse `status` column is kept consistent for any legacy reader.
 */
const COARSE_STATUS_BY_LIFECYCLE: Record<MemberLifecycle, 'active' | 'inactive' | 'closed'> = {
  pending: 'active',
  active: 'active',
  dormant: 'inactive',
  transferred: 'active',
  dropout: 'closed',
  deceased: 'closed',
};

/**
 * POST /api/v1/members/:id/status — lifecycle transition with an audit row.
 * Mirrors the demo router (members.demo.routes.ts) so the Members page works
 * identically in both modes: pending → active is the admission "approve".
 */
membersRouter.post(
  '/:id/status',
  requirePermission('member:approve'),
  validate(memberStatusChangeSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { status: MemberLifecycle; reasonCode: string; note?: string; effectiveDate: string };

    let query = supabaseAdmin
      .from('members')
      .select('id, org_id, lifecycle')
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);

    const { data: member, error } = await query.maybeSingle();
    if (error) throw error;
    if (!member) throw NotFound('সদস্য পাওয়া যায়নি / Member not found');

    const from = member.lifecycle as MemberLifecycle;
    if (from === body.status) {
      res.json({ member: { id: member.id, lifecycle: from } });
      return;
    }
    const allowed = LIFECYCLE_TRANSITIONS[from] ?? [];
    if (!allowed.includes(body.status)) {
      throw Conflict(`অবৈধ স্থানান্তর ${from} → ${body.status} / Invalid status transition`);
    }

    // The read above already proved the row is in the caller's org, but the
    // write carries the predicate too so the invariant is unconditional (the
    // service client bypasses RLS).
    let updateQuery = supabaseAdmin
      .from('members')
      .update({ lifecycle: body.status, status: COARSE_STATUS_BY_LIFECYCLE[body.status] })
      .eq('id', member.id);
    if (scopesOrg(auth)) updateQuery = updateQuery.eq('org_id', auth.orgId);
    const { error: updateError } = await updateQuery;
    if (updateError) throw updateError;

    // Append-only lifecycle audit (0005). Never silently skipped — an audit gap
    // is worse than a failed request.
    const { error: historyError } = await supabaseAdmin.from('member_status_history').insert({
      org_id: member.org_id,
      member_id: member.id,
      status: body.status,
      reason_code: body.reasonCode,
      note: body.note ?? null,
      changed_by: auth.userId,
    });
    if (historyError) throw historyError;

    res.json({ member: { id: member.id, lifecycle: body.status } });
  }),
);

/** DELETE /api/v1/members/:id — soft delete only (sets deleted_at). */
membersRouter.delete(
  '/:id',
  requirePermission('member:write'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    // `members` has no deleted_by column — soft delete is deleted_at only.
    let query = supabaseAdmin
      .from('members')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);

    // PostgREST reports no error when the filter matches nothing, so the row is
    // read back: an unknown, already-deleted or other-org member must 404
    // instead of answering a silent 204.
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('সদস্য পাওয়া যায়নি / Member not found');
    res.status(204).send();
  }),
);
