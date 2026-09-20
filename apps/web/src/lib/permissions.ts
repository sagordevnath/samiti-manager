import { permissionsForRole, type Permission, type Role } from '@samity/shared';
import { useAuthStore } from '@/stores/auth';

/** Fallback permission resolution when the token carries no claims. */
export function usePermissions(): Permission[] {
  const role = useAuthStore((s) => s.user?.role) as Role | undefined;
  return role ? [...permissionsForRole(role)] : [];
}

export function useCan(): (p: Permission) => boolean {
  const permissions = usePermissions();
  return (p: Permission) => permissions.includes(p);
}
