/**
 * ── Security router (reqs 1–4) ───────────────────────────────────────────────
 * Audit trail viewer with filters, protected-field reveal + unmask log,
 * security config (password/TOTP/lockout/session/IP allowlist), device
 * registry, TOTP enrollment and the RLS cross-branch matrix runner.
 * Reads require member:read; policy writes require org:manage; field reveals
 * additionally enforce the per-field role mask inside the store.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  PROTECTED_FIELDS,
  auditFilterSchema,
  deviceCreateSchema,
  evaluatePassword,
  ipAllowlistSchema,
  lockoutPolicySchema,
  passwordPolicySchema,
  sessionPolicySchema,
  totpConfigSchema,
  type AuditFilter,
  type ProtectedField,
} from '@samity/shared';
import {
  financeIpGateDecision,
  getSecurityConfig,
  listAudit,
  listDevices,
  listUnmaskLog,
  maskedProtectedField,
  registerDevice,
  revealProtectedField,
  revokeDevice,
  runRlsMatrix,
  rlsVisibleRows,
  totpEnrollConfirm,
  totpEnrollStart,
  totpSatisfied,
  totpStatus,
  updateSecurityConfig,
} from '../lib/security-store.js';
import { CommError } from '../lib/comm-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function pgError(e: unknown): never {
  if (e instanceof CommError) {
    throw new AppError(e.status, e.code as never, e.message);
  }
  if (e instanceof Error && 'status' in e && 'code' in e) {
    const errRow = e as unknown as { status: number; code: string; message: string };
    throw new AppError(errRow.status, errRow.code as never, errRow.message);
  }
  throw e as Error;
}

function viewerOf(req: RequestWithAuth): { userId: string; userName: string; role: string; ip: string | null } {
  return {
    userId: req.auth?.userId ?? 'unknown',
    userName: req.auth?.email ?? 'unknown',
    role: req.auth?.role ?? 'member',
    ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? null,
  };
}

function qStr(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : undefined;
}

export const securityRouter = Router();
securityRouter.use(requireAuth);

/* ── Req 1: audit trail viewer with filters ───────────────────────────────── */

securityRouter.get(
  '/audit',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const filter: AuditFilter = auditFilterSchema.parse({
      tableName: qStr(req.query['tableName']),
      recordId: qStr(req.query['recordId']),
      action: qStr(req.query['action']),
      userId: qStr(req.query['userId']),
      from: qStr(req.query['from']),
      to: qStr(req.query['to']),
      q: qStr(req.query['q']),
      limit: qStr(req.query['limit']),
    });
    res.json({ items: listAudit(filter) });
  }),
);

/* ── Req 2: protected fields — masked view + role-checked reveal + log ────── */

securityRouter.get(
  '/protected-fields/:entityTable/:entityId',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const entityTable = req.params['entityTable'] as string;
    const entityId = req.params['entityId'] as string;
    const items = PROTECTED_FIELDS.map((f) => ({
      field: f,
      masked: maskedProtectedField(entityTable, entityId, f),
    }));
    res.json({ items });
  }),
);

const revealSchema = z.object({
  field: z.enum(PROTECTED_FIELDS),
  entityTable: z.string().trim().min(1).max(40).default('members'),
  entityId: z.string().trim().min(1).max(80),
});

securityRouter.post(
  '/protected-fields/reveal',
  requirePermission('member:read'),
  validate(revealSchema),
  asyncHandler(async (req, res) => {
    try {
      const v = viewerOf(req as RequestWithAuth);
      const body = req.body as { field: ProtectedField; entityTable: string; entityId: string };
      const { value } = revealProtectedField(body.entityTable, body.entityId, body.field, v);
      res.json({ field: body.field, value, logged: true });
    } catch (e) {
      pgError(e);
    }
  }),
);

