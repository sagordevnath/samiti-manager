/**
 * Live-path guard for the member write endpoints.
 *
 * `member.test.ts` exercises the in-memory demo router. This file mounts the
 * real Supabase-backed `membersRouter` on a throwaway Express app with
 * `supabaseAdmin` replaced by a small fake, so the rules that only exist on the
 * live path are pinned:
 *
 *  - every id-addressed read/write carries an `org_id` predicate: the service
 *    client bypasses RLS, so a manager in one organization must not be able to
 *    read, edit, retire or re-lifecycle another organization's member by
 *    guessing its uuid;
 *  - a lifecycle change is a legal transition from the current state, is
 *    written together with the coarse `status` column, and appends an
 *    `member_status_history` audit row — never silently skipped;
 *  - DELETE is a soft delete (`deleted_at` only).
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

const ORG_A = '00000000-0000-4000-8000-0000000000aa';
const ORG_B = '00000000-0000-4000-8000-0000000000bb';
const BRANCH_ID = '00000000-0000-4000-8000-0000000000b1';
const MEMBER_ID = '00000000-0000-4000-8000-000000000401';

type Row = Record<string, unknown>;

/** Mutable fake database + an ordered log of every statement the handler ran. */
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  calls: [] as string[],
  nextId: 1,
}));

vi.mock('./lib/supabase.js', () => {
  interface Filter {
    column: string;
    value: unknown;
  }

  const rowsOf = (name: string): Row[] => {
    db.tables[name] ??= [];
    return db.tables[name]!;
  };

  /**
   * Pick the requested columns ('' / '*' means the whole row). PostgREST column
   * lists may embed FKs (`samities(name)`), which the fake carries as a nested
   * object — the projection keeps the base name and drops the column list.
   */
  const project = (rows: Row[], columns: string): Row[] => {
    if (!columns || columns === '*') return rows;
    const keys = columns
      .split(',')
      .map((c) => c.trim().split('(')[0]!.replace(/!.*$/, '').replace(/\)+$/, ''))
      .filter(Boolean);
    return rows.map((row) => Object.fromEntries(keys.map((k) => [k, row[k]])));
  };

  function query(name: string) {
    let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
    const filters: Filter[] = [];
    const nullColumns: string[] = [];
    let patch: Row = {};
    let inserted: Row | Row[] | null = null;
    let columns = '*';
    let head = false;
    let limit: number | null = null;

    const matches = () =>
      rowsOf(name).filter(
        (row) =>
          filters.every((f) => row[f.column] === f.value) &&
          nullColumns.every((c) => row[c] === null || row[c] === undefined),
      );

    async function complete() {
      db.calls.push(`${name}:${op}${head ? ':count' : ''}`);
      if (op === 'select') {
        const matched = matches();
        const rows = limit === null ? matched : matched.slice(0, limit);
        if (head) return { data: null, count: matched.length, error: null };
        return { data: project(rows, columns), error: null, count: rows.length };
      }
      if (op === 'insert') {
        const incoming = Array.isArray(inserted) ? inserted : [inserted ?? {}];
        const rows = incoming.map((r) => ({ id: `gen-${db.nextId++}`, ...r }));
        rowsOf(name).push(...rows);
        return { data: rows, error: null };
      }
      if (op === 'delete') {
        const doomed = new Set(matches());
        db.tables[name] = rowsOf(name).filter((row) => !doomed.has(row));
        return { data: null, error: null };
      }
      const matched = matches();
      for (const row of matched) Object.assign(row, patch);
      return { data: columns === '*' && matched.length ? matched : project(matched, columns), error: null };
    }

    const take = async (exactlyOne: boolean) => {
      const result = await complete();
      const rows = (result.data ?? []) as Row[];
      if (exactlyOne && rows.length !== 1) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
      }
      if (exactlyOne) return { data: rows[0], error: null };
      return { data: rows[0] ?? null, error: null };
    };

    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
        columns = cols ?? '*';
        head = Boolean(opts?.head);
        return q;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ column, value });
        return q;
      },
      is: (column: string, value: unknown) => {
        if (value === null) nullColumns.push(column);
        else filters.push({ column, value });
        return q;
      },
      in: () => q,
      or: () => q,
      order: () => q,
      range: () => q,
      limit: (n: number) => {
        limit = n;
        return q;
      },
      update: (values: Row) => {
        op = 'update';
        patch = values;
        return q;
      },
      insert: (values: Row | Row[]) => {
        op = 'insert';
        inserted = values;
        return q;
      },
      delete: () => {
        op = 'delete';
        return q;
      },
      single: () => take(true),
      maybeSingle: () => take(false),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => complete().then(resolve, reject),
    });
    return q;
  }

  return { supabaseAdmin: { from: (table: string) => query(table) } };
});

