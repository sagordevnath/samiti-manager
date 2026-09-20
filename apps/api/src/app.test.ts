import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT']; // tests must not inherit a meaningless PORT=0
// Env validation requires a URL; tests never touch the network.
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
});

afterEach(() => {
  vi.unmock('@supabase/supabase-js');
});

/** Mint a Supabase-style HS256 JWT (same alg Supabase uses for access tokens). */
async function makeToken(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode('test-jwt-secret');
  return await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
}

const adminClaims = { sub: crypto.randomUUID(), email: 'admin@samity.test', role: 'org_admin' };

describe('GET /api/v1/health', () => {
  it('returns 200 ok', async () => {
    const app = createAppRef();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'samity-api', version: 'v1' });
    expect(typeof res.body.uptimeSec).toBe('number');
  });

  it('root responds without auth', async () => {
    const app = createAppRef();
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('samity-api');
  });
});

describe('auth middleware', () => {
  it('401 without a bearer token', async () => {
    const app = createAppRef();
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('401 with a garbage token', async () => {
    const app = createAppRef();
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('200 /auth/me with a valid token and role claim', async () => {
    const app = createAppRef();
    const token = await makeToken(adminClaims);
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('org_admin');
    expect(Array.isArray(res.body.user.permissions)).toBe(true);
  });
});

describe('authorization', () => {
  it('member role cannot list members (403)', async () => {
    const app = createAppRef();
    const token = await makeToken({ sub: crypto.randomUUID(), email: 'm@samity.test', role: 'member' });
    const res = await request(app).get('/api/v1/members').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('validation & errors', () => {
  it('400 with VALIDATION_ERROR for a bad login payload', async () => {
    const app = createAppRef();
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'nope', password: '1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeDefined();
  });

  it('404 JSON for unknown routes', async () => {
    const app = createAppRef();
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
