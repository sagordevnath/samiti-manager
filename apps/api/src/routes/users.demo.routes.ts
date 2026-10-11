/**
 * ── Users & access demo router (in-memory) ───────────────────────────────────
 * Mirrors users.routes.ts (live) so the Users & Access page behaves the same
 * without a configured Supabase project. Credentials are not modelled: there
 * is no real sign-in to create, only the authorization record.
 */
import { Router } from 'express';
import {
  canGrantRole,
  canManageUser,
  ROLES,
  userCreateSchema,
  userStatusSchema,
  userUpdateSchema,
  type Role,
  type UserAccount,
  type UserStatus,
} from '@samity/shared';
import { Conflict, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { demoAuthUser } from '../lib/demo.js';

export const usersDemoRouter = Router();
usersDemoRouter.use(requireAuth);

interface DemoUser extends UserAccount {
  /** Kept out of the wire shape; drives the disabled badge. */
  disabled: boolean;
}

interface DemoState {
  users: DemoUser[];
}

const state: DemoState = { users: [] };

function seed(): void {
  const org = demoAuthUser().orgId!;
  const rows: Array<
    Partial<UserAccount> & {
      role: Role;
      email: string;
      fullName: string;
      branchCode?: string;
      branchName?: string;
      disabled?: boolean;
    }
  > = [
    { id: demoAuthUser().userId, email: 'admin@samity.test', fullName: 'সিস্টেম অ্যাডমিন', role: 'super_admin', phone: '01711000000' },
    { email: 'area.manager@samity.test', fullName: 'রফিকুল ইসলাম', role: 'area_manager', phone: '01711000001', branchCode: 'BR-001', branchName: 'ধানমন্ডি শাখা' },
    { email: 'manager.dhaka@samity.test', fullName: 'সালমা আক্তার', role: 'branch_manager', phone: '01711000002', branchCode: 'BR-001', branchName: 'ধানমন্ডি শাখা' },
    { email: 'accounts@samity.test', fullName: 'আব্দুল করিম', role: 'account_officer', phone: '01711000003', branchCode: 'BR-001', branchName: 'ধানমন্ডি শাখা' },
    { email: 'officer@samity.test', fullName: 'নাসরিন সুলতানা', role: 'account_officer', phone: '01711000004', branchCode: 'BR-002', branchName: 'মিরপুর শাখা', disabled: true },
  ];
  const now = new Date().toISOString();
  state.users = rows.map((r) => ({
    id: r.id ?? crypto.randomUUID(),
    orgId: org,
    branchId: r.branchCode ? `demo-branch-${r.branchCode}` : null,
    branchCode: r.branchCode ?? null,
    branchName: r.branchName ?? null,
    email: r.email,
    fullName: r.fullName,
    phone: r.phone ?? '',
    role: r.role,
    status: (r.disabled ? 'disabled' : 'active') as UserStatus,
    locale: 'bn',
    isSelf: false,
    createdAt: now,
    updatedAt: now,
    disabled: Boolean(r.disabled),
  }));
}

seed();

/** Test helper: restore the seeded demo directory between cases. */
export function resetUsersDemoStore(): void {
  seed();
}

const wire = (u: DemoUser, callerId: string): UserAccount => {
  const { disabled: _disabled, ...rest } = u;
  void _disabled;
  return { ...rest, isSelf: u.id === callerId };
};

const find = (req: RequestWithAuth): DemoUser | undefined =>
  state.users.find((u) => u.id === req.params['id']);

usersDemoRouter.get(
  '/',
  requirePermission('user:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const caller = req.auth!;
    const status = req.query['status'] as UserStatus | undefined;
    const role = req.query['role'] as Role | undefined;
    res.json({
      items: state.users
        .filter((u) => (!status || u.status === status) && (!role || u.role === role))
        .map((u) => wire(u, caller.userId)),
      roles: ROLES,
      blocksSelfDemotion: true,
    });
  }),
);

