/**
 * ── Cross-tenant 404-no-write guards for every live router ──────────────────
 * The live routers run on the service-role Supabase client, which bypasses RLS,
 * so an id-addressed write must carry an `org_id` predicate in code — a manager
 * of one organization must not be able to mutate another's row by guessing its
 * uuid. `collection/members/savings/hr/users.live.test.ts` already pin their
 * own routers; this suite extends the same mocked-Supabase pattern to every
 * remaining router that has id-addressed writes:
 *
 *   samities · org · work · security · privacy · mis · mis-ops · comms · coop ·
 *   delinquency · documents (+ comms bulk) · insurance · accounting · loans ·
 *   programs
 *
 * Each test seeds the router's real table with a row owned by ORG_B, calls the
 * endpoint as an ORG_A user, and asserts the response is 404 and the foreign
 * row (and any dependent insert table) is untouched. A positive control at the
 * bottom proves the same harness lets an in-org write through.
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
const SAMITY_ID = '00000000-0000-4000-8000-000000000101';
const OPENING_ID = '00000000-0000-4000-8000-000000000102';
const AREA_ID = '00000000-0000-4000-8000-000000000103';
const TASK_ID = '00000000-0000-4000-8000-000000000104';
const STAFF_ID = '00000000-0000-4000-8000-000000000105';
const DEVICE_ID = '00000000-0000-4000-8000-000000000106';
const CORRECTION_ID = '00000000-0000-4000-8000-000000000107';
const TEMPLATE_ID = '00000000-0000-4000-8000-000000000108';
const COMPLAINT_ID = '00000000-0000-4000-8000-000000000109';
const SCHEDULE_ID = '00000000-0000-4000-8000-000000000110';
const NOTIFICATION_ID = '00000000-0000-4000-8000-000000000111';
const AGM_ID = '00000000-0000-4000-8000-000000000112';
const EXIT_ID = '00000000-0000-4000-8000-000000000113';
const D_TASK_ID = '00000000-0000-4000-8000-000000000114';
const WRITE_OFF_ID = '00000000-0000-4000-8000-000000000115';
const SIGNAL_ID = '00000000-0000-4000-8000-000000000116';
const DOC_ID = '00000000-0000-4000-8000-000000000117';
const BULK_ID = '00000000-0000-4000-8000-000000000118';
const CLAIM_ID = '00000000-0000-4000-8000-000000000119';
const WELFARE_ID = '00000000-0000-4000-8000-000000000120';
const REQUISITION_ID = '00000000-0000-4000-8000-000000000121';
const PERIOD_ID = '00000000-0000-4000-8000-000000000122';
const APPLICATION_ID = '00000000-0000-4000-8000-000000000123';
const PROJECT_ID = '00000000-0000-4000-8000-000000000124';
const ACTIVITY_ID = '00000000-0000-4000-8000-000000000125';
const CASE_ID = '00000000-0000-4000-8000-000000000126';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  calls: [] as string[],
  nextId: 1,
  rpcArgs: [] as Array<Record<string, unknown>>,
}));

vi.mock('./lib/supabase.js', async () => {
  const { supabaseFake } = await import('./test-utils/supabase-fake.js');
  return supabaseFake(db);
});

// The org router branches on demo mode inside its handlers. Tests are "test"
// env, so force the live Supabase path while keeping every demo export (the
// auth middleware imports the demo tokens).
vi.mock('./lib/demo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/demo.js')>();
  return { ...actual, isDemoMode: () => false };
});

let app: Express;

beforeEach(async () => {
  db.tables = {};
  db.calls = [];
  db.nextId = 1;
  db.rpcArgs = [];

  // Imported here (not at module top) so `env.ts` parses after the test sets
  // SUPABASE_JWT_SECRET — the same reason the other live-router files do.
  const [
    { samityRouter },
    { orgRouter },
    { workRouter },
    { securityLiveRouter },
    { privacyLiveRouter },
    { misLiveRouter },
    { misOpsLiveRouter },
    { commLiveRouter },
    { commBulkLiveRouter, documentsLiveRouter },
    { coopGovLiveRouter },
    { delinquencyLiveRouter },
    { insWelfareLiveRouter },
    { loansRouter },
    { accountingRouter },
    { programsLiveRouter },
    { errorHandler },
  ] = await Promise.all([
    import('./routes/samity.routes.js'),
    import('./routes/org.routes.js'),
    import('./routes/work.routes.js'),
    import('./routes/security-live.routes.js'),
    import('./routes/privacy-live.routes.js'),
    import('./routes/mis-live.routes.js'),
    import('./routes/mis-ops-live.routes.js'),
    import('./routes/comms-live.routes.js'),
    import('./routes/documents-live.routes.js'),
    import('./routes/coop-governance-live.routes.js'),
    import('./routes/delinquency-live.routes.js'),
    import('./routes/insurance-welfare-live.routes.js'),
    import('./routes/loans.routes.js'),
    import('./routes/accounting.routes.js'),
    import('./routes/programs-live.routes.js'),
    import('./middleware/error.js'),
  ]);

  app = express();
  app.use(express.json());
  app.use('/api/v1/samities', samityRouter);
  app.use('/api/v1/org', orgRouter);
  app.use('/api/v1/work', workRouter);
  app.use('/api/v1/security', securityLiveRouter);
  app.use('/api/v1/privacy', privacyLiveRouter);
  app.use('/api/v1/mis', misLiveRouter);
  app.use('/api/v1/mis-ops', misOpsLiveRouter);
  app.use('/api/v1/comms', commLiveRouter);
  app.use('/api/v1/comms/bulk', commBulkLiveRouter);
  app.use('/api/v1/coop', coopGovLiveRouter);
  app.use('/api/v1/delinquency', delinquencyLiveRouter);
  app.use('/api/v1/documents', documentsLiveRouter);
  app.use('/api/v1/insurance', insWelfareLiveRouter);
  app.use('/api/v1/loans', loansRouter);
  app.use('/api/v1/accounting', accountingRouter);
  app.use('/api/v1/programs', programsLiveRouter);
  app.use(errorHandler);
});

async function token(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode('test-jwt-secret');
  return await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
}

/** Full permission set so one token reaches every dashboard-independent gate. */
const ALL_PERMISSIONS = [
  'org:manage',
  'branch:manage',
  'member:read',
  'member:write',
  'member:approve',
  'savings:read',
  'savings:write',
  'loan:read',
  'loan:write',
  'report:read',
  'user:manage',
];

