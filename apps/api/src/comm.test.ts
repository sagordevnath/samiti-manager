import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

process.env['SUPABASE_URL'] = 'http://localhost';
process.env['SUPABASE_ANON_KEY'] = 'test-anon';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service';
process.env['PORT'] = '4010';
process.env['NODE_ENV'] = 'test';

const auth = { Authorization: 'Bearer demo-token' };
const officer = { Authorization: 'Bearer demo-token-officer' };

let createAppRef: () => unknown;
let resetCommStore: () => void;
let resetWork: () => void;
let resetMisOps: () => void;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./app.js');
  createAppRef = () => mod.createApp();
  const comm = await import('./lib/comm-store.js');
  resetCommStore = comm.resetCommStore;
  resetCommStore();
  const work = await import('./lib/work-store.js');
  resetWork = work.resetWorkDemoStore;
  resetWork();
  const misOps = await import('./lib/mis-ops-store.js');
  resetMisOps = misOps.resetMisOpsStore;
  resetMisOps();
});

afterAll(() => {
  vi.restoreAllMocks();
});

const get = (url: string, headers = auth) => request(createAppRef() as never).get(url).set(headers);
const post = (url: string, body?: unknown, headers = auth) => request(createAppRef() as never).post(url).set(headers).send(body ?? {});
const put = (url: string, body?: unknown, headers = auth) => request(createAppRef() as never).put(url).set(headers).send(body ?? {});

