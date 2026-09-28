/**
 * ── Insurance & welfare demo router ──────────────────────────────────────────
 * Credit life (policy issue, claims ladder), micro-insurance (products,
 * enrollments, claims), member/staff welfare funds (rules, requests, decisions,
 * ledger) and the dividend split. Mirrors migration 0040 for the demo path.
 */
import { Router } from 'express';
import {
  claimDecisionSchema,
  claimSubmitSchema,
  computeDividend,
  microClaimSchema,
  microEnrollSchema,
  microProductUpsertSchema,
  welfareDecisionSchema,
  welfareRequestSchema,
} from '@samity/shared';
import {
  InsuranceWelfareError,
  decideClaim,
  decideWelfare,
  enrollMicro,
  fundBalance,
  getWelfareRules,
  issueCreditLife,
  listClaims,
  listMicroEnrollments,
  listMicroProducts,
  listPolicies,
  listWelfareRequests,
  postWelfareContribution,
  resetInsWelfareStore,
  submitClaim,
  submitMicroClaim,
  submitWelfareRequest,
  updateWelfareRules,
  upsertMicroProduct,
  welfareSummary,
  insWelfareStore,
} from '../lib/insurance-welfare-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function iwError(err: unknown): never {
  if (err instanceof InsuranceWelfareError) throw new AppError(err.status, err.code as never, err.message);
  throw err as Error;
}

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';

/** Demo actor identity from the token. */
function actor(req: RequestWithAuth): { id: string; name: string; isAdmin: boolean } {
  const role = req.auth!.role;
  return {
    id: req.auth!.userId,
    name: req.auth!.email.split('@')[0] ?? 'user',
    isAdmin: role === 'super_admin' || role === 'org_admin',
  };
}

export const insWelfareRouter = Router();
insWelfareRouter.use(requireAuth);

/* ── 1) Credit life ───────────────────────────────────────────────────────── */

insWelfareRouter.get(
  '/policies',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = insWelfareStore();
    res.json({
      items: listPolicies(store, {
        branchId: (req.query['branchId'] as string | undefined) ?? undefined,
        status: (req.query['status'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

insWelfareRouter.post(
  '/policies',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const policy = issueCreditLife(insWelfareStore(), req.body);
      res.status(201).json(policy);
    } catch (err) {
      iwError(err);
    }
  }),
);

insWelfareRouter.get(
  '/claims',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = insWelfareStore();
    res.json({
      items: listClaims(store, {
        branchId: (req.query['branchId'] as string | undefined) ?? undefined,
        status: (req.query['status'] as string | undefined) ?? undefined,
        kind: (req.query['kind'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

insWelfareRouter.post(
  '/claims',
  requirePermission('member:write'),
  validate(claimSubmitSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const claim = submitClaim(insWelfareStore(), req.body, actor(req));
      res.status(201).json(claim);
    } catch (err) {
      iwError(err);
    }
  }),
);

insWelfareRouter.post(
  '/claims/:id/decision',
  requirePermission('member:write'),
  validate(claimDecisionSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(decideClaim(insWelfareStore(), req.params['id'] as string, req.body));
    } catch (err) {
      iwError(err);
    }
  }),
);

/* ── 2) Micro insurance ───────────────────────────────────────────────────── */

insWelfareRouter.get(
  '/micro/products',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listMicroProducts(insWelfareStore(), (req.query['kind'] as string | undefined) ?? undefined) });
  }),
);

insWelfareRouter.post(
  '/micro/products',
  requirePermission('branch:manage'),
  validate(microProductUpsertSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(upsertMicroProduct(insWelfareStore(), req.body));
    } catch (err) {
      iwError(err);
    }
  }),
);

insWelfareRouter.get(
  '/micro/enrollments',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = insWelfareStore();
    res.json({
      items: listMicroEnrollments(store, {
        branchId: (req.query['branchId'] as string | undefined) ?? undefined,
        kind: (req.query['kind'] as string | undefined) ?? undefined,
        memberId: (req.query['memberId'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

insWelfareRouter.post(
  '/micro/enrollments',
  requirePermission('member:write'),
  validate(microEnrollSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const branchId = req.auth!.branchId ?? BRANCH_DHAKA;
      res.status(201).json(enrollMicro(insWelfareStore(), req.body, branchId));
    } catch (err) {
      iwError(err);
    }
  }),
);

insWelfareRouter.post(
  '/micro/claims',
  requirePermission('member:write'),
  validate(microClaimSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.status(201).json(submitMicroClaim(insWelfareStore(), req.body, actor(req)));
    } catch (err) {
      iwError(err);
    }
  }),
);

/* ── 3) Member welfare fund ───────────────────────────────────────────────── */

insWelfareRouter.get(
  '/welfare/rules',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json(getWelfareRules(insWelfareStore()));
  }),
);

insWelfareRouter.put(
  '/welfare/rules',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      res.json(updateWelfareRules(insWelfareStore(), req.body));
    } catch (err) {
      iwError(err);
    }
  }),
);

