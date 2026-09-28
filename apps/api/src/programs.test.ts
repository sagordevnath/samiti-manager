/**
 * ── Programs & projects tests ────────────────────────────────────────────────
 * Project register lifecycle with restricted fund code, logframe indicator
 * progress with evidence, beneficiary/enrollment/service records, activity
 * planner, training batches with attendance/tests and the certificate rules
 * (≥ 60% attendance, post-test ≥ 40, single issue), plus role denial.
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
const put = (url: string, body?: unknown, headers = auth) => request(createAppRef() as never).put(url).set(headers).send(body ?? {} as never);

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
  targetAreas: ['গাজীপুর', 'মিরকাদিম'],
  targetBeneficiaries: 500,
  managerName: 'নাসরিন সুলতানা',
  budget: [
    { lineItem: 'প্রশিক্ষণ ব্যয়', amount: '400000', note: '' },
    { lineItem: 'কিট', amount: '100000', note: 'স্কুল ব্যাগ ও বই' },
  ],
};

const BEN = {
  memberId: MEMBER_A,
  nameBn: 'রহিমা বেগম',
  guardianBn: 'মৃত আব্দুল করিম',
  phone: '01712345678',
  age: 32,
  gender: 'female',
  village: 'গাজীপুর',
};

async function seedProject(): Promise<{ projectId: string; beneficiaryId: string; batchId: string }> {
  const project = await post('/api/v1/programs/projects', PROJECT);
  const activate = await post(`/api/v1/programs/projects/${project.body.id}/decision`, { action: 'activate' });
  expect(activate.body.status).toBe('active');
  const ben = await post('/api/v1/programs/beneficiaries', BEN);
  await post('/api/v1/programs/enrollments', {
    beneficiaryId: ben.body.id,
    projectId: project.body.id,
    enrolledAt: '2026-02-01',
    note: 'প্রথম ব্যাচ',
  });
  const batch = await post('/api/v1/programs/batches', {
    projectId: project.body.id,
    titleBn: 'হাঁস-মুরগি পালন প্রশিক্ষণ',
    trainerName: 'ড. আক্তার হোসেন',
    trainerOrgBn: 'প্রাণিসম্পদ অধিদপ্তর',
    startDate: '2026-09-01',
    endDate: '2026-09-20',
    hours: 24,
    sessions: 3,
  });
  return { projectId: project.body.id, beneficiaryId: ben.body.id, batchId: batch.body.id };
}

describe('Project register (req 1)', () => {
  it('creates a project with budget total and restricted fund code', async () => {
    const res = await post('/api/v1/programs/projects', PROJECT);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('proposed');
    expect(res.body.budgetTotal).toBe('500000.00');
    expect(res.body.fundCode).toBe('RF-EDU-01');
    expect(res.body.targetAreas).toHaveLength(2);
  });

  it('rejects duplicate project codes and bad date ranges', async () => {
    await post('/api/v1/programs/projects', PROJECT);
    const dup = await post('/api/v1/programs/projects', PROJECT);
    expect(dup.status).toBe(409);

    const badDates = await post('/api/v1/programs/projects', { ...PROJECT, code: 'PRJ-2026-002', endDate: '2025-12-31' });
    expect(badDates.status).toBe(422);
  });

  it('walks the lifecycle proposed → active → suspended → active → closed', async () => {
    const p = await post('/api/v1/programs/projects', PROJECT);
    const id = p.body.id as string;
    expect((await post(`/api/v1/programs/projects/${id}/decision`, { action: 'suspend' })).status).toBe(409);
    expect((await post(`/api/v1/programs/projects/${id}/decision`, { action: 'activate' })).body.status).toBe('active');
    expect((await post(`/api/v1/programs/projects/${id}/decision`, { action: 'suspend' })).body.status).toBe('suspended');
    expect((await post(`/api/v1/programs/projects/${id}/decision`, { action: 'resume' })).body.status).toBe('active');
    expect((await post(`/api/v1/programs/projects/${id}/decision`, { action: 'close' })).body.status).toBe('closed');
    expect((await post(`/api/v1/programs/projects/${id}/decision`, { action: 'activate' })).status).toBe(409);
  });

  it('filters by sector, status and donor', async () => {
    await post('/api/v1/programs/projects', PROJECT);
    await post('/api/v1/programs/projects', {
      ...PROJECT,
      code: 'PRJ-2026-002',
      nameBn: 'স্বাস্থ্য প্রকল্প',
      nameEn: 'Health Project',
      donor: 'JCF',
      grantAgreementNo: 'GA-77',
      fundCode: 'RF-HEALTH-01',
      sector: 'health',
      budget: [{ lineItem: 'ক্যাম্প', amount: '50000', note: '' }],
    });
    expect((await get('/api/v1/programs/projects?sector=health')).body.items).toHaveLength(1);
    expect((await get('/api/v1/programs/projects?donor=brac')).body.items).toHaveLength(1);
    // Neither project was activated in this test — both remain proposed.
    expect((await get('/api/v1/programs/projects?status=proposed')).body.items).toHaveLength(2);
  });
});

describe('Logframe (req 2)', () => {
  it('adds entries at all levels and measures indicator progress with evidence', async () => {
    const { projectId } = await seedProject();

    await post(`/api/v1/programs/projects/${projectId}/logframe`, {
      level: 'goal', statement: 'গ্রামীণ দরিদ্র পরিবারের আয় বৃদ্ধি', meansOfVerification: 'প্রতিবেদন',
    });
    await post(`/api/v1/programs/projects/${projectId}/logframe`, {
      level: 'output', statement: '৩০০ জন প্রশিক্ষণ সম্পন্ন করেছে', parentLabel: 'OBJ-1', meansOfVerification: 'ব্যাচ রেকর্ড',
    });
    const indicator = await post(`/api/v1/programs/projects/${projectId}/logframe`, {
      level: 'indicator',
      statement: 'প্রশিক্ষণপ্রাপ্ত উপকারভোগী',
      indicatorCode: 'IND-1',
      baseline: '0',
      targetValue: '300',
      unit: 'জন',
      meansOfVerification: 'উপস্থিতি তালিকা ও সার্টিফিকেট',
    });
    const entryId = indicator.body.id as string;

    // Non-indicator levels refuse values.
    const goalEntries = await get(`/api/v1/programs/projects/${projectId}/logframe`);
    const goalEntry = goalEntries.body.entries.find((e: { level: string }) => e.level === 'goal');
    const wrongLevel = await post('/api/v1/programs/indicator-values', {
      entryId: goalEntry.id, periodStart: '2026-01-01', periodEnd: '2026-03-31', value: '10',
    });
    expect(wrongLevel.status).toBe(422);

    const v1 = await post('/api/v1/programs/indicator-values', {
      entryId,
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      value: '120',
      evidence: [{ id: 'att-list', labelBn: 'উপস্থিতি তালিকা', path: 'evidence/att-q1.pdf' }],
      note: 'প্রথম প্রান্তিক',
    });
    expect(v1.status).toBe(201);
    expect(v1.body.value).toBe('120.00');
    await post('/api/v1/programs/indicator-values', {
      entryId, periodStart: '2026-04-01', periodEnd: '2026-06-30', value: '60',
    });

    const lf = await get(`/api/v1/programs/projects/${projectId}/logframe`);
    const values = lf.body.values.filter((v: { entryId: string }) => v.entryId === entryId);
    expect(values).toHaveLength(2);
    const achieved = values.reduce((s: number, v: { value: string }) => s + Number(v.value), 0);
    expect(achieved).toBe(180); // 60% of the 300 target
  });

  it('rejects an inverted measurement period', async () => {
    const { projectId } = await seedProject();
    const ind = await post(`/api/v1/programs/projects/${projectId}/logframe`, {
      level: 'indicator', statement: 'মাপা সূচক', targetValue: '10', meansOfVerification: 'রেজিস্টার',
    });
    const bad = await post('/api/v1/programs/indicator-values', {
      entryId: ind.body.id, periodStart: '2026-06-01', periodEnd: '2026-01-01', value: '5',
    });
    expect(bad.status).toBe(422);
  });
});

describe('Beneficiaries, enrollments & services (req 3)', () => {
  it('registers a beneficiary linked to a member with a sequential code', async () => {
    const res = await post('/api/v1/programs/beneficiaries', BEN);
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('BEN-0001');
    expect(res.body.memberId).toBe(MEMBER_A);

    const second = await post('/api/v1/programs/beneficiaries', { ...BEN, memberId: null, nameBn: 'কমল হোসেন' });
    expect(second.body.code).toBe('BEN-0002');
  });

  it('enrolls in multiple projects and blocks duplicates per project', async () => {
    const ben = await post('/api/v1/programs/beneficiaries', BEN);
    const p1 = await post('/api/v1/programs/projects', PROJECT);
    const p2 = await post('/api/v1/programs/projects', {
      ...PROJECT, code: 'PRJ-2026-002', nameEn: 'Health Project', sector: 'health', fundCode: 'RF-HP-01',
      budget: [{ lineItem: 'ক্যাম্প', amount: '50000', note: '' }],
    });
    expect((await post('/api/v1/programs/enrollments', { beneficiaryId: ben.body.id, projectId: p1.body.id, enrolledAt: '2026-02-01' })).status).toBe(201);
    expect((await post('/api/v1/programs/enrollments', { beneficiaryId: ben.body.id, projectId: p2.body.id, enrolledAt: '2026-03-01' })).status).toBe(201);
    const dup = await post('/api/v1/programs/enrollments', { beneficiaryId: ben.body.id, projectId: p1.body.id, enrolledAt: '2026-04-01' });
    expect(dup.status).toBe(409);

    const byBen = await get(`/api/v1/programs/enrollments?beneficiaryId=${ben.body.id}`);
    expect(byBen.body.items).toHaveLength(2);
  });

  it('logs service delivery records of each kind', async () => {
    const { projectId, beneficiaryId } = await seedProject();
    for (const kind of ['training', 'health_camp', 'school_enrollment', 'kit_distribution', 'awareness_session']) {
      const res = await post('/api/v1/programs/services', {
        projectId, beneficiaryId, kind, serviceDate: '2026-09-10', details: 'ডেমো সেবা',
      });
      expect(res.status).toBe(201);
    }
    const services = await get(`/api/v1/programs/services?beneficiaryId=${beneficiaryId}`);
    expect(services.body.items).toHaveLength(5);
    expect((await get('/api/v1/programs/services?kind=health_camp')).body.items).toHaveLength(1);
  });
});

describe('Activities & training batches (req 4)', () => {
  it('plans activities and serves calendar slices, then completes them', async () => {
    const { projectId } = await seedProject();
    await post('/api/v1/programs/activities', { projectId, titleBn: 'স্বাস্থ্য ক্যাম্প', kind: 'health_camp', plannedDate: '2026-10-05', venue: 'গাজীপুর স্কুল', targetParticipants: 80 });
    await post('/api/v1/programs/activities', { projectId, titleBn: 'সচেতনতা সেশন', kind: 'awareness_session', plannedDate: '2026-09-28', venue: 'মিরকাদিম ক্লাব', targetParticipants: 40 });
    await post('/api/v1/programs/activities', { projectId, titleBn: 'কিট বিতরণ', kind: 'kit_distribution', plannedDate: '2026-10-01', targetParticipants: 50 });

    const week = await get(`/api/v1/programs/activities?projectId=${projectId}&start=2026-09-30&end=2026-10-05`);
    expect(week.body.items.map((a: { titleBn: string }) => a.titleBn)).toEqual(['কিট বিতরণ', 'স্বাস্থ্য ক্যাম্প']);

    const list = await get(`/api/v1/programs/activities?projectId=${projectId}`);
    const id = list.body.items[0].id as string;
    const done = await post(`/api/v1/programs/activities/${id}/decision`, { status: 'done' });
    expect(done.body.status).toBe('done');
    expect((await post(`/api/v1/programs/activities/${id}/decision`, { status: 'cancelled' })).status).toBe(409);
  });

  it('records attendance and scores, then computes batch stats', async () => {
    const { beneficiaryId, batchId } = await seedProject();
    const ben2 = await post('/api/v1/programs/beneficiaries', { ...BEN, memberId: null, nameBn: 'সালমা খাতুন' });

    // Session beyond the 3-session plan is rejected.
    expect((await put(`/api/v1/programs/batches/${batchId}/attendance`, { beneficiaryId, sessionNo: 4, present: true })).status).toBe(422);

    for (const s of [1, 2, 3]) {
      await put(`/api/v1/programs/batches/${batchId}/attendance`, { beneficiaryId, sessionNo: s, present: true });
      await put(`/api/v1/programs/batches/${batchId}/attendance`, { beneficiaryId: ben2.body.id, sessionNo: s, present: s !== 2 });
    }
    // Upsert: same mark again replaces.
    await put(`/api/v1/programs/batches/${batchId}/attendance`, { beneficiaryId: ben2.body.id, sessionNo: 2, present: true });

    await put(`/api/v1/programs/batches/${batchId}/scores`, { beneficiaryId, pre: 40, post: 75 });
    await put(`/api/v1/programs/batches/${batchId}/scores`, { beneficiaryId: ben2.body.id, pre: 60, post: 85 });

    const detail = await get(`/api/v1/programs/batches/${batchId}`);
    expect(detail.body.stats.attendees).toBe(2);
    expect(detail.body.stats.avgAttendancePct).toBe(100);
    expect(detail.body.stats.avgPre).toBe(50);
    expect(detail.body.stats.avgPost).toBe(80);
    expect(detail.body.stats.avgGainPct).toBe(60);
    expect(detail.body.stats.certificates).toBe(0);
  });
});

describe('Certificates (req 4)', () => {
  it('issues only with ≥ 60% attendance and post-test ≥ 40, once per beneficiary', async () => {
    const { projectId, beneficiaryId, batchId } = await seedProject();

    // No attendance → refused.
    expect((await post(`/api/v1/programs/batches/${batchId}/certificates`, { beneficiaryId })).status).toBe(422);

    // 2 of 3 sessions = 66% ≥ 60%, but no score → refused.
    await put(`/api/v1/programs/batches/${batchId}/attendance`, { beneficiaryId, sessionNo: 1, present: true });
    await put(`/api/v1/programs/batches/${batchId}/attendance`, { beneficiaryId, sessionNo: 3, present: true });
    expect((await post(`/api/v1/programs/batches/${batchId}/certificates`, { beneficiaryId })).status).toBe(422);

    // Low post score → refused.
    await put(`/api/v1/programs/batches/${batchId}/scores`, { beneficiaryId, pre: 30, post: 35 });
    expect((await post(`/api/v1/programs/batches/${batchId}/certificates`, { beneficiaryId })).status).toBe(422);

    // Passing score → issued with print payload.
    await put(`/api/v1/programs/batches/${batchId}/scores`, { beneficiaryId, pre: 40, post: 72 });
    const cert = await post(`/api/v1/programs/batches/${batchId}/certificates`, { beneficiaryId });
    expect(cert.status).toBe(201);
    expect(cert.body.certNo).toMatch(/^CERT-\d{4}-0001$/);
    expect(cert.body.batch.code).toMatch(/^TRN-\d{4}-001$/);
    expect(cert.body.beneficiary.nameBn).toBe('রহিমা বেগম');
    expect(cert.body.beneficiary.memberId).toBe(MEMBER_A);

    // Second issue for the same beneficiary → 409.
    expect((await post(`/api/v1/programs/batches/${batchId}/certificates`, { beneficiaryId })).status).toBe(409);

    const list = await get(`/api/v1/programs/certificates?batchId=${batchId}`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.batches[0].projectId).toBe(projectId);
  });

  it('rejects a beneficiary below 60% attendance (1 of 3 sessions)', async () => {
    const { beneficiaryId, batchId } = await seedProject();
    await put(`/api/v1/programs/batches/${batchId}/attendance`, { beneficiaryId, sessionNo: 1, present: true });
    await put(`/api/v1/programs/batches/${batchId}/attendance`, { beneficiaryId, sessionNo: 2, present: false });
    await put(`/api/v1/programs/batches/${batchId}/scores`, { beneficiaryId, pre: 50, post: 80 });
    expect((await post(`/api/v1/programs/batches/${batchId}/certificates`, { beneficiaryId })).status).toBe(422);
  });
});

describe('Role denial', () => {
  it('lets the officer read, enroll and log services but blocks register writes', async () => {
    expect((await get('/api/v1/programs/projects', officer)).status).toBe(200);
    expect((await post('/api/v1/programs/projects', PROJECT, officer)).status).toBe(403);
    expect((await post('/api/v1/programs/batches', { projectId: 'x', titleBn: 'x', trainerName: 'x', startDate: '2026-01-01', endDate: '2026-01-02' }, officer)).status).toBe(403);

    const ben = await post('/api/v1/programs/beneficiaries', BEN, officer);
    expect(ben.status).toBe(201);
  });
});