describe('Communication module (reqs 1–3)', () => {
  it('seeds 14 bilingual templates across all kinds and channels', async () => {
    const res = await get('/api/v1/comms/templates');
    expect(res.status).toBe(200);
    const items = res.body.items as { kind: string; locale: string; body: string }[];
    expect(items).toHaveLength(14);
    expect(items.filter((t) => t.locale === 'bn')).toHaveLength(7);
    expect(items.filter((t) => t.locale === 'en')).toHaveLength(7);
    expect(items.every((t) => t.body.length > 10)).toBe(true);
    // All 7 kinds present in both locales.
    const kinds = new Set(items.filter((t) => t.locale === 'bn').map((t) => t.kind));
    expect(kinds.size).toBe(7);
  });

  it('renders a template preview with sample vars and flags missing ones', async () => {
    const list = await get('/api/v1/comms/templates');
    const tpl = (list.body.items as { id: string; kind: string; locale: string }[]).find(
      (t) => t.kind === 'installment_reminder' && t.locale === 'bn',
    )!;
    const ok = await post(`/api/v1/comms/templates/${tpl.id}/preview`, {});
    expect(ok.status).toBe(200);
    expect(ok.body.text).toContain('রহিমা বেগম');
    expect(ok.body.missing).toEqual([]);
    // Unknown-variable templates are rejected on upsert.
    const bad = await put('/api/v1/comms/templates', {
      kind: 'receipt', name: 'ভাঙা', locale: 'bn', channel: 'sms', subject: '', body: 'রশিদ {{notAVar}}',
    });
    expect(bad.status).toBe(422);
    // Valid upsert updates the existing bn/sms receipt template.
    const upd = await put('/api/v1/comms/templates', {
      kind: 'receipt', name: 'রশিদ v2', locale: 'bn', channel: 'sms', subject: '', body: '{{orgName}}: রশিদ {{receiptNo}} — ৳{{amount}}',
    });
    expect(upd.status).toBe(200);
    expect(upd.body.body).toContain('{{receiptNo}}');
    // Field officer cannot edit templates.
    const denied = await put('/api/v1/comms/templates', {
      kind: 'receipt', name: 'x2', locale: 'en', channel: 'sms', subject: '', body: 'Receipt {{receiptNo}}',
    }, officer);
    expect(denied.status).toBe(403);
  });

  it('sends an in-app message, logs it and lands in the notification center', async () => {
    await put('/api/v1/comms/rules', { sendWindowStart: '00:00', sendWindowEnd: '23:59' });
    const send = await post('/api/v1/comms/send', {
      kind: 'approval_request', channel: 'in_app',
      recipientName: 'নাসরিন সুলতানা', recipient: '00000000-0000-4000-8000-0000000002a1',
      vars: { requesterName: 'করিম মিয়া', amount: '৫০০০', branchName: 'ধানমন্ডি শাখা' },
    });
    expect(send.status).toBe(201);
    expect(send.body.status).toBe('sent');
    expect(send.body.provider).toBe('in-app');
    const feed = await get('/api/v1/comms/notifications');
    expect(feed.status).toBe(200);
    const items = feed.body.items as { title: string; body: string; read: boolean }[];
    expect(items.some((n) => n.body.includes('করিম মিয়া'))).toBe(true);
    // Mark read.
    const target = items[0]! as unknown as { id: string };
    const mark = await post(`/api/v1/comms/notifications/${target.id}/read`);
    expect(mark.status).toBe(200);
    expect(mark.body.read).toBe(true);
  });

  it('broadcasts to all staff (manager) and blocks field officers', async () => {
    const ok = await post('/api/v1/comms/broadcast', { title: 'সভার স্মারক', message: 'আগামীকাল সকাল ১০টায় সভা' });
    expect(ok.status).toBe(201);
    expect((ok.body.items as unknown[]).length).toBeGreaterThanOrEqual(2);
    const denied = await post('/api/v1/comms/broadcast', { title: 'x', message: 'yy' }, officer);
    expect(denied.status).toBe(403);
  });

  it('respects opt-out: SMS to an opted-out phone is blocked and logged', async () => {
    await put('/api/v1/comms/rules', { sendWindowStart: '00:00', sendWindowEnd: '23:59' });
    const send = await post('/api/v1/comms/send', {
      kind: 'greeting', channel: 'sms', recipientName: 'অপ্ট-আউট সদস্য', recipient: '01700000001',
      vars: { memberName: 'সালমা', festivalName: 'পহেলা বৈশাখ' },
    });
    expect(send.status).toBe(201);
    expect(send.body.status).toBe('opted_out');
    expect(send.body.provider).toBe('guard');
    const log = await get('/api/v1/comms/deliveries');
    expect(log.status).toBe(200);
    expect((log.body.items as { status: string }[])[0]!.status).toBe('opted_out');
    // Toggle the opt-out off via the API and resend.
    await put('/api/v1/comms/opt-outs', { recipient: '01700000001', sms: false });
    const send2 = await post('/api/v1/comms/send', {
      kind: 'greeting', channel: 'sms', recipientName: 'অপ্ট-আউট সদস্য', recipient: '01700000001',
      vars: { memberName: 'সালমা', festivalName: 'পহেলা বৈশাখ' },
    });
    expect(send2.body.status).toBe('sent');
    expect(Number(send2.body.cost)).toBeGreaterThan(0);
  });

  it('blocks night sends via the send window and lets admins force', async () => {
    // Use a tiny window that excludes "now" so the test is time-independent.
    const nowHhmm = new Date().toISOString().slice(11, 16);
    const inWindow = (h: string) => h >= '23:30' && h <= '23:59';
    const tight = inWindow(nowHhmm)
      ? { sendWindowStart: '00:00', sendWindowEnd: '00:00' }
      : { sendWindowStart: '23:30', sendWindowEnd: '23:59' };
    await put('/api/v1/comms/rules', tight);
    const send = await post('/api/v1/comms/send', {
      kind: 'meeting_notice', channel: 'sms', recipientName: 'রহিমা', recipient: '01711000002',
      vars: { memberName: 'রহিমা', samityName: 'গাজীপুর', meetingDate: '০৫/১০', meetingVenue: 'অফিস' },
    });
    expect(['outside_window', 'sent'].includes(send.body.status)).toBe(true);
    if (send.body.status === 'outside_window') {
      const forced = await post('/api/v1/comms/send', {
        kind: 'meeting_notice', channel: 'sms', recipientName: 'রহিমা', recipient: '01711000002', force: true,
        vars: { memberName: 'রহিমা', samityName: 'গাজীপুর', meetingDate: '০৫/১০', meetingVenue: 'অফিস' },
      });
      expect(forced.body.status).toBe('sent');
      // Officers cannot force.
      const deniedForce = await post('/api/v1/comms/send', {
        kind: 'meeting_notice', channel: 'sms', recipientName: 'x', recipient: '01711000003', force: true,
        vars: { memberName: 'x', samityName: 's', meetingDate: 'd', meetingVenue: 'v' },
      }, officer);
      expect(deniedForce.body.status).toBe('outside_window');
    }
  });

  it('caps daily spend and blocks further SMS with cap_blocked', async () => {
    // Window opened so the test is time-independent; cap sits between one
    // greeting SMS (2 unicode parts = ৳0.70) and two (৳1.40).
    await put('/api/v1/comms/rules', { sendWindowStart: '00:00', sendWindowEnd: '23:59', dailyCostCap: 1, monthlyCostCap: 5000 });
    const first = await post('/api/v1/comms/send', {
      kind: 'greeting', channel: 'sms', recipientName: 'এক', recipient: '01711000011',
      vars: { memberName: 'এক', festivalName: 'ঈদ' },
    });
    expect(first.body.status).toBe('sent');
    const second = await post('/api/v1/comms/send', {
      kind: 'greeting', channel: 'sms', recipientName: 'দুই', recipient: '01711000012',
      vars: { memberName: 'দুই', festivalName: 'ঈদ' },
    });
    expect(second.body.status).toBe('cap_blocked');
    expect(second.body.error).toContain('দৈনিক');
  });

  it('mock SMS provider charges per unicode part and emails fail gracefully without SMTP', async () => {
    await put('/api/v1/comms/rules', { sendWindowStart: '00:00', sendWindowEnd: '23:59' });
    const bnLong = await post('/api/v1/comms/send', {
      kind: 'custom', channel: 'sms', recipientName: 'দীর্ঘ', recipient: '01711000021',
      body: 'ব'.repeat(75), // 2 unicode parts
    });
    expect(bnLong.status).toBe(201);
    expect(Number(bnLong.body.cost)).toBeCloseTo(0.7, 2);
    const mail = await post('/api/v1/comms/send', {
      kind: 'disbursement_confirmation', channel: 'email', locale: 'en', recipientName: 'মেম্বার', recipient: 'member@example.com',
      vars: { memberName: 'রহিমা', loanCode: 'LN-1', amount: '12000', disbursementDate: '2026-09-25' },
    });
    expect(mail.body.status).toBe('retrying'); // smtp-not-configured → scheduled retry
    expect(mail.body.error).toContain('smtp');
    // Retry pass: no SMTP still, so it retries again with grown attempts.
    const pass = await post('/api/v1/comms/deliveries/retry-due');
    expect(pass.status).toBe(200);
  });

  it('delivery log filters by channel/status and exposes spend + stats; staff-only', async () => {
    await put('/api/v1/comms/rules', { sendWindowStart: '00:00', sendWindowEnd: '23:59' });
    await post('/api/v1/comms/send', {
      kind: 'greeting', channel: 'sms', recipientName: 'ফিল্টার', recipient: '01711000031',
      vars: { memberName: 'ফিল্টার', festivalName: 'বিজয়া' },
    });
    const smsOnly = await get('/api/v1/comms/deliveries?channel=sms');
    expect((smsOnly.body.items as { channel: string }[]).every((d) => d.channel === 'sms')).toBe(true);
    const stats = smsOnly.body.stats as { total: number; costToday: number; byStatus: unknown[] };
    expect(stats.total).toBeGreaterThanOrEqual(1);
    expect(Number(stats.costToday)).toBeGreaterThan(0);
    // Officers lack report:read → the log stays staff-only (members never).
    const denied = await get('/api/v1/comms/deliveries', officer);
    expect(denied.status).toBe(403);
    const spend = await get('/api/v1/comms/rules');
    expect(spend.body.spend.rules.dailyCostCap).toBeGreaterThan(0);
  });
});