const orgAdmin = () =>
  token({ sub: '11111111-1111-4111-8111-111111111111', email: 'admin@x.test', role: 'org_admin', org_id: ORG_A, app_permissions: ALL_PERMISSIONS });
const branchManager = () =>
  token({ sub: '22222222-2222-4222-8222-222222222222', email: 'bm@x.test', role: 'branch_manager', org_id: ORG_A, branch_id: BRANCH_ID });

const rows = (table: string): Row[] => db.tables[table] ?? [];

describe('samities', () => {
  it('PATCH /:id 404s cross-org and keeps the stored name', async () => {
    db.tables['samities'] = [{ id: SAMITY_ID, org_id: ORG_B, branch_id: BRANCH_ID, code: 'S-1', name: 'অন্য সমিতি', deleted_at: null }];
    const res = await request(app)
      .patch(`/api/v1/samities/${SAMITY_ID}`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ name: 'নতুন নাম' });

    expect(res.status).toBe(404);
    expect(rows('samities')[0]!['name']).toBe('অন্য সমিতি');
    // The write was issued, but the tenant predicate filtered it to zero rows.
    expect(db.calls).toEqual(['samities:update']);
  });

  it('DELETE /:id leaves a cross-org samity live', async () => {
    db.tables['samities'] = [{ id: SAMITY_ID, org_id: ORG_B, deleted_at: null }];
    const res = await request(app)
      .delete(`/api/v1/samities/${SAMITY_ID}`)
      .set('Authorization', `Bearer ${await branchManager()}`);

    // This handler answers 204 either way — the invariant under test is that
    // nothing was retired.
    expect(res.status).toBe(204);
    expect(rows('samities')[0]!['deleted_at']).toBeNull();
  });
});

