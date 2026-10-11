/**
 * Tenant-scoping rule (apps/api/src/lib/tenant.ts).
 *
 * The live routers run on the service-role Supabase client, which bypasses RLS,
 * so the `org_id` predicate has to live in code. These tests pin the single
 * rule every router now imports: ordinary org users are pinned to their org,
 * super_admins keep cross-tenant access, and a caller without an org is left
 * untouched.
 */
import { describe, expect, it } from 'vitest';
import type { RequestWithAuth } from './middleware/auth.js';
import { orgOf, scopeOrg, scopeToOrg, scopesOrg } from './lib/tenant.js';

/** Minimal structural twin of the Supabase query builder the routers use. */
function buildQuery() {
  const calls: Array<[string, unknown]> = [];
  const query = {
    calls,
    eq(column: string, value: unknown) {
      calls.push([column, value]);
      return query;
    },
  };
  return query;
}

const asReq = (auth?: { orgId: string | null; role: string }) =>
  (auth ? { auth } : {}) as unknown as RequestWithAuth;

describe('scopesOrg', () => {
  it('pins any non-super_admin caller that carries an org', () => {
    expect(scopesOrg({ orgId: 'org-1', role: 'branch_manager' })).toBe(true);
    expect(scopesOrg({ orgId: 'org-1', role: 'account_officer' })).toBe(true);
    expect(scopesOrg({ orgId: 'org-1', role: 'org_admin' })).toBe(true);
  });

  it('never pins a super_admin', () => {
    expect(scopesOrg({ orgId: 'org-1', role: 'super_admin' })).toBe(false);
  });

  it('does not pin a caller with no org or no auth at all', () => {
    expect(scopesOrg({ orgId: null, role: 'branch_manager' })).toBe(false);
    expect(scopesOrg(undefined)).toBe(false);
    expect(scopesOrg(null)).toBe(false);
  });
});

describe('orgOf / scopeOrg', () => {
  it('returns the request org, or an empty string when the token has none', () => {
    expect(orgOf(asReq({ orgId: 'org-1', role: 'branch_manager' }))).toBe('org-1');
    expect(orgOf(asReq({ orgId: null, role: 'branch_manager' }))).toBe('');
    expect(orgOf(asReq())).toBe('');
  });

  it('mirrors scopesOrg for the request auth', () => {
    expect(scopeOrg(asReq({ orgId: 'org-1', role: 'branch_manager' }))).toBe(true);
    expect(scopeOrg(asReq({ orgId: 'org-1', role: 'super_admin' }))).toBe(false);
    expect(scopeOrg(asReq())).toBe(false);
  });
});

describe('scopeToOrg', () => {
  it('adds the org predicate for an org user', () => {
    const query = buildQuery();
    const scoped = scopeToOrg(query, { orgId: 'org-1', role: 'branch_manager' });
    expect(scoped).toBe(query);
    expect(query.calls).toEqual([['org_id', 'org-1']]);
  });

  it('leaves the query untouched for a super_admin or an orgless caller', () => {
    const superQuery = buildQuery();
    expect(scopeToOrg(superQuery, { orgId: 'org-1', role: 'super_admin' })).toBe(superQuery);
    expect(superQuery.calls).toEqual([]);

    const orglessQuery = buildQuery();
    expect(scopeToOrg(orglessQuery, { orgId: null, role: 'branch_manager' })).toBe(orglessQuery);
    expect(orglessQuery.calls).toEqual([]);
  });

  it('accepts a request as well as an auth object', () => {
    const scoped = buildQuery();
    scopeToOrg(scoped, asReq({ orgId: 'org-2', role: 'org_admin' }));
    expect(scoped.calls).toEqual([['org_id', 'org-2']]);

    const untouched = buildQuery();
    scopeToOrg(untouched, asReq());
    expect(untouched.calls).toEqual([]);
  });
});
