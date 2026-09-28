/**
 * ── Work distribution, supervision & internal audit tests ────────────────────
 * Task lifecycle (transitions, verification rights, comments), auto-task
 * generation with dedupe, delegation + bulk reassignment, and the target
 * cascade with achievement and split guards.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let createAppRef: typeof import('./app.js').createApp;

const ADMIN = '00000000-0000-4000-8000-0000000000f3'; // seeded BM id used as actor via demo token
const F1 = '00000000-0000-4000-8000-0000000000f1';
const F2 = '00000000-0000-4000-8000-0000000000f2';
const BRANCH_B1 = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_TARGET = '00000000-0000-4000-8000-00000000b001';
const period = new Date().toISOString().slice(0, 7);

beforeEach(async () => {
  vi.resetModules();
  ({ createApp: createAppRef } = await import('./app.js'));
  const work = await import('./lib/work-store.js');
  work.resetWorkDemoStore();
});

const auth = { Authorization: 'Bearer demo-token' };
const officer = { Authorization: 'Bearer demo-token-officer' };
const get = (url: string, headers = auth) => request(createAppRef() as never).get(url).set(headers);
const post = (url: string, body: unknown, headers = auth) => request(createAppRef() as never).post(url).set(headers).send(body as never);
const patch = (url: string, body: unknown, headers = auth) => request(createAppRef() as never).patch(url).set(headers).send(body as never);
const put = (url: string, body: unknown, headers = auth) => request(createAppRef() as never).put(url).set(headers).send(body as never);

describe('Task engine', () => {
  it('lists seeded tasks and filters by assignee', async () => {
    const all = await get('/api/v1/work/tasks');
    expect(all.status).toBe(200);
    expect(all.body.items.length).toBeGreaterThanOrEqual(4);

    const mine = await get(`/api/v1/work/tasks?assigneeId=${F1}`);
    expect(mine.status).toBe(200);
    expect(mine.body.items.length).toBeGreaterThan(0);
    expect(mine.body.items.every((t: { assigneeId: string }) => t.assigneeId === F1)).toBe(true);

    const overdue = await get('/api/v1/work/tasks?overdue=1');
    expect(overdue.status).toBe(200);
    expect(overdue.body.items.some((t: { type: string }) => t.type === 'overdue_followup')).toBe(true);
  });

  it('creates a manual task and walks the status flow todo → in_progress → done → verified', async () => {
    const created = await post('/api/v1/work/tasks', {
      type: 'manual',
      title: 'শাখা পরিদর্শন রিপোর্ট',
      assigneeId: F2,
      dueDate: '2026-10-01',
      priority: 'high',
      link: { kind: 'branch', id: BRANCH_B1, label: 'ঢাকা শাখা' },
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body.status).toBe('todo');

    const start = await patch(`/api/v1/work/tasks/${id}`, { status: 'in_progress' });
    expect(start.status).toBe(200);
    expect(start.body.status).toBe('in_progress');

    const done = await patch(`/api/v1/work/tasks/${id}`, { status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.completedAt).not.toBeNull();

    const verified = await patch(`/api/v1/work/tasks/${id}`, { status: 'verified' });
    expect(verified.status).toBe(200);
    expect(verified.body.verifiedAt).not.toBeNull();
  });

  it('rejects illegal transitions and non-assigner verification', async () => {
    const created = await post('/api/v1/work/tasks', {
      type: 'manual',
      title: 'অবৈধ পরীক্ষা',
      assigneeId: F1,
      dueDate: '2026-10-01',
    });
    const id = created.body.id as string;

    const skip = await patch(`/api/v1/work/tasks/${id}`, { status: 'done' });
    expect(skip.status).toBe(409);

    const officerStart = await patch(`/api/v1/work/tasks/${id}`, { status: 'in_progress' }, officer);
    expect(officerStart.status).toBe(200);
    const officerDone = await patch(`/api/v1/work/tasks/${id}`, { status: 'done' }, officer);
    expect(officerDone.status).toBe(200);
    const verifyAsOfficer = await patch(`/api/v1/work/tasks/${id}`, { status: 'verified' }, officer);
    expect(verifyAsOfficer.status).toBe(403);

    const adminVerify = await patch(`/api/v1/work/tasks/${id}`, { status: 'verified' });
    expect(adminVerify.status).toBe(200);
  });

  it('supports comments', async () => {
    const created = await post('/api/v1/work/tasks', {
      type: 'manual',
      title: 'মন্তব্য পরীক্ষা',
      assigneeId: F2,
      dueDate: '2026-10-01',
    });
    const id = created.body.id as string;

    const commented = await post(`/api/v1/work/tasks/${id}/comments`, { text: 'কাল সকালে দেখা হবে' });
    expect(commented.status).toBe(201);
    expect(commented.body.comments).toHaveLength(1);
    expect(commented.body.comments[0].text).toBe('কাল সকালে দেখা হবে');
  });
});

describe('Auto-generated tasks', () => {
  it('generates a task from a module event with correct due date', async () => {
    const res = await post('/api/v1/work/tasks/auto', {
      source: 'kyc_pending',
      linkId: '00000000-0000-4000-8000-0000000000e9',
      linkLabel: 'নতুন সদস্য',
      assigneeId: F1,
      eventDate: '2026-09-24',
    });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('kyc_pending');
    expect(res.body.dueDate).toBe('2026-10-01'); // +7 days
    expect(res.body.autoKey).toBe('kyc_pending:00000000-0000-4000-8000-0000000000e9');
  });

  it('dedupes open auto tasks for the same event', async () => {
    const body = { source: 'meeting_due', linkId: '00000000-0000-4000-8000-0000000000e1', linkLabel: 'বাংলা সমিতি', assigneeId: F2 };
    const first = await post('/api/v1/work/tasks/auto', body);
    expect(first.status).toBe(201);
    const second = await post('/api/v1/work/tasks/auto', body);
    expect(second.status).toBe(409);

    await patch(`/api/v1/work/tasks/${first.body.id}`, { status: 'in_progress' });
    await patch(`/api/v1/work/tasks/${first.body.id}`, { status: 'done' });
    const third = await post('/api/v1/work/tasks/auto', body);
    expect(third.status).toBe(201);
  });
});

describe('Delegation and reassignment', () => {
  it('reassigns an open task with reason and records history', async () => {
    const created = await post('/api/v1/work/tasks', {
      type: 'manual',
      title: 'বদলি পরীক্ষা',
      assigneeId: F1,
      dueDate: '2026-10-01',
    });
    const id = created.body.id as string;

    const moved = await post(`/api/v1/work/tasks/${id}/reassign`, { toStaffId: F2, reason: 'leave', note: 'কমল ছুটিতে' });
    expect(moved.status).toBe(200);
    expect(moved.body.assigneeId).toBe(F2);

    const history = await get('/api/v1/work/delegations');
    expect(history.status).toBe(200);
    expect(history.body.items.some((d: { taskId: string; reason: string }) => d.taskId === id && d.reason === 'leave')).toBe(true);
  });

  it('blocks reassignment of done tasks and self-reassignment', async () => {
    const created = await post('/api/v1/work/tasks', {
      type: 'manual',
      title: 'সম্পন্ন বদলি পরীক্ষা',
      assigneeId: F1,
      dueDate: '2026-10-01',
    });
    const id = created.body.id as string;
    await patch(`/api/v1/work/tasks/${id}`, { status: 'in_progress' });
    await patch(`/api/v1/work/tasks/${id}`, { status: 'done' });

    const closedMove = await post(`/api/v1/work/tasks/${id}/reassign`, { toStaffId: F2 });
    expect(closedMove.status).toBe(409);

    const self = await post(`/api/v1/work/tasks/${created.body.id}/reassign`, { toStaffId: F1 });
    expect(self.status).toBe(409);
  });

  it('bulk-reassigns all open tasks when staff go on leave', async () => {
    const res = await post('/api/v1/work/reassign-bulk', {
      fromStaffId: F1,
      toStaffId: F2,
      reason: 'leave',
      note: 'বার্ষিক ছুটি',
    });
    expect(res.status).toBe(200);
    expect(res.body.moved).toBeGreaterThan(0);

    const left = await get(`/api/v1/work/tasks?assigneeId=${F1}`);
    expect(left.body.items.every((t: { status: string }) => t.status === 'done' || t.status === 'verified')).toBe(true);
  });
});

describe('Targets and achievement', () => {
  it('lists the area → branch cascade with achievement bars', async () => {
    const res = await get('/api/v1/work/targets');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);

    const area = res.body.items.find((i: { target: { scope: string } }) => i.target.scope === 'area');
    expect(area.actual.newMembers).toBe(34);
    expect(area.target.metrics.newMembers).toBe(50);
  });

  it('adds officer splits under the branch target', async () => {
    const res = await put('/api/v1/work/targets', {
      scope: 'officer',
      ownerStaffId: F1,
      ownerName: 'কমল হোসেন',
      parentId: BRANCH_TARGET,
      period,
      metrics: { newMembers: 15, disbursement: '150000', collection: '130000', savings: '80000', parLimit: 5 },
    });
    expect(res.status).toBe(201);
    expect(res.body.scope).toBe('officer');
  });

  it('rejects officer splits exceeding the branch target', async () => {
    const res = await put('/api/v1/work/targets', {
      scope: 'officer',
      ownerStaffId: F2,
      ownerName: 'নুসরাত জাহান',
      parentId: BRANCH_TARGET,
      period,
      metrics: { newMembers: 30, disbursement: '100000', collection: '100000', savings: '100000', parLimit: 5 },
    });
    expect(res.status).toBe(422);
  });

  it('requires branch:manage to author targets', async () => {
    const res = await put(
      '/api/v1/work/targets',
      {
        scope: 'officer',
        ownerStaffId: F1,
        ownerName: 'কমল হোসেন',
        period,
        metrics: { newMembers: 1, disbursement: '0', collection: '0', savings: '0', parLimit: 0 },
      },
      officer,
    );
    expect(res.status).toBe(403);
  });
});
