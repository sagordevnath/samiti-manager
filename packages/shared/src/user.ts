/**
 * ── User accounts & access ───────────────────────────────────────────────────
 * `users_profile` is 1:1 with `auth.users` (migration 0001) and is the app-side
 * authorization record: which organization/branch a login belongs to and what
 * role it carries. Sign-in credentials live in Supabase Auth.
 *
 * Lifecycle: a disabled account is a soft delete (`deleted_at` set) plus a
 * Supabase Auth ban, so a former officer keeps their history in the audit trail
 * but can no longer sign in. Enable reverses both.
 */
import { z } from 'zod';
import { ROLES, type Role } from './roles.js';
import { LOCALES, phoneBdSchema, uuidSchema, type Locale } from './schemas.js';

export const USER_STATUSES = ['active', 'disabled'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_STATUS_LABELS: Record<UserStatus, { en: string; bn: string }> = {
  active: { en: 'Active', bn: 'সক্রিয়' },
  disabled: { en: 'Access disabled', bn: 'প্রবেশ বন্ধ' },
};

/** Wire shape of one user account (never carries credentials). */
export interface UserAccount {
  id: string;
  orgId: string | null;
  branchId: string | null;
  /** Denormalised from `branches` so the table needs no second lookup. */
  branchCode: string | null;
  branchName: string | null;
  email: string;
  fullName: string;
  phone: string;
  role: Role;
  status: UserStatus;
  locale: Locale;
  /** True when this row is the signed-in user (destructive actions blocked). */
  isSelf: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Payload for GET /users — rows plus the option lists the form needs. */
export interface UserListResponse {
  items: UserAccount[];
  roles: readonly Role[];
  blocksSelfDemotion: boolean;
}

const optionalPhone = z.union([phoneBdSchema, z.literal('')]).default('');

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email('অবৈধ ইমেইল / Invalid email')),
  fullName: z.string().trim().min(2, 'নাম খুব ছোট / Name too short').max(120),
  phone: optionalPhone,
  role: z.enum(ROLES),
  branchId: z.union([uuidSchema, z.literal('')]).nullable().default(null),
  locale: z.enum(LOCALES).default('bn'),
  /**
   * Initial sign-in password, shared with the person out-of-band. Required so
   * the account can be used immediately without depending on email delivery.
   */
  password: z.string().min(8, 'কমপক্ষে ৮ অক্ষর / At least 8 characters').max(72),
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: z.union([phoneBdSchema, z.literal('')]).optional(),
    role: z.enum(ROLES).optional(),
    branchId: z.union([uuidSchema, z.literal('')]).nullable().optional(),
    locale: z.enum(LOCALES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'পরিবর্তনের কিছু নেই / Nothing to update');
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const userStatusSchema = z.object({ status: z.enum(USER_STATUSES) });
export type UserStatusInput = z.infer<typeof userStatusSchema>;

/** Only a super_admin may grant or revoke super_admin. */
export function canGrantRole(actorRole: Role, targetRole: Role): boolean {
  if (targetRole === 'super_admin') return actorRole === 'super_admin';
  return actorRole === 'super_admin' || actorRole === 'org_admin';
}

/** An account cannot disable or demote itself — that locks the org out. */
export function canManageUser(actorId: string, targetId: string): boolean {
  return actorId !== targetId;
}
