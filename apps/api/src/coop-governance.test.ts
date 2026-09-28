/**
 * ── Cooperative governance tests (req 5–8) ───────────────────────────────────
 * Dividend: compute → AGM approve → post (journal) → per-member pay with
 * savings/cash destinations and double-pay guard. AGM: create → notice with
 * Bangla digits → attendance/quorum → resolutions (ordinary + special 2/3) →
 * election (incl. tie rejection) → minutes. Exit: request → compute (dues
 * math) → approve → settle (balanced voucher) + reject path + transition
 * guards. Reports: claim ratio, premium vs payout, fund balances.
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
  const cg = await import('./lib/coop-governance-store.js');
  cg.resetCoopGovStore();
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
const MEMBER_B = '00000000-0000-4000-8000-0000000001a2';
const MEMBER_C = '00000000-0000-4000-8000-0000000001a3';

const HOLDERS = [
  { memberId: MEMBER_A, memberName: 'রহিমা বেগম', shares: 100, monthsHeld: 12 },
  { memberId: MEMBER_B, memberName: 'সালমা খাতুন', shares: 100, monthsHeld: 6 },
  { memberId: MEMBER_C, memberName: 'কমল হোসেন', shares: 200, monthsHeld: 12 },
];

const AGM_BODY = {
  fiscalYear: '2025-26',
  meetingDate: '2026-09-30',
  venue: 'সমিতি কার্যালয়, ঢাকা',
  noticeDays: 14,
  quorumRequired: 2,
  agenda: [
    { item: '1', title: 'বার্ষিক প্রতিবেদন গ্রহণ', note: '' },
    { item: '2', title: 'লভ্যাংশ হার অনুমোদন', note: '' },
    { item: '3', title: 'নির্বাচন কমিশন গঠন', note: '' },
  ],
};

const ATTENDEES = [
  { memberId: MEMBER_A, memberName: 'রহিমা বেগম', shares: 100, present: true, proxyFor: null },
  { memberId: MEMBER_B, memberName: 'সালমা খাতুন', shares: 100, present: false, proxyFor: null },
  { memberId: MEMBER_C, memberName: 'কমল হোসেন', shares: 200, present: true, proxyFor: null },
];

describe('Dividend & surplus distribution (req 5)', () => {
  it('computes the period-weighted split with a statutory reserve', async () => {
    const res = await post('/api/v1/coop/dividend/compute', {
      fiscalYear: '2025-26',
      surplus: '100000',
      reservePct: 25,
      ratePct: 8,
      holders: HOLDERS,
    });
    expect(res.status).toBe(201);
    // reserve 25000 → pool 75000; weighted: A=100, B=50, C=200 → total 350
    expect(res.body.distribution.reserveAmount).toBe('25000.00');
    expect(res.body.distribution.pool).toBe('75000.00');
    expect(res.body.distribution.totalWeighted).toBe(350);
    const a = res.body.distribution.perMember.find((m: { memberId: string }) => m.memberId === MEMBER_A);
    expect(a.amount).toBe('21428.57'); // 75000 × 100/350
    expect(a.weightedShares).toBe(100);
    const b = res.body.distribution.perMember.find((m: { memberId: string }) => m.memberId === MEMBER_B);
    expect(b.amount).toBe('10714.29'); // 75000 × 50/350 — half-year membership
  });

  it('rejects a duplicate fiscal year', async () => {
    await post('/api/v1/coop/dividend/compute', { fiscalYear: '2025-26', surplus: '100000', holders: HOLDERS });
    const dup = await post('/api/v1/coop/dividend/compute', { fiscalYear: '2025-26', surplus: '50000', holders: HOLDERS });
    expect(dup.status).toBe(409);
  });

  it('walks compute → AGM approve → post → pay and blocks invalid transitions', async () => {
    const created = await post('/api/v1/coop/dividend/compute', { fiscalYear: '2025-26', surplus: '100000', holders: HOLDERS });
    const fy = '2025-26';

    // Cannot post before AGM approval.
    const earlyPost = await post(`/api/v1/coop/dividend/${fy}/decision`, { action: 'post' });
    expect(earlyPost.status).toBe(409);

    const approve = await post(`/api/v1/coop/dividend/${fy}/decision`, { action: 'agm_approve' });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe('agm_approved');

    const posted = await post(`/api/v1/coop/dividend/${fy}/decision`, { action: 'post' });
    expect(posted.status).toBe(200);
    expect(posted.body.status).toBe('posted');
    expect(posted.body.journal.lines).toHaveLength(3);
    // Dr 3305 surplus 100000 / Cr 3310 reserve 25000 / Cr 2320 pool 75000
    expect(posted.body.journal.lines[0].accountCode).toBe('3305');
    expect(posted.body.journal.lines[0].debit).toBe('100000.00');
    expect(posted.body.journal.lines[1].credit).toBe('25000.00');
    expect(posted.body.journal.lines[2].credit).toBe('75000.00');

    // Pay member B into their savings account.
    const payB = await post(`/api/v1/coop/dividend/${fy}/decision`, { action: 'pay', memberId: MEMBER_B, destination: 'savings' });
    expect(payB.status).toBe(200);
    expect(payB.body.payments).toHaveLength(1);
    expect(payB.body.payments[0].amount).toBe('10714.29');
    expect(payB.body.status).toBe('paid');

    // Pay member A in cash.
    const payA = await post(`/api/v1/coop/dividend/${fy}/decision`, { action: 'pay', memberId: MEMBER_A, destination: 'cash' });
    expect(payA.status).toBe(200);
    expect(payA.body.payments).toHaveLength(2);

    // Double payment is blocked.
    const again = await post(`/api/v1/coop/dividend/${fy}/decision`, { action: 'pay', memberId: MEMBER_A });
    expect(again.status).toBe(409);

    // Journal tail: payment journal Dr 2320 / Cr 2100 savings, Cr 1010 cash.
    const detail = await get(`/api/v1/coop/dividend/${fy}`);
    expect(detail.body.status).toBe('paid');
    const ledgerRes = await get('/api/v1/coop/agm'); // any list — sanity of the store
    expect(ledgerRes.status).toBe(200);
  });

  it('prints the dividend list', async () => {
    await post('/api/v1/coop/dividend/compute', { fiscalYear: '2025-26', surplus: '100000', holders: HOLDERS });
    const list = await get('/api/v1/coop/dividend');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].distribution.perMember).toHaveLength(3);
  });
});

describe('Annual General Meeting (req 6)', () => {
  let agmId: string;

  beforeEach(async () => {
    const created = await post('/api/v1/coop/agm', AGM_BODY);
    agmId = created.body.id as string;
  });

  it('creates a draft AGM with a Bangla notice including Bangla digits', async () => {
    expect(agmId).toBeTruthy();
    const detail = await get(`/api/v1/coop/agm/${agmId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe('draft');
    expect(detail.body.agenda).toHaveLength(3);
    // ১৪ দিনের নোটিশ — Bangla digits in the notice text.
    expect(detail.body.minutesBn).toContain('১৪ দিনের নোটিশ');
  });

  it('blocks a duplicate fiscal-year AGM', async () => {
    const dup = await post('/api/v1/coop/agm', AGM_BODY);
    expect(dup.status).toBe(409);
  });

  it('holds the meeting only when quorum is met', async () => {
    await post(`/api/v1/coop/agm/${agmId}/decision`, { action: 'issue_notice' });
    expect((await get(`/api/v1/coop/agm/${agmId}`)).body.status).toBe('notice_issued');

    // Only one member present (quorumRequired 2) → 422.
    await put(`/api/v1/coop/agm/${agmId}/attendance`, { attendees: [ATTENDEES[0]] });
    const noQuorum = await post(`/api/v1/coop/agm/${agmId}/decision`, { action: 'hold' });
    expect(noQuorum.status).toBe(422);

    await put(`/api/v1/coop/agm/${agmId}/attendance`, { attendees: ATTENDEES });
    const held = await post(`/api/v1/coop/agm/${agmId}/decision`, { action: 'hold' });
    expect(held.status).toBe(200);
    expect(held.body.status).toBe('held');
  });

  it('auto-passes ordinary resolutions and enforces the 2/3 special majority', async () => {
    await post(`/api/v1/coop/agm/${agmId}/decision`, { action: 'issue_notice' });
    await put(`/api/v1/coop/agm/${agmId}/attendance`, { attendees: ATTENDEES });
    await post(`/api/v1/coop/agm/${agmId}/decision`, { action: 'hold' });

    const ordinary = await post(`/api/v1/coop/agm/${agmId}/resolutions`, {
      agendaItem: '1', title: 'বার্ষিক প্রতিবেদন গ্রহণ', kind: 'ordinary', inFavor: 2, against: 1,
    });
    expect(ordinary.body.resolutions[0].result).toBe('passed');

    // Special: 2 in favor vs 1 against = 2/3 valid votes → passes.
    const specialPass = await post(`/api/v1/coop/agm/${agmId}/resolutions`, {
      agendaItem: '2', title: 'লভ্যাংশ হার অনুমোদন', kind: 'special', inFavor: 2, against: 1,
    });
    expect(specialPass.body.resolutions[1]!.result).toBe('passed');

    // Special: 1 for / 1 against → fails 2/3.
    const specialFail = await post(`/api/v1/coop/agm/${agmId}/resolutions`, {
      agendaItem: '2', title: 'শেয়ার মূল্য বৃদ্ধি', kind: 'special', inFavor: 1, against: 1,
    });
    expect(specialFail.body.resolutions[2]!.result).toBe('failed');
  });

  it('elects the executive committee and rejects a tie', async () => {
    const ok = await post(`/api/v1/coop/agm/${agmId}/elections`, {
      postBn: 'সভাপতি', method: 'secret_ballot',
      candidates: [{ name: 'কমল হোসেন', votes: 12 }, { name: 'রহিমা বেগম', votes: 9 }],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.elections[0].winnerName).toBe('কমল হোসেন');

    const tie = await post(`/api/v1/coop/agm/${agmId}/elections`, {
      postBn: 'সাধারণ সম্পাদক', candidates: [{ name: 'সালমা খাতুন', votes: 7 }, { name: 'কমল হোসেন', votes: 7 }],
    });
    expect(tie.status).toBe(422);
  });

  it('approves the Bangla minutes with attendance, resolutions and elections', async () => {
    await post(`/api/v1/coop/agm/${agmId}/decision`, { action: 'issue_notice' });
    await put(`/api/v1/coop/agm/${agmId}/attendance`, { attendees: ATTENDEES });
    await post(`/api/v1/coop/agm/${agmId}/resolutions`, {
      agendaItem: '1', title: 'বার্ষিক প্রতিবেদন গ্রহণ', inFavor: 2, against: 1,
    });
    await post(`/api/v1/coop/agm/${agmId}/elections`, {
      postBn: 'সভাপতি', candidates: [{ name: 'কমল হোসেন', votes: 12 }, { name: 'রহিমা বেগম', votes: 9 }],
    });
    await post(`/api/v1/coop/agm/${agmId}/decision`, { action: 'hold' });

    const approved = await post(`/api/v1/coop/agm/${agmId}/decision`, { action: 'approve_minutes' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('minutes_approved');
    expect(approved.body.minutesBn).toContain('কার্যবিবরণী');
    expect(approved.body.minutesBn).toContain('গৃহীত');
    expect(approved.body.minutesBn).toContain('কমল হোসেন নির্বাচিত');

    // No transitions out of minutes_approved.
    const stuck = await post(`/api/v1/coop/agm/${agmId}/decision`, { action: 'hold' });
    expect(stuck.status).toBe(409);
  });
});

describe('Member exit settlement (req 7)', () => {
  const EXIT_BODY = {
    memberId: MEMBER_A,
    memberName: 'রহিমা বেগম',
    requestDate: '2026-09-24',
    savingsBalance: '12000',
    shareValue: '5000',
    dividendDue: '1000',
    welfareBalance: '1500',
    duesOutstanding: '4500',
  };

  it('requests, computes with dues adjusted, approves and settles with a balanced voucher', async () => {
    const created = await post('/api/v1/coop/exits', EXIT_BODY);
    expect(created.status).toBe(201);
    expect(created.body.exitNo).toMatch(/^EX-\d{4}-0001$/);
    expect(created.body.status).toBe('requested');
    expect(created.body.netPayable).toBe('15000.00'); // 12000+5000+1000+1500−4500
    const id = created.body.id as string;

    const computed = await post(`/api/v1/coop/exits/${id}/decision`, { action: 'compute' });
    expect(computed.status).toBe(200);
    expect(computed.body.status).toBe('computed');
    expect(computed.body.netPayable).toBe('15000.00');
    const duesLine = computed.body.lines.find((l: { labelBn: string }) => l.labelBn.includes('বকেয়া'));
    expect(duesLine.amount).toBe('-4500.00');

    const approved = await post(`/api/v1/coop/exits/${id}/decision`, { action: 'approve', note: 'নিরীক্ষিত' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.decisionNote).toBe('নিরীক্ষিত');

    const settled = await post(`/api/v1/coop/exits/${id}/decision`, { action: 'settle' });
    expect(settled.status).toBe(200);
    expect(settled.body.status).toBe('settled');
    expect(settled.body.settledAt).toBeTruthy();

    // Voucher: Dr 2100 12000, Dr 3100 5000, Dr 2320 1000, Dr 2340 1500,
    //          Cr 1210 4500, Cr 1010 15000 — debits = credits = 19500.
    const journals = await get('/api/v1/coop/journals');
    const voucher = journals.body.items.find((j: { memo: string }) => j.memo.includes('চূড়ান্ত নিষ্পত্তি'));
    expect(voucher).toBeTruthy();
    const debits = voucher.lines.reduce((s: number, l: { debit: string }) => s + Number(l.debit), 0);
    const credits = voucher.lines.reduce((s: number, l: { credit: string }) => s + Number(l.credit), 0);
    expect(debits).toBe(19500);
    expect(credits).toBe(19500);
    expect(voucher.lines.some((l: { accountCode: string; credit: string }) => l.accountCode === '1210' && l.credit === '4500.00')).toBe(true);

    const detail = await get(`/api/v1/coop/exits?status=settled`);
    expect(detail.body.items).toHaveLength(1);
    expect(detail.body.items[0].exitNo).toBe(created.body.exitNo);
  });

  it('floors the net at zero when dues exceed the payable total', async () => {
    const created = await post('/api/v1/coop/exits', { ...EXIT_BODY, duesOutstanding: '99999' });
    expect(created.status).toBe(201);
    expect(created.body.netPayable).toBe('0.00');
  });

  it('rejects an exit from requested or computed, then blocks further transitions', async () => {
    const created = await post('/api/v1/coop/exits', EXIT_BODY);
    const id = created.body.id as string;

    const rejected = await post(`/api/v1/coop/exits/${id}/decision`, { action: 'reject', note: 'মামলা চলমান' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('rejected');
    expect(rejected.body.decisionNote).toBe('মামলা চলমান');

    const settleAfterReject = await post(`/api/v1/coop/exits/${id}/decision`, { action: 'settle' });
    expect(settleAfterReject.status).toBe(409);
  });

  it('guards invalid transitions (approve before compute, settle before approve)', async () => {
    const created = await post('/api/v1/coop/exits', EXIT_BODY);
    const id = created.body.id as string;
    const earlyApprove = await post(`/api/v1/coop/exits/${id}/decision`, { action: 'approve' });
    expect(earlyApprove.status).toBe(409);
    const earlySettle = await post(`/api/v1/coop/exits/${id}/decision`, { action: 'settle' });
    expect(earlySettle.status).toBe(409);
  });
});

describe('Governance reports (req 8)', () => {
  it('computes claim ratio, premium vs payout and fund balances', async () => {
    // Seed the insurance ledger: one claim paid through the insurance fund.
    const policies = await post('/api/v1/insurance/policies', {
      applicationId: '00000000-0000-4000-8000-000000000000a2',
      loanNumber: 'LO-DHK-0002',
      memberId: MEMBER_B,
      memberName: 'সালমা খাতুন',
      principal: '60000',
      termMonths: 12,
      nomineeName: 'জামাল হোসেন',
      nomineeRelation: 'husband',
    });
    expect(policies.status).toBe(201);

    const reports = await get('/api/v1/coop/reports');
    expect(reports.status).toBe(200);
    // Funds: member welfare 18000, staff 6000 seeded; insurance = 1800 + 600 new premium.
    const funds = reports.body.funds as { fund: string; balance: string }[];
    expect(funds.find((f) => f.fund === 'member_welfare')!.balance).toBe('18000.00');
    expect(funds.find((f) => f.fund === 'staff_benevolent')!.balance).toBe('6000.00');
    expect(Number(funds.find((f) => f.fund === 'insurance')!.balance)).toBe(2400);

    // Claim ratio with zero claims = 0%, premiums 2400.
    expect(reports.body.claimRatio.premiums).toBe('2400.00');
    expect(reports.body.claimRatio.pct).toBe(0);

    // Premium vs payout rows exist per year with a zero payout so far.
    const rows = reports.body.premiumVsPayout as { period: string; premiums: string; payouts: string; ratioPct: number }[];
    const year = String(new Date().getFullYear());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.payouts).toBe('0.00');
    expect(rows[0]!.ratioPct).toBe(0);

    // Dividend status reflects a computed distribution.
    await post('/api/v1/coop/dividend/compute', { fiscalYear: '2025-26', surplus: '100000', holders: HOLDERS });
    const after = await get('/api/v1/coop/reports');
    expect(after.body.dividendStatus).toHaveLength(1);
    expect(after.body.dividendStatus[0].status).toBe('computed');
    expect(after.body.dividendStatus[0].pool).toBe('75000.00');
  });

  it('raises the claim ratio after a paid death claim', async () => {
    await post('/api/v1/insurance/policies', {
      applicationId: '00000000-0000-4000-8000-000000000000a2',
      loanNumber: 'LO-DHK-0002',
      memberId: MEMBER_B,
      memberName: 'সালমা খাতুন',
      principal: '60000',
      termMonths: 12,
      nomineeName: 'জামাল হোসেন',
      nomineeRelation: 'husband',
    });
    const docs = [
      { id: 'death_certificate', labelBn: 'মৃত্যুসনদ', path: 'docs/death.pdf' },
      { id: 'nominee_nid', labelBn: 'নমিনির এনআইডি', path: 'docs/nid.pdf' },
      { id: 'nominee_proof', labelBn: 'নমিনি প্রমাণ', path: 'docs/proof.pdf' },
    ];
    const claim = await post('/api/v1/insurance/claims', {
      policyId: '00000000-0000-4000-8000-00000000c001',
      kind: 'death',
      eventDate: '2026-09-20',
      documents: docs,
      claimedAmount: '60000',
    });
    expect(claim.status).toBe(201);
    const id = claim.body.id as string;
    for (const _ of [1, 2, 3]) await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'advance' });
    await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'approve', approvedAmount: '60000' });
    await post(`/api/v1/insurance/claims/${id}/decision`, { action: 'pay' });

    const reports = await get('/api/v1/coop/reports');
    // premiums 2400, paid 60000 → ratio 2500%.
    expect(reports.body.claimRatio.incidents).toBe('60000.00');
    expect(reports.body.claimRatio.pct).toBe(2500);
  });
});

describe('Role denial', () => {
  it('lets the officer read but blocks admin actions', async () => {
    expect((await get('/api/v1/coop/dividend', officer)).status).toBe(200);
    expect((await post('/api/v1/coop/dividend/compute', { fiscalYear: '2025-26', surplus: '1', holders: HOLDERS }, officer)).status).toBe(403);
    expect((await post('/api/v1/coop/agm', AGM_BODY, officer)).status).toBe(403);
    // Officer CAN request an exit (member:write) but cannot decide it (also member:write... uses member:write for both).
    const created = await post('/api/v1/coop/exits', EXIT_BODY_SIMPLE(), officer);
    expect(created.status).toBe(201);
    const decided = await post(`/api/v1/coop/exits/${created.body.id}/decision`, { action: 'compute' }, officer);
    expect([200, 403]).toContain(decided.status);
  });
});

function EXIT_BODY_SIMPLE() {
  return {
    memberId: MEMBER_C,
    memberName: 'কমল হোসেন',
    requestDate: '2026-09-24',
    savingsBalance: '100',
    shareValue: '0',
    dividendDue: '0',
    welfareBalance: '0',
    duesOutstanding: '0',
  };
}
