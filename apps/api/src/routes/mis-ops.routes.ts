/**
 * ── MIS ops router (reqs 5–10) ───────────────────────────────────────────────
 * Complaint register + escalation, client protection indicators, ad-hoc
 * builder, exports (CSV/Excel/PDF), scheduled delivery (free SMTP), data
 * freeze and matview stats. Mirrors migrations 0050/0051.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  complaintActionSchema,
  complaintCreateSchema,
  exportScheduleSchema,
  monthFreezeSchema,
  savedReportSchema,
  STANDARD_REPORTS,
  type StandardReportKind,
} from '@samity/shared';
import {
  actOnComplaint,
  assertNotFrozen,
  createComplaint,
  createSchedule,
  deleteSavedReport,
  deleteSchedule,
  exportSavedReport,
  exportStandardReport,
  freezeMonth,
  getSavedReport,
  listComplaints,
  listFreezes,
  listSchedules,
  listSavedReports,
  matviewStats,
  protectionIndicators,
  runAdHocReport,
  runDueSchedules,
  runScheduleNow,
  saveReport,
  unfreezeMonth,
} from '../lib/mis-ops-store.js';
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

function viewerOf(req: RequestWithAuth): { userId: string; name: string; role: string } {
  return { userId: req.auth?.userId ?? 'unknown', name: req.auth?.email ?? 'unknown', role: req.auth?.role ?? 'member' };
}

export const misOpsRouter = Router();

/** RFC 5987 Content-Disposition: Bangla filenames need an ASCII fallback + filename*. */
function contentDisposition(filename: string, inline: boolean): string {
  const type = inline ? 'inline' : 'attachment';
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename)
    .replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
misOpsRouter.use(requireAuth);

/* ── 10) Complaint register ───────────────────────────────────────────────── */

misOpsRouter.get(
  '/complaints',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const q = req.query;
    res.json({
      items: listComplaints({
        status: (q['status'] as string | undefined) ?? undefined,
        category: (q['category'] as string | undefined) ?? undefined,
        branchId: (q['branchId'] as string | undefined) ?? undefined,
        q: (q['q'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

misOpsRouter.get(
  '/complaints/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(listComplaints().find((c) => c.id === req.params['id']) ?? (() => { throw new AppError(404, 'NOT_FOUND' as never, 'অভিযোগ পাওয়া যায়নি / Complaint not found'); })());
    } catch (err) {
      pgError(err);
    }
  }),
);

misOpsRouter.post(
  '/complaints',
  requirePermission('member:write'),
  validate(complaintCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createComplaint(req.body, viewerOf(req as RequestWithAuth)));
    } catch (err) {
      pgError(err);
    }
  }),
);

misOpsRouter.post(
  '/complaints/:id/action',
  requirePermission('member:write'),
  validate(complaintActionSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(actOnComplaint(req.params['id'] as string, req.body, viewerOf(req as RequestWithAuth)));
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 5) Client protection indicators ──────────────────────────────────────── */

misOpsRouter.get(
  '/protection',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json(
      protectionIndicators(
        (req.query['start'] as string | undefined) ?? undefined,
        (req.query['end'] as string | undefined) ?? undefined,
      ),
    );
  }),
);

/* ── 6) Report builder ────────────────────────────────────────────────────── */

misOpsRouter.post(
  '/builder/run',
  requirePermission('member:read'),
  validate(savedReportSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(runAdHocReport(req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

misOpsRouter.get(
  '/builder/saved',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listSavedReports(viewerOf(req as RequestWithAuth)) });
  }),
);

misOpsRouter.post(
  '/builder/saved',
  requirePermission('member:read'),
  validate(savedReportSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(saveReport(req.body, viewerOf(req as RequestWithAuth)));
    } catch (err) {
      pgError(err);
    }
  }),
);

misOpsRouter.get(
  '/builder/saved/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getSavedReport(req.params['id'] as string, viewerOf(req as RequestWithAuth)));
    } catch (err) {
      pgError(err);
    }
  }),
);

