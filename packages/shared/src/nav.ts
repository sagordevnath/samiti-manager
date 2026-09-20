import type { Permission, Role } from './roles.js';
import type { Locale } from './schemas.js';

/**
 * ── Auth identity carried by the Supabase JWT ───────────────────────────────
 * The API verifies the token, then enriches it with app-level claims.
 */
export interface AuthUser {
  userId: string;
  email: string;
  role: Role;
  orgId: string | null;
  branchId: string | null;
  permissions: readonly Permission[];
  locale?: Locale;
}

/** ── Sidebar menu model — built from permissions, rendered by the web app ── */
export interface NavItem {
  /** i18n key under `nav.*` */
  key: string;
  /** Route path */
  to: string;
  /** Lucide icon name (string so shared package stays UI-agnostic) */
  icon: string;
  /** Minimum permission required to see this item */
  permission: Permission;
}

export interface NavGroup {
  key: string;
  items: readonly NavItem[];
}

/** Single source of truth for the sidebar; filtered by permissions in the UI. */
export const NAV: readonly NavGroup[] = [
  {
    key: 'operations',
    items: [
      { key: 'dashboard', to: '/', icon: 'LayoutDashboard', permission: 'member:read' },
      { key: 'members', to: '/members', icon: 'Users', permission: 'member:read' },
      { key: 'memberAdmission', to: '/members/new', icon: 'UserPlus', permission: 'member:write' },
      { key: 'samities', to: '/samities', icon: 'Users', permission: 'member:read' },
      { key: 'savings', to: '/savings', icon: 'PiggyBank', permission: 'savings:read' },
      { key: 'loans', to: '/loans', icon: 'HandCoins', permission: 'loan:read' },
    ],
  },
  {
    key: 'administration',
    items: [
      { key: 'branches', to: '/branches', icon: 'Building2', permission: 'branch:manage' },
      { key: 'orgTree', to: '/organization/tree', icon: 'Landmark', permission: 'org:manage' },
      { key: 'workingAreas', to: '/working-areas', icon: 'MapPinned', permission: 'branch:manage' },
      { key: 'map', to: '/map', icon: 'Map', permission: 'branch:manage' },
      { key: 'users', to: '/users', icon: 'UserCog', permission: 'user:manage' },
    ],
  },
  {
    key: 'insights',
    items: [{ key: 'reports', to: '/reports', icon: 'BarChart3', permission: 'report:read' }],
  },
];
