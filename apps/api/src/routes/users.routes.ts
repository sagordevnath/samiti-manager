/**
 * ── Users & access live router (Supabase) ────────────────────────────────────
 * Manages the app-side authorization record for every login: `users_profile`
 * (1:1 with `auth.users`, migration 0001, RLS in 0002) plus the matching
 * Supabase Auth user (the credential itself, with role/org/branch claims kept
 * in `app_metadata` so the JWT carries them — see middleware/auth.ts).
 *
 *   GET    /users               list accounts (active + disabled) + option lists
 *   POST   /users               create a login + profile row (initial password)
 *   PATCH  /users/:id           rename / re-post / re-role an account
 *   POST   /users/:id/status    enable <-> disable (soft delete + Auth ban)
 *
 * Guard rails: an admin can never disable or re-role their own account, and
 * only a super_admin may grant or revoke `super_admin`.
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
import { BadRequest, Conflict, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf } from '../lib/tenant.js';
import { serviceKeyLooksMisconfigured } from '../lib/demo.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const nowIso = () => new Date().toISOString();

function pgError(err: unknown): never {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505' || e?.code === '23P01' || e?.code === '23514') {
    throw Conflict(e.message ?? 'ডেটাবেজ সীমাবদ্ধতা / Database constraint violated');
  }
  if (e?.code === '23503') {
    throw NotFound('সম্পর্কিত রেকর্ড পাওয়া যায়নি / Related record not found');
  }
  throw (err as Error) ?? new Error('unknown');
}

/**
 * Creating/resetting a login needs the service-role key. Without it the Auth
 * admin API answers 401, which would surface as an opaque failure.
 */
function assertAuthAdminAvailable(): void {
  if (serviceKeyLooksMisconfigured()) {
    throw BadRequest(
      'ব্যবহারকারী তৈরি করতে Supabase service_role key প্রয়োজন / Creating logins needs the Supabase service_role key (currently the anon key appears to be configured)',
    );
  }
}

/** Supabase Auth admin errors are plain strings — map the useful ones. */
function authAdminError(message: string): never {
  if (/already|registered|exists/i.test(message)) {
    throw Conflict('এই ইমেইল দিয়ে অ্যাকাউন্ট আছে / An account with this email already exists');
  }
  throw BadRequest(`সাইন-ইন তৈরি করা যায়নি / Could not create the sign-in: ${message}`);
}

function statusOf(deletedAt: unknown): UserStatus {
  return deletedAt ? 'disabled' : 'active';
}

function toWire(
  row: Record<string, unknown>,
  auth: { email: string; locale: string } | undefined,
  branch: { code: string; name: string } | undefined,
  callerId: string,
): UserAccount {
  return {
    id: String(row['id']),
    orgId: (row['org_id'] as string) ?? null,
    branchId: (row['branch_id'] as string) ?? null,
    branchCode: branch?.code ?? null,
    branchName: branch?.name ?? null,
    email: auth?.email ?? '',
    fullName: String(row['full_name']),
    phone: (row['phone'] as string) ?? '',
    role: row['role'] as Role,
    status: statusOf(row['deleted_at']),
    locale: (auth?.locale === 'en' ? 'en' : 'bn') as UserAccount['locale'],
    isSelf: row['id'] === callerId,
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at']),
  };
}

/**
 * Auth user id → { email, locale }. Email and locale have no home in
 * `users_profile`, so they are read from the Auth directory (app_metadata).
 */
async function authUsersMap(): Promise<Map<string, { email: string; locale: string }>> {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) authAdminError(error.message);
  return new Map(
    (data?.users ?? []).map((u) => [
      u.id,
      { email: u.email ?? '', locale: String((u.app_metadata?.['locale'] as string) ?? 'bn') },
    ]),
  );
}

/** Branch id → code/name for the org (used to denormalise the table rows). */
async function branchMap(orgId: string): Promise<Map<string, { code: string; name: string }>> {
  const { data } = await supabaseAdmin.from('branches').select('id, code, name, name_bn').eq('org_id', orgId);
  return new Map((data ?? []).map((b) => [b.id as string, { code: b.code as string, name: (b.name_bn ?? b.name) as string }]));
}

usersRouter.get(
  '/',
  requirePermission('user:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    // Disabled accounts are soft-deleted rows, so this list deliberately does
    // NOT filter `deleted_at` — that is what makes them visible and restorable.
    const { data, error } = await supabaseAdmin
      .from('users_profile')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: true });
    if (error) pgError(error);
    const [authUsers, branches] = await Promise.all([authUsersMap(), branchMap(orgId)]);
    const items = (data ?? []).map((r) =>
      toWire(r as Record<string, unknown>, authUsers.get(String(r.id)), branches.get(String(r.branch_id)), req.auth!.userId),
    );
    const status = req.query['status'] as UserStatus | undefined;
    const role = req.query['role'] as Role | undefined;
    res.json({
      items: items.filter((u) => (!status || u.status === status) && (!role || u.role === role)),
      roles: ROLES,
      blocksSelfDemotion: true,
    });
  }),
);

