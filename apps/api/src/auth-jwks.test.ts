import { generateKeyPairSync } from 'node:crypto';
import request from 'supertest';
import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT']; // tests must not inherit a meaningless PORT=0
// A real-looking project URL so the JWKS path is reachable — fetch is mocked.
process.env['SUPABASE_URL'] = 'https://test-project.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

// ── ES256 keypair standing in for the project's JWT signing key ──────────────
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privateJwk = { ...privateKey.export({ format: 'jwk' }), kid: 'kid-1', alg: 'ES256' };
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: 'kid-1', alg: 'ES256', use: 'sig' };

interface JwksResponse {
  ok: boolean;
  json: () => Promise<unknown>;
}

function jwksResponse(keys: unknown[]): JwksResponse {
  return { ok: true, json: async () => ({ keys }) };
}

/** Mint an ES256 access token the way Supabase Auth does (kid in header).
 *  `expSeconds` is a NumericDate: pass 1 for an already-expired token. */
async function mintEs256(claims: Record<string, unknown>, opts: { kid?: string; expSeconds?: number } = {}): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'ES256', kid: opts.kid ?? 'kid-1' })
    .setIssuedAt()
    .setExpirationTime(opts.expSeconds ?? '1h')
    .sign(privateJwk as Parameters<SignJWT['sign']>[0]);
}

/** Legacy HS256 token, signed with the configured project secret. */
async function mintHs256(claims: Record<string, unknown>): Promise<string> {
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('test-jwt-secret'));
}

const jwksFetch = vi.fn();
let createAppRef: typeof import('./app.js').createApp;

beforeEach(async () => {
  vi.resetModules(); // fresh module state = empty JWKS cache per test
  jwksFetch.mockReset().mockResolvedValue(jwksResponse([publicJwk]));
  vi.stubGlobal('fetch', jwksFetch);
  ({ createApp: createAppRef } = await import('./app.js'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('JWKS (asymmetric signing key) verification', () => {
  it('accepts an ES256 token whose kid is in the project JWKS', async () => {
    const token = await mintEs256({
      sub: crypto.randomUUID(),
      email: 'admin@samity.test',
      role: 'org_admin',
      org_id: crypto.randomUUID(),
    });
    const res = await request(createAppRef()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('org_admin');
    expect(res.body.user.email).toBe('admin@samity.test');
  });

  it('reads role and org from app_metadata for Supabase-issued tokens', async () => {
    // Real Supabase access tokens put role/org_id in app_metadata, not top-level.
    const token = await mintEs256({
      sub: crypto.randomUUID(),
      email: 'officer@samity.test',
      role: 'authenticated', // Supabase's own role claim — not an app role
      app_metadata: { role: 'branch_manager', org_id: '00000000-0000-4000-8000-0000000000aa' },
    });
    const res = await request(createAppRef()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('branch_manager');
    expect(res.body.user.orgId).toBe('00000000-0000-4000-8000-0000000000aa');
  });

  it('refreshes JWKS once on kid miss, then accepts the rotated key', async () => {
    const rotatedJwk = { ...publicJwk, kid: 'kid-2' };
    jwksFetch
      .mockResolvedValueOnce(jwksResponse([{ ...publicJwk, kid: 'kid-old' }])) // stale cache
      .mockResolvedValueOnce(jwksResponse([rotatedJwk])); // post-rotation JWKS
    const token = await mintEs256({ sub: crypto.randomUUID(), role: 'org_admin' }, { kid: 'kid-2' });
    const res = await request(createAppRef()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(jwksFetch).toHaveBeenCalledTimes(2);
  });

  it('rejects when the kid is unknown even after a refresh', async () => {
    const token = await mintEs256({ sub: crypto.randomUUID(), role: 'org_admin' }, { kid: 'kid-unknown' });
    const res = await request(createAppRef()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(jwksFetch).toHaveBeenCalledTimes(2); // initial + forced refresh
  });

  it('rejects an expired ES256 token', async () => {
    const token = await mintEs256({ sub: crypto.randomUUID(), role: 'org_admin' }, { expSeconds: 1 });
    const res = await request(createAppRef()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('algorithm confusion is rejected before any key lookup', () => {
  it('rejects an HS256 token signed with a wrong secret without fetching JWKS', async () => {
    const forged = await new SignJWT({ sub: crypto.randomUUID(), role: 'super_admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('attacker-guess'));
    const res = await request(createAppRef()).get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(jwksFetch).not.toHaveBeenCalled();
  });

  it("rejects an alg: 'none' token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: crypto.randomUUID(), role: 'super_admin', exp: 9999999999 })).toString('base64url');
    const res = await request(createAppRef())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${header}.${payload}.`);
    expect(res.status).toBe(401);
  });

  it('rejects an ES256-structured token that claims alg HS256 (key-type mismatch)', async () => {
    // Header says HS256 but the signature is ES256: the pinned asymmetric list
    // must refuse it before the key object is even constructed.
    const token = await mintEs256({ sub: crypto.randomUUID(), role: 'super_admin' });
    const [, p, s] = token.split('.');
    const lyingHeader = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'kid-1' })).toString('base64url');
    const res = await request(createAppRef()).get('/api/v1/auth/me').set('Authorization', `Bearer ${lyingHeader}.${p}.${s}`);
    expect(res.status).toBe(401);
    expect(jwksFetch).not.toHaveBeenCalled();
  });
});

describe('existing verification paths keep working', () => {
  it('still accepts legacy HS256 tokens signed with the project secret', async () => {
    const token = await mintHs256({ sub: crypto.randomUUID(), email: 'admin@samity.test', role: 'org_admin' });
    const res = await request(createAppRef()).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('org_admin');
    expect(jwksFetch).not.toHaveBeenCalled(); // first path succeeded
  });

  it('still accepts the demo-token session in demo/test mode', async () => {
    const res = await request(createAppRef()).get('/api/v1/auth/me').set('Authorization', 'Bearer demo-token');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('super_admin');
    expect(jwksFetch).not.toHaveBeenCalled();
  });

  it('401 on a garbage token', async () => {
    const res = await request(createAppRef()).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });
});