usersDemoRouter.post(
  '/',
  requirePermission('user:manage'),
  validate(userCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const caller = req.auth!;
    const body = req.body as { email: string; fullName: string; phone: string; role: Role; branchId: string | null; locale: 'bn' | 'en' };
    if (!canGrantRole(caller.role, body.role)) {
      throw Conflict('শুধু সুপার অ্যাডমিন সুপার অ্যাডমিন তৈরি করতে পারেন / Only a super_admin can grant super_admin');
    }
    if (state.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase())) {
      throw Conflict('এই ইমেইল দিয়ে অ্যাকাউন্ট আছে / An account with this email already exists');
    }
    const now = new Date().toISOString();
    const created: DemoUser = {
      id: crypto.randomUUID(),
      orgId: caller.orgId,
      branchId: body.branchId,
      branchCode: null,
      branchName: null,
      email: body.email,
      fullName: body.fullName,
      phone: body.phone,
      role: body.role,
      status: 'active',
      locale: body.locale,
      isSelf: false,
      createdAt: now,
      updatedAt: now,
      disabled: false,
    };
    state.users.push(created);
    res.status(201).json(wire(created, caller.userId));
  }),
);

usersDemoRouter.patch(
  '/:id',
  requirePermission('user:manage'),
  validate(userUpdateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const caller = req.auth!;
    const existing = find(req);
    if (!existing) throw NotFound('ব্যবহারকারী পাওয়া যায়নি / User not found');
    const body = req.body as { fullName?: string; phone?: string; role?: Role; branchId?: string | null; locale?: 'bn' | 'en' };
    if (body.role || body.branchId !== undefined || body.locale) {
      if (!canManageUser(caller.userId, existing.id)) {
        throw Conflict('নিজের ভূমিকা বা শাখা পরিবর্তন করা যাবে না / You cannot change your own role or branch');
      }
      if (body.role && !canGrantRole(caller.role, body.role)) {
        throw Conflict('এই ভূমিকা দেওয়ার অনুমতি নেই / Not allowed to grant that role');
      }
      if (body.role && !canGrantRole(caller.role, existing.role)) {
        throw Conflict('এই ভূমিকা পরিবর্তনের অনুমতি নেই / Not allowed to change that role');
      }
    }
    if (body.fullName !== undefined) existing.fullName = body.fullName;
    if (body.phone !== undefined) existing.phone = body.phone;
    if (body.role !== undefined) existing.role = body.role;
    if (body.branchId !== undefined) existing.branchId = body.branchId;
    if (body.locale !== undefined) existing.locale = body.locale;
    existing.updatedAt = new Date().toISOString();
    res.json(wire(existing, caller.userId));
  }),
);

usersDemoRouter.post(
  '/:id/status',
  requirePermission('user:manage'),
  validate(userStatusSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const caller = req.auth!;
    const existing = find(req);
    if (!existing) throw NotFound('ব্যবহারকারী পাওয়া যায়নি / User not found');
    const status = (req.body as { status: UserStatus }).status;
    if (!canManageUser(caller.userId, existing.id)) {
      throw Conflict('নিজের অ্যাকাউন্ট বন্ধ করা যাবে না / You cannot disable your own account');
    }
    if (existing.role === 'super_admin' && caller.role !== 'super_admin') {
      throw Conflict('সুপার অ্যাডমিনের প্রবেশ বন্ধ করার অনুমতি নেই / Not allowed to disable a super_admin');
    }
    existing.status = status;
    existing.disabled = status === 'disabled';
    existing.updatedAt = new Date().toISOString();
    res.json(wire(existing, caller.userId));
  }),
);

/** Purge a login outright (mirrors the live router's DELETE /users/:id). */
usersDemoRouter.delete(
  '/:id',
  requirePermission('user:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const caller = req.auth!;
    const idx = state.users.findIndex((u) => u.id === req.params['id']);
    if (idx < 0) throw NotFound('ব্যবহারকারী পাওয়া যায়নি / User not found');
    const existing = state.users[idx]!;
    if (!canManageUser(caller.userId, existing.id)) {
      throw Conflict('নিজের অ্যাকাউন্ট মুছে ফেলা যাবে না / You cannot delete your own account');
    }
    if (existing.role === 'super_admin' && caller.role !== 'super_admin') {
      throw Conflict('সুপার অ্যাডমিন মুছে ফেলার অনুমতি নেই / Not allowed to delete a super_admin');
    }
    state.users.splice(idx, 1);
    res.status(204).end();
  }),
);
