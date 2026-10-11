import { Router } from 'express';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { scopesOrg } from '../lib/tenant.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

/**
 * GET /api/v1/dashboard/summary — every KPI computed from the live database:
 * members, branches, samities, total savings balance and active (disbursed)
 * loans — all org-scoped for non-super users.
 */
dashboardRouter.get(
  '/summary',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const scopeOrg = scopesOrg(auth);

    const countOf = async (table: string, statusEq?: string, softDelete = true) => {
      let query = supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
      if (softDelete) query = query.is('deleted_at', null);
      if (scopeOrg) query = query.eq('org_id', auth.orgId!);
      if (statusEq) query = query.eq('status', statusEq);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    };

    const [totalMembers, branches, samities, activeLoans, savingsRows] = await Promise.all([
      countOf('members'),
      countOf('branches'),
      countOf('samities'),
      // loan_applications has no soft-delete column (0012).
      countOf('loan_applications', 'disbursed', false),
      // Demo-scale data fits comfortably; the balance sum is folded here
      // (PostgREST has no aggregate sum without a DB view/RPC).
      (async () => {
        let query = supabaseAdmin.from('savings_accounts').select('balance').is('deleted_at', null).limit(10_000);
        if (scopeOrg) query = query.eq('org_id', auth.orgId!);
        const { data, error } = await query;
        if (error) throw error;
        return data ?? [];
      })(),
    ]);

    const totalSavings = savingsRows.reduce((sum, row) => sum + Number(row.balance ?? 0), 0);

    res.json({
      totalMembers,
      branches,
      samities,
      activeLoans,
      totalSavings: totalSavings.toFixed(2),
    });
  }),
);
