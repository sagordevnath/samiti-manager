/**
 * Live-path guard for the HR correction endpoints.
 *
 * `hr.test.ts` exercises the in-memory demo router. This file mounts the real
 * Supabase-backed `hrRouter` on a throwaway Express app with `supabaseAdmin`
 * replaced by a small fake that owns a few rows, so the ordering and guard
 * rules that only exist on the live path are pinned:
 *
 *  - staff removal is a SOFT delete (the row survives for payroll history) and
 *    is tenant-scoped — the service client bypasses RLS, so `org_id` has to be
 *    in the query itself;
 *  - a rejected/closed vacancy is not editable;
 *  - a vacancy is only withdrawn when no applicant references it, and the
 *    dependency count is checked BEFORE the row is marked deleted;
 *  - a `joined` applicant has become staff, so their application record can
 *    neither be edited nor deleted.
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
const STAFF_ID = '00000000-0000-4000-8000-000000000101';
const VACANCY_ID = '00000000-0000-4000-8000-000000000102';
const APPLICANT_ID = '00000000-0000-4000-8000-000000000103';

type Row = Record<string, unknown>;

/** Mutable fake database + an ordered log of every statement the handler ran. */
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  calls: [] as string[],
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

  /** Pick the requested columns ('' / '*' means the whole row). */
  const project = (rows: Row[], columns: string): Row[] => {
    if (!columns || columns === '*') return rows;
    const keys = columns.split(',').map((c) => c.trim()).filter(Boolean);
    return rows.map((row) => Object.fromEntries(keys.map((k) => [k, row[k]])));
  };

  function query(name: string) {
    let op: 'select' | 'update' | 'delete' = 'select';
    const filters: Filter[] = [];
    const nullColumns: string[] = [];
    let patch: Row = {};
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
        if (head) return { data: null, count: matched.length, error: null };
        return { data: project(limit === null ? matched : matched.slice(0, limit), columns), error: null };
      }
      if (op === 'update') {
        const matched = matches();
        for (const row of matched) Object.assign(row, patch);
        return { data: columns === '*' && matched.length ? matched : project(matched, columns), error: null };
      }
      const doomed = new Set(matches());
      db.tables[name] = rowsOf(name).filter((row) => !doomed.has(row));
      return { data: null, error: null };
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
      limit: (n: number) => {
        limit = n;
        return q;
      },
      update: (values: Row) => {
        op = 'update';
        patch = values;
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

  return {
    supabaseAdmin: { from: (table: string) => query(table) },
  };
});

let app: Express;

beforeEach(async () => {
  db.tables = {
    hr_staff: [],
    hr_vacancies: [],
    hr_applicants: [],
  };
  db.calls = [];

  const { hrRouter } = await import('./routes/hr.routes.js');
  const { errorHandler } = await import('./middleware/error.js');
  app = express();
  app.use(express.json());
  app.use('/api/v1/hr', hrRouter);
  app.use(errorHandler);
});

async function token(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode('test-jwt-secret');
  return await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
}

/**
 * A branch manager whose Supabase claims carry `org:manage`. Real tokens are
 * minted with the account's permission set, so this is how a non-super_admin
 * reaches the staff routes — and, unlike a super_admin, it stays tenant-scoped.
 */
const orgManager = () =>
  token({ sub: '11111111-1111-4111-8111-111111111111', email: 'hr@x.test', role: 'branch_manager', org_id: ORG_A, app_permissions: ['org:manage', 'branch:manage', 'member:read'] });

/** Branch/area planner: may run recruitment, cannot manage the staff master. */
const planner = () =>
  token({ sub: '22222222-2222-4222-8222-222222222222', email: 'planner@x.test', role: 'area_manager', org_id: ORG_A });

const staffRow = (over: Row = {}): Row => ({
  id: STAFF_ID,
  org_id: ORG_A,
  employee_code: 'EMP-DHK-0007',
  name: 'Karim Mia',
  name_bn: 'করিম মিয়া',
  designation: 'field_officer',
  grade: 'G1',
  branch_id: null,
  joining_date: '2026-01-05',
  probation_end_date: '2027-01-04',
  confirmation_date: null,
  status: 'probation',
  mobile: '01711111111',
  email: null,
  nid_enc: null,
  nid_masked: null,
  bank_account_enc: null,
  bank_name: null,
  bank_masked: null,
  monthly_gross: '15000.00',
  emergency_contact_name: null,
  emergency_contact_phone: null,
  documents: [],
  created_at: '2026-01-05T00:00:00.000Z',
  updated_at: '2026-01-05T00:00:00.000Z',
  deleted_at: null,
  ...over,
});