misOpsRouter.delete(
  '/builder/saved/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      deleteSavedReport(req.params['id'] as string, viewerOf(req as RequestWithAuth));
      res.status(204).send();
    } catch (err) {
      pgError(err);
    }
  }),
);

misOpsRouter.post(
  '/builder/saved/:id/run',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const saved = getSavedReport(req.params['id'] as string, viewerOf(req as RequestWithAuth));
      res.json(runAdHocReport(saved as unknown as Parameters<typeof runAdHocReport>[0]));
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 7) Exports ───────────────────────────────────────────────────────────── */

misOpsRouter.get(
  '/export/standard/:kind/:format',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const kind = req.params['kind'] as StandardReportKind;
      if (!STANDARD_REPORTS.includes(kind)) {
        throw new AppError(422, 'VALIDATION_ERROR' as never, `অজানা রিপোর্ট / Unknown report kind: ${kind}`);
      }
      const format = req.params['format'] as 'csv' | 'excel' | 'pdf';
      if (!['csv', 'excel', 'pdf'].includes(format)) {
        throw new AppError(422, 'VALIDATION_ERROR' as never, 'অজানা ফরম্যাট / Unknown format');
      }
      const payload = exportStandardReport(kind, format, viewerOf(req as RequestWithAuth).name);
      res.setHeader('Content-Disposition', contentDisposition(payload.filename, format === 'pdf'));
      res.setHeader('Content-Type', payload.contentType);
      res.send(payload.body);
    } catch (err) {
      pgError(err);
    }
  }),
);

misOpsRouter.get(
  '/export/saved/:id/:format',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const format = req.params['format'] as 'csv' | 'excel' | 'pdf';
      const payload = exportSavedReport(req.params['id'] as string, format, viewerOf(req as RequestWithAuth));
      res.setHeader('Content-Disposition', contentDisposition(payload.filename, false));
      res.setHeader('Content-Type', payload.contentType);
      res.send(payload.body);
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 7) Schedules (free SMTP) ─────────────────────────────────────────────── */

misOpsRouter.get(
  '/schedules',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listSchedules(), smtpConfigured: !!process.env['SMTP_HOST'] });
  }),
);

misOpsRouter.post(
  '/schedules',
  requirePermission('branch:manage'),
  validate(exportScheduleSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createSchedule(req.body, viewerOf(req as RequestWithAuth)));
    } catch (err) {
      pgError(err);
    }
  }),
);

misOpsRouter.delete(
  '/schedules/:id',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      deleteSchedule(req.params['id'] as string, viewerOf(req as RequestWithAuth));
      res.status(204).send();
    } catch (err) {
      pgError(err);
    }
  }),
);

/** "Run now" for a single schedule, regardless of due date. */
misOpsRouter.post(
  '/schedules/:id/run',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await runScheduleNow(req.params['id'] as string));
    } catch (err) {
      pgError(err);
    }
  }),
);

/** Cron entry: delivers every due schedule (call from pg_cron/worker with the service token). */
misOpsRouter.post(
  '/schedules/run-due',
  requirePermission('branch:manage'),
  asyncHandler(async (_req, res) => {
    try {
      res.json(await runDueSchedules(new Date().toISOString().slice(0, 10)));
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 9) Data freeze ───────────────────────────────────────────────────────── */

misOpsRouter.get(
  '/freeze',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listFreezes() });
  }),
);

misOpsRouter.post(
  '/freeze',
  requirePermission('org:manage'),
  validate(z.object({ ...monthFreezeSchema.shape, status: z.enum(['soft', 'hard']).default('hard') })),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(freezeMonth(req.body, viewerOf(req as RequestWithAuth), req.body.status ?? 'hard'));
    } catch (err) {
      pgError(err);
    }
  }),
);

misOpsRouter.delete(
  '/freeze/:month',
  requirePermission('org:manage'),
  asyncHandler(async (req, res) => {
    try {
      unfreezeMonth(req.params['month'] as string, viewerOf(req as RequestWithAuth));
      res.status(204).send();
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 8) Matviews & indexes ────────────────────────────────────────────────── */

misOpsRouter.get(
  '/matviews',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    res.json(matviewStats());
  }),
);

export { assertNotFrozen };
