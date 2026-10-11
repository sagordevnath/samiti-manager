/**
 * Live-path regression guard for the user purge endpoint.
 *
 * `users.test.ts` exercises the in-memory demo router. This file mounts the
 * real Supabase-backed `usersRouter` on a throwaway Express app with
 * `supabaseAdmin` replaced by a fake that models the failure that motivated
 * the endpoint's ordering: deleting the auth user while its `users_profile`
 * row still exists makes GoTrue cascade into that row, where the AFTER DELETE
 * audit trigger (migration 0056) runs as the auth-admin role and fails — so
 * Supabase answers 500 "Database error deleting user" and the login survives.
 *
 * The fake therefore REFUSES `deleteUser` while a profile row is present, and
 * these tests pin the profile-row-first ordering that gets around it.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import type { Express } from 'express';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const OTHER_ORG_ID = '00000000-0000-4000-8000-0000000000bb';

/** Mutable fake-database state, shared with the hoisted module mock. */
const db = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  authUser: null as { id: string; app_metadata?: Record<string, unknown> } | null,
  /** Ordered log of the mutations the handler performs. */
  calls: [] as string[],
  /** Model the real cascade: refuse auth-delete while a profile row exists. */
  authDeleteBlockedByProfile: true,
  forceAuthDeleteError: null as string | null,
  profileDeleteError: null as { code?: string; message?: string } | null,
  insertProfileError: null as { message?: string } | null,
}));

vi.mock('./lib/supabase.js', () => {
  const query = (table: string) => {
    let op: 'select' | 'delete' | 'insert' | 'update' = 'select';
    let inserted: Record<string, unknown> | null = null;
    const complete = async () => {
      if (op === 'delete') {
        if (table === 'users_profile') {
          db.calls.push('profile:delete');
          if (db.profileDeleteError) return { data: null, error: db.profileDeleteError };
          db.profile = null;
        }
        return { data: null, error: null };
      }
      if (op === 'insert') {
        if (table === 'users_profile') {
          db.calls.push('profile:insert');
          if (db.insertProfileError) return { data: null, error: db.insertProfileError };
          db.profile = inserted;
        }
        return { data: null, error: null };
      }
      return { data: db.profile, error: null };
    };
    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: () => q,
      eq: () => q,
      is: () => q,
      order: () => q,
      limit: () => q,
      delete: () => {
        op = 'delete';
        return q;
      },
      insert: (row: Record<string, unknown>) => {
        op = 'insert';
        inserted = row;
        return q;
      },
      update: () => {
        op = 'update';
        return q;
      },
      maybeSingle: () => complete(),
      single: () => complete(),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => complete().then(resolve, reject),
    });
    return q;
  };

  return {
    supabaseAdmin: {
      from: (table: string) => query(table),
      auth: {
        admin: {
          getUserById: async () => {
            db.calls.push('auth:get');
            return db.authUser
              ? { data: { user: db.authUser }, error: null }
              : { data: { user: null }, error: { message: 'User not found' } };
          },
          deleteUser: async () => {
            db.calls.push('auth:delete');
            if (db.forceAuthDeleteError) return { data: null, error: { message: db.forceAuthDeleteError } };
            if (db.authDeleteBlockedByProfile && db.profile) {
              return { data: null, error: { message: 'Database error deleting user' } };
            }
            db.authUser = null;
            return { data: null, error: null };
          },
        },
      },
    },
  };
});

let app: Express;

beforeEach(async () => {
  db.profile = null;
  db.authUser = null;
  db.calls = [];
  db.authDeleteBlockedByProfile = true;
  db.forceAuthDeleteError = null;
  db.profileDeleteError = null;
  db.insertProfileError = null;

  const { usersRouter } = await import('./routes/users.routes.js');
  const { errorHandler } = await import('./middleware/error.js');
  app = express();
  app.use(express.json());
  app.use('/api/v1/users', usersRouter);
  app.use(errorHandler);
});

async function token(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode('test-jwt-secret');
  return await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
}

const adminToken = () => token({ sub: '11111111-1111-4111-8111-111111111111', email: 'admin@x.test', role: 'org_admin', org_id: ORG_ID });
const officerToken = () => token({ sub: '22222222-2222-4222-8222-222222222222', email: 'officer@x.test', role: 'account_officer', org_id: ORG_ID });

const TARGET_ID = '33333333-3333-4333-8333-333333333333';

