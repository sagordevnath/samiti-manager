import { Router } from 'express';
import { memberCreateSchema, paginationQuerySchema } from '@samity/shared';
import { NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';

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
  validate(paginationQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    const branchId = (req.query as Record<string, unknown>).branchId;

    let query = supabaseAdmin
      .from('members')
      .select('id, org_id, branch_id, full_name, phone, samity_name, national_id, status, created_at', { count: 'exact' })
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (typeof branchId === 'string' && branchId) {
      query = query.eq('branch_id', branchId);
    }
    // Non-super users are scoped to their own org.
    const auth = (req as RequestWithAuth).auth;
    if (auth?.orgId && auth.role !== 'super_admin') {
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
    const body = req.body as { fullName: string; phone: string; branchId: string; samityName?: string; nationalId?: string };

    const { data, error } = await supabaseAdmin
      .from('members')
      .insert({
        org_id: auth.orgId,
        branch_id: body.branchId,
        full_name: body.fullName,
        phone: body.phone,
        samity_name: body.samityName ?? null,
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

/** GET /api/v1/members/:id — single member. */
membersRouter.get(
  '/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('members')
      .select('*')
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null)
      .single();

    if (error || !data) throw NotFound('সদস্য পাওয়া যায়নি / Member not found');
    res.json({ member: data });
  }),
);

/** DELETE /api/v1/members/:id — soft delete only (sets deleted_at). */
membersRouter.delete(
  '/:id',
  requirePermission('member:write'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const { error } = await supabaseAdmin
      .from('members')
      .update({ deleted_at: new Date().toISOString(), deleted_by: auth.userId })
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);

    if (error) throw error;
    res.status(204).send();
  }),
);
