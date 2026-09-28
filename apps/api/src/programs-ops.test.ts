/**
 * ── Programs ops tests (reqs 5–9) ────────────────────────────────────────────
 * 5) Budget monitoring: expense vs line, 80% alert, burn rate, donor rollup.
 * 6) Field visits with checklist scoring and photos.
 * 7) Donor quarterly reports with indicator/financial tables + Word export,
 *    verified to exclude all case data.
 * 8) Sensitive cases: worker-only write, masked rows for the officer, access
 *    logging of every view, worker-only access log, never on donor reports.
 * 9) Funding tracker: grant/principal schedule, declining EMI, validation.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const pg = await import('./lib/programs-store.js');
  pg.resetProgramsStore();
  const iw = await import('./lib/insurance-welfare-store.js');
  iw.resetInsWelfareStore();
  const work = await import('./lib/work-store.js');
  work.resetWorkDemoStore();
});

const auth = { Authorization: 'Bearer demo-token' };
const officer = { Authorization: 'Bearer demo-token-officer' };
const get = (url: string, headers = auth) => request(createAppRef() as never).get(url).set(headers);
const post = (url: string, body?: unknown, headers = auth) => request(createAppRef() as never).post(url).set(headers).send(body ?? {} as never);

const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';

const PROJECT = {
  code: 'PRJ-2026-001',
  nameBn: 'শিক্ষা সহায়তা প্রকল্প',
  nameEn: 'Education Support Project',
  donor: 'BRAC Foundation',
  grantAgreementNo: 'GA-2026-88',
  fundCode: 'RF-EDU-01',
  sector: 'education',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  targetAreas: ['গাজীপুর'],
  targetBeneficiaries: 500,
  managerName: 'নাসরিন সুলতানা',
  budget: [
    { lineItem: 'প্রশিক্ষণ ব্যয়', amount: '100000', note: '' },
    { lineItem: 'কিট', amount: '50000', note: '' },
  ],
};

async function seedActiveProject(): Promise<string> {
  const project = await post('/api/v1/programs/projects', PROJECT);
  await post(`/api/v1/programs/projects/${project.body.id}/decision`, { action: 'activate' });
  return project.body.id as string;
}

async function seedIndicator(projectId: string, target = '300'): Promise<string> {
  const ind = await post(`/api/v1/programs/projects/${projectId}/logframe`, {
    level: 'indicator',
    statement: 'প্রশিক্ষণপ্রাপ্ত উপকারভোগী',
    indicatorCode: 'IND-1',
    baseline: '0',
    targetValue: target,
    unit: 'জন',
    meansOfVerification: 'উপস্থিতি তালিকা',
  });
  await post('/api/v1/programs/indicator-values', { entryId: ind.body.id, periodStart: '2026-04-01', periodEnd: '2026-06-30', value: '120' });
  await post('/api/v1/programs/indicator-values', { entryId: ind.body.id, periodStart: '2026-07-01', periodEnd: '2026-09-30', value: '60' });
  return ind.body.id as string;
}

describe('Budget monitoring (req 5)', () => {
  it('records expenses and shows per-line utilization with the 80% alert', async () => {
    const projectId = await seedActiveProject();

    const exp = await post('/api/v1/programs/expenses', { projectId, expenseDate: '2026-05-10', budgetLine: 'প্রশিক্ষণ ব্যয়', amount: '85000', voucherNo: 'JV-101', description: 'প্রশিক্ষণ ব্যয়' });
    expect(exp.status).toBe(201);
    await post('/api/v1/programs/expenses', { projectId, expenseDate: '2026-06-20', budgetLine: 'কিট', amount: '10000', recordedBy: 'x' });

    const status = await get(`/api/v1/programs/projects/${projectId}/budget-status`);
    expect(status.status).toBe(200);
    const trn = status.body.monitor.lines.find((l: { lineItem: string }) => l.lineItem === 'প্রশিক্ষণ ব্যয়');
    expect(trn.spent).toBe('85000.00');
    expect(trn.utilizationPct).toBe(85);
    expect(trn.alert).toBe('warning');
    expect(status.body.monitor.budgetTotal).toBe('150000.00');
    expect(status.body.monitor.spentTotal).toBe('95000.00');

    // Org-wide alert list contains the line at/above 80%.
    const alerts = await get('/api/v1/programs/budget/alerts');
    const alertRow = alerts.body.items.find((a: { projectId: string; lineItem: string }) => a.projectId === projectId && a.lineItem === 'প্রশিক্ষণ ব্যয়');
    expect(alertRow.utilizationPct).toBe(85);
    expect(alertRow.alert).toBe('warning');
  });

  it('keeps unbudgeted spending visible', async () => {
    const projectId = await seedActiveProject();
    await post('/api/v1/programs/expenses', { projectId, expenseDate: '2026-05-10', budgetLine: 'অঘোষিত ব্যয়', amount: '5000' });
    const status = await get(`/api/v1/programs/projects/${projectId}/budget-status`);
    expect(status.body.monitor.unbudgetedSpent).toBe('5000.00');
    expect(status.body.monitor.spentTotal).toBe('5000.00');
  });

  it('computes burn rate vs elapsed time', async () => {
    const projectId = await seedActiveProject();
    await post('/api/v1/programs/expenses', { projectId, expenseDate: '2026-03-01', budgetLine: 'প্রশিক্ষণ ব্যয়', amount: '60000' });
    // 2026-04-01 ≈ 25% through the year; 60k/150k = 40% burned → overspent.
    const status = await get(`/api/v1/programs/projects/${projectId}/budget-status?asOf=2026-04-01`);
    expect(status.body.burn.burnPct).toBe(40);
    expect(status.body.burn.status).toBe('overspent');
  });

  it('rolls donor-wise utilization', async () => {
    await seedActiveProject();
    const rows = await get('/api/v1/programs/budget/donor-utilization');
    const brac = rows.body.items.find((d: { donor: string }) => d.donor === 'BRAC Foundation');
    expect(brac).toBeTruthy();
    expect(brac.projects).toBe(1);
    expect(brac.budgetTotal).toBe('150000.00');
  });
});

describe('Field visits (req 6)', () => {
  it('logs a visit with checklist, photos and follow-ups, and scores it', async () => {
    const projectId = await seedActiveProject();
    const visit = await post('/api/v1/programs/visits', {
      projectId,
      visitDate: '2026-09-20',
      officerId: 'off-1',
      officerName: 'রফিক ইসলাম',
      village: 'গাজীপুর',
      beneficiariesMet: 18,
      checklist: [
        { item: 'সভা নিয়মিত হচ্ছে', passed: true, note: '' },
        { item: 'কিট সঠিকভাবে বিতরণ', passed: true, note: '' },
        { item: 'ঝুঁকিপূর্ণ শিশু শনাক্তকরণ', passed: false, note: 'বাজেট প্রয়োজন' },
        { item: 'নথি হালনাগাদ', passed: true, note: '' },
      ],
      photos: [{ id: 'ph1', labelBn: 'সভার ছবি', path: 'photos/visit-1.jpg' }],
      findings: 'সাধারণভাবে ভালো অগ্রগতি',
      followUps: [{ action: 'কিট সরবরাহ', owner: 'ম্যানেজার', dueDate: '2026-10-05', done: false }],
    });
    expect(visit.status).toBe(201);
    expect(visit.body.checklist).toHaveLength(4);
    expect(visit.body.photos).toHaveLength(1);

    const list = await get(`/api/v1/programs/visits?projectId=${projectId}`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].scorePct).toBe(75);

    const detail = await get(`/api/v1/programs/visits/${visit.body.id}`);
    expect(detail.body.findings).toContain('ভালো');
  });

  it('rejects a visit without a checklist', async () => {
    const projectId = await seedActiveProject();
    const bad = await post('/api/v1/programs/visits', {
      projectId, visitDate: '2026-09-20', officerId: 'off-1', officerName: 'রফিক ইসলাম', checklist: [],
    });
    expect(bad.status).toBe(400);
  });

  it('lets the field officer record visits', async () => {
    const projectId = await seedActiveProject();
    const res = await post('/api/v1/programs/visits', {
      projectId,
      visitDate: '2026-09-21',
      officerId: 'off-2',
      officerName: 'অফিসার',
      checklist: [{ item: 'সভা হয়েছে', passed: true, note: '' }],
    }, officer);
    expect(res.status).toBe(201);
  });
});

describe('Donor reports (req 7)', () => {
  it('generates a quarterly report with indicator and financial tables and exports Word HTML', async () => {
    const projectId = await seedActiveProject();
    await seedIndicator(projectId);
    await post('/api/v1/programs/expenses', { projectId, expenseDate: '2026-04-05', budgetLine: 'প্রশিক্ষণ ব্যয়', amount: '50000' });
    await post('/api/v1/programs/expenses', { projectId, expenseDate: '2026-02-10', budgetLine: 'প্রশিক্ষণ ব্যয়', amount: '40000' });

    // Duplicate generation for the same period is blocked.
    const first = await post('/api/v1/programs/donor-reports', { projectId, periodStart: '2026-04-01', periodEnd: '2026-06-30' });
    expect(first.status).toBe(201);
    expect(first.body.report.indicators).toHaveLength(1);
    expect(first.body.report.indicators[0].achieved).toBe('120.00');
    expect(first.body.report.financialSummary.spentPeriod).toBe('50000.00');
    expect(first.body.report.financialSummary.spentCumulative).toBe('90000.00');
    expect(first.body.report.narrativeBn.length).toBeGreaterThan(3);
    const dup = await post('/api/v1/programs/donor-reports', { projectId, periodStart: '2026-04-01', periodEnd: '2026-06-30' });
    expect(dup.status).toBe(409);

    // Officer (field role) cannot generate donor reports.
    expect((await post('/api/v1/programs/donor-reports', { projectId, periodStart: '2026-07-01', periodEnd: '2026-09-30' }, officer)).status).toBe(403);

    // Word/PDF export: standalone HTML document.
    const exp = await get(`/api/v1/programs/donor-reports/${first.body.id}/export`);
    expect(exp.status).toBe(200);
    expect(exp.headers['content-type']).toContain('text/html');
    expect(exp.text).toContain('দাতা প্রতিবেদন / Donor Report');
    expect(exp.text).toContain('<table');
  });

  it('never includes case data in the report', async () => {
    const projectId = await seedActiveProject();
    const report = await post('/api/v1/programs/donor-reports', { projectId, periodStart: '2026-01-01', periodEnd: '2026-06-30' });
    const html = await get(`/api/v1/programs/donor-reports/${report.body.id}/export`);
    expect(html.text).not.toContain('CASE-');
    const listed = await get('/api/v1/programs/donor-reports');
    expect(listed.body.items).toHaveLength(1);
  });
});

describe('Sensitive case management (req 8)', () => {
  const CASE_BODY = {
    type: 'gbv_survivor',
    severity: 'critical',
    beneficiaryId: null,
    beneficiaryName: 'সংবেদনশীল উপকারভোগী',
    restrictedDetails: 'গোপনীয় বিবরণ — শুধু কেস ওয়ার্কার পড়বেন',
    consentGiven: true,
    assignedWorkerId: 'worker-1',
    assignedWorkerName: 'কেস ওয়ার্কার',
  };

  it('opens a case with a sequential number and walks the state machine', async () => {
    const c1 = await post('/api/v1/programs/cases', CASE_BODY);
    expect(c1.status).toBe(201);
    expect(c1.body.caseNo).toBe('CASE-0001');
    expect(c1.body.status).toBe('open');

    expect((await post(`/api/v1/programs/cases/${c1.body.id}/decision`, { status: 'referred' })).status).toBe(200);
    const moved = await post(`/api/v1/programs/cases/${c1.body.id}/decision`, { status: 'closed' });
    expect(moved.status).toBe(200);
    expect(moved.body.status).toBe('closed');
    expect(moved.body.closedAt).toBeTruthy();
    // Closed is terminal.
    expect((await post(`/api/v1/programs/cases/${c1.body.id}/decision`, { status: 'open' })).status).toBe(409);

    const c2 = await post('/api/v1/programs/cases', CASE_BODY);
    expect(c2.body.caseNo).toBe('CASE-0002');
  });

  it('masks identity and restricted fields for the field officer but not for admins', async () => {
    const created = await post('/api/v1/programs/cases', CASE_BODY);
    const id = created.body.id as string;

    // Admin (super_admin) sees everything.
    const adminView = await get(`/api/v1/programs/cases/${id}`);
    expect(adminView.body.restrictedUnlocked).toBe(true);
    expect(adminView.body.case.restrictedDetails).toContain('গোপনীয়');
    expect(adminView.body.case.beneficiaryName).toBe('সংবেদনশীল উপকারভোগী');

    // Field officer gets a masked row: no name, no details.
    const officerView = await get(`/api/v1/programs/cases/${id}`, officer);
    expect(officerView.status).toBe(200);
    expect(officerView.body.restrictedUnlocked).toBe(false);
    expect(officerView.body.case.beneficiaryName).toBeNull();
    expect(officerView.body.case.restrictedDetails).toBeNull();
    expect(officerView.body.case.caseNo).toBe('CASE-0001');

    // List view is masked too.
    const officerList = await get('/api/v1/programs/cases', officer);
    expect(officerList.body.items[0].restrictedDetails).toBeNull();
    expect(officerList.body.restrictedUnlocked).toBe(false);
  });

  it('logs every access and shows the log only to case workers', async () => {
    const created = await post('/api/v1/programs/cases', CASE_BODY);
    const id = created.body.id as string;
    await get(`/api/v1/programs/cases/${id}`); // admin view → view_restricted
    await get(`/api/v1/programs/cases/${id}`, officer); // officer view → masked view

    const log = await get(`/api/v1/programs/cases/${id}/access-log`);
    expect(log.status).toBe(200);
    const actions = log.body.items.map((l: { action: string }) => l.action);
    expect(actions).toContain('create');
    expect(actions).toContain('view_restricted');
    expect(actions.filter((a: string) => a === 'view').length).toBeGreaterThanOrEqual(1);

    // The officer cannot read the access log.
    expect((await get(`/api/v1/programs/cases/${id}/access-log`, officer)).status).toBe(403);
  });

  it('blocks the officer from opening or updating cases', async () => {
    const created = await post('/api/v1/programs/cases', CASE_BODY);
    const officerOpen = await post('/api/v1/programs/cases', { ...CASE_BODY, type: 'child_protection' }, officer);
    expect(officerOpen.status).toBe(403);
    expect((await post(`/api/v1/programs/cases/${created.body.id}/decision`, { status: 'in_progress' }, officer)).status).toBe(403);
  });

  it('exposes counts-only stats safe for dashboards', async () => {
    await post('/api/v1/programs/cases', CASE_BODY);
    const stats = await get('/api/v1/programs/cases/stats');
    expect(stats.body.total).toBe(1);
    expect(stats.body.open).toBe(1);
    expect(stats.body.byType.gbv_survivor).toBe(1);
    expect(JSON.stringify(stats.body)).not.toContain('গোপনীয়');
  });
});

describe('Funding & borrowing tracker (req 9)', () => {
  it('registers a PKSF source and generates a declining EMI schedule', async () => {
    const res = await post('/api/v1/programs/funding', {
      sourceName: 'PKSF বাংলাদেশ ব্যাংক লাইন',
      kind: 'pksf',
      principal: '1200000',
      interestRatePct: '6',
      tenureMonths: 24,
      disbursementDate: '2026-01-15',
      repaymentStart: '2026-04-01',
      purposeProjectId: null,
      lenderContact: 'pksf@example.com',
    });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('FND-0001');
    expect(res.body.schedule).toHaveLength(24);
    expect(Number(res.body.schedule[0].interest)).toBeGreaterThan(Number(res.body.schedule[23].interest));
    expect(res.body.schedule[23].balance).toBe('0.00');
    expect(Number(res.body.summary.totalPayable)).toBeGreaterThan(1200000);

    const detail = await get(`/api/v1/programs/funding/${res.body.id}`);
    expect(detail.body.schedule).toHaveLength(24);
    expect(detail.body.summary.installmentCount).toBe(24);

    const list = await get('/api/v1/programs/funding?kind=pksf');
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].summary.totalInterest).toBeTruthy();
  });

  it('gives grants a principal-only schedule', async () => {
    const res = await post('/api/v1/programs/funding', {
      sourceName: 'BRAC অনুদান',
      kind: 'grant',
      principal: '500000',
      interestRatePct: '0',
      tenureMonths: 10,
      disbursementDate: '2026-02-01',
      repaymentStart: '2026-03-01',
      purposeProjectId: null,
    });
    expect(res.status).toBe(201);
    expect(res.body.schedule[0].interest).toBe('0.00');
    expect(res.body.summary.totalInterest).toBe('0.00');
    expect(res.body.summary.totalPayable).toBe('500000.00');
  });

  it('rejects repayment start before disbursement', async () => {
    const res = await post('/api/v1/programs/funding', {
      sourceName: 'ব্যাংক ঋণ',
      kind: 'bank',
      principal: '300000',
      interestRatePct: '9',
      tenureMonths: 12,
      disbursementDate: '2026-06-01',
      repaymentStart: '2026-01-01',
    });
    expect(res.status).toBe(422);
  });

  it('links funding to a project and rejects unknown projects', async () => {
    const projectId = await seedActiveProject();
    const ok = await post('/api/v1/programs/funding', {
      sourceName: 'JCF পাইকারি তহবিল',
      kind: 'mfi_wholesale',
      principal: '800000',
      interestRatePct: '5',
      tenureMonths: 12,
      disbursementDate: '2026-01-01',
      repaymentStart: '2026-02-01',
      purposeProjectId: projectId,
    });
    expect(ok.status).toBe(201);
    const bad = await post('/api/v1/programs/funding', {
      sourceName: 'ভুল প্রকল্প',
      kind: 'bank',
      principal: '100000',
      interestRatePct: '5',
      tenureMonths: 12,
      disbursementDate: '2026-01-01',
      repaymentStart: '2026-02-01',
      purposeProjectId: MEMBER_A,
    });
    expect(bad.status).toBe(404);
  });
});
