/**
 * ── HR payroll, PF, performance & discipline tests (req 5–9) ─────────────────
 * Payroll run preview/approve/pay, payslip + bank sheet, PF ledger rules,
 * gratuity, KPI scorecards, appraisals, disciplinary access control, and the
 * self-service summary.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;

const FIELD_OFFICER = '00000000-0000-4000-8000-0000000000f1';
const ACCOUNTANT = '00000000-0000-4000-8000-0000000000f2';
const today = new Date().toISOString().slice(0, 10);
const period = today.slice(0, 7);
const year = today.slice(0, 4);

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const hr = await import('./lib/hr-store.js');
  hr.resetHrDemoStore();
  const payroll = await import('./lib/hr-payroll-store.js');
  payroll.resetHrPayrollStore();
});

const auth = { Authorization: 'Bearer demo-token' };
const officer = { Authorization: 'Bearer demo-token-officer' };
const get = (url: string, headers = auth) => request(createAppRef() as never).get(url).set(headers);
const post = (url: string, body?: unknown, headers = auth) => request(createAppRef() as never).post(url).set(headers).send(body ?? {});
const put = (url: string, body?: unknown, headers = auth) => request(createAppRef() as never).put(url).set(headers).send(body ?? {});

/** Confirm both seeded staff so payroll includes them with full bonus. */
async function confirmBoth(): Promise<void> {
  await post(`/api/v1/hr/staff/${FIELD_OFFICER}/confirm`);
  await post(`/api/v1/hr/staff/${ACCOUNTANT}/confirm`);
}

describe('HR payroll run (req 5)', () => {
  it('previews and creates a draft run with prorated lines and totals', async () => {
    await confirmBoth();
    const r = await post('/api/v1/hr/payroll/runs', { period });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('draft');
    expect(r.body.lines).toHaveLength(3);
    for (const line of r.body.lines) {
      expect(Number(line.gross)).toBeGreaterThan(0);
      expect(line.deductions.pf_employee).toBeDefined();
      expect(Number(line.net)).toBeCloseTo(Number(line.gross) - Number(line.totalDeduction), 2);
    }
    expect(r.body.totalGross).toBe(
      r.body.lines.reduce((a: string, l: { gross: string }) => a + Number(l.gross), 0).toFixed(2),
    );
  });

  it('rejects a duplicate run for the same period (409)', async () => {
    await post('/api/v1/hr/payroll/runs', { period });
    const r = await post('/api/v1/hr/payroll/runs', { period });
    expect(r.status).toBe(409);
  });

  it('walks draft → approved → paid and posts PF contributions on payment', async () => {
    const created = await post('/api/v1/hr/payroll/runs', { period });
    const id = created.body.id as string;
    const approve = await post(`/api/v1/hr/payroll/runs/${id}/decision`, { action: 'approve' });
    expect(approve.body.status).toBe('approved');
    const reApprove = await post(`/api/v1/hr/payroll/runs/${id}/decision`, { action: 'approve' });
    expect(reApprove.status).toBe(409);
    const pay = await post(`/api/v1/hr/payroll/runs/${id}/decision`, { action: 'pay' });
    expect(pay.body.status).toBe('paid');
    const pf = await get(`/api/v1/hr/pf?staffId=${FIELD_OFFICER}`);
    expect(pf.body.items.length).toBeGreaterThan(0);
    expect(pf.body.items[0].type).toBe('contribution');
    expect(Number(pf.body.items[0].employerAmount)).toBeGreaterThan(0);
  });

  it('blocks paying an unapproved run (409)', async () => {
    const created = await post('/api/v1/hr/payroll/runs', { period });
    const r = await post(`/api/v1/hr/payroll/runs/${created.body.id}/decision`, { action: 'pay' });
    expect(r.status).toBe(409);
  });

  it('serves a Bangla payslip and a bank sheet with masked accounts', async () => {
    const created = await post('/api/v1/hr/payroll/runs', { period });
    const id = created.body.id as string;
    const slip = await get(`/api/v1/hr/payroll/runs/${id}/payslip/${FIELD_OFFICER}`);
    expect(slip.status).toBe(200);
    expect(slip.body.text).toContain('বেতন স্লিপ');
    expect(slip.body.line.staffCode).toBe('EMP-DHK-0001');
    const sheet = await get(`/api/v1/hr/payroll/runs/${id}/bank-sheet`);
    expect(sheet.body.items).toHaveLength(3);
    expect(sheet.body.items[0].accountMasked).toMatch(/····/);
  });

  it('validates the period format (400)', async () => {
    const r = await post('/api/v1/hr/payroll/runs', { period: '2026/09' });
    expect(r.status).toBe(400);
  });
});

describe('PF ledger & gratuity (req 6)', () => {
  it('rejects withdrawals above the balance (422)', async () => {
    const r = await post('/api/v1/hr/pf', {
      staffId: ACCOUNTANT,
      type: 'withdrawal',
      employeeAmount: '5000.00',
      employerAmount: '0.00',
    });
    expect(r.status).toBe(422);
  });

  it('records a contribution and a withdrawal with running balance', async () => {
    const c = await post('/api/v1/hr/pf', {
      staffId: ACCOUNTANT,
      type: 'contribution',
      period,
      employeeAmount: '900.00',
      employerAmount: '900.00',
      note: 'manual',
    });
    expect(c.status).toBe(201);
    expect(c.body.balanceAfter).toBe('1800.00');
    const w = await post('/api/v1/hr/pf', {
      staffId: ACCOUNTANT,
      type: 'withdrawal',
      employeeAmount: '500.00',
      employerAmount: '0.00',
    });
    expect(w.status).toBe(201);
    expect(w.body.balanceAfter).toBe('1300.00');
  });

  it('computes a gratuity settlement from joining date and basic', async () => {
    const r = await post('/api/v1/hr/pf/gratuity', {
      staffId: ACCOUNTANT,
      leavingDate: today,
    });
    expect(r.status).toBe(201);
    expect(Number(r.body.amount)).toBeGreaterThan(0);
    expect(Number(r.body.years)).toBeGreaterThanOrEqual(1);
  });
});