securityRouter.get(
  '/unmask-log',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const field = qStr(req.query['field']);
    if (field && !(PROTECTED_FIELDS as readonly string[]).includes(field)) {
      throw new AppError(400, 'VALIDATION_ERROR', `অজানা ফিল্ড / Unknown field: ${field}`);
    }
    res.json({
      items: listUnmaskLog({
        field: field as ProtectedField | undefined,
        userId: qStr(req.query['userId']),
      }),
    });
  }),
);

/* ── Req 3: security config + policies ────────────────────────────────────── */

securityRouter.get(
  '/config',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json(getSecurityConfig());
  }),
);

securityRouter.put(
  '/config',
  requirePermission('org:manage'),
  validate(
    z.object({
      passwordPolicy: passwordPolicySchema.partial().optional(),
      totp: totpConfigSchema.partial().optional(),
      lockout: lockoutPolicySchema.partial().optional(),
      session: sessionPolicySchema.partial().optional(),
      ipAllowlist: ipAllowlistSchema.optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    try {
      res.json(updateSecurityConfig(req.body, viewerOf(req as RequestWithAuth)));
    } catch (e) {
      pgError(e);
    }
  }),
);

securityRouter.post(
  '/password/check',
  requirePermission('member:read'),
  validate(z.object({ password: z.string().min(1).max(128), email: z.string().optional(), name: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const cfg = getSecurityConfig();
    const body = req.body as { password: string; email?: string; name?: string };
    res.json(evaluatePassword(body.password, cfg.passwordPolicy, { email: body.email, name: body.name }));
  }),
);

securityRouter.get(
  '/session/timeout',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const v = viewerOf(req as RequestWithAuth);
    res.json({ policy: getSecurityConfig().session, userId: v.userId });
  }),
);

securityRouter.get(
  '/finance-ip-check',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const v = viewerOf(req as RequestWithAuth);
    res.json(financeIpGateDecision(v.role, req.method, v.ip));
  }),
);

/* ── Req 3: devices ───────────────────────────────────────────────────────── */

securityRouter.get(
  '/devices',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listDevices(viewerOf(req as RequestWithAuth), qStr(req.query['userId'])) });
  }),
);

securityRouter.post(
  '/devices',
  requirePermission('member:read'),
  validate(deviceCreateSchema),
  asyncHandler(async (req, res) => {
    const v = viewerOf(req as RequestWithAuth);
    res.status(201).json(
      registerDevice(v.userId, req.body, {
        userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
        ip: v.ip,
      }),
    );
  }),
);

securityRouter.post(
  '/devices/:id/revoke',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(revokeDevice(req.params['id'] as string, viewerOf(req as RequestWithAuth)));
    } catch (e) {
      pgError(e);
    }
  }),
);

/* ── Req 3: TOTP enrollment + status ──────────────────────────────────────── */

securityRouter.get(
  '/totp/status',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const v = viewerOf(req as RequestWithAuth);
    res.json({ ...totpStatus(v.userId), satisfied: totpSatisfied(v.userId, v.role) });
  }),
);

securityRouter.post(
  '/totp/start',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const v = viewerOf(req as RequestWithAuth);
    res.status(201).json(totpEnrollStart(v.userName, v.userId));
  }),
);

securityRouter.post(
  '/totp/confirm',
  requirePermission('member:read'),
  validate(z.object({ code: z.string().regex(/^\d{6}$/) })),
  asyncHandler(async (req, res) => {
    try {
      const v = viewerOf(req as RequestWithAuth);
      res.json(totpEnrollConfirm(v.userId, (req.body as { code: string }).code));
    } catch (e) {
      pgError(e);
    }
  }),
);

/* ── Req 4: RLS cross-branch matrix (automated denial suite) ──────────────── */

securityRouter.get(
  '/rls-matrix',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({
      items: runRlsMatrix(),
      visibleB1Members: rlsVisibleRows('members', '00000000-0000-4000-8000-0000000000b1').length,
    });
  }),
);