usersRouter.post(
  '/',
  requirePermission('user:manage'),
  validate(userCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    assertAuthAdminAvailable();
    const orgId = orgOf(req);
    const caller = req.auth!;
    const body = req.body as {
      email: string; fullName: string; phone: string; role: Role;
      branchId: string | null; locale: 'bn' | 'en'; password: string;
    };
    if (!canGrantRole(caller.role, body.role)) {
      throw Conflict('শুধু সুপার অ্যাডমিন সুপার অ্যাডমিন তৈরি করতে পারেন / Only a super_admin can grant super_admin');
    }
    const branchId = body.branchId || null;
    if (branchId) {
      const { data: branch } = await supabaseAdmin
        .from('branches')
        .select('id')
        .eq('org_id', orgId)
        .eq('id', branchId)
        .maybeSingle();
      if (!branch) throw NotFound('শাখা পাওয়া যায়নি / Branch not found in this organization');
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      // Pre-confirmed: the admin shares the password and the person can sign in
      // straight away, without depending on outbound email.
      email_confirm: true,
      app_metadata: { role: body.role, org_id: orgId, branch_id: branchId, locale: body.locale },
      user_metadata: { full_name: body.fullName },
    });
    if (error) authAdminError(error.message);
    const userId = created?.user?.id;
    if (!userId) throw BadRequest('সাইন-ইন তৈরি করা যায়নি / Could not create the sign-in');

    const { data: profile, error: pErr } = await supabaseAdmin
      .from('users_profile')
      .insert({
        id: userId,
        org_id: orgId,
        branch_id: branchId,
        role: body.role,
        full_name: body.fullName,
        phone: body.phone || null,
        created_by: caller.userId,
      })
      .select('*')
      .single();
    if (pErr) {
      // Do not leave a usable login behind without an authorization record.
      //
      // A hard `deleteUser` cannot be used for compensation here: deleting the
      // auth user cascades into `users_profile`, which fires
      // `trg_audit_users_profile` (migration 0056) against the auth-admin role
      // and fails — Supabase then answers 500 "Database error deleting user"
      // and the account survives. Banning is the primitive that always works
      // and is enforced by GoTrue itself at sign-in time.
      try {
        await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: '87600h' });
      } catch {
        /* best effort: the profile error below is the actionable one */
      }
      pgError(pErr);
    }
    const branches = await branchMap(orgId);
    res.status(201).json(
      toWire(profile as Record<string, unknown>, { email: body.email, locale: body.locale }, branches.get(branchId ?? ''), caller.userId),
    );
  }),
);

usersRouter.patch(
  '/:id',
  requirePermission('user:manage'),
  validate(userUpdateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const caller = req.auth!;
    const id = req.params['id'] as string;
    const { data: row, error } = await supabaseAdmin
      .from('users_profile')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error) pgError(error);
    if (!row) throw NotFound('ব্যবহারকারী পাওয়া যায়নি / User not found');
    const body = req.body as { fullName?: string; phone?: string; role?: Role; branchId?: string | null; locale?: 'bn' | 'en' };

    if (body.role || body.branchId !== undefined || body.locale) {
      if (id === caller.userId) {
        throw Conflict('নিজের ভূমিকা বা শাখা পরিবর্তন করা যাবে না / You cannot change your own role or branch');
      }
      if (body.role && !canGrantRole(caller.role, body.role)) {
        throw Conflict('এই ভূমিকা দেওয়ার অনুমতি নেই / Not allowed to grant that role');
      }
      if (body.role && !canGrantRole(caller.role, row.role as Role)) {
        throw Conflict('এই ভূমিকা পরিবর্তনের অনুমতি নেই / Not allowed to change that role');
      }
    }

    const patch: Record<string, unknown> = { updated_at: nowIso() };
    if (body.fullName !== undefined) patch['full_name'] = body.fullName;
    if (body.phone !== undefined) patch['phone'] = body.phone || null;
    if (body.role !== undefined) patch['role'] = body.role;
    if (body.branchId !== undefined) patch['branch_id'] = body.branchId || null;

    const { data: updated, error: uErr } = await supabaseAdmin
      .from('users_profile')
      .update(patch)
      .eq('id', id)
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (uErr) pgError(uErr);

    // Keep the JWT claims in step: the next sign-in (and any refreshed token)
    // must carry the new role/branch, otherwise nav and route gates disagree.
    if (body.role !== undefined || body.branchId !== undefined || body.locale !== undefined) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(id);
      const meta = (authUser?.user?.app_metadata ?? {}) as Record<string, unknown>;
      await supabaseAdmin.auth.admin.updateUserById(id, {
        app_metadata: {
          ...meta,
          ...(body.role !== undefined ? { role: body.role } : {}),
          ...(body.branchId !== undefined ? { branch_id: body.branchId || null } : {}),
          ...(body.locale !== undefined ? { locale: body.locale } : {}),
          org_id: orgId,
        },
      });
    }

    const [authUsers, branches] = await Promise.all([authUsersMap(), branchMap(orgId)]);
    const merged = { ...(updated as Record<string, unknown>) };
    res.json(toWire(merged, authUsers.get(id), branches.get(String(merged['branch_id'])), caller.userId));
  }),
);