describe('Performance (req 7)', () => {
  it('scores KPI actuals and grades the card', async () => {
    const r = await put(`/api/v1/hr/performance/kpi/${FIELD_OFFICER}/${period}`, {
      collection_rate: 1.0,
      par: 0.02,
      new_members: 9,
      meeting_attendance: 0.95,
    });
    expect(r.status).toBe(201);
    expect(r.body.scores.collection_rate).toBe(100);
    expect(r.body.grade).toBe('A');
    const list = await get(`/api/v1/hr/performance/kpi?staffId=${FIELD_OFFICER}`);
    expect(list.body.items).toHaveLength(1);
  });

  it('upserts the same month instead of duplicating', async () => {
    await put(`/api/v1/hr/performance/kpi/${FIELD_OFFICER}/${period}`, {
      collection_rate: 0.9,
      par: 0.05,
      new_members: 2,
      meeting_attendance: 0.8,
    });
    await put(`/api/v1/hr/performance/kpi/${FIELD_OFFICER}/${period}`, {
      collection_rate: 1.0,
      par: 0.0,
      new_members: 10,
      meeting_attendance: 1,
    });
    const list = await get(`/api/v1/hr/performance/kpi`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].grade).toBe('A');
  });

  it('creates and reviews a yearly appraisal', async () => {
    const created = await post('/api/v1/hr/performance/appraisals', {
      staffId: FIELD_OFFICER,
      year,
      scores: { job_knowledge: 8, discipline: 9, teamwork: 7, client_service: 8, target_achievement: 8 },
      comments: 'ভালো কর্মক্ষমতা',
    });
    expect(created.status).toBe(201);
    expect(Number(created.body.rating)).toBe(80);
    const reviewed = await post(`/api/v1/hr/performance/appraisals/${created.body.id}/review`, { note: 'গৃহীত' });
    expect(reviewed.body.status).toBe('reviewed');
    const dupe = await post('/api/v1/hr/performance/appraisals', {
      staffId: FIELD_OFFICER,
      year,
      scores: { job_knowledge: 5, discipline: 5, teamwork: 5, client_service: 5, target_achievement: 5 },
    });
    expect(dupe.status).toBe(409);
  });
});

describe('Disciplinary (req 8, HR/Director only)', () => {
  it('lets the admin open a case and fetch bilingual letters', async () => {
    const created = await post('/api/v1/hr/discipline', {
      staffId: FIELD_OFFICER,
      severity: 'written_warning',
      incidentDate: today,
      description: 'ধারাবাহিক সভা মিস করেছেন',
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('open');
    const letter = await get(`/api/v1/hr/discipline/${created.body.id}/letter`);
    expect(letter.body.bn).toContain('সতর্কতা পত্র');
    expect(letter.body.en).toContain('WARNING LETTER');
  });

  it('closes a case with explanation and outcome (one-shot)', async () => {
    const created = await post('/api/v1/hr/discipline', {
      staffId: FIELD_OFFICER,
      severity: 'verbal_warning',
      incidentDate: today,
      description: 'অভিযোগ',
    });
    const closed = await post(`/api/v1/hr/discipline/${created.body.id}/close`, {
      explanation: 'ব্যাখ্যা দেওয়া হয়েছে',
      outcome: 'সতর্ক করা হলো',
    });
    expect(closed.body.status).toBe('closed');
    const again = await post(`/api/v1/hr/discipline/${created.body.id}/close`, {
      explanation: 'আবার ব্যাখ্যা',
      outcome: 'আবার সতর্ক',
    });
    expect(again.status).toBe(409);
  });

  it('denies the field-officer role access (403)', async () => {
    const list = await get('/api/v1/hr/discipline', officer);
    expect(list.status).toBe(403);
    const create = await post(
      '/api/v1/hr/discipline',
      { staffId: FIELD_OFFICER, severity: 'verbal_warning', incidentDate: today, description: 'সভা মিস' },
      officer,
    );
    expect(create.status).toBe(403);
  });
});

describe('Self-service (req 9)', () => {
  it('returns payslips, leave balance, PF and documents for a staff member', async () => {
    await confirmBoth();
    await post('/api/v1/hr/payroll/runs', { period });
    await post('/api/v1/hr/pf', { staffId: ACCOUNTANT, type: 'contribution', period, employeeAmount: '700.00', employerAmount: '700.00' });
    const s = await get(`/api/v1/hr/self-service?staffId=${ACCOUNTANT}`);
    expect(s.status).toBe(200);
    expect(s.body.staffCode).toBe('EMP-DHK-0002');
    expect(s.body.payslips).toHaveLength(1);
    expect(s.body.payslips[0].status).toBe('draft');
    expect(s.body.leaveBalance.casual.entitlement).toBe(10);
    expect(Number(s.body.pfBalance)).toBe(1400);
    expect(Array.isArray(s.body.documents)).toBe(true);
  });

  it('blocks an officer token from reading another staff member (403)', async () => {
    const r = await get(`/api/v1/hr/self-service?staffId=${ACCOUNTANT}`, officer);
    expect(r.status).toBe(403);
    const own = await get('/api/v1/hr/self-service', officer);
    expect(own.status).toBe(200);
    expect(own.body.staffCode).toBe('EMP-DHK-0001');
  });
});