insWelfareRouter.get(
  '/welfare/requests',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = insWelfareStore();
    res.json({
      items: listWelfareRequests(store, {
        fund: (req.query['fund'] as string | undefined) ?? undefined,
        status: (req.query['status'] as string | undefined) ?? undefined,
        branchId: (req.query['branchId'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

insWelfareRouter.post(
  '/welfare/requests',
  requirePermission('member:write'),
  validate(welfareRequestSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const branchId = req.auth!.branchId ?? BRANCH_DHAKA;
      res.status(201).json(submitWelfareRequest(insWelfareStore(), req.body, branchId));
    } catch (err) {
      iwError(err);
    }
  }),
);

insWelfareRouter.post(
  '/welfare/requests/:id/decision',
  requirePermission('member:write'),
  validate(welfareDecisionSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(decideWelfare(insWelfareStore(), req.params['id'] as string, req.body));
    } catch (err) {
      iwError(err);
    }
  }),
);

/* ── Ledger, summary, dividend ─────────────────────────────────────────────── */

insWelfareRouter.get(
  '/welfare/ledger',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = insWelfareStore();
    const fund = (req.query['fund'] as string | undefined) ?? undefined;
    const items = fund ? store.ledger.filter((l) => l.fund === fund) : store.ledger;
    res.json({
      items: [...items].sort((a, b) => b.at.localeCompare(a.at)),
      balances: {
        member: fundBalance(store, 'member_welfare'),
        staff: fundBalance(store, 'staff_benevolent'),
        insurance: fundBalance(store, 'insurance'),
      },
    });
  }),
);

insWelfareRouter.get(
  '/welfare/summary',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json(welfareSummary(insWelfareStore()));
  }),
);

insWelfareRouter.post(
  '/welfare/contribution',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      const { fund, amount, memo } = req.body as { fund: 'member_welfare' | 'staff_benevolent'; amount: string; memo?: string };
      if (!['member_welfare', 'staff_benevolent'].includes(fund) || !amount) {
        throw new AppError(400, 'VALIDATION_ERROR', 'fund এবং amount প্রয়োজন / fund and amount required');
      }
      postWelfareContribution(insWelfareStore(), fund, amount, memo ?? 'চাঁদা জমা');
      res.status(201).json({ ok: true });
    } catch (err) {
      iwError(err);
    }
  }),
);

insWelfareRouter.post(
  '/dividend/compute',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      const { surplus, payoutPct, totalShares, holders } = req.body as {
        surplus: string;
        payoutPct: number;
        totalShares: number;
        holders: { memberId: string; memberName: string; shares: number }[];
      };
      if (!surplus || typeof payoutPct !== 'number' || !Array.isArray(holders)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'surplus, payoutPct, holders প্রয়োজন');
      }
      res.json(computeDividend({ surplus, payoutPct, totalShares: totalShares ?? holders.reduce((s, h) => s + h.shares, 0) }, holders));
    } catch (err) {
      iwError(err);
    }
  }),
);

/** Test helper exported for isolation. */
export { resetInsWelfareStore, ORG_ID };
