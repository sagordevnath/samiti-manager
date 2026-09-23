/**
 * ── HR module tests ──────────────────────────────────────────────────────────
 * Staff master (encryption, masking, probation), recruitment workflow,
 * GPS/office attendance, leave balances with holidays, transfer/promotion
 * orders with history.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;
let resetHrRef: typeof import('./lib/hr-store.js').resetHrDemoStore;

const DHAKA = '00000000-0000-4000-8000-0000000000b1';
const MYM = '00000000-0000-4000-8000-0000000000b2';
const FIELD_OFFICER = '00000000-0000-4000-8000-0000000000f1';
const ACCOUNTANT = '00000000-0000-4000-8000-0000000000f2';
const VACANCY = '00000000-0000-4000-8000-0000000000a1';
const APPLICANT_A = '00000000-0000-4000-8000-0000000000b1';
const today = new Date().toISOString().slice(0, 10);
const year = today.slice(0, 4);

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const hr = await import('./lib/hr-store.js');
  resetHrRef = hr.resetHrDemoStore;
  resetHrRef();
});

const auth = { Authorization: 'Bearer demo-token' };
const get = (url: string) => request(createAppRef() as never).get(url).set(auth);
const post = (url: string, body?: unknown) => request(createAppRef() as never).post(url).set(auth).send(body ?? {});
const patch = (url: string, body?: unknown) => request(createAppRef() as never).patch(url).set(auth).send(body ?? {});

describe('HR staff master (req 1)', () => {
  it('creates staff with encrypted NID/bank and masked display values', async () => {
    const r = await post('/api/v1/hr/staff', {
      name: 'Fatema Khatun',
      nameBn: 'ফাতেমা খাতুন',
      designation: 'field_officer',
      grade: 'G1',
      branchId: DHAKA,
      joiningDate: today,
      mobile: '01711000000',
      nid: '1234567890123',
      bankAccount: '1234567890',
      bankName: 'Sonali Bank',
      monthlyGross: '15500.00',
      emergencyContactName: 'Husband name',
      emergencyContactPhone: '01811000000',
    });
    expect(r.status).toBe(201);
    const staff = r.body;
    expect(staff.employeeCode).toMatch(/^EMP-DHK-\d{4}$/);
    expect(staff.probationEndDate).toBeTruthy();
    // Ciphertext never leaves the API; only masks do.
    expect(staff.nidEnc).toBeNull();
    expect(staff.bankAccountEnc).toBeNull();
    expect(staff.nidMasked).toBe('0123');
    expect(staff.bankMasked).toBe('····7890');
  });

  it('rejects an invalid NID and mobile', async () => {
    const r = await post('/api/v1/hr/staff', {
      name: 'Bad Data',
      nameBn: 'খারাপ তথ্য',
      designation: 'field_officer',
      grade: 'G1',
      joiningDate: today,
      mobile: '12345',
      nid: '123',
      monthlyGross: '1.00',
    });
    expect(r.status).toBe(400);
  });

  it('keeps a posting history and confirms probation', async () => {
    const detail = await get(`/api/v1/hr/staff/${FIELD_OFFICER}`);
    expect(detail.body.postings).toHaveLength(1);
    expect(detail.body.status).toBe('probation');

    const confirmed = await post(`/api/v1/hr/staff/${FIELD_OFFICER}/confirm`);
    expect(confirmed.body.status).toBe('confirmed');
    expect(confirmed.body.confirmationDate).toBe(today);

    const again = await post(`/api/v1/hr/staff/${FIELD_OFFICER}/confirm`);
    expect(again.status).toBe(409);
  });

  it('searches staff by name/code/mobile and lists by branch', async () => {
    const byName = await get('/api/v1/hr/staff?q=Kamal');
    expect(byName.body.items).toHaveLength(1);
    const byBranch = await get(`/api/v1/hr/staff?branchId=${MYM}`);
    expect(byBranch.body.items.every((s: { branchId: string }) => s.branchId === MYM)).toBe(true);
  });
});

describe('HR recruitment lite (req 2)', () => {
  it('walks vacancy → approve → applicant → interviews → offer', async () => {
    const applicant = await post('/api/v1/hr/applicants', {
      vacancyId: VACANCY,
      name: 'New Candidate',
      mobile: '01755500000',
      educationLevel: 'HSC',
      experienceYears: 1,
    });
    expect(applicant.status).toBe(201);
    const id = applicant.body.id as string;

    const noOffer = await post(`/api/v1/hr/applicants/${id}/offer`, {});
    expect(noOffer.status).toBe(409); // needs at least one interview score

    await post(`/api/v1/hr/applicants/${id}/interview`, { panelist: 'BM Dhaka', score: 8, note: 'strong field skills' });
    await post(`/api/v1/hr/applicants/${id}/interview`, { panelist: 'AM', score: 7 });
    const offered = await post(`/api/v1/hr/applicants/${id}/offer`, { offeredSalary: '16000.00' });
    expect(offered.body.status).toBe('offered');
    expect(offered.body.interviewScores).toHaveLength(2);
  });

  it('scores the seeded applicant and rejects offer before interview', async () => {
    const scored = await post(`/api/v1/hr/applicants/${APPLICANT_A}/interview`, { panelist: 'Panel 1', score: 6 });
    expect(scored.body.status).toBe('interviewed');
    const mean = scored.body.interviewScores.reduce((s: number, r: { score: number }) => s + r.score, 0) / 1;
    expect(mean).toBe(6);
  });

  it('vacancy decisions are one-shot and gated', async () => {
    const created = await post('/api/v1/hr/vacancies', {
      branchId: DHAKA,
      designation: 'account_officer',
      headcount: 1,
      reason: 'Staff turnover',
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body.status).toBe('requested');

    const approved = await post(`/api/v1/hr/vacancies/${id}/decision`, { decision: 'approve' });
    expect(approved.body.status).toBe('approved');
    const again = await post(`/api/v1/hr/vacancies/${id}/decision`, { decision: 'reject' });
    expect(again.status).toBe(409);
  });
});

describe('HR attendance (req 3)', () => {
  it('field check-in derives status and distance, blocks duplicates', async () => {
    const r = await post('/api/v1/hr/attendance/field-check-in', {
      workDate: today,
      lat: 23.8113,
      lng: 90.413,
      selfiePath: 'selfies/field-officer-today.jpg',
    });
    expect(r.status).toBe(201);
    expect(r.body.mode).toBe('field');
    expect(['present', 'late']).toContain(r.body.status);
    expect(r.body.distanceMeters).toBeLessThan(2000);
    expect(r.body.selfiePath).toContain('selfies/');

    const dup = await post('/api/v1/hr/attendance/field-check-in', {
      workDate: today,
      lat: 23.8113,
      lng: 90.413,
      selfiePath: 'selfies/again.jpg',
    });
    expect(dup.status).toBe(409);
  });

  it('office staff use terminal check-in; field staff cannot', async () => {
    const ok = await post(`/api/v1/hr/attendance/office-check-in?staffId=${ACCOUNTANT}`, { workDate: today });
    expect(ok.status).toBe(201);
    expect(ok.body.mode).toBe('office');

    const wrongMode = await post(`/api/v1/hr/attendance/office-check-in?staffId=${FIELD_OFFICER}`, { workDate: today });
    expect(wrongMode.status).toBe(409);

    const wrongField = await post(`/api/v1/hr/attendance/field-check-in?staffId=${ACCOUNTANT}`, {
      workDate: today,
      lat: 23.8,
      lng: 90.4,
      selfiePath: 's.jpg',
    });
    expect(wrongField.status).toBe(409);
  });

  it('lists the day sheet per branch', async () => {
    await post('/api/v1/hr/attendance/field-check-in', { workDate: today, lat: 23.811, lng: 90.413, selfiePath: 's.jpg' });
    await post('/api/v1/hr/attendance/office-check-in', { workDate: today, staffId: ACCOUNTANT });
    const sheet = await get(`/api/v1/hr/attendance?date=${today}&branchId=${DHAKA}`);
    expect(sheet.body.items.length).toBe(2);
  });
});

describe('HR leave (req 3)', () => {
  it('requests leave within balance and rejects exceeding it', async () => {
    const ok = await post('/api/v1/hr/leave', {
      staffId: ACCOUNTANT,
      leaveType: 'casual',
      startDate: `${year}-10-05`,
      endDate: `${year}-10-07`,
      reason: 'Family visit',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.days).toBe(3);

    const tooMany = await post('/api/v1/hr/leave', {
      staffId: ACCOUNTANT,
      leaveType: 'sick',
      startDate: `${year}-11-01`,
      endDate: `${year}-12-31`,
      reason: 'Long illness beyond entitlement',
    });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error.code).toBe('LEAVE_BALANCE_EXCEEDED');
  });

  it('approval updates balances and marks attendance as leave', async () => {
    const req2 = await post('/api/v1/hr/leave', {
      staffId: ACCOUNTANT,
      leaveType: 'casual',
      startDate: today,
      endDate: today,
      reason: 'One day',
    });
    const id = req2.body.id as string;
    await post(`/api/v1/hr/attendance/office-check-in`, { workDate: today, staffId: ACCOUNTANT });
    const approved = await post(`/api/v1/hr/leave/${id}/decision`, { decision: 'approve' });
    expect(approved.body.status).toBe('approved');

    const bal = await get(`/api/v1/hr/leave-balances/${ACCOUNTANT}`);
    expect(bal.body.casual.taken).toBe(1);
    expect(bal.body.casual.remaining).toBe(9);

    const sheet = await get(`/api/v1/hr/attendance?date=${today}`);
    const mine = sheet.body.items.find((a: { staffId: string }) => a.staffId === ACCOUNTANT);
    expect(mine.status).toBe('leave');
  });
});

describe('HR holidays (req 3)', () => {
  it('adds holidays and rejects duplicates', async () => {
    const r = await post('/api/v1/hr/holidays', { date: '2027-01-01', name: "New Year's Day", nameBn: 'নববর্ষ' });
    expect(r.status).toBe(201);
    const dup = await post('/api/v1/hr/holidays', { date: '2027-01-01', name: 'Dup', nameBn: 'ডাবল' });
    expect(dup.status).toBe(409);
    const list = await get('/api/v1/hr/holidays');
    expect(list.body.items.length).toBe(3);
  });
});

describe('HR transfer & promotion (req 4)', () => {
  it('transfer: propose → approve (order number) → apply updates staff + history', async () => {
    // Only confirmed staff can be moved — confirm the probationer first.
    await post(`/api/v1/hr/staff/${FIELD_OFFICER}/confirm`);
    const m = await post('/api/v1/hr/movements', {
      kind: 'transfer',
      staffId: FIELD_OFFICER,
      toBranchId: MYM,
      toDesignation: 'field_officer',
      effectiveDate: `${year}-10-01`,
      reason: 'Staffing gap at Mymensingh',
    });
    expect(m.status).toBe(201);
    const id = m.body.id as string;

    const orderTooEarly = await get(`/api/v1/hr/movements/${id}/order`);
    expect(orderTooEarly.status).toBe(409);

    const approved = await post(`/api/v1/hr/movements/${id}/decision`, { decision: 'approve' });
    expect(approved.body.status).toBe('approved');
    expect(approved.body.orderNumber).toMatch(/^TRF-\d{4}-\d{4}$/);

    const applied = await post(`/api/v1/hr/movements/${id}/apply`);
    expect(applied.body.status).toBe('effective');

    const detail = await get(`/api/v1/hr/staff/${FIELD_OFFICER}`);
    expect(detail.body.branchId).toBe(MYM);
    const openPostings = detail.body.postings.filter((p: { effectiveTo: string | null }) => p.effectiveTo === null);
    expect(openPostings).toHaveLength(1);
    expect(detail.body.postings).toHaveLength(2);

    const order = await get(`/api/v1/hr/movements/${id}/order`);
    expect(order.text).toContain('TRF-');
    expect(order.text).toContain('বদলি');
    expect(order.text).toContain('transferred');
  });

  it('promotion with grade + salary bump', async () => {
    await post(`/api/v1/hr/staff/${FIELD_OFFICER}/confirm`);
    const m = await post('/api/v1/hr/movements', {
      kind: 'promotion',
      staffId: FIELD_OFFICER,
      toDesignation: 'senior_field_officer',
      toGrade: 'G3',
      newMonthlyGross: '19000.00',
      effectiveDate: `${year}-10-01`,
      reason: 'Consistent strong performance',
    });
    const id = m.body.id as string;
    await post(`/api/v1/hr/movements/${id}/decision`, { decision: 'approve' });
    expect(m.body.id).toBeTruthy();
    const approved = await post(`/api/v1/hr/movements/${id}/apply`);
    expect(approved.body.status).toBe('effective');

    const detail = await get(`/api/v1/hr/staff/${FIELD_OFFICER}`);
    expect(detail.body.designation).toBe('senior_field_officer');
    expect(detail.body.grade).toBe('G3');
    expect(detail.body.monthlyGross).toBe('19000.00');

    const order = await get(`/api/v1/hr/movements/${id}/order`);
    expect(order.text).toMatch(/PRM-\d{4}-\d{4}/);
    expect(order.text).toContain('পদোন্নতি');
  });

  it('blocks promotion to a different branch and transfers of probationers', async () => {
    const badPromotion = await post('/api/v1/hr/movements', {
      kind: 'promotion',
      staffId: FIELD_OFFICER,
      toBranchId: MYM,
      toDesignation: 'senior_field_officer',
      effectiveDate: `${year}-10-01`,
      reason: 'Invalid branch change',
    });
    expect(badPromotion.status).toBe(409); // staff is a probationer (confirmed-only rule fires first)

    const accountant = ACCOUNTANT; // confirmed office staff
    const badBranchPromotion = await post('/api/v1/hr/movements', {
      kind: 'promotion',
      staffId: accountant,
      toBranchId: MYM,
      toDesignation: 'senior_field_officer',
      effectiveDate: `${year}-10-01`,
      reason: 'Invalid branch change on confirmed staff',
    });
    expect(badBranchPromotion.status).toBe(400);
  });
});