describe('DELETE /api/v1/users/:id (live Supabase router)', () => {
  it('403 without user:manage and never touches the auth directory', async () => {
    const res = await request(app).delete(`/api/v1/users/${TARGET_ID}`).set('Authorization', `Bearer ${await officerToken()}`);
    expect(res.status).toBe(403);
    expect(db.calls).toEqual([]);
  });

  it('removes the profile row BEFORE the credential so the cascade cannot fail', async () => {
    db.profile = { id: TARGET_ID, org_id: ORG_ID, role: 'branch_manager', full_name: 'Rina' };
    db.authUser = { id: TARGET_ID, app_metadata: { org_id: ORG_ID } };

    const res = await request(app).delete(`/api/v1/users/${TARGET_ID}`).set('Authorization', `Bearer ${await adminToken()}`);

    expect(res.status).toBe(204);
    // The load-bearing assertion: profile delete precedes auth delete.
    expect(db.calls).toEqual(['profile:delete', 'auth:delete']);
    expect(db.profile).toBeNull();
    expect(db.authUser).toBeNull();
  });

  it('survives the exact cascade failure when the credential is deleted after the profile', async () => {
    // authDeleteBlockedByProfile stays true: if the handler deleted the
    // credential first, deleteUser would answer "Database error deleting user"
    // and the response would be a 409 — not 204.
    db.profile = { id: TARGET_ID, org_id: ORG_ID, role: 'account_officer', full_name: 'Karim' };
    db.authUser = { id: TARGET_ID, app_metadata: { org_id: ORG_ID } };

    const res = await request(app).delete(`/api/v1/users/${TARGET_ID}`).set('Authorization', `Bearer ${await adminToken()}`);

    expect(res.status).toBe(204);
    expect(db.authUser).toBeNull();
  });

  it('restores the profile row and 409s when the credential cannot be deleted', async () => {
    const row = { id: TARGET_ID, org_id: ORG_ID, role: 'account_officer', full_name: 'Has History' };
    db.profile = row;
    db.authUser = { id: TARGET_ID, app_metadata: { org_id: ORG_ID } };
    db.forceAuthDeleteError = 'Database error deleting user';

    const res = await request(app).delete(`/api/v1/users/${TARGET_ID}`).set('Authorization', `Bearer ${await adminToken()}`);

    expect(res.status).toBe(409);
    expect(db.calls).toEqual(['profile:delete', 'auth:delete', 'profile:insert']);
    // The authorization record is put back so the admin can disable instead.
    expect(db.profile).toEqual(row);
  });

  it('purges an orphan login that has no profile row (scoped to the token org)', async () => {
    db.profile = null;
    db.authUser = { id: TARGET_ID, app_metadata: { org_id: ORG_ID } };

    const res = await request(app).delete(`/api/v1/users/${TARGET_ID}`).set('Authorization', `Bearer ${await adminToken()}`);

    expect(res.status).toBe(204);
    expect(db.calls).toEqual(['auth:get', 'auth:delete']);
    expect(db.authUser).toBeNull();
  });

  it('404s on an orphan from another org without deleting it', async () => {
    db.profile = null;
    db.authUser = { id: TARGET_ID, app_metadata: { org_id: OTHER_ORG_ID } };

    const res = await request(app).delete(`/api/v1/users/${TARGET_ID}`).set('Authorization', `Bearer ${await adminToken()}`);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['auth:get']);
    expect(db.authUser).not.toBeNull();
  });

  it('409s when a non-super_admin tries to purge a super_admin', async () => {
    db.profile = { id: TARGET_ID, org_id: ORG_ID, role: 'super_admin', full_name: 'Boss' };
    db.authUser = { id: TARGET_ID, app_metadata: { org_id: ORG_ID } };

    const res = await request(app).delete(`/api/v1/users/${TARGET_ID}`).set('Authorization', `Bearer ${await adminToken()}`);

    expect(res.status).toBe(409);
    expect(db.calls).toEqual([]);
  });

  it('409s when an admin tries to purge their own account', async () => {
    const selfToken = await token({ sub: TARGET_ID, email: 'admin@x.test', role: 'super_admin', org_id: ORG_ID });
    db.profile = { id: TARGET_ID, org_id: ORG_ID, role: 'super_admin', full_name: 'Me' };

    const res = await request(app).delete(`/api/v1/users/${TARGET_ID}`).set('Authorization', `Bearer ${selfToken}`);

    expect(res.status).toBe(409);
    expect(db.calls).toEqual([]);
  });

  it('404s for an unknown user id (neither profile nor auth user)', async () => {
    db.profile = null;
    db.authUser = null;

    const res = await request(app).delete(`/api/v1/users/${TARGET_ID}`).set('Authorization', `Bearer ${await adminToken()}`);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['auth:get']);
  });
});