const vacancyRow = (over: Row = {}): Row => ({
  id: VACANCY_ID,
  org_id: ORG_A,
  branch_id: '00000000-0000-4000-8000-0000000000b1',
  designation: 'field_officer',
  headcount: 2,
  reason: 'New post',
  status: 'requested',
  requested_by: '11111111-1111-4111-8111-111111111111',
  decided_by: null,
  decided_at: null,
  note: null,
  created_at: '2026-02-01T00:00:00.000Z',
  updated_at: '2026-02-01T00:00:00.000Z',
  deleted_at: null,
  ...over,
});

const applicantRow = (over: Row = {}): Row => ({
  id: APPLICANT_ID,
  org_id: ORG_A,
  vacancy_id: VACANCY_ID,
  name: 'Rina Begum',
  mobile: '01811111111',
  education_level: 'HSC',
  experience_years: 2,
  status: 'applied',
  interview_scores: [],
  offered_salary: null,
  created_at: '2026-02-02T00:00:00.000Z',
  updated_at: '2026-02-02T00:00:00.000Z',
  ...over,
});

describe('DELETE /api/v1/hr/staff/:id (live router)', () => {
  it('403s without org:manage and never touches the table', async () => {
    db.tables['hr_staff'] = [staffRow()];
    const res = await request(app).delete(`/api/v1/hr/staff/${STAFF_ID}`).set('Authorization', `Bearer ${await token({ sub: '33333333-3333-4333-8333-333333333333', role: 'account_officer', org_id: ORG_A })}`);
    expect(res.status).toBe(403);
    expect(db.calls).toEqual([]);
  });

  it('soft-deletes the row so payroll history keeps its staff reference', async () => {
    db.tables['hr_staff'] = [staffRow()];
    const res = await request(app).delete(`/api/v1/hr/staff/${STAFF_ID}`).set('Authorization', `Bearer ${await orgManager()}`);

    expect(res.status).toBe(204);
    // The load-bearing assertion: the row is still there, just retired.
    expect(db.tables['hr_staff']).toHaveLength(1);
    expect(db.tables['hr_staff']![0]!['deleted_at']).toBeTruthy();
    expect(db.calls).toEqual(['hr_staff:update']);
  });

  it('404s (and never writes) for a staff row belonging to another organization', async () => {
    db.tables['hr_staff'] = [staffRow({ org_id: ORG_B })];
    const res = await request(app).delete(`/api/v1/hr/staff/${STAFF_ID}`).set('Authorization', `Bearer ${await orgManager()}`);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['hr_staff:update']);
    // Nothing was written: the tenant predicate filtered the row out.
    expect(db.tables['hr_staff']![0]!['deleted_at']).toBeNull();
    expect(db.tables['hr_staff']![0]!['updated_at']).toBe('2026-01-05T00:00:00.000Z');
  });

  it('404s for a row that is already deleted', async () => {
    db.tables['hr_staff'] = [staffRow({ deleted_at: '2026-03-01T00:00:00.000Z' })];
    const res = await request(app).delete(`/api/v1/hr/staff/${STAFF_ID}`).set('Authorization', `Bearer ${await orgManager()}`);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['hr_staff:update']);
    expect(db.tables['hr_staff']![0]!['deleted_at']).toBe('2026-03-01T00:00:00.000Z');
  });
});

