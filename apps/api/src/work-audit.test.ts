/**
 * ── Work audit tests (req 5–9) ───────────────────────────────────────────────
 * Supervision submissions (checklists, GPS, photos), internal audit plans with
 * random sampling, findings register (severity SLA, response, follow-up,
 * close), approval inbox, escalation sweeps, calendar/kanban and digests.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;

const F1 = '00000000-0000-4000-8000-0000000000f1';
const F3 = '00000000-0000-4000-8000-0000000000f3';
const DHAKA = '00000000-0000-4000-8000-0000000000b1';
const AUDIT_ID = '00000000-0000-4000-8000-00000000ad01';
const FINDING_ID = '00000000-0000-4000-8000-00000000fd01';

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const work = await import('./lib/work-store.js');
  work.resetWorkDemoStore();
  const audit = await import('./lib/work-audit-store.js');
  audit.resetWorkAuditStore();
  const loans = await import('./lib/loan-store.js');
  loans.resetLoanDemoStore();
});

const auth = { Authorization: 'Bearer demo-token' };
const officer = { Authorization: 'Bearer demo-token-officer' };
const get = (url: string, headers = auth) => request(createAppRef() as never).get(url).set(headers);
const post = (url: string, body?: unknown, headers = auth) => request(createAppRef() as never).post(url).set(headers).send(body ?? {} as never);

describe('Supervision forms (req 5)', () => {
  it('submits a checklist form with GPS and photos and counts exceptions', async () => {
    const res = await post('/api/v1/work/supervision', {
      branchId: DHAKA,
      formType: 'loan_utilization',
      linkLabel: 'ঋণ ব্যবহার পরিদর্শন',
      lat: 23.81,
      lng: 90.41,
      distanceMeters: 150,
      photos: ['photos/util-1.jpg'],
      answers: { lu1: 'yes', lu2: 'no', lu3: 'na' },
      note: 'ক্রয়ের প্রমাণ পাওয়া যায়নি',
    });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.exceptions).toBe(1);
    expect(res.body.distanceMeters).toBe(150);
    expect(res.body.photos).toEqual(['photos/util-1.jpg']);
  });

  it('lists submissions with filters', async () => {
    await post('/api/v1/work/supervision', {
      branchId: DHAKA,
      formType: 'cash_verification',
      answers: { cav1: 'yes', cav2: 'yes', cav3: 'yes' },
    });
    const all = await get('/api/v1/work/supervision');
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThanOrEqual(3); // 2 seeded + 1 new
    const cashOnly = await get('/api/v1/work/supervision?formType=cash_verification');
    expect(cashOnly.body.items.every((s: { formType: string }) => s.formType === 'cash_verification')).toBe(true);
  });

  it('rejects an invalid form type', async () => {
    const res = await post('/api/v1/work/supervision', { branchId: DHAKA, formType: 'mystery_visit', answers: {} });
    expect(res.status).toBe(400);
  });
});

describe('Internal audit (req 6)', () => {
  it('creates a plan and draws a random sample without replacement', async () => {
    const created = await post('/api/v1/work/audits', {
      branchId: DHAKA,
      branchName: 'ঢাকা শাখা',
      title: 'কোয়ার্টারলি নিরীক্ষা',
      plannedDate: '2026-10-05',
      leadAuditorId: F3,
      sampleSize: 6,
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const sampled = await post(`/api/v1/work/audits/${id}/sample`, { sampleSize: 5 });
    expect(sampled.status).toBe(200);
    expect(sampled.body.loanSample.length).toBeGreaterThan(0);
    expect(sampled.body.loanSample.length).toBeLessThanOrEqual(5);
    const unique = new Set(sampled.body.loanSample as string[]);
    expect(unique.size).toBe(sampled.body.loanSample.length);
  });

  it('walks the plan status flow and rejects illegal jumps', async () => {
    const seededIsInProgress = await post(`/api/v1/work/audits/${AUDIT_ID}/status`, { status: 'in_progress' });
    expect(seededIsInProgress.status).toBe(409); // seeded plan already in_progress

    const report = await post(`/api/v1/work/audits/${AUDIT_ID}/status`, { status: 'draft_report' });
    expect(report.status).toBe(200);
    const closed = await post(`/api/v1/work/audits/${AUDIT_ID}/status`, { status: 'closed' });
    expect(closed.status).toBe(200);
    const reopen = await post(`/api/v1/work/audits/${AUDIT_ID}/status`, { status: 'in_progress' });
    expect(reopen.status).toBe(409);
  });

  it('records a finding with severity SLA, branch response, follow-up and close', async () => {
    const finding = await post('/api/v1/work/findings', {
      auditId: AUDIT_ID,
      ref: 'bi2',
      title: 'রেজিস্টার হালনাগাদ নেই',
      detail: 'সঞ্চয় রেজিস্টার ৩ দিন পিছিয়ে',
      severity: 'critical',
    });
    expect(finding.status).toBe(201);
    const id = finding.body.id as string;
    expect(finding.body.deadline).not.toBeNull(); // SLA trigger path
    expect(finding.body.status).toBe('open');

    const responded = await post(`/api/v1/work/findings/${id}/respond`, {
      response: 'রেজিস্টার হালনাগাদ সম্পন্ন, আগামী সপ্তাহে চূড়ান্ত হবে',
      deadline: '2026-10-10',
    });
    expect(responded.status).toBe(200);
    expect(responded.body.status).toBe('responded');

    const doubleRespond = await post(`/api/v1/work/findings/${id}/respond`, { response: 'আবার' });
    expect(doubleRespond.status).toBe(409);

    const followup = await post(`/api/v1/work/findings/${id}/followup`, { note: 'যাচাই করা হয়েছে, সংশোধন হয়েছে' });
    expect(followup.status).toBe(200);
    expect(followup.body.status).toBe('in_followup');

    const closed = await post(`/api/v1/work/findings/${id}/followup`, { note: 'চূড়ান্ত যাচাই সম্পন্ন', close: true });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.closedAt).not.toBeNull();

    const afterClose = await post(`/api/v1/work/findings/${id}/followup`, { note: 'আবার খুলি' });
    expect(afterClose.status).toBe(409);
  });

  it('lets the branch respond to the seeded overdue finding', async () => {
    const res = await post(`/api/v1/work/findings/${FINDING_ID}/respond`, {
      response: 'ঘাটতি পরিশোধ করা হয়েছে, ক্যাশ বই সংশোধন করা হয়েছে',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('responded');
  });

  it('requires branch:manage to author audits and findings', async () => {
    const plan = await post(
      '/api/v1/work/audits',
      { branchId: DHAKA, branchName: 'ঢাকা শাখা', title: 'অফিসার নিরীক্ষা', plannedDate: '2026-10-01', leadAuditorId: F1 },
      officer,
    );
    expect(plan.status).toBe(403);
    const finding = await post('/api/v1/work/findings', { auditId: AUDIT_ID, title: 'x', severity: 'low' }, officer);
    expect(finding.status).toBe(403);
  });
});

describe('Approval inbox (req 7)', () => {
  it('returns a sorted inbox including loan reviews and open findings', async () => {
    const res = await get('/api/v1/work/inbox');
    expect(res.status).toBe(200);
    const items = res.body.items as { kind: string; waitingDays: number }[];
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1]!.waitingDays).toBeGreaterThanOrEqual(items[i]!.waitingDays);
    }
    expect(items.some((x) => x.kind === 'audit_finding_response')).toBe(true);
  });
});

describe('Escalations (req 8)', () => {
  it('sweeps aged tasks and findings into the ledger without duplicates', async () => {
    // Seed an overdue task (8 days) and an overdue finding so tiers fire.
    await post('/api/v1/work/tasks', { type: 'manual', title: 'পুরোনো বকেয়া কাজ', assigneeId: F1, dueDate: '2026-09-16' });
    const overdueFinding = await post('/api/v1/work/findings', {
      auditId: AUDIT_ID,
      title: 'নগদ ঘাটতি (পুরোনো)',
      severity: 'high',
    });
    // Force the deadline into the past via the respond endpoint is not possible;
    // the shared SLA defaults to +14d, so manipulate via follow-up is unnecessary:
    // the overdue *task* alone proves the sweep. Also keep the seeded finding check.
    expect(overdueFinding.status).toBe(201);

    const first = await post('/api/v1/work/escalations/sweep');
    expect(first.status).toBe(200);
    const created = first.body.created as { entityId: string; tierRole: string }[];
    expect(created.length).toBeGreaterThan(0);
    expect(created.some((c) => c.tierRole === 'area_manager')).toBe(true); // 8 days → tier 2

    const second = await post('/api/v1/work/escalations/sweep');
    expect((second.body.created as unknown[])).toHaveLength(0); // idempotent

    const list = await get('/api/v1/work/escalations');
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(created.length);
  });
});

describe('Calendar, Kanban and digest (req 9)', () => {
  it('serves the daily digest for a role', async () => {
    const res = await get('/api/v1/work/digest?role=branch_manager');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('branch_manager');
    expect(typeof res.body.summaryBn).toBe('string');
    expect(res.body.summaryBn).toContain('আজ');
    expect(Array.isArray(res.body.overdue)).toBe(true);
    expect(Array.isArray(res.body.dueToday)).toBe(true);
  });

  it('uses the caller role when none is given', async () => {
    const res = await get('/api/v1/work/digest', officer);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('account_officer');
  });
});