let app: Express;

beforeEach(async () => {
  db.tables = {
    members: [],
    member_status_history: [],
    member_admissions: [],
    member_nominees: [],
    samities: [],
    branches: [],
  };
  db.calls = [];
  db.nextId = 1;

  const { membersRouter } = await import('./routes/members.routes.js');
  const { errorHandler } = await import('./middleware/error.js');
  app = express();
  app.use(express.json());
  app.use('/api/v1/members', membersRouter);
  app.use(errorHandler);
});

async function token(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode('test-jwt-secret');
  return await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
}

/** Branch manager: member:read + member:write + member:approve. */
const branchManager = () => token({ sub: '11111111-1111-4111-8111-111111111111', email: 'bm@x.test', role: 'branch_manager', org_id: ORG_A });
/** Field officer: may write, may NOT approve a lifecycle change. */
const officer = () => token({ sub: '22222222-2222-4222-8222-222222222222', email: 'fo@x.test', role: 'account_officer', org_id: ORG_A });
/** Super admin: no org scope (sees every tenant). */
const superAdmin = () => token({ sub: '33333333-3333-4333-8333-333333333333', email: 'sa@x.test', role: 'super_admin', org_id: null });

const memberRow = (over: Row = {}): Row => ({
  id: MEMBER_ID,
  org_id: ORG_A,
  branch_id: BRANCH_ID,
  samity_id: null,
  member_code: 'MEM-2026-0001',
  passbook_no: 'PB-2026-0001',
  full_name: 'রহিম মিয়া',
  full_name_bn: 'রহিম মিয়া',
  phone: '01711111111',
  national_id: '1990123456789',
  status: 'active',
  lifecycle: 'pending',
  created_at: '2026-02-01T00:00:00.000Z',
  deleted_at: null,
  ...over,
});

describe('GET /api/v1/members/:id (live router)', () => {
  it('returns the caller’s own member', async () => {
    db.tables['members'] = [memberRow()];
    const res = await request(app).get(`/api/v1/members/${MEMBER_ID}`).set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(200);
    expect(res.body.member.id).toBe(MEMBER_ID);
    expect(db.calls).toEqual(['members:select']);
  });

  it('404s for a member belonging to another organization (service client bypasses RLS)', async () => {
    db.tables['members'] = [memberRow({ org_id: ORG_B })];
    const res = await request(app).get(`/api/v1/members/${MEMBER_ID}`).set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(404);
  });

  it('lets a super_admin (no org scope) read across tenants', async () => {
    db.tables['members'] = [memberRow({ org_id: ORG_B })];
    const res = await request(app).get(`/api/v1/members/${MEMBER_ID}`).set('Authorization', `Bearer ${await superAdmin()}`);

    expect(res.status).toBe(200);
  });

  it('404s for a soft-deleted member', async () => {
    db.tables['members'] = [memberRow({ deleted_at: '2026-03-01T00:00:00.000Z' })];
    const res = await request(app).get(`/api/v1/members/${MEMBER_ID}`).set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/members/:id (live router)', () => {
  it('precise-edits the contact fields it was given', async () => {
    db.tables['members'] = [memberRow()];
    const res = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ fullName: 'রহিম উদ্দিন', phone: '01799999999' });

    expect(res.status).toBe(200);
    const row = db.tables['members']![0]!;
    expect(row['full_name']).toBe('রহিম উদ্দিন');
    expect(row['phone']).toBe('01799999999');
    // Untouched columns stay put.
    expect(row['member_code']).toBe('MEM-2026-0001');
    expect(row['lifecycle']).toBe('pending');
  });

  it('404s for another organization’s member and writes nothing', async () => {
    db.tables['members'] = [memberRow({ org_id: ORG_B, phone: '01711111111' })];
    const res = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ phone: '01799999999' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['members:update']);
    expect(db.tables['members']![0]!['phone']).toBe('01711111111');
  });

  it('400s on an invalid body before touching the database', async () => {
    db.tables['members'] = [memberRow()];
    const res = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ phone: '12345' });

    expect(res.status).toBe(400);
    expect(db.calls).toEqual([]);
  });

  it('403s for a role without member:write', async () => {
    db.tables['members'] = [memberRow()];
    const areaManager = await token({ sub: '44444444-4444-4444-8444-444444444444', email: 'am@x.test', role: 'area_manager', org_id: ORG_A });
    const res = await request(app)
      .patch(`/api/v1/members/${MEMBER_ID}`)
      .set('Authorization', `Bearer ${areaManager}`)
      .send({ phone: '01799999999' });

    expect(res.status).toBe(403);
    expect(db.calls).toEqual([]);
  });
});