describe('PATCH /api/v1/hr/staff/:id (live router)', () => {
  it('re-encrypts a corrected NID and only ever returns the mask', async () => {
    db.tables['hr_staff'] = [staffRow()];
    const res = await request(app)
      .patch(`/api/v1/hr/staff/${STAFF_ID}`)
      .set('Authorization', `Bearer ${await orgManager()}`)
      .send({ mobile: '01799999999', nid: '9876543210123' });

    expect(res.status).toBe(200);
    const row = db.tables['hr_staff']![0]!;
    expect(row['mobile']).toBe('01799999999');
    expect(String(row['nid_enc'])).not.toContain('9876543210123');
    expect(row['nid_masked']).toBe('0123');
    expect(res.body.mobile).toBe('01799999999');
    expect(res.body.nidMasked).toBe('0123');
    expect(res.body.nidEnc).toBeNull();
  });

  it('404s for another organization’s staff row', async () => {
    db.tables['hr_staff'] = [staffRow({ org_id: ORG_B })];
    const res = await request(app)
      .patch(`/api/v1/hr/staff/${STAFF_ID}`)
      .set('Authorization', `Bearer ${await orgManager()}`)
      .send({ mobile: '01799999999' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['hr_staff:update']);
    expect(db.tables['hr_staff']![0]!['mobile']).toBe('01711111111');
  });
});

describe('PATCH /api/v1/hr/vacancies/:id (live router)', () => {
  it('corrects a mistyped headcount/reason request', async () => {
    db.tables['hr_vacancies'] = [vacancyRow()];
    const res = await request(app)
      .patch(`/api/v1/hr/vacancies/${VACANCY_ID}`)
      .set('Authorization', `Bearer ${await planner()}`)
      .send({ headcount: 5, reason: 'Two resignations' });

    expect(res.status).toBe(200);
    expect(db.calls).toEqual(['hr_vacancies:select', 'hr_vacancies:update']);
    const row = db.tables['hr_vacancies']![0]!;
    expect(row['headcount']).toBe(5);
    expect(row['reason']).toBe('Two resignations');
    // Untouched fields keep their stored value.
    expect(row['designation']).toBe('field_officer');
    expect(row['status']).toBe('requested');
  });

  it('refuses to edit a rejected vacancy and writes nothing', async () => {
    db.tables['hr_vacancies'] = [vacancyRow({ status: 'rejected' })];
    const res = await request(app)
      .patch(`/api/v1/hr/vacancies/${VACANCY_ID}`)
      .set('Authorization', `Bearer ${await planner()}`)
      .send({ headcount: 9 });

    expect(res.status).toBe(409);
    expect(db.calls).toEqual(['hr_vacancies:select']);
    expect(db.tables['hr_vacancies']![0]!['headcount']).toBe(2);
  });

  it('validates the patch body (headcount above the schema cap)', async () => {
    db.tables['hr_vacancies'] = [vacancyRow()];
    const res = await request(app)
      .patch(`/api/v1/hr/vacancies/${VACANCY_ID}`)
      .set('Authorization', `Bearer ${await planner()}`)
      .send({ headcount: 999 });

    expect(res.status).toBe(400);
    expect(db.calls).toEqual([]);
  });
});

describe('DELETE /api/v1/hr/vacancies/:id (live router)', () => {
  it('checks the applicant dependency BEFORE marking the vacancy deleted', async () => {
    db.tables['hr_vacancies'] = [vacancyRow()];
    const res = await request(app).delete(`/api/v1/hr/vacancies/${VACANCY_ID}`).set('Authorization', `Bearer ${await planner()}`);

    expect(res.status).toBe(204);
    // 1) read the vacancy, 2) count its applicants, 3) only then retire it.
    expect(db.calls).toEqual(['hr_vacancies:select', 'hr_applicants:select:count', 'hr_vacancies:update']);
    expect(db.tables['hr_vacancies']![0]!['deleted_at']).toBeTruthy();
  });

  it('409s and leaves the vacancy live while applicants still reference it', async () => {
    db.tables['hr_vacancies'] = [vacancyRow()];
    db.tables['hr_applicants'] = [applicantRow()];
    const res = await request(app).delete(`/api/v1/hr/vacancies/${VACANCY_ID}`).set('Authorization', `Bearer ${await planner()}`);

    expect(res.status).toBe(409);
    expect(db.calls).toEqual(['hr_vacancies:select', 'hr_applicants:select:count']);
    expect(db.tables['hr_vacancies']![0]!['deleted_at']).toBeNull();
    expect(db.tables['hr_applicants']).toHaveLength(1);
  });
});

describe('applicant correction paths (live router)', () => {
  it('PATCH fixes the applicant’s own details', async () => {
    db.tables['hr_applicants'] = [applicantRow()];
    const res = await request(app)
      .patch(`/api/v1/hr/applicants/${APPLICANT_ID}`)
      .set('Authorization', `Bearer ${await planner()}`)
      .send({ name: 'Rina Akter', mobile: '01822222222', experienceYears: 3 });

    expect(res.status).toBe(200);
    expect(db.calls).toEqual(['hr_applicants:select', 'hr_applicants:update']);
    const row = db.tables['hr_applicants']![0]!;
    expect(row['name']).toBe('Rina Akter');
    expect(row['mobile']).toBe('01822222222');
    expect(row['experience_years']).toBe(3);
    // Workflow state is never part of a bulk edit.
    expect(row['status']).toBe('applied');
    expect(row['education_level']).toBe('HSC');
  });

  it('PATCH 409s on a joined applicant — they are staff now', async () => {
    db.tables['hr_applicants'] = [applicantRow({ status: 'joined' })];
    const res = await request(app)
      .patch(`/api/v1/hr/applicants/${APPLICANT_ID}`)
      .set('Authorization', `Bearer ${await planner()}`)
      .send({ name: 'Rina Akter' });

    expect(res.status).toBe(409);
    expect(db.calls).toEqual(['hr_applicants:select']);
    expect(db.tables['hr_applicants']![0]!['name']).toBe('Rina Begum');
  });

  it('PATCH validates the mobile format', async () => {
    db.tables['hr_applicants'] = [applicantRow()];
    const res = await request(app)
      .patch(`/api/v1/hr/applicants/${APPLICANT_ID}`)
      .set('Authorization', `Bearer ${await planner()}`)
      .send({ mobile: '12345' });

    expect(res.status).toBe(400);
    expect(db.calls).toEqual([]);
  });

  it('DELETE really removes the row (nothing references it)', async () => {
    db.tables['hr_applicants'] = [applicantRow()];
    const res = await request(app).delete(`/api/v1/hr/applicants/${APPLICANT_ID}`).set('Authorization', `Bearer ${await planner()}`);

    expect(res.status).toBe(204);
    expect(db.calls).toEqual(['hr_applicants:select', 'hr_applicants:delete']);
    expect(db.tables['hr_applicants']).toHaveLength(0);
  });

  it('DELETE 409s on a joined applicant', async () => {
    db.tables['hr_applicants'] = [applicantRow({ status: 'joined' })];
    const res = await request(app).delete(`/api/v1/hr/applicants/${APPLICANT_ID}`).set('Authorization', `Bearer ${await planner()}`);

    expect(res.status).toBe(409);
    expect(db.calls).toEqual(['hr_applicants:select']);
    expect(db.tables['hr_applicants']).toHaveLength(1);
  });

  it('DELETE 404s for another organization’s applicant', async () => {
    db.tables['hr_applicants'] = [applicantRow({ org_id: ORG_B })];
    const res = await request(app).delete(`/api/v1/hr/applicants/${APPLICANT_ID}`).set('Authorization', `Bearer ${await planner()}`);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['hr_applicants:select']);
    expect(db.tables['hr_applicants']).toHaveLength(1);
  });
});