usersRouter.post(
  '/:id/status',
  requirePermission('user:manage'),
  validate(userStatusSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const caller = req.auth!;
    const id = req.params['id'] as string;
    const status = (req.body as { status: UserStatus }).status;
    if (!canManageUser(caller.userId, id)) {
      throw Conflict('নিজের অ্যাকাউন্ট বন্ধ করা যাবে না / You cannot disable your own account');
    }
    const { data: row, error } = await supabaseAdmin
      .from('users_profile')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error) pgError(error);
    if (!row) throw NotFound('ব্যবহারকারী পাওয়া যায়নি / User not found');
    if (row.role === 'super_admin' && caller.role !== 'super_admin') {
      throw Conflict('সুপার অ্যাডমিনের প্রবেশ বন্ধ করার অনুমতি নেই / Not allowed to disable a super_admin');
    }

    const disabling = status === 'disabled';
    const { data: updated, error: uErr } = await supabaseAdmin
      .from('users_profile')
      .update({ deleted_at: disabling ? nowIso() : null, updated_at: nowIso() })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (uErr) pgError(uErr);

    // Block (or restore) the credential itself. `ban_duration: 'none'` is the
    // Supabase way of lifting a ban.
    const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
      ban_duration: disabling ? '87600h' : 'none',
    });
    if (banErr && !/not found/i.test(banErr.message)) authAdminError(banErr.message);

    const [authUsers, branches] = await Promise.all([authUsersMap(), branchMap(orgId)]);
    const merged = updated as Record<string, unknown>;
    res.json(toWire(merged, authUsers.get(id), branches.get(String(merged['branch_id'])), caller.userId));
  }),
);

/**
 * Purge a login outright — for a mistyped invite or a duplicate that never
 * did any work. Prefer `POST /:id/status` (disable) for anyone with history.
 *
 * Order matters and is load-bearing. Deleting the auth user directly makes
 * GoTrue cascade into `users_profile`, where the AFTER DELETE audit trigger
 * (migration 0056) runs as the auth-admin role and fails, so Auth answers
 * 500 "Database error deleting user" and the login survives. Removing the
 * profile row first — which is what this endpoint does — succeeds, and the
 * audit trail still records the removal.
 */
usersRouter.delete(
  '/:id',
  requirePermission('user:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    assertAuthAdminAvailable();
    const orgId = orgOf(req);
    const caller = req.auth!;
    const id = req.params['id'] as string;
    if (!canManageUser(caller.userId, id)) {
      throw Conflict('নিজের অ্যাকাউন্ট মুছে ফেলা যাবে না / You cannot delete your own account');
    }
    const { data: row, error } = await supabaseAdmin
      .from('users_profile')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', id)
      .maybeSingle();
    if (error) pgError(error);

    if (!row) {
      // Orphan cleanup: a sign-in whose profile insert failed (an upstream
      // timeout can leave one) has no authorization record, so there is no row
      // in this directory to act on — but it is still a usable credential and
      // should be removable. Scope the check through the token's org claim so
      // one organization can never delete another's login.
      const { data: authUser, error: getErr } = await supabaseAdmin.auth.admin.getUserById(id);
      if (getErr || !authUser?.user) throw NotFound('ব্যবহারকারী পাওয়া যায়নি / User not found');
      const meta = (authUser.user.app_metadata ?? {}) as Record<string, unknown>;
      if (meta['org_id'] && meta['org_id'] !== orgId) {
        throw NotFound('ব্যবহারকারী পাওয়া যায়নি / User not found');
      }
      const { error: orphanErr } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (orphanErr) throw Conflict('লগইন মুছে ফেলা যায়নি / Could not delete the orphan sign-in');
      res.status(204).end();
      return;
    }

    if (row.role === 'super_admin' && caller.role !== 'super_admin') {
      throw Conflict('সুপার অ্যাডমিন মুছে ফেলার অনুমতি নেই / Not allowed to delete a super_admin');
    }

    // 1) Drop the authorization record first (see the note above).
    const { error: delErr } = await supabaseAdmin.from('users_profile').delete().eq('id', id).eq('org_id', orgId);
    if (delErr) pgError(delErr);

    // 2) Then the credential. If this fails, the account has records pointing
    //    at it (the schema guards transactional history with NO ACTION FKs),
    //    so put the profile row back and tell the admin to disable instead.
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (authErr) {
      const { error: restoreErr } = await supabaseAdmin.from('users_profile').insert(row);
      if (restoreErr) pgError(restoreErr);
      throw Conflict(
        'এই অ্যাকাউন্টের সাথে লেনদেন/রেকর্ড যুক্ত আছে, তাই মুছে ফেলা যায়নি — প্রবেশ বন্ধ করুন / This account has linked records and cannot be deleted — disable it instead',
      );
    }
    res.status(204).end();
  }),
);