describe('org', () => {
  it('POST /branch-openings/:id/decision 404s cross-org and keeps the stage', async () => {
    db.tables['branch_openings'] = [{ id: OPENING_ID, org_id: ORG_B, stage: 'proposed', branch_id: BRANCH_ID }];
    const res = await request(app)
      .post(`/api/v1/org/branch-openings/${OPENING_ID}/decision`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ decision: 'approve' });

    expect(res.status).toBe(404);
    expect(rows('branch_openings')[0]!['stage']).toBe('proposed');
    expect(rows('branch_openings')[0]!['director_note']).toBeUndefined();
  });

  it('POST /working-areas/:id/assign 404s cross-org and leaves the village unbound', async () => {
    db.tables['working_areas'] = [{ id: AREA_ID, org_id: ORG_B, branch_id: null, deleted_at: null }];
    const res = await request(app)
      .post(`/api/v1/org/working-areas/${AREA_ID}/assign`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ branchId: BRANCH_ID });

    expect(res.status).toBe(404);
    expect(rows('working_areas')[0]!['branch_id']).toBeNull();
  });
});

describe('work', () => {
  it('PATCH /tasks/:id 404s cross-org and leaves the task status', async () => {
    db.tables['work_tasks'] = [{ id: TASK_ID, org_id: ORG_B, status: 'todo', deleted_at: null }];
    const res = await request(app)
      .patch(`/api/v1/work/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ status: 'done' });

    expect(res.status).toBe(404);
    expect(rows('work_tasks')[0]!['status']).toBe('todo');
  });

  it('POST /tasks/:id/reassign 404s cross-org and writes no delegation', async () => {
    db.tables['work_tasks'] = [{ id: TASK_ID, org_id: ORG_B, status: 'todo', assignee_id: STAFF_ID, deleted_at: null }];
    const res = await request(app)
      .post(`/api/v1/work/tasks/${TASK_ID}/reassign`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ toStaffId: STAFF_ID, reason: 'leave' });

    expect(res.status).toBe(404);
    // The scoped read is the only statement: no staff lookup, no update, no
    // delegation row.
    expect(db.calls).toEqual(['work_tasks:select']);
    expect(rows('task_delegations')).toHaveLength(0);
    expect(rows('work_tasks')[0]!['assignee_id']).toBe(STAFF_ID);
  });
});

describe('security', () => {
  it('POST /devices/:id/revoke 404s cross-org and leaves the device active', async () => {
    db.tables['user_devices'] = [{ id: DEVICE_ID, org_id: ORG_B, user_id: 'someone', revoked: false }];
    const res = await request(app)
      .post(`/api/v1/security/devices/${DEVICE_ID}/revoke`)
      .set('Authorization', `Bearer ${await orgAdmin()}`);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['user_devices:select']);
    expect(rows('user_devices')[0]!['revoked']).toBe(false);
  });
});

describe('privacy', () => {
  it('POST /corrections/:id/decide 404s cross-org and keeps it submitted', async () => {
    db.tables['member_corrections'] = [{ id: CORRECTION_ID, org_id: ORG_B, status: 'submitted' }];
    const res = await request(app)
      .post(`/api/v1/privacy/corrections/${CORRECTION_ID}/decide`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ decision: 'approve', note: 'ঠিক আছে' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['member_corrections:select']);
    expect(rows('member_corrections')[0]!['status']).toBe('submitted');
  });

  it('POST /corrections/:id/apply 404s cross-org and never touches the member', async () => {
    db.tables['member_corrections'] = [
      { id: CORRECTION_ID, org_id: ORG_B, status: 'approved', field: 'phone', member_id: 'someone', requested_value: '01799999999' },
    ];
    db.tables['members'] = [{ id: 'someone', org_id: ORG_B, phone: '01711111111' }];
    const res = await request(app)
      .post(`/api/v1/privacy/corrections/${CORRECTION_ID}/apply`)
      .set('Authorization', `Bearer ${await orgAdmin()}`);

    expect(res.status).toBe(404);
    expect(rows('member_corrections')[0]!['status']).toBe('approved');
    expect(rows('members')[0]!['phone']).toBe('01711111111');
  });
});

describe('mis', () => {
  it('POST /templates/:id/verify 404s cross-org and writes no audit row', async () => {
    db.tables['report_templates'] = [{ id: TEMPLATE_ID, org_id: ORG_B, needs_verification: true }];
    const res = await request(app)
      .post(`/api/v1/mis/templates/${TEMPLATE_ID}/verify`)
      .set('Authorization', `Bearer ${await orgAdmin()}`);

    expect(res.status).toBe(404);
    expect(rows('report_templates')[0]!['needs_verification']).toBe(true);
    expect(rows('report_audit_log')).toHaveLength(0);
  });

  it('DELETE /templates/:id 404s cross-org and leaves the template live', async () => {
    db.tables['report_templates'] = [{ id: TEMPLATE_ID, org_id: ORG_B, name: 'অন্য টেমপ্লেট' }];
    const res = await request(app)
      .delete(`/api/v1/mis/templates/${TEMPLATE_ID}`)
      .set('Authorization', `Bearer ${await orgAdmin()}`);

    expect(res.status).toBe(404);
    expect(rows('report_templates')).toHaveLength(1);
  });
});

describe('mis-ops', () => {
  it('POST /complaints/:id/action 404s cross-org and keeps it open', async () => {
    db.tables['complaints'] = [{ id: COMPLAINT_ID, org_id: ORG_B, status: 'open', escalations: [] }];
    const res = await request(app)
      .post(`/api/v1/mis-ops/complaints/${COMPLAINT_ID}/action`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ action: 'acknowledge' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['complaints:select']);
    expect(rows('complaints')[0]!['status']).toBe('open');
  });

  it('DELETE /schedules/:id 404s cross-org and keeps the export schedule', async () => {
    db.tables['export_schedules'] = [{ id: SCHEDULE_ID, org_id: ORG_B, created_by: 'other' }];
    const res = await request(app)
      .delete(`/api/v1/mis-ops/schedules/${SCHEDULE_ID}`)
      .set('Authorization', `Bearer ${await orgAdmin()}`);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['export_schedules:select']);
    expect(rows('export_schedules')).toHaveLength(1);
  });
});

describe('comms', () => {
  it('POST /notifications/:id/read 404s cross-org and leaves it unread', async () => {
    db.tables['notifications'] = [{ id: NOTIFICATION_ID, org_id: ORG_B, user_id: 'someone', read: false }];
    const res = await request(app)
      .post(`/api/v1/comms/notifications/${NOTIFICATION_ID}/read`)
      .set('Authorization', `Bearer ${await orgAdmin()}`);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['notifications:select']);
    expect(rows('notifications')[0]!['read']).toBe(false);
  });
});

describe('coop', () => {
  it('POST /exits/:id/decision 404s cross-org and leaves it requested', async () => {
    db.tables['member_exits'] = [{ id: EXIT_ID, org_id: ORG_B, status: 'requested' }];
    const res = await request(app)
      .post(`/api/v1/coop/exits/${EXIT_ID}/decision`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ action: 'compute' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['member_exits:select']);
    expect(rows('member_exits')[0]!['status']).toBe('requested');
  });

  it('PUT /agm/:id/attendance 404s cross-org and records no attendance', async () => {
    db.tables['agm_records'] = [{ id: AGM_ID, org_id: ORG_B, attendance: [] }];
    const res = await request(app)
      .put(`/api/v1/coop/agm/${AGM_ID}/attendance`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ attendees: [] });

    expect(res.status).toBe(404);
    expect(rows('agm_records')[0]!['attendance']).toEqual([]);
  });
});

describe('delinquency', () => {
  it('POST /tasks/:id/complete 404s cross-org and leaves the task pending', async () => {
    db.tables['delinquency_tasks'] = [{ id: D_TASK_ID, org_id: ORG_B, status: 'pending' }];
    const res = await request(app)
      .post(`/api/v1/delinquency/tasks/${D_TASK_ID}/complete`)
      .set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(404);
    expect(rows('delinquency_tasks')[0]!['status']).toBe('pending');
  });

  it('POST /write-off-proposals/:id/decision 404s cross-org and leaves it proposed', async () => {
    db.tables['loan_write_offs'] = [{ id: WRITE_OFF_ID, org_id: ORG_B, status: 'proposed' }];
    const res = await request(app)
      .post(`/api/v1/delinquency/write-off-proposals/${WRITE_OFF_ID}/decision`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ decision: 'approved' });

    expect(res.status).toBe(404);
    expect(rows('loan_write_offs')[0]!['status']).toBe('proposed');
  });

  it('POST /early-warning/:id/acknowledge 404s cross-org and stays unacknowledged', async () => {
    db.tables['early_warning_signals'] = [{ id: SIGNAL_ID, org_id: ORG_B, acknowledged: false }];
    const res = await request(app)
      .post(`/api/v1/delinquency/early-warning/${SIGNAL_ID}/acknowledge`)
      .set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(404);
    expect(rows('early_warning_signals')[0]!['acknowledged']).toBe(false);
  });
});

describe('documents', () => {
  it('POST /:id/revoke 404s cross-org and leaves the document issued', async () => {
    db.tables['documents'] = [{ id: DOC_ID, org_id: ORG_B, status: 'issued' }];
    const res = await request(app)
      .post(`/api/v1/documents/${DOC_ID}/revoke`)
      .set('Authorization', `Bearer ${await orgAdmin()}`);

    expect(res.status).toBe(404);
    expect(rows('documents')[0]!['status']).toBe('issued');
  });

  it('POST /bulk-jobs/:id/tick 404s cross-org and never runs the job', async () => {
    db.tables['bulk_jobs'] = [{ id: BULK_ID, org_id: ORG_B, status: 'pending' }];
    const res = await request(app)
      .post(`/api/v1/documents/bulk-jobs/${BULK_ID}/tick`)
      .set('Authorization', `Bearer ${await orgAdmin()}`);

    expect(res.status).toBe(404);
    expect(rows('bulk_jobs')[0]!['status']).toBe('pending');
  });

  it('POST /comms/bulk/:id/tick 404s cross-org and never runs the job', async () => {
    db.tables['bulk_jobs'] = [{ id: BULK_ID, org_id: ORG_B, status: 'pending' }];
    const res = await request(app)
      .post(`/api/v1/comms/bulk/${BULK_ID}/tick`)
      .set('Authorization', `Bearer ${await orgAdmin()}`);

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['bulk_jobs:select']);
    expect(rows('bulk_jobs')[0]!['status']).toBe('pending');
  });
});

describe('insurance', () => {
  it('POST /claims/:id/decision 404s cross-org and leaves the claim submitted', async () => {
    db.tables['insurance_claims'] = [{ id: CLAIM_ID, org_id: ORG_B, status: 'submitted', deleted_at: null }];
    const res = await request(app)
      .post(`/api/v1/insurance/claims/${CLAIM_ID}/decision`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ action: 'reject', note: 'নথি অসম্পূর্ণ' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['insurance_claims:select']);
    expect(rows('insurance_claims')[0]!['status']).toBe('submitted');
  });

  it('POST /welfare/requests/:id/decision 404s cross-org and leaves it submitted', async () => {
    db.tables['welfare_requests'] = [{ id: WELFARE_ID, org_id: ORG_B, status: 'submitted', deleted_at: null }];
    const res = await request(app)
      .post(`/api/v1/insurance/welfare/requests/${WELFARE_ID}/decision`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ action: 'reject', note: 'অযোগ্য' });

    expect(res.status).toBe(404);
    expect(rows('welfare_requests')[0]!['status']).toBe('submitted');
  });
});

describe('accounting', () => {
  it('POST /requisitions/:id/decision 404s cross-org and leaves it requested', async () => {
    db.tables['fund_requisitions'] = [{ id: REQUISITION_ID, org_id: ORG_B, status: 'requested' }];
    const res = await request(app)
      .post(`/api/v1/accounting/requisitions/${REQUISITION_ID}/decision`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ decision: 'approve' });

    expect(res.status).toBe(404);
    expect(rows('fund_requisitions')[0]!['status']).toBe('requested');
  });

  it('POST /period-closes/:id/reopen 404s cross-org and keeps the period closed', async () => {
    db.tables['period_closes'] = [{ id: PERIOD_ID, org_id: ORG_B, deleted_at: null }];
    const res = await request(app)
      .post(`/api/v1/accounting/period-closes/${PERIOD_ID}/reopen`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ note: 'মাস পুনরায় খুলুন' });

    expect(res.status).toBe(404);
    expect(rows('period_closes')).toHaveLength(1);
    expect(rows('period_closes')[0]!['deleted_at']).toBeNull();
  });
});

describe('loans', () => {
  it('POST /applications/:id/decision 404s cross-org and writes no decision step', async () => {
    db.tables['loan_applications'] = [
      { id: APPLICATION_ID, org_id: ORG_B, status: 'bm_review', requested_amount: '50000.00', branch_id: BRANCH_ID },
    ];
    const res = await request(app)
      .post(`/api/v1/loans/applications/${APPLICATION_ID}/decision`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ decision: 'reject', reason: 'প্রয়োজন নেই' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['loan_applications:select']);
    expect(rows('loan_applications')[0]!['status']).toBe('bm_review');
    expect(rows('loan_application_steps')).toHaveLength(0);
  });

  it('PATCH /disbursements/:applicationId 404s cross-org and prepares nothing', async () => {
    db.tables['loan_applications'] = [{ id: APPLICATION_ID, org_id: ORG_B, status: 'approved' }];
    const res = await request(app)
      .patch(`/api/v1/loans/disbursements/${APPLICATION_ID}`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ plannedDate: '2026-04-01' });

    expect(res.status).toBe(404);
    expect(rows('loan_disbursements')).toHaveLength(0);
  });
});

describe('programs', () => {
  it('POST /projects/:id/decision 404s cross-org and keeps the project planned', async () => {
    db.tables['projects'] = [{ id: PROJECT_ID, org_id: ORG_B, status: 'planned' }];
    const res = await request(app)
      .post(`/api/v1/programs/projects/${PROJECT_ID}/decision`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ action: 'activate' });

    expect(res.status).toBe(404);
    expect(rows('projects')[0]!['status']).toBe('planned');
  });

  it('POST /activities/:id/decision 404s cross-org and keeps the activity planned', async () => {
    db.tables['program_activities'] = [{ id: ACTIVITY_ID, org_id: ORG_B, status: 'planned' }];
    const res = await request(app)
      .post(`/api/v1/programs/activities/${ACTIVITY_ID}/decision`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ status: 'done' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['program_activities:select']);
    expect(rows('program_activities')[0]!['status']).toBe('planned');
  });

  it('POST /cases/:id/decision 404s cross-org and keeps the case open', async () => {
    db.tables['cases'] = [{ id: CASE_ID, org_id: ORG_B, status: 'open', assigned_worker_id: null }];
    const res = await request(app)
      .post(`/api/v1/programs/cases/${CASE_ID}/decision`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(404);
    expect(rows('cases')[0]!['status']).toBe('open');
  });
});

/**
 * Positive control: the same harness and the same token let an in-org write
 * through, so a 404 above means the tenant predicate — not a broken fake — did
 * the filtering.
 */
describe('positive control', () => {
  it('PATCH /samities/:id updates the caller’s own samity', async () => {
    db.tables['samities'] = [{ id: SAMITY_ID, org_id: ORG_A, code: 'S-1', name: 'পুরনো নাম', deleted_at: null }];
    const res = await request(app)
      .patch(`/api/v1/samities/${SAMITY_ID}`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ name: 'নতুন নাম' });

    expect(res.status).toBe(200);
    expect(rows('samities')[0]!['name']).toBe('নতুন নাম');
  });
});
