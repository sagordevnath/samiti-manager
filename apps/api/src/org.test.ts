import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
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

async function makeToken(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode('test-jwt-secret');
  return await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
}

const adminClaims = { sub: crypto.randomUUID(), email: 'admin@samity.test', role: 'super_admin' };

describe('org structure', () => {
  it('401 without a token on /org/branches', async () => {
    const app = createAppRef();
    const res = await request(app).get('/api/v1/org/branches');
    expect(res.status).toBe(401);
  });

  it('lists demo zones, areas and branches for super_admin', async () => {
    const app = createAppRef();
    const token = await makeToken(adminClaims);
    const zones = await request(app).get('/api/v1/org/zones').set('Authorization', `Bearer ${token}`);
    expect(zones.status).toBe(200);
    expect(zones.body.items.length).toBeGreaterThanOrEqual(2);

    const branches = await request(app).get('/api/v1/org/branches').set('Authorization', `Bearer ${token}`);
    expect(branches.status).toBe(200);
    expect(branches.body.items.length).toBeGreaterThanOrEqual(3);
  });

  it('tree view rolls up counts to the org root', async () => {
    const app = createAppRef();
    const token = await makeToken(adminClaims);
    const res = await request(app).get('/api/v1/org/tree').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tree.kind).toBe('organization');
    expect(res.body.tree.counts.members).toBeGreaterThan(0);
    expect(res.body.tree.children.some((c: { kind: string }) => c.kind === 'zone')).toBe(true);
  });

  it('map points include branches and villages with GPS', async () => {
    const app = createAppRef();
    const token = await makeToken(adminClaims);
    const res = await request(app).get('/api/v1/org/map-points').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.branches.length).toBeGreaterThanOrEqual(3);
    expect(res.body.villages.length).toBeGreaterThan(20);
  });

  it('rejects branch status closed→active centers rule with 409', async () => {
    const app = createAppRef();
    const token = await makeToken(adminClaims);
    const branches = await request(app).get('/api/v1/org/branches').set('Authorization', `Bearer ${token}`);
    const active = branches.body.items.find((b: { status: string }) => b.status === 'active');

    const res = await request(app)
      .patch(`/api/v1/org/branches/${active.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'closed' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  /** Create a fresh planned branch so tests never collide with seeded openings. */
  async function createPlannedBranch(app: ReturnType<typeof createAppRef>, token: string, code: string) {
    const areas = await request(app).get('/api/v1/org/areas').set('Authorization', `Bearer ${token}`);
    const created = await request(app)
      .post('/api/v1/org/branches')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Test Branch ${code}`,
        nameBn: 'টেস্ট শাখা',
        code,
        areaId: areas.body.items[0].id,
        openingDate: '2026-12-01',
      });
    expect(created.status).toBe(201);
    return created.body.branch;
  }

  it('runs the opening workflow proposed → approved → checklist → activated', async () => {
    const app = createAppRef();
    const token = await makeToken(adminClaims);
    const planned = await createPlannedBranch(app, token, 'TST-01');

    const proposed = await request(app)
      .post('/api/v1/org/branch-openings')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: planned.id, proposalNote: '১৮ গ্রামে সম্ভাবনা যাচাই সম্পন্ন' });
    expect(proposed.status).toBe(201);

    const decided = await request(app)
      .post(`/api/v1/org/branch-openings/${proposed.body.opening.id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'approve' });
    expect(decided.body.opening.stage).toBe('director_approved');

    const checklist = await request(app)
      .post(`/api/v1/org/branch-openings/${proposed.body.opening.id}/checklist`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { item: 'office_rent', done: true },
          { item: 'staff_recruited', done: true },
          { item: 'cash_limit_set', done: true },
        ],
      });
    expect(checklist.body.opening.stage).toBe('checklist_done');

    const activated = await request(app)
      .post(`/api/v1/org/branch-openings/${proposed.body.opening.id}/activate`)
      .set('Authorization', `Bearer ${token}`);
    expect(activated.body.opening.stage).toBe('activated');

    const after = await request(app).get('/api/v1/org/branches').set('Authorization', `Bearer ${token}`);
    const updated = after.body.items.find((b: { id: string }) => b.id === planned.id);
    expect(updated.status).toBe('active');
  });

  it('activating before checklist fails with 409', async () => {
    const app = createAppRef();
    const token = await makeToken(adminClaims);
    const planned = await createPlannedBranch(app, token, 'TST-02');

    const proposed = await request(app)
      .post('/api/v1/org/branch-openings')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchId: planned.id, proposalNote: 'Another proposal' });
    expect(proposed.status).toBe(201);

    const activated = await request(app)
      .post(`/api/v1/org/branch-openings/${proposed.body.opening.id}/activate`)
      .set('Authorization', `Bearer ${token}`);
    expect(activated.status).toBe(409);
  });

  it('duplicate village assignment does not create a second row', async () => {
    const app = createAppRef();
    const token = await makeToken(adminClaims);

    const before = await request(app).get('/api/v1/org/working-areas').set('Authorization', `Bearer ${token}`);
    const countBefore = before.body.items.length;

    const survey = await request(app)
      .post('/api/v1/org/working-areas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Baliati',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: 'Dhamrai',
        union: 'Baliati',
        village: 'Baliati',
        population: 3200,
        households: 740,
        potentialScore: 5,
      });
    expect([200, 201]).toContain(survey.status); // upsert on geo identity

    const after = await request(app).get('/api/v1/org/working-areas').set('Authorization', `Bearer ${token}`);
    expect(after.body.items.length).toBe(countBefore);
  });

  it('forbids members from org routes', async () => {
    const app = createAppRef();
    const token = await makeToken({ sub: crypto.randomUUID(), email: 'm@samity.test', role: 'member' });
    const res = await request(app).get('/api/v1/org/branches').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
