/**
 * ── Roles ────────────────────────────────────────────────────────────────────
 * Fixed role set for NGO-MFI / cooperative society operations (BRAC/Grameen
 * style org hierarchy: central office → area office → branch → samity).
 */
export const ROLES = ['super_admin', 'org_admin', 'area_manager', 'branch_manager', 'account_officer', 'member'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, { en: string; bn: string }> = {
  super_admin: { en: 'Super Admin', bn: 'সুপার অ্যাডমিন' },
  org_admin: { en: 'Organization Admin', bn: 'সংস্থা অ্যাডমিন' },
  area_manager: { en: 'Area Manager', bn: 'এরিয়া ম্যানেজার' },
  branch_manager: { en: 'Branch Manager', bn: 'শাখা ম্যানেজার' },
  account_officer: { en: 'Account Officer', bn: 'একাউন্ট অফিসার' },
  member: { en: 'Member', bn: 'সদস্য' },
};

/**
 * ── Permissions ──────────────────────────────────────────────────────────────
 * Coarse-grained: `<domain>:<action>`. Sidebar entries and API routes both
 * gate on these, so nav and authorization never drift apart.
 */
export const PERMISSIONS = [
  'org:manage',
  'branch:manage',
  'member:read',
  'member:write',
  'member:approve',
  'savings:read',
  'savings:write',
  'loan:read',
  'loan:write',
  'report:read',
  'user:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Base permission sets per role. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  org_admin: PERMISSIONS.filter((p) => p !== 'org:manage'),
  area_manager: ['branch:manage', 'member:read', 'savings:read', 'loan:read', 'report:read'],
  branch_manager: ['member:read', 'member:write', 'member:approve', 'savings:read', 'savings:write', 'loan:read', 'loan:write', 'report:read'],
  account_officer: ['member:read', 'member:write', 'savings:read', 'savings:write', 'loan:read'],
  member: [],
};

export function permissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
