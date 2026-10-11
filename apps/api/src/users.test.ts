import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT']; // tests must not inherit a meaningless PORT=0
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;

beforeEach(async () => {
  // Fresh module registry → the demo user directory is re-seeded per test.
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
});

async function makeToken(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode('test-jwt-secret');
  return await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
}

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
/** The seeded demo super_admin row (see users.demo.routes.ts). */
const SEEDED_ADMIN_ID = '00000000-0000-4000-8000-000000000001';

const adminToken = () => makeToken({ sub: crypto.randomUUID(), email: 'admin2@samity.test', role: 'org_admin', org_id: ORG_ID });
const officerToken = () =>
  makeToken({ sub: crypto.randomUUID(), email: 'officer@samity.test', role: 'account_officer', org_id: ORG_ID });

const newUser = {
  email: 'new.officer@samity.test',
  fullName: 'নতুন অফিসার',
  phone: '01711009999',
  role: 'account_officer',
  branchId: null,
  locale: 'bn',
  password: 'Initial@2026',
};

describe('GET /api/v1/users', () => {
  it('401 without a bearer token', async () => {
    const res = await request(createAppRef()).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('403 for a role without user:manage', async () => {
    const res = await request(createAppRef()).get('/api/v1/users').set('Authorization', `Bearer ${await officerToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lists the org directory with role options for an admin', async () => {
    const res = await request(createAppRef()).get('/api/v1/users').set('Authorization', `Bearer ${await adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.roles).toContain('branch_manager');
    const admin = res.body.items.find((u: { id: string }) => u.id === SEEDED_ADMIN_ID);
    expect(admin).toMatchObject({ role: 'super_admin', status: 'active', isSelf: false });
    // Disabled accounts stay visible so they can be restored.
    expect(res.body.items.some((u: { status: string }) => u.status === 'disabled')).toBe(true);
  });

  it('filters by status and role', async () => {
    const app = createAppRef();
    const token = await adminToken();
    const disabled = await request(app).get('/api/v1/users?status=disabled').set('Authorization', `Bearer ${token}`);
    expect(disabled.status).toBe(200);
    expect(disabled.body.items.every((u: { status: string }) => u.status === 'disabled')).toBe(true);

    const managers = await request(app).get('/api/v1/users?role=branch_manager').set('Authorization', `Bearer ${token}`);
    expect(managers.body.items.every((u: { role: string }) => u.role === 'branch_manager')).toBe(true);
  });
});

describe('POST /api/v1/users', () => {
  it('creates an account that then appears in the directory', async () => {
    const app = createAppRef();
    const token = await adminToken();
    const created = await request(app).post('/api/v1/users').set('Authorization', `Bearer ${token}`).send(newUser);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ email: newUser.email, role: 'account_officer', status: 'active' });

    const list = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
    const row = list.body.items.find((u: { email: string }) => u.email === newUser.email);
    expect(row).toBeTruthy();
    expect(row.status).toBe('active');
  });

  it('409 for a duplicate email', async () => {
    const res = await request(createAppRef())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ ...newUser, email: 'manager.dhaka@samity.test' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('409 when a non-super_admin tries to grant super_admin', async () => {
    const res = await request(createAppRef())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ ...newUser, role: 'super_admin' });
    expect(res.status).toBe(409);
  });

  it('400 for an invalid payload (bad email, short password, bad phone)', async () => {
    const res = await request(createAppRef())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ ...newUser, email: 'nope', password: 'short', phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/users/:id', () => {
  it('re-posts a user to a new role', async () => {
    const app = createAppRef();
    const token = await adminToken();
    const list = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
    const target = list.body.items.find((u: { email: string }) => u.email === 'accounts@samity.test');

    const res = await request(app)
      .patch(`/api/v1/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'branch_manager' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('branch_manager');
  });

  it('409 when an admin tries to change their own role', async () => {
    const token = await makeToken({ sub: SEEDED_ADMIN_ID, email: 'admin@samity.test', role: 'super_admin', org_id: ORG_ID });
    const res = await request(createAppRef())
      .patch(`/api/v1/users/${SEEDED_ADMIN_ID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'branch_manager' });
    expect(res.status).toBe(409);
  });

  it('404 for an unknown user id', async () => {
    const res = await request(createAppRef())
      .patch(`/api/v1/users/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${await adminToken()}`)
      .send({ fullName: 'Nobody Here' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/users/:id/status', () => {
  it('disables access and can restore it', async () => {
    const app = createAppRef();
    const token = await adminToken();
    const list = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
    const target = list.body.items.find((u: { email: string }) => u.email === 'accounts@samity.test');

    const off = await request(app)
      .post(`/api/v1/users/${target.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'disabled' });
    expect(off.status).toBe(200);
    expect(off.body.status).toBe('disabled');

    const back = await request(app)
      .post(`/api/v1/users/${target.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(back.body.status).toBe('active');
  });

  it('409 when disabling your own account', async () => {
    const token = await makeToken({ sub: SEEDED_ADMIN_ID, email: 'admin@samity.test', role: 'super_admin', org_id: ORG_ID });
    const res = await request(createAppRef())
      .post(`/api/v1/users/${SEEDED_ADMIN_ID}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'disabled' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/v1/users/:id (purge)', () => {
  /** Create a throwaway account and return its id. */
  const seedThrowaway = async (app: ReturnType<typeof createAppRef>, token: string): Promise<string> => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...newUser, email: `throwaway.${Date.now()}@samity.test` });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  it('403 without user:manage', async () => {
    const res = await request(createAppRef())
      .delete(`/api/v1/users/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${await officerToken()}`);
    expect(res.status).toBe(403);
  });

  it('purges a mistyped invite so it leaves the directory', async () => {
    const app = createAppRef();
    const token = await adminToken();
    const id = await seedThrowaway(app, token);

    const before = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
    expect(before.body.items.some((u: { id: string }) => u.id === id)).toBe(true);

    const del = await request(app).delete(`/api/v1/users/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const after = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
    expect(after.body.items.some((u: { id: string }) => u.id === id)).toBe(false);
  });

  it('409 when purging your own account', async () => {
    const token = await makeToken({ sub: SEEDED_ADMIN_ID, email: 'admin@samity.test', role: 'super_admin', org_id: ORG_ID });
    const res = await request(createAppRef())
      .delete(`/api/v1/users/${SEEDED_ADMIN_ID}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('409 when a non-super_admin purges a super_admin', async () => {
    const res = await request(createAppRef())
      .delete(`/api/v1/users/${SEEDED_ADMIN_ID}`)
      .set('Authorization', `Bearer ${await adminToken()}`);
    expect(res.status).toBe(409);
  });

  it('404 for an unknown user id', async () => {
    const res = await request(createAppRef())
      .delete(`/api/v1/users/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${await adminToken()}`);
    expect(res.status).toBe(404);
  });
});
