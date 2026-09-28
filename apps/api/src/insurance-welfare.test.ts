/**
 * ── Insurance & welfare tests ────────────────────────────────────────────────
 * Credit life policy issuance + premium ledger, death-claim document gating
 * and the BM → AM → HO review ladder, micro-insurance products/enrollments/
 * claims with photo requirement, welfare fund caps + approval matrix + ledger,
 * and the dividend split.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;

const DHAKA = '00000000-0000-4000-8000-0000000000b1';
const POLICY_ID = '00000000-0000-4000-8000-00000000c001';
const ENROLLMENT_ID = '00000000-0000-4000-8000-00000000e001';
const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_B = '00000000-0000-4000-8000-0000000001a2';

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
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

const FULL_DOCS = [
  { id: 'death_certificate', labelBn: 'মৃত্যুসনদ', path: 'docs/death.pdf' },
  { id: 'nominee_nid', labelBn: 'নমিনির এনআইডি', path: 'docs/nid.pdf' },
  { id: 'nominee_proof', labelBn: 'নমিনি প্রমাণ', path: 'docs/proof.pdf' },
];

describe('Credit life insurance (req 1)', () => {
  it('issues a policy with premium and posts the premium ledger entry', async () => {
    const policy = await post('/api/v1/insurance/policies', {
      applicationId: '00000000-0000-4000-8000-000000000000a2',
      loanNumber: 'LO-DHK-0002',
      memberId: MEMBER_B,
      memberName: 'সালমা খাতুন',
      principal: '60000',
      termMonths: 12,
      nomineeName: 'জামাল হোসেন',
      nomineeRelation: 'husband',
    });
    expect(policy.status).toBe(201);
    expect(policy.body.premiumAmount).toBe('600.00'); // 1% of 60000
    expect(policy.body.coverageAmount).toBe('60000.00');
    expect(policy.body.status).toBe('active');

    const ledger = await get('/api/v1/insurance/welfare/ledger?fund=insurance');
    expect(ledger.body.items.some((l: { memo: string }) => l.memo.includes('LO-DHK-0002'))).toBe(true);
  });

  it('blocks a second policy for the same loan', async () => {
    const dup = await post('/api/v1/insurance/policies', {
      applicationId: '00000000-0000-4000-8000-000000000000a1',
      loanNumber: 'LO-DHK-0001',
      memberId: MEMBER_A,
      memberName: 'রহিমা বেগম',
      principal: '100000',
      termMonths: 12,
      nomineeName: 'x',
      nomineeRelation: 'husband',
    });
    expect(dup.status).toBe(409);
  });

  it('submits a death claim only with all required documents', async () => {
    const incomplete = await post('/api/v1/insurance/claims', {
      policyId: POLICY_ID,
      kind: 'death',
      eventDate: '2026-09-20',
      cause: 'natural',
      documents: [FULL_DOCS[0]],
      claimedAmount: '150000',
    });
    expect(incomplete.status).toBe(422);

    const ok = await post('/api/v1/insurance/claims', {
      policyId: POLICY_ID,
      kind: 'death',
      eventDate: '2026-09-20',
      cause: 'natural',
      documents: FULL_DOCS,
      claimedAmount: '150000',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.claimNo).toMatch(/^CL-\d{4}-0001$/);
    expect(ok.body.status).toBe('submitted');
  });

  it('walks the three-level review ladder and pays out', async () => {
    const claim = await post('/api/v1/insurance/claims', {
      policyId: POLICY_ID,
      kind: 'death',
      eventDate: '2026-09-20',
      documents: FULL_DOCS,
      claimedAmount: '150000',
    });
    const id = claim.body.id as string;

    const bm = await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'advance', note: 'শাখা যাচাই সম্পন্ন' });
    expect(bm.body.status).toBe('bm_review');
    const am = await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'advance', note: 'এরিয়া অনুমোদন' });
    expect(am.body.status).toBe('am_review');
    const ho = await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'advance', note: 'প্রধান কার্যালয়' });
    expect(ho.body.status).toBe('ho_review');

    const approve = await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'approve', approvedAmount: '150000' });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('approved');

    const pay = await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'pay' });
    expect(pay.status).toBe(200);
    expect(pay.body.status).toBe('paid');
    expect(pay.body.settlementMode).toBe('payout');

    const ledger = await get('/api/v1/insurance/welfare/ledger?fund=insurance');
    expect(ledger.body.items.some((l: { entryType: string; amount: string }) => l.entryType === 'claim_paid' && l.amount === '150000.00')).toBe(true);

    // Policy is now claimed — no second claim.
    const second = await post('/api/v1/insurance/claims', {
      policyId: POLICY_ID,
      kind: 'death',
      eventDate: '2026-09-21',
      documents: FULL_DOCS,
      claimedAmount: '1000',
    });
    expect(second.status).toBe(409);
  });

  it('settles an approved claim as a loan waiver writing off the portfolio', async () => {
    const claim = await post('/api/v1/insurance/claims', {
      policyId: POLICY_ID,
      kind: 'death',
      eventDate: '2026-09-20',
      documents: FULL_DOCS,
      claimedAmount: '180000',
    });
    const id = claim.body.id as string;
    for (const _ of [1, 2, 3]) await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'advance' });
    await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'approve', approvedAmount: '180000' });
    const waiver = await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'settle_waiver' });
    expect(waiver.body.settlementMode).toBe('waiver');
    const ledger = await get('/api/v1/insurance/welfare/ledger?fund=insurance');
    expect(ledger.body.items.some((l: { entryType: string }) => l.entryType === 'claim_waiver')).toBe(true);
  });

  it('rejects at branch level with a note', async () => {
    const claim = await post('/api/v1/insurance/claims', {
      policyId: POLICY_ID,
      kind: 'death',
      eventDate: '2026-09-20',
      documents: FULL_DOCS,
      claimedAmount: '150000',
    });
    const rejected = await post(`/api/v1/insurance/claims/${claim.body.id}/decision`, { action: 'reject', note: 'নথিতে অমিল' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.decisionNote).toBe('নথিতে অমিল');
  });
});

describe('Micro insurance (req 2)', () => {
  it('lists seeded products and creates a new one (admin)', async () => {
    const list = await get('/api/v1/insurance/micro/products');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(3);

    const created = await post('/api/v1/insurance/micro/products', {
      kind: 'health', nameBn: 'মাতৃ স্বাস্থ্য বীমা', annualPremium: '800', coverageLimit: '40000', units: 1, active: true,
    });
    expect(created.status).toBe(201);
    expect(created.body.nameBn).toBe('মাতৃ স্বাস্থ্য বীমা');
  });

  it('enrolls a member with premium × units', async () => {
    const products = await get('/api/v1/insurance/micro/products?kind=cattle');
    const productId = products.body.items[0].id as string;
    const enr = await post('/api/v1/insurance/micro/enrollments', {
      productId,
      memberId: MEMBER_B,
      memberName: 'সালমা খাতুন',
      units: 3,
      subjectRef: 'গরু #২০১, #২০২, #২০৩',
      startDate: '2026-09-24',
    });
    expect(enr.status).toBe(201);
    expect(enr.body.annualPremium).toBe('1650.00'); // 550 × 3
    expect(enr.body.coverageLimit).toBe('90000.00');
  });

  it('requires photos on a micro claim and computes coverage', async () => {
    const noPhoto = await post('/api/v1/insurance/micro/claims', {
      enrollmentId: ENROLLMENT_ID,
      cause: 'death',
      eventDate: '2026-09-20',
      claimedAmount: '30000',
    });
    expect(noPhoto.status).toBe(422);

    const ok = await post('/api/v1/insurance/micro/claims', {
      enrollmentId: ENROLLMENT_ID,
      cause: 'death',
      eventDate: '2026-09-20',
      photos: ['claims/cow-1.jpg', 'claims/cow-2.jpg'],
      claimedAmount: '25000',
      assessmentNote: 'পশু মারা গেছে, ছবি সংযুক্ত',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.kind).toBe('cattle');
    expect(ok.body.documents).toHaveLength(2);
  });
});

describe('Member & staff welfare fund (req 3, 4)', () => {
  it('returns the rules and defaults', async () => {
    const rules = await get('/api/v1/insurance/welfare/rules');
    expect(rules.status).toBe(200);
    expect(rules.body.rules.grantCapBdt).toBe(5000);
    expect(rules.body.rules.loanCapBdt).toBe(20000);
  });

  it('updates caps (admin) and rejects over-cap requests', async () => {
    const updated = await put('/api/v1/insurance/welfare/rules', { grantCapBdt: 8000 });
    expect(updated.body.rules.grantCapBdt).toBe(8000);

    const over = await post('/api/v1/insurance/welfare/requests', {
      fund: 'member',
      requesterId: MEMBER_A,
      requesterName: 'রহিমা বেগম',
      kind: 'flood',
      type: 'grant',
      amount: '9000',
      reason: 'ঘর ভেঙে গেছে',
    });
    expect(over.status).toBe(422);
  });

  it('routes a grant through BM → approval → disbursement with ledger', async () => {
    const req1 = await post('/api/v1/insurance/welfare/requests', {
      fund: 'member',
      requesterId: MEMBER_A,
      requesterName: 'রহিমা বেগম',
      kind: 'funeral',
      type: 'grant',
      amount: '3000',
      reason: 'স্বামীর অন্ত্যেষ্টিক্রিয়া',
    });
    expect(req1.status).toBe(201);
    expect(req1.body.requestId).toMatch(/^WF-\d{4}-0001$/);
    const id = req1.body.id as string;

    // 3000 ≤ BM limit → BM can approve directly from bm_review
    const advance = await post(`/api/v1/insurance/welfare/requests/${id}/decision`, { action: 'advance' });
    expect(advance.body.status).toBe('bm_review');
    const approve = await post(`/api/v1/insurance/welfare/requests/${id}/decision`, { action: 'approve' });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('approved');

    const disburse = await post(`/api/v1/insurance/welfare/requests/${id}/decision`, { action: 'disburse' });
    expect(disburse.status).toBe(200);
    expect(disburse.body.status).toBe('disbursed');

    const ledger = await get('/api/v1/insurance/welfare/ledger?fund=member_welfare');
    expect(ledger.body.items.some((l: { entryType: string; amount: string }) => l.entryType === 'grant' && l.amount === '3000.00')).toBe(true);
  });

  it('sends a large interest-free loan to the Area Manager first', async () => {
    const loan = await post('/api/v1/insurance/welfare/requests', {
      fund: 'member',
      requesterId: MEMBER_B,
      requesterName: 'সালমা খাতুন',
      kind: 'illness',
      type: 'interest_free_loan',
      amount: '15000',
      reason: 'আপন ভাইয়ের অপারেশন',
    });
    expect(loan.status).toBe(201);
    expect(loan.body.repaymentMonths).toBe(10);
    const id = loan.body.id as string;

    await post(`/api/v1/insurance/welfare/requests/${id}/decision`, { action: 'advance' });
    const earlyApprove = await post(`/api/v1/insurance/welfare/requests/${id}/decision`, { action: 'approve' });
    expect(earlyApprove.status).toBe(409); // above BM limit → AM must review
    const advance2 = await post(`/api/v1/insurance/welfare/requests/${id}/decision`, { action: 'advance' });
    expect(advance2.body.status).toBe('am_review');
    const approve = await post(`/api/v1/insurance/welfare/requests/${id}/decision`, { action: 'approve' });
    expect(approve.status).toBe(200);
  });

  it('serves the staff benevolent fund separately', async () => {
    const staffReq = await post('/api/v1/insurance/welfare/requests', {
      fund: 'staff',
      requesterId: '00000000-0000-4000-8000-0000000000f1',
      requesterName: 'কমল হোসেন',
      kind: 'illness',
      type: 'grant',
      amount: '4000',
      reason: 'জরুরি চিকিৎসা',
    });
    expect(staffReq.status).toBe(201);
    expect(staffReq.body.requestId).toMatch(/^SB-\d{4}-0001$/);

    const summary = await get('/api/v1/insurance/welfare/summary');
    expect(summary.body.staffBalance).toBe('6000.00');
    expect(summary.body.memberBalance).toBe('18000.00');
    expect(summary.body.pendingStaff).toBe(1);

    const staffList = await get('/api/v1/insurance/welfare/requests?fund=staff');
    expect(staffList.body.items).toHaveLength(1);
  });

  it('blocks welfare requests beyond the fund balance', async () => {
    // Member fund has 18000; request a 20000 loan (over balance after pending)
    const tooBig = await post('/api/v1/insurance/welfare/requests', {
      fund: 'member',
      requesterId: MEMBER_A,
      requesterName: 'রহিমা বেগম',
      kind: 'disaster',
      type: 'interest_free_loan',
      amount: '20000',
      reason: 'বাড়ি পুনর্নির্মাণ',
    });
    expect(tooBig.status).toBe(422);
  });

  it('posts fund contributions (admin/accountant)', async () => {
    const contributed = await post('/api/v1/insurance/welfare/contribution', {
      fund: 'staff_benevolent', amount: '600', memo: 'সেপ্টেম্বর কর্তন',
    });
    expect(contributed.status).toBe(201);
    const summary = await get('/api/v1/insurance/welfare/summary');
    expect(summary.body.staffBalance).toBe('6600.00');
  });

  it('denies officer writes on admin endpoints', async () => {
    const rules = await put('/api/v1/insurance/welfare/rules', { grantCapBdt: 9999 }, officer);
    expect(rules.status).toBe(403);
    const product = await post(
      '/api/v1/insurance/micro/products',
      { kind: 'crop', nameBn: 'x', annualPremium: '1', coverageLimit: '1' },
      officer,
    );
    expect(product.status).toBe(403);
  });
});

describe('Dividend', () => {
  it('computes the per-holder split from surplus and shares', async () => {
    const res = await post('/api/v1/insurance/dividend/compute', {
      surplus: '200000',
      payoutPct: 60,
      totalShares: 200,
      holders: [
        { memberId: MEMBER_A, memberName: 'রহিমা', shares: 120 },
        { memberId: MEMBER_B, memberName: 'সালমা', shares: 80 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.pool).toBe('120000.00');
    expect(res.body.reserve).toBe('80000.00');
    expect(res.body.perHolder[0]?.amount).toBe('72000.00');
    expect(res.body.perHolder[1]?.amount).toBe('48000.00');
  });
});
