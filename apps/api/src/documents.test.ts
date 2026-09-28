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
let resetDocStore: () => void;
let resetCommStore: () => void;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./app.js');
  createAppRef = () => mod.createApp();
  const docs = await import('./lib/doc-store.js');
  resetDocStore = docs.resetDocStore;
  resetDocStore();
  const comm = await import('./lib/comm-store.js');
  resetCommStore = comm.resetCommStore;
  resetCommStore();
});

afterAll(() => {
  vi.restoreAllMocks();
});

const get = (url: string, headers: Record<string, string> = auth) => request(createAppRef() as never).get(url).set(headers);
const post = (url: string, body?: unknown, headers: Record<string, string> = auth) => request(createAppRef() as never).post(url).set(headers).send(body ?? {});
const put = (url: string, body?: unknown, headers: Record<string, string> = auth) => request(createAppRef() as never).put(url).set(headers).send(body ?? {});

const SAMITY_ID = '00000000-0000-4000-8000-0000000000s1';
const BRANCH_ID = '00000000-0000-4000-8000-0000000000b1';

describe('Documents module (reqs 4–8)', () => {
  it('seeds 22 doc templates across 11 kinds and both registers', async () => {
    const res = await get('/api/v1/documents/templates');
    expect(res.status).toBe(200);
    const items = res.body.items as { kind: string; register: string; body: string; version: number }[];
    expect(items).toHaveLength(22);
    expect(new Set(items.map((t) => t.kind)).size).toBe(11);
    expect(items.filter((t) => t.register === 'sadhu')).toHaveLength(11);
    expect(items.every((t) => t.version === 1)).toBe(true);
    // Sadhu variants genuinely differ (req 4 register support).
    const receiptCholito = items.find((t) => t.kind === 'receipt' && t.register === 'cholito')!;
    const receiptSadhu = items.find((t) => t.kind === 'receipt' && t.register === 'sadhu')!;
    expect(receiptCholito.body).not.toBe(receiptSadhu.body);
  });

  it('generates a receipt with amount-words, Bangla date and a QR verify block', async () => {
    const res = await post('/api/v1/documents/generate', {
      kind: 'receipt',
      register: 'cholito',
      vars: { memberName: 'রহিমা বেগম', memberCode: 'M-0001', branchName: 'ধানমন্ডি শাখা', samityName: 'গাজীপুর সমিতি', paidAmount: '25000', paidFor: 'সঞ্চয় জমা', balance: '৫০০' },
    });
    expect(res.status).toBe(201);
    expect(res.body.docNo).toMatch(/^RCP-\d{4}-\d{4}$/);
    expect(res.body.verifyCode).toMatch(/^VRF-[A-HJ-NP-Z2-9]{10}$/);
    expect(res.body.html).toContain('পঁচিশ হাজার টাকা'); // numberToWordsBn wired (req 6)
    // Bangla calendar issuedDateBn: a Bangla month name with Bangla digits.
    expect(res.body.html).toMatch(/[\u09E6-\u09EF]{1,2} (বৈশাখ|জ্যৈষ্ঠ|আষাঢ়|শ্রাবণ|ভাদ্র|আশ্বিন|কার্তিক|অগ্রহায়ণ|পৌষ|মাঘ|ফাল্গুন|চৈত্র) [\u09E6-\u09EF]+/);
    expect(res.body.html).toContain('data:image/png;base64'); // embedded QR
    expect(res.body.html).toContain('যাচাই কোড');
    // Missing required vars are rejected.
    const bad = await post('/api/v1/documents/generate', { kind: 'receipt', vars: { memberName: 'x', paidFor: 'x' } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.message).toContain('অনুপস্থিত');
  });

  it('keeps template version history and restores a previous version', async () => {
    const list = await get('/api/v1/documents/templates');
    const tpl = (list.body.items as { id: string; kind: string; register: string }[]).find(
      (t) => t.kind === 'notice' && t.register === 'cholito',
    )!;
    // Save a new version via the editor endpoint.
    const up = await put('/api/v1/documents/templates', {
      id: tpl.id, kind: 'notice', register: 'cholito', orientation: 'portrait', enabled: true,
      body: '<h3>নোটিশ v2</h3><p>বিষয়: {{noticeSubject}}</p><p>সদস্য: {{memberName}}</p>',
    });
    expect(up.status).toBe(201);
    expect(up.body.template.version).toBe(2);
    const hist = await get(`/api/v1/documents/templates/${tpl.id}/versions`);
    const versions = hist.body.items as { version: number }[];
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    // Restore v1 → becomes v3 with v1's body.
    const restored = await post(`/api/v1/documents/templates/${tpl.id}/restore/1`);
    expect(restored.status).toBe(200);
    expect(restored.body.template.version).toBe(3);
    expect(restored.body.template.body).toContain('সকল সংশ্লিষ্টকে');
    // Unknown variables rejected (422).
    const bad = await put('/api/v1/documents/templates', {
      id: tpl.id, kind: 'notice', register: 'cholito', enabled: true, body: '<p>{{mysteryVar}}</p>',
    });
    expect(bad.status).toBe(422);
    // Field officer cannot edit.
    const denied = await put('/api/v1/documents/templates', {
      id: tpl.id, kind: 'notice', register: 'cholito', enabled: true, body: '<p>no vars</p>',
    }, officer);
    expect(denied.status).toBe(403);
  });

  it('previews templates and lists documents without heavy html bodies', async () => {
    const list = await get('/api/v1/documents/templates');
    const tpl = (list.body.items as { id: string }[])[0]!;
    const preview = await post(`/api/v1/documents/templates/${tpl.id}/preview`, {});
    expect(preview.status).toBe(200);
    expect(preview.body.html).toContain('রহিমা বেগম');
    expect(preview.body.missing).toEqual([]);
    await post('/api/v1/documents/generate', { kind: 'notice', vars: { branchName: 'ধানমন্ডি শাখা', noticeSubject: 'বকেয়া নোটিশ', noticeDate: '২০২৬-১০-০১' } });
    const docs = await get('/api/v1/documents?kind=notice');
    expect(docs.status).toBe(200);
    const items = docs.body.items as { docNo: string; html?: string; titleSnippet: string }[];
    expect(items).toHaveLength(1);
    expect(items[0]!.html).toBeUndefined(); // list is light
    expect(items[0]!.titleSnippet.length).toBeGreaterThan(0);
    const dl = await get(`/api/v1/documents/${(docs.body.items as { id: string }[])[0]!.id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toContain('text/html');
    expect(dl.headers['content-disposition']).toContain('filename*');
  });

  it('public verify endpoint exposes no personal data and reflects revocation', async () => {
    const gen = await post('/api/v1/documents/generate', {
      kind: 'loan_agreement',
      vars: {
        branchName: 'ধানমন্ডি শাখা',
        memberName: 'রহিমা বেগম', loanCode: 'LN-1', loanAmount: '১০০০০',
        installment: '১২৫০', installmentCount: '৮', termMonths: '৮', interestRate: '১২',
        guarantorName: 'করিম মিয়া', guarantorAddress: 'গাজীপুর, ঢাকা',
      },
    });
    const code = gen.body.verifyCode as string;
    // No auth header at all.
    const pub = await get(`/api/v1/public/verify/${code}`, {});
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ docNo: gen.body.docNo, status: 'valid' });
    expect(pub.body.kindLabelBn).toBe('ঋণ চুক্তিপত্র');
    const serialized = JSON.stringify(pub.body);
    expect(serialized).not.toContain('রহিমা'); // member name never exposed
    expect(serialized).not.toContain('html');
    // Unknown code → status unknown, no error leak.
    const unknown = await get('/api/v1/public/verify/VRF-AAAAAAAAAA', {});
    expect(unknown.status).toBe(200);
    expect(unknown.body.status).toBe('unknown');
    // Revoke → verify flips to revoked (managers only).
    const denied = await post(`/api/v1/documents/${gen.body.id}/revoke`, {}, officer);
    expect(denied.status).toBe(403);
    await post(`/api/v1/documents/${gen.body.id}/revoke`);
    const after = await get(`/api/v1/public/verify/${code}`, {});
    expect(after.body.status).toBe('revoked');
  });

  it('runs bulk jobs over a samity with tick progress and per-item results', async () => {
    const job = await post('/api/v1/documents/bulk-jobs', {
      kind: 'documents_batch', scope: 'samity', scopeId: SAMITY_ID, scopeName: 'গাজীপুর সমিতি',
      params: { docKind: 'receipt', register: 'cholito', amount: '৫০০', paidFor: 'সঞ্চয় জমা' },
    });
    expect(job.status).toBe(201);
    expect(job.body.total).toBe(3);
    expect(job.body.status).toBe('pending');
    // Field officers cannot create jobs.
    const denied = await post('/api/v1/documents/bulk-jobs', {
      kind: 'sms_batch', scope: 'branch', scopeId: BRANCH_ID, scopeName: 'ঢাকা শাখা', params: { body: 'hi {name}' },
    }, officer);
    expect(denied.status).toBe(403);
    // Tick processes all three items.
    const tick = await post(`/api/v1/documents/bulk-jobs/${job.body.id}/tick`);
    expect(tick.status).toBe(200);
    expect(tick.body.status).toBe('done');
    expect(tick.body.processed).toBe(3);
    expect(tick.body.failed).toBe(0);
    const docs = await get('/api/v1/documents?kind=receipt');
    expect((docs.body.items as unknown[]).length).toBe(3);
    // Unknown scope is rejected with a clear message.
    const badScope = await post('/api/v1/documents/bulk-jobs', {
      kind: 'documents_batch', scope: 'samity', scopeId: 'nope', scopeName: 'x',
      params: { docKind: 'receipt' },
    });
    expect(badScope.status).toBe(422);
  });

  it('bulk SMS batch flows through the guarded send pipeline', async () => {
    await put('/api/v1/comms/rules', { sendWindowStart: '00:00', sendWindowEnd: '23:59' });
    const job = await post('/api/v1/comms/bulk', {
      kind: 'sms_batch', scope: 'branch', scopeId: BRANCH_ID, scopeName: 'ঢাকা শাখা',
      params: { body: 'সুপ্রিয় {name}, আগামীকাল সভা।' },
    });
    expect(job.status).toBe(201);
    const tick = await post(`/api/v1/comms/bulk/${job.body.id}/tick`);
    expect(tick.body.status).toBe('done');
    expect(tick.body.processed).toBe(5);
    // The opted-out seeded number must show up as a failed item.
    const items = tick.body.items as { targetName: string; status: string; error: string | null }[];
    const optedOut = items.find((i) => i.error?.includes('opted out'));
    expect(optedOut).toBeTruthy();
    // Delivery log captured the batch.
    const log = await get('/api/v1/comms/deliveries?channel=sms');
    expect((log.body.items as unknown[]).length).toBeGreaterThanOrEqual(5);
    // /comms/bulk listing works.
    const list = await get('/api/v1/comms/bulk');
    expect(list.status).toBe(200);
    expect((list.body.items as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});
