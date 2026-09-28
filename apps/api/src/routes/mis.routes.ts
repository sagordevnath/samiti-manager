/**
 * ── Reports/MIS demo router ──────────────────────────────────────────────────
 * Role dashboards, standard reports (audited), financial ratios and the
 * regulatory template designer + return generation. Mirrors migrations
 * 0048/0049 for the demo path.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  STANDARD_REPORTS,
  renderRegulatoryTextBn,
  reportTemplateSchema,
  type StandardReportKind,
} from '@samity/shared';
import {
  boardDashboard,
  createTemplate,
  dashboardForRole,
  deleteTemplate,
  generateReturn,
  getReturn,
  getTemplate,
  listAudit,
  listReturns,
  listTemplates,
  standardReport,
  submitReturn,
  updateTemplate,
  verifyTemplate,
} from '../lib/mis-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function pgError(err: unknown): never {
  if (err instanceof Error && 'status' in err && 'code' in err) {
    const e = err as unknown as { status: number; code: string; message: string };
    throw new AppError(e.status, e.code as never, e.message);
  }
  throw err as Error;
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

export const misRouter = Router();
misRouter.use(requireAuth);

/* ── 1) Dashboards ────────────────────────────────────────────────────────── */

misRouter.get(
  '/dashboard',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const overrideRole = (req.query['role'] as string | undefined) ?? undefined; // demo preview switch
    res.json(dashboardForRole({ role: auth.role, userId: auth.userId, name: auth.email, branchId: auth.branchId }, overrideRole));
  }),
);

misRouter.get(
  '/dashboard/board',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    res.json(boardDashboard());
  }),
);

/* ── 2) Standard reports ──────────────────────────────────────────────────── */

misRouter.get(
  '/reports/:kind',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const kind = req.params['kind'] as StandardReportKind;
      if (!STANDARD_REPORTS.includes(kind)) {
        throw new AppError(422, 'VALIDATION_ERROR' as never, `অজানা রিপোর্ট / Unknown report kind: ${kind}`);
      }
      const q = req.query;
      const report = standardReport(
        kind,
        {
          start: (q['start'] as string | undefined) ?? undefined,
          end: (q['end'] as string | undefined) ?? undefined,
          memberId: (q['memberId'] as string | undefined) ?? undefined,
          loanId: (q['loanId'] as string | undefined) ?? undefined,
          branchId: (q['branchId'] as string | undefined) ?? undefined,
        },
        (req as RequestWithAuth).auth?.email ?? 'unknown',
      );
      res.json(report);
    } catch (err) {
      pgError(err);
    }
  }),
);

misRouter.get(
  '/audit',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listAudit() });
  }),
);

/* ── 3) Financial ratios ──────────────────────────────────────────────────── */

misRouter.get(
  '/ratios',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    // Ratios are computed on demand from the live snapshot.
    const { ratiosFor } = await import('../lib/mis-store.js');
    res.json({ items: Object.values(ratiosFor(new Date().toISOString().slice(0, 10))) });
  }),
);

/* ── 4) Regulatory templates & returns ────────────────────────────────────── */

misRouter.get(
  '/templates',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listTemplates() });
  }),
);

misRouter.get(
  '/templates/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getTemplate(req.params['id'] as string));
    } catch (err) {
      pgError(err);
    }
  }),
);

misRouter.post(
  '/templates',
  requirePermission('branch:manage'),
  validate(reportTemplateSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createTemplate(req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

misRouter.put(
  '/templates/:id',
  requirePermission('branch:manage'),
  validate(reportTemplateSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(updateTemplate(req.params['id'] as string, req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

misRouter.post(
  '/templates/:id/verify',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      res.json(verifyTemplate(req.params['id'] as string, (req as RequestWithAuth).auth?.email ?? 'unknown'));
    } catch (err) {
      pgError(err);
    }
  }),
);

misRouter.delete(
  '/templates/:id',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      deleteTemplate(req.params['id'] as string);
      res.status(204).send();
    } catch (err) {
      pgError(err);
    }
  }),
);

misRouter.get(
  '/returns',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const rows = listReturns((req.query['templateId'] as string | undefined) ?? undefined).map((r) => ({
      ...r.generated,
      id: r.id,
      submittedAt: r.submittedAt,
    }));
    res.json({ items: rows });
  }),
);

misRouter.post(
  '/returns',
  requirePermission('branch:manage'),
  validate(z.object({ templateId: z.string().uuid(), periodStart: z.string().regex(dateRe), periodEnd: z.string().regex(dateRe) })),
  asyncHandler(async (req, res) => {
    try {
      const row = generateReturn(req.body.templateId, req.body.periodStart, req.body.periodEnd, (req as RequestWithAuth).auth?.email ?? 'unknown');
      // Flat response: return row + the generated document inline.
      res.status(201).json({ ...row.generated, id: row.id, submittedAt: row.submittedAt });
    } catch (err) {
      pgError(err);
    }
  }),
);

misRouter.get(
  '/returns/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getReturn(req.params['id'] as string));
    } catch (err) {
      pgError(err);
    }
  }),
);

misRouter.post(
  '/returns/:id/submit',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      res.json(submitReturn(req.params['id'] as string));
    } catch (err) {
      pgError(err);
    }
  }),
);

/** Plain-text (Word-openable) export of a generated return. */
misRouter.get(
  '/returns/:id/export',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const row = getReturn(req.params['id'] as string);
      const text = renderRegulatoryTextBn(row.generated, 'স্যামিটি ডেমো সমবায় সমিতি');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="return-${row.generated.regulator}-${row.periodStart}.txt"`);
      res.send(text);
    } catch (err) {
      pgError(err);
    }
  }),
);
