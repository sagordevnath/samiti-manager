/**
 * ── MIS ops tests (reqs 5–10) ────────────────────────────────────────────────
 * Complaint register (tickets, SLA, escalation ladder, terminal states),
 * client protection indicators (resolution time, SLA%, overlap, stress),
 * report builder (run/save/share/delete), exports (CSV BOM/Excel XML/print
 * HTML), schedules (due logic, SMTP-missing path), month freeze enforcement
 * and matview stats.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';
delete process.env['SMTP_HOST'];

let createAppRef: typeof import('./app.js').createApp;

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const ops = await import('./lib/mis-ops-store.js');
  ops.resetMisOpsStore();
  const mis = await import('./lib/mis-store.js');
  mis.resetMisStore();
  const del = await import('./lib/delinquency-store.js');
  del.resetDelinquencyDemoStore();
  const loan = await import('./lib/loan-store.js');
  loan.resetLoanDemoStore();
  const work = await import('./lib/work-store.js');
  work.resetWorkDemoStore();
  const iw = await import('./lib/insurance-welfare-store.js');
  iw.resetInsWelfareStore();
});

const auth = { Authorization: 'Bearer demo-token' };
const officer = { Authorization: 'Bearer demo-token-officer' };
const get = (url: string, headers = auth) => request(createAppRef() as never).get(url).set(headers);
const post = (url: string, body?: unknown, headers = auth) => request(createAppRef() as never).post(url).set(headers).send(body ?? {} as never);
const del = (url: string, headers = auth) => request(createAppRef() as never).delete(url).set(headers);

const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';

const COMPLAINT = {
  channel: 'hotline',
  category: 'overcharging',
  severity: 'medium',
  subject: 'অতিরিক্ত চার্জ আদায়',
  details: 'কিস্তির দিন অতিরিক্ত টাকা চাওয়া হয়েছে',
  memberId: MEMBER_A,
  memberName: 'রহিমা বেগম',
  branchId: '00000000-0000-4000-8000-0000000000b1',
  reportedAt: '2026-09-20',
};

async function seedComplaint(over: Record<string, unknown> = {}): Promise<{ id: string; ticketNo: string }> {
  const res = await post('/api/v1/mis-ops/complaints', { ...COMPLAINT, ...over });
  expect(res.status).toBe(201);
  return { id: res.body.id as string, ticketNo: res.body.ticketNo as string };
}

describe('Complaint register & escalation (req 5, 10)', () => {
  it('opens a complaint with a ticket and SLA deadline', async () => {
    const c = await seedComplaint();
    expect(c.ticketNo).toBe('CMP-0001');
    const list = await get('/api/v1/mis-ops/complaints');
    const row = list.body.items[0];
    expect(row.status).toBe('open');
    expect(row.dueAt).toBe('2026-09-23'); // medium = +3 days
    const critical = await seedComplaint({ severity: 'critical', subject: 'জোরপূর্বক আদায়', category: 'coercive_collection' });
    expect(critical.ticketNo).toBe('CMP-0002');
    const list2 = await get('/api/v1/mis-ops/complaints');
    expect(list2.body.items.find((x: { id: string }) => x.id === critical.id).dueAt).toBe('2026-09-21'); // critical = +1
  });

  it('acknowledges, escalates up the ladder and resolves', async () => {
    const c = await seedComplaint();
    const ack = await post(`/api/v1/mis-ops/complaints/${c.id}/action`, { action: 'acknowledge', note: 'গ্রহণ করা হয়েছে' });
    expect(ack.body.status).toBe('in_progress');
    expect(ack.body.acknowledgedAt).toBeTruthy();

    const esc1 = await post(`/api/v1/mis-ops/complaints/${c.id}/action`, { action: 'escalate', note: 'শাখায় সমাধান হয়নি' });
    expect(esc1.body.status).toBe('escalated');
    expect(esc1.body.escalations[0].level).toBe('branch_manager');

    const esc2 = await post(`/api/v1/mis-ops/complaints/${c.id}/action`, { action: 'escalate', note: 'এলাকায়' });
    expect(esc2.body.escalations[1].level).toBe('area_manager');

    const resolve = await post(`/api/v1/mis-ops/complaints/${c.id}/action`, { action: 'resolve', note: 'টাকা ফেরত দেওয়া হয়েছে' });
    expect(resolve.body.status).toBe('resolved');
    expect(resolve.body.resolvedAt).toBeTruthy();

    // Terminal — no further actions.
    const again = await post(`/api/v1/mis-ops/complaints/${c.id}/action`, { action: 'escalate' });
    expect(again.status).toBe(409);
  });

  it('critical complaints skip branch level on first escalation', async () => {
    const c = await seedComplaint({ severity: 'critical', category: 'coercive_collection', subject: 'হটলাইন জরুরি' });
    const esc = await post(`/api/v1/mis-ops/complaints/${c.id}/action`, { action: 'escalate' });
    expect(esc.body.escalations[0].level).toBe('area_manager');
  });

  it('blocks rejection for the field officer but allows managers', async () => {
    const c = await seedComplaint();
    expect((await post(`/api/v1/mis-ops/complaints/${c.id}/action`, { action: 'reject', note: 'ভিত্তিহীন' }, officer)).status).toBe(403);
    const ok = await post(`/api/v1/mis-ops/complaints/${c.id}/action`, { action: 'reject', note: 'ভিত্তিহীন' });
    expect(ok.body.status).toBe('rejected');
    expect((await post(`/api/v1/mis-ops/complaints/${c.id}/action`, { action: 'resolve' })).status).toBe(409);
  });

  it('filters by status and search', async () => {
    await seedComplaint();
    await seedComplaint({ subject: 'ঝুঁকিপূর্ণ আচরণ', category: 'staff_behaviour' });
    expect((await get('/api/v1/mis-ops/complaints?status=open')).body.items).toHaveLength(2);
    expect((await get('/api/v1/mis-ops/complaints?q=ঝুঁকিপূর্ণ')).body.items).toHaveLength(1);
    expect((await get('/api/v1/mis-ops/complaints?category=overcharging')).body.items).toHaveLength(1);
  });
});

describe('Client protection indicators (req 5)', () => {
  it('computes resolution time, SLA%, overlap and stress', async () => {
    await seedComplaint({ reportedAt: '2026-09-10' });
    const list = await get('/api/v1/mis-ops/complaints');
    const id = list.body.items[0].id as string;
    await post(`/api/v1/mis-ops/complaints/${id}/action`, { action: 'resolve', note: 'সমাধান', resolvedOn: '2026-09-12' });
    await seedComplaint({}); // open, same member → overlap
    await seedComplaint({ memberName: 'সালমা খাতুন', memberId: null, subject: 'দ্বিতীয়' });

    const ind = await get('/api/v1/mis-ops/protection');
    expect(ind.status).toBe(200);
    expect(ind.body.complaintsTotal).toBe(3);
    expect(ind.body.complaintsOpen).toBe(2);
    expect(ind.body.overlapCases).toBe(1); // MEMBER_A twice
    expect(ind.body.slaCompliancePct).toBe(100); // resolved next-day vs +3 SLA
    expect(ind.body.resolutionDaysAvg).toBeGreaterThanOrEqual(0);
    expect(ind.body.byCategory.length).toBeGreaterThan(0);
  });
});

describe('Report builder (req 6)', () => {
  it('runs an ad-hoc grouping with filters and metric', async () => {
    const res = await post('/api/v1/mis-ops/builder/run', {
      name: 'শাখা বকেয়া', dataset: 'loans', filters: [], groupBy: 'branchName', metric: 'sum', metricField: 'outstanding', chartType: 'bar', sharedWithRoles: [],
    });
    expect(res.status).toBe(200);
    expect(res.body.scanned).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.chartType).toBe('bar');
  });

  it('saves, shares by role, runs and deletes', async () => {
    const saved = await post('/api/v1/mis-ops/builder/saved', {
      name: 'সাপ্তাহিক বকেয়া', dataset: 'loans', filters: [], groupBy: 'branchName', metric: 'sum', metricField: 'overdueTotal', chartType: 'line', sharedWithRoles: ['branch_manager'],
    });
    expect(saved.status).toBe(201);
    expect(saved.body.ownerName).toBe('admin@samity.test');

    // Shared with branch_manager (officer token is account_officer → denied).
    expect((await get(`/api/v1/mis-ops/builder/saved/${saved.body.id}`, officer)).status).toBe(403);
    expect((await get(`/api/v1/mis-ops/builder/saved/${saved.body.id}`)).status).toBe(200);

    const run = await post(`/api/v1/mis-ops/builder/saved/${saved.body.id}/run`);
    expect(run.status).toBe(200);
    expect(run.body.chartType).toBe('line');

    const list = await get('/api/v1/mis-ops/builder/saved', officer);
    expect(list.body.items).toHaveLength(0); // not shared with account_officer

    expect((await del(`/api/v1/mis-ops/builder/saved/${saved.body.id}`, officer)).status).toBe(403);
    expect((await del(`/api/v1/mis-ops/builder/saved/${saved.body.id}`)).status).toBe(204);
  });
});

describe('Exports (req 7)', () => {
  it('downloads CSV with BOM, Excel XML and print HTML', async () => {
    const csv = await get('/api/v1/mis-ops/export/standard/overdue_aging/csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('attachment');
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);

    const xls = await get('/api/v1/mis-ops/export/standard/outstanding_loans/excel');
    expect(xls.headers['content-type']).toContain('vnd.ms-excel');
    expect(xls.text).toContain('urn:schemas-microsoft-com:office:spreadsheet');

    const pdf = await get('/api/v1/mis-ops/export/standard/samity_list/pdf');
    expect(pdf.headers['content-type']).toContain('text/html');
    expect(pdf.text).toContain('Noto Sans Bengali');
    expect(pdf.headers['content-disposition']).toContain('inline');
  });

  it('rejects unknown kinds and formats', async () => {
    expect((await get('/api/v1/mis-ops/export/standard/nope/csv')).status).toBe(422);
    expect((await get('/api/v1/mis-ops/export/standard/overdue_aging/docx')).status).toBe(422);
  });
});

describe('Schedules & SMTP (req 7)', () => {
  it('saves a schedule and reports smtpConfigured=false without env', async () => {
    const res = await post('/api/v1/mis-ops/schedules', {
      name: 'সাপ্তাহিক বকেয়া ইমেইল', kind: 'standard_report', reportId: 'overdue_aging', format: 'excel', frequency: 'weekly', runOn: 1, recipients: ['bm@samity.test'], enabled: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.smtpConfigured).toBe(false);
    const list = await get('/api/v1/mis-ops/schedules');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.smtpConfigured).toBe(false);
  });

  it('run-due records the smtp-missing error instead of silently dropping', async () => {
    await post('/api/v1/mis-ops/schedules', {
      name: 'দৈনিক', kind: 'standard_report', reportId: 'samity_list', format: 'csv', frequency: 'daily', runOn: 1, recipients: ['x@y.org'],
    });
    const run = await post('/api/v1/mis-ops/schedules/run-due');
    expect(run.status).toBe(200);
    expect(run.body.run).toBe(1);
    expect(run.body.skippedNoSmtp).toBe(1);
    const list = await get('/api/v1/mis-ops/schedules');
    expect(list.body.items[0].lastStatus).toBe('error');
    expect(list.body.items[0].lastError).toBe('smtp-not-configured');
    // Already ran today → not due again.
    const again = await post('/api/v1/mis-ops/schedules/run-due');
    expect(again.body.run).toBe(0);
  });

  it('officer cannot create schedules', async () => {
    expect((await post('/api/v1/mis-ops/schedules', { name: 'x', kind: 'standard_report', reportId: 'r', format: 'csv', frequency: 'daily', runOn: 1, recipients: ['a@b.c'] }, officer)).status).toBe(403);
  });
});

describe('Month freeze (req 9)', () => {
  it('freezes a month and rejects complaints dated inside it', async () => {
    const freeze = await post('/api/v1/mis-ops/freeze', { month: '2026-08', note: 'বার্ষিক নিরীক্ষা শেষে', status: 'hard' });
    expect(freeze.status).toBe(201);
    expect(freeze.body.status).toBe('hard');

    const bad = await post('/api/v1/mis-ops/complaints', { ...COMPLAINT, reportedAt: '2026-08-15' });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('ALREADY_CLOSED');

    // Current month is fine.
    expect((await post('/api/v1/mis-ops/complaints', COMPLAINT)).status).toBe(201);
    const list = await get('/api/v1/mis-ops/freeze');
    expect(list.body.items).toHaveLength(1);
  });

  it('soft freeze allows corrections but hard blocks; only admins manage', async () => {
    expect((await post('/api/v1/mis-ops/freeze', { month: '2026-07', status: 'soft' }, officer)).status).toBe(403);
    await post('/api/v1/mis-ops/freeze', { month: '2026-07', status: 'soft' });
    // Soft freeze still accepts dated entries (correction flag is the contract).
    expect((await post('/api/v1/mis-ops/complaints', { ...COMPLAINT, reportedAt: '2026-07-10' })).status).toBe(201);

    // Duplicate freeze is blocked; unfreeze reopens.
    expect((await post('/api/v1/mis-ops/freeze', { month: '2026-07', status: 'hard' })).status).toBe(409);
    expect((await del('/api/v1/mis-ops/freeze/2026-07')).status).toBe(204);
    expect((await get('/api/v1/mis-ops/freeze')).body.items).toHaveLength(0);
  });
});

describe('Matviews & indexes (req 8)', () => {
  it('serves the matview catalogue with refresh info', async () => {
    const res = await get('/api/v1/mis-ops/matviews');
    expect(res.status).toBe(200);
    expect(res.body.views.length).toBeGreaterThanOrEqual(4);
    expect(res.body.refreshSql).toContain('refresh_mis_matviews');
    const branch = res.body.views.find((v: { name: string }) => v.name === 'mv_branch_portfolio_daily');
    expect(branch.refreshMode).toContain('nightly');
  });
});