describe('DELETE /api/v1/members/:id (live router)', () => {
  it('soft-deletes the row (deleted_at only — members has no deleted_by)', async () => {
    db.tables['members'] = [memberRow()];
    const res = await request(app).delete(`/api/v1/members/${MEMBER_ID}`).set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(204);
    expect(db.tables['members']).toHaveLength(1);
    expect(db.tables['members']![0]!['deleted_at']).toBeTruthy();
    expect(db.calls).toEqual(['members:update']);
  });

  it('404s for another organization’s member and leaves the row live', async () => {
    db.tables['members'] = [memberRow({ org_id: ORG_B })];
    const res = await request(app).delete(`/api/v1/members/${MEMBER_ID}`).set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(404);
    expect(db.tables['members']![0]!['deleted_at']).toBeNull();
  });

  it('404s for an already-deleted member', async () => {
    db.tables['members'] = [memberRow({ deleted_at: '2026-03-01T00:00:00.000Z' })];
    const res = await request(app).delete(`/api/v1/members/${MEMBER_ID}`).set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(404);
    expect(db.tables['members']![0]!['deleted_at']).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('POST /api/v1/members/:id/status (live router)', () => {
  const approval = { status: 'active', reasonCode: 'new_admission', effectiveDate: '2026-03-02' };

  it('403s without member:approve and never reads the member', async () => {
    db.tables['members'] = [memberRow()];
    const res = await request(app)
      .post(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', `Bearer ${await officer()}`)
      .send(approval);

    expect(res.status).toBe(403);
    expect(db.calls).toEqual([]);
  });

  it('approves a pending admission: writes lifecycle + coarse status, then the audit row', async () => {
    db.tables['members'] = [memberRow({ lifecycle: 'pending', status: 'active' })];
    const res = await request(app)
      .post(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send(approval);

    expect(res.status).toBe(200);
    expect(res.body.member).toEqual({ id: MEMBER_ID, lifecycle: 'active' });
    // Order is load-bearing: state first, audit second.
    expect(db.calls).toEqual(['members:select', 'members:update', 'member_status_history:insert']);
    const row = db.tables['members']![0]!;
    expect(row['lifecycle']).toBe('active');
    expect(row['status']).toBe('active');
    const history = db.tables['member_status_history']![0]!;
    expect(history['member_id']).toBe(MEMBER_ID);
    expect(history['org_id']).toBe(ORG_A);
    expect(history['status']).toBe('active');
    expect(history['reason_code']).toBe('new_admission');
    expect(history['changed_by']).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('maps a dormant exit to the coarse inactive status', async () => {
    db.tables['members'] = [memberRow({ lifecycle: 'active' })];
    const res = await request(app)
      .post(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ status: 'dormant', reasonCode: 'inactivity', effectiveDate: '2026-03-02' });

    expect(res.status).toBe(200);
    const row = db.tables['members']![0]!;
    expect(row['lifecycle']).toBe('dormant');
    expect(row['status']).toBe('inactive');
  });

  it('409s on an illegal transition (dropout is terminal) and writes nothing', async () => {
    db.tables['members'] = [memberRow({ lifecycle: 'dropout' })];
    const res = await request(app)
      .post(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send(approval);

    expect(res.status).toBe(409);
    expect(db.calls).toEqual(['members:select']);
    expect(db.tables['members']![0]!['lifecycle']).toBe('dropout');
    expect(db.tables['member_status_history']).toHaveLength(0);
  });

  it('is a no-op when the member is already in that lifecycle', async () => {
    db.tables['members'] = [memberRow({ lifecycle: 'active' })];
    const res = await request(app)
      .post(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send(approval);

    expect(res.status).toBe(200);
    // A read only — no write, no audit row.
    expect(db.calls).toEqual(['members:select']);
    expect(db.tables['member_status_history']).toHaveLength(0);
  });

  it('404s for another organization’s member and writes nothing', async () => {
    db.tables['members'] = [memberRow({ org_id: ORG_B, lifecycle: 'pending' })];
    const res = await request(app)
      .post(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send(approval);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['members:select']);
    expect(db.tables['members']![0]!['lifecycle']).toBe('pending');
    expect(db.tables['member_status_history']).toHaveLength(0);
  });

  it('404s for an unknown member id', async () => {
    const res = await request(app)
      .post(`/api/v1/members/${MEMBER_ID}/status`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send(approval);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['members:select']);
  });
});

describe('GET /api/v1/members (live router)', () => {
  it('scopes the list to the caller’s org and returns the total', async () => {
    db.tables['members'] = [memberRow(), memberRow({ id: 'gen-b', org_id: ORG_B, member_code: 'MEM-2026-0002' })];
    const res = await request(app).get('/api/v1/members').set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].org_id).toBe(ORG_A);
    expect(res.body.total).toBe(1);
  });
});