/** HR Director: the only role the discipline endpoints accept. */
const hrDirector = () =>
  token({ sub: '33333333-3333-4333-8333-333333333333', email: 'hrd@x.test', role: 'org_admin', org_id: ORG_A });

/**
 * Every one of these is an id-addressed WRITE reached by guessing a uuid. The
 * service client bypasses RLS, so without the tenant predicate a manager of
 * one organization could confirm a probationer, decide a vacancy, move an
 * applicant, approve leave, apply a movement, approve payroll, review an
 * appraisal or close a disciplinary case in another tenant.
 */
describe('HR workflow writes are tenant-scoped (live router)', () => {
  it('POST /staff/:id/confirm 404s cross-org and leaves the probationer unconfirmed', async () => {
    db.tables['hr_staff'] = [staffRow({ org_id: ORG_B })];
    const res = await request(app).post(`/api/v1/hr/staff/${STAFF_ID}/confirm`).set('Authorization', `Bearer ${await orgManager()}`);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['hr_staff:update']);
    expect(db.tables['hr_staff']![0]!['status']).toBe('probation');
    expect(db.tables['hr_staff']![0]!['confirmation_date']).toBeNull();
  });

  it('POST /staff/:id/confirm confirms an in-org probationer', async () => {
    db.tables['hr_staff'] = [staffRow()];
    const res = await request(app).post(`/api/v1/hr/staff/${STAFF_ID}/confirm`).set('Authorization', `Bearer ${await orgManager()}`);

    expect(res.status).toBe(200);
    expect(db.tables['hr_staff']![0]!['status']).toBe('confirmed');
    expect(db.tables['hr_staff']![0]!['confirmation_date']).toBeTruthy();
  });

  it('POST /vacancies/:id/decision 404s cross-org', async () => {
    db.tables['hr_vacancies'] = [vacancyRow({ org_id: ORG_B })];
    const res = await request(app)
      .post(`/api/v1/hr/vacancies/${VACANCY_ID}/decision`)
      .set('Authorization', `Bearer ${await orgManager()}`)
      .send({ decision: 'approve' });

    expect(res.status).toBe(404);
    expect(db.tables['hr_vacancies']![0]!['status']).toBe('requested');
  });

  it('PATCH /applicants/:id/status 404s cross-org', async () => {
    db.tables['hr_applicants'] = [applicantRow({ org_id: ORG_B })];
    const res = await request(app)
      .patch(`/api/v1/hr/applicants/${APPLICANT_ID}/status`)
      .set('Authorization', `Bearer ${await orgManager()}`)
      .send({ status: 'interviewed' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['hr_applicants:update']);
    expect(db.tables['hr_applicants']![0]!['status']).toBe('applied');
  });

  it('POST /leave/:id/decision 404s cross-org', async () => {
    db.tables['hr_leave_requests'] = [{ id: 'lv-1', org_id: ORG_B, status: 'pending' }];
    const res = await request(app)
      .post('/api/v1/hr/leave/lv-1/decision')
      .set('Authorization', `Bearer ${await orgManager()}`)
      .send({ decision: 'approve' });

    expect(res.status).toBe(404);
    expect(db.tables['hr_leave_requests']![0]!['status']).toBe('pending');
  });

  it('POST /movements/:id/decision 404s cross-org', async () => {
    db.tables['hr_movements'] = [{ id: 'mv-1', org_id: ORG_B, kind: 'transfer', status: 'proposed' }];
    const res = await request(app)
      .post('/api/v1/hr/movements/mv-1/decision')
      .set('Authorization', `Bearer ${await orgManager()}`)
      .send({ decision: 'approve' });

    expect(res.status).toBe(404);
    expect(db.tables['hr_movements']![0]!['status']).toBe('proposed');
  });

  it('POST /payroll/runs/:id/decision 404s cross-org', async () => {
    db.tables['payroll_runs'] = [{ id: 'pr-1', org_id: ORG_B, status: 'draft' }];
    const res = await request(app)
      .post('/api/v1/hr/payroll/runs/pr-1/decision')
      .set('Authorization', `Bearer ${await orgManager()}`)
      .send({ action: 'approve' });

    expect(res.status).toBe(404);
    expect(db.tables['payroll_runs']![0]!['status']).toBe('draft');
  });

  it('POST /performance/appraisals/:id/review 404s cross-org', async () => {
    db.tables['staff_appraisals'] = [{ id: 'ap-1', org_id: ORG_B, status: 'submitted' }];
    const res = await request(app)
      .post('/api/v1/hr/performance/appraisals/ap-1/review')
      .set('Authorization', `Bearer ${await orgManager()}`)
      .send({ note: 'ঠিক আছে' });

    expect(res.status).toBe(404);
    expect(db.tables['staff_appraisals']![0]!['status']).toBe('submitted');
  });

  it('POST /discipline/:id/close 404s cross-org', async () => {
    db.tables['disciplinary_cases'] = [{ id: 'dc-1', org_id: ORG_B, status: 'open' }];
    const res = await request(app)
      .post('/api/v1/hr/discipline/dc-1/close')
      .set('Authorization', `Bearer ${await hrDirector()}`)
      .send({ outcome: 'warning_issued' });

    expect(res.status).toBe(404);
    expect(db.tables['disciplinary_cases']![0]!['status']).toBe('open');
  });
});
