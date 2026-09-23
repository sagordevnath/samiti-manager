import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { hasPermission, permissionsForRole, ROLES, type AuthUser, type Permission, type Role } from '@samity/shared';
import { env } from '../env.js';
import { Forbidden, Unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { DEMO_OFFICER_TOKEN, DEMO_TOKEN, demoAuthUser, demoOfficerAuthUser, isDemoMode } from '../lib/demo.js';

export interface RequestWithAuth extends Request {
  auth?: AuthUser;
}

/**
 * Verify the Supabase JWT and attach an AuthUser to the request.
 * Role/permissions come from custom claims (`app_metadata` in Supabase);
 * fall back to the role's default permission set if claims are absent.
 */
export function requireAuth(req: RequestWithAuth, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(Unauthorized('Missing bearer token'));
    return;
  }
  const token = header.slice('Bearer '.length);

  // Demo mode: accept the web app's seeded session as a super_admin identity.
  if (isDemoMode() && token === DEMO_TOKEN) {
    req.auth = demoAuthUser();
    next();
    return;
  }
  // Secondary demo session with the field-officer role.
  if (isDemoMode() && token === DEMO_OFFICER_TOKEN) {
    req.auth = demoOfficerAuthUser();
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET) as {
      sub: string;
      email?: string;
      role?: string;
      org_id?: string | null;
      branch_id?: string | null;
      app_permissions?: Permission[];
      locale?: string;
    };

    const role: Role = ROLES.includes(payload.role as Role) ? (payload.role as Role) : 'member';

    req.auth = {
      userId: payload.sub,
      email: payload.email ?? '',
      role,
      orgId: payload.org_id ?? null,
      branchId: payload.branch_id ?? null,
      permissions: payload.app_permissions ?? permissionsForRole(role),
      locale: payload.locale === 'en' ? 'en' : 'bn',
    };
    next();
  } catch {
    next(Unauthorized('Invalid or expired token'));
  }
}

/** Gate a route behind one or more permissions (any-of). */
export function requirePermission(...required: Permission[]) {
  return (req: RequestWithAuth, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(Unauthorized());
      return;
    }
    const ok = required.some((p) => hasPermission(req.auth!.role, p) || req.auth!.permissions.includes(p));
    if (!ok) {
      logger.warn({ userId: req.auth.userId, required, role: req.auth.role }, 'permission denied');
      next(Forbidden());
      return;
    }
    next();
  };
}
