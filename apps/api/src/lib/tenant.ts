/**
 * ── Tenant scoping helpers ───────────────────────────────────────────────────
 * The live routers run on the service-role Supabase client, which bypasses RLS
 * entirely, so the `org_id` predicate has to live in code. These helpers are
 * the single home of that rule:
 *
 *   scopesOrg(auth)     — true when the caller must be pinned to one org
 *   orgOf(req)          — the caller's org id ('' when the token has none)
 *   scopeOrg(req)       — scopesOrg on a request's auth
 *   scopeToOrg(q, who)  — add `.eq('org_id', …)` to a query for a scoped
 *                         caller; `who` is the request or an auth object
 *
 * A super_admin — or a token without an org — is never pinned, which keeps
 * platform-wide access intact. Callers that need the predicate in an existing
 * chain (with filters added afterwards) use `scopesOrg` directly.
 */
import type { RequestWithAuth } from '../middleware/auth.js';

/** The slice of an auth identity the tenant rule depends on. */
export interface TenantSubject {
  orgId: string | null;
  role: string;
}

/** True when this caller's queries must carry an `org_id` predicate. */
export function scopesOrg(auth: TenantSubject | null | undefined): auth is TenantSubject & { orgId: string } {
  return Boolean(auth?.orgId) && auth!.role !== 'super_admin';
}

/** The caller's organization id ('' when the token carries none). */
export function orgOf(req: RequestWithAuth): string {
  return req.auth?.orgId ?? '';
}

/** True when the request's caller must be pinned to their organization. */
export function scopeOrg(req: RequestWithAuth): boolean {
  return scopesOrg(req.auth);
}

/** Add the tenant predicate to a query for a non-super_admin caller. */
export function scopeToOrg<T>(query: T, subject: RequestWithAuth | TenantSubject): T {
  const auth: TenantSubject | null | undefined = (subject as RequestWithAuth).auth ?? (subject as TenantSubject);
  return scopesOrg(auth)
    ? (query as { eq: (column: string, value: unknown) => T }).eq('org_id', auth.orgId)
    : query;
}
