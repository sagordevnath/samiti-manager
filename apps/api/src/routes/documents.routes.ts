/**
 * ── Documents router (reqs 4–8) ──────────────────────────────────────────────
 * Template editor endpoints (with versions), document generation + listing,
 * the public verification endpoint (NO auth — it exposes no personal data)
 * and the bulk-job queue endpoints with an on-demand tick. Bulk jobs also
 * ride under /comms/bulk for the communication module UI.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  DOC_KINDS,
  DOC_REGISTERS,
  bulkJobSchema,
  docTemplateSchema,
} from '@samity/shared';
import {
  CommError,
} from '../lib/comm-store.js';
import {
  createBulkJob,
  generateDocument,
  getBulkJob,
  getDocumentHtml,
  listBulkJobs,
  listDocTemplateVersions,
  listDocTemplates,
  listDocuments,
  previewDocTemplate,
  processJob,
  publicVerify,
  restoreDocTemplateVersion,
  revokeDocument,
  upsertDocTemplate,
} from '../lib/doc-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function pgError(e: unknown): never {
  if (e instanceof CommError) {
    throw new AppError(e.status, e.code as never, e.message);
  }
  if (e instanceof Error && 'status' in e && 'code' in e) {
    const err = e as unknown as { status: number; code: string; message: string };
    throw new AppError(err.status, err.code as never, err.message);
  }
  throw e as Error;
}

function viewerOf(req: RequestWithAuth): { userId: string; name: string; role: string } {
  return { userId: req.auth?.userId ?? 'unknown', name: req.auth?.email ?? 'unknown', role: req.auth?.role ?? 'member' };
}

export const documentsRouter = Router();

/* ── Req 7: public verification — deliberately BEFORE requireAuth ─────────── */
export const publicVerifyRouter = Router();

publicVerifyRouter.get(
  '/verify/:code',
  asyncHandler(async (req, res) => {
    try {
      const payload = publicVerify(req.params['code'] as string);
      res.set('cache-control', 'no-store');
      res.json(payload);
    } catch (e) {
      pgError(e);
    }
  }),
);

/* ── Templates (req 5): list, upsert, preview, versions, restore ──────────── */

documentsRouter.use(requireAuth);

documentsRouter.get(
  '/templates',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listDocTemplates() });
  }),
);

// Seeded templates use slug ids (doc-notice-cholito), so id stays a free
// string here and unknown ids surface as a 404 from the store instead.
const templateUpsertSchema = docTemplateSchema.extend({ id: z.string().trim().min(1).max(60).optional() });

documentsRouter.put(
  '/templates',
  requirePermission('branch:manage'),
  validate(templateUpsertSchema),
  asyncHandler(async (req, res) => {
    try {
      const { template, version } = upsertDocTemplate(req.body, viewerOf(req as RequestWithAuth));
      res.status(201).json({ template, version });
    } catch (e) {
      pgError(e);
    }
  }),
);

documentsRouter.post(
  '/templates/:id/preview',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const body = (req.body ?? {}) as { vars?: Record<string, string> };
      res.json(await previewDocTemplate(req.params['id'] as string, body.vars ?? {}));
    } catch (e) {
      pgError(e);
    }
  }),
);

documentsRouter.get(
  '/templates/:id/versions',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json({ items: listDocTemplateVersions(req.params['id'] as string) });
    } catch (e) {
      pgError(e);
    }
  }),
);

documentsRouter.post(
  '/templates/:id/restore/:version',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      const v = Number(req.params['version']);
      if (!Number.isFinite(v)) throw new CommError(400, 'VALIDATION_ERROR', 'ভার্সন নম্বর ভুল / Bad version');
      res.json({ template: restoreDocTemplateVersion(req.params['id'] as string, v, viewerOf(req as RequestWithAuth)) });
    } catch (e) {
      pgError(e);
    }
  }),
);

/* ── Documents (req 4): generate, list, download, revoke ──────────────────── */

const generateSchema = z.object({
  kind: z.enum(DOC_KINDS),
  register: z.enum(DOC_REGISTERS).default('cholito'),
  referenceId: z.string().trim().uuid().optional(),
  vars: z.record(z.string(), z.string()).default({}),
});

documentsRouter.post(
  '/generate',
  requirePermission('member:write'),
  validate(generateSchema),
  asyncHandler(async (req, res) => {
    try {
      const doc = await generateDocument(req.body, viewerOf(req as RequestWithAuth));
      res.status(201).json(doc);
    } catch (e) {
      pgError(e);
    }
  }),
);

documentsRouter.get(
  '/',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const kind = req.query['kind'] as string | undefined;
    const q = req.query['q'] as string | undefined;
    res.json({
      items: listDocuments({
        kind: kind && (DOC_KINDS as readonly string[]).includes(kind) ? (kind as never) : undefined,
        q,
      }),
    });
  }),
);

documentsRouter.get(
  '/:id/download',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const { html, filename } = getDocumentHtml(req.params['id'] as string);
      // RFC 5987 filename* so Bangla filenames survive headers.
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(html);
    } catch (e) {
      pgError(e);
    }
  }),
);

documentsRouter.post(
  '/:id/revoke',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      res.json(revokeDocument(req.params['id'] as string, viewerOf(req as RequestWithAuth)));
    } catch (e) {
      pgError(e);
    }
  }),
);

/* ── Req 8: bulk jobs ─────────────────────────────────────────────────────── */

documentsRouter.post(
  '/bulk-jobs',
  requirePermission('branch:manage'),
  validate(bulkJobSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createBulkJob(req.body, viewerOf(req as RequestWithAuth)));
    } catch (e) {
      pgError(e);
    }
  }),
);

documentsRouter.get(
  '/bulk-jobs',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listBulkJobs() });
  }),
);

documentsRouter.get(
  '/bulk-jobs/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getBulkJob(req.params['id'] as string));
    } catch (e) {
      pgError(e);
    }
  }),
);

/** On-demand progress: processes every pending item of this job now. */
documentsRouter.post(
  '/bulk-jobs/:id/tick',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await processJob(req.params['id'] as string));
    } catch (e) {
      pgError(e);
    }
  }),
);

/* ── Alias under /comms/bulk for the communication module UI ─────────────── */

export const commBulkRouter = Router();
commBulkRouter.use(requireAuth);

commBulkRouter.post(
  '/',
  requirePermission('branch:manage'),
  validate(bulkJobSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createBulkJob(req.body, viewerOf(req as RequestWithAuth)));
    } catch (e) {
      pgError(e);
    }
  }),
);

commBulkRouter.get(
  '/',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listBulkJobs() });
  }),
);

commBulkRouter.post(
  '/:id/tick',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await processJob(req.params['id'] as string));
    } catch (e) {
      pgError(e);
    }
  }),
);
