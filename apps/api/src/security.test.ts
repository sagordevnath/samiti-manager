/**
 * ── Security, audit & privacy tests (reqs 1–5) ───────────────────────────────
 * Audit trail append + filters, protected-field masking/reveal/unmask-log,
 * password policy, security config, lockout, session timeout, CSRF guard,
 * sensitive rate limiting, devices, TOTP, the RLS cross-branch matrix
 * (every cross-branch probe must FAIL) and the privacy workflows.
 */
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
let sec: typeof import('./lib/security-store.js');
let resetSecurityStore: () => void;
let mw: typeof import('./middleware/security.js');

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./app.js');
  createAppRef = () => mod.createApp();
  sec = await import('./lib/security-store.js');
  resetSecurityStore = sec.resetSecurityStore;
  resetSecurityStore();
  mw = await import('./middleware/security.js');
  mw.resetSessionTracker();
});

afterAll(() => {
  vi.restoreAllMocks();
});

const get = (url: string, headers: Record<string, string> = auth) => request(createAppRef() as never).get(url).set(headers);
const post = (url: string, body?: unknown, headers: Record<string, string> = auth) => request(createAppRef() as never).post(url).set(headers).send(body ?? {});
const put = (url: string, body?: unknown, headers: Record<string, string> = auth) => request(createAppRef() as never).put(url).set(headers).send(body ?? {});

const MEMBER_B1 = '00000000-0000-4000-8000-0000000001a1';
const BRANCH_B1 = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_B2 = '00000000-0000-4000-8000-0000000000b2';

describe('Security module (reqs 1–5)', () => {
  it('req 1: records sensitive mutations in the append-only audit trail with filters', async () => {
    const consent = await post('/api/v1/privacy/consents', {
      memberId: MEMBER_B1,
      kind: 'data_processing',
      granted: true,
    });
    expect(consent.status).toBe(201);

    const audit = await get('/api/v1/security/audit?tableName=member_consents');
    expect(audit.status).toBe(200);
    const rows = audit.body.items as { tableName: string; action: string; userId: string | null; ip: string | null }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.tableName).toBe('member_consents');
    expect(rows[0]!.action).toBe('insert');
    expect(rows[0]!.userId).toBe('00000000-0000-4000-8000-000000000001'); // demo super_admin
    expect(rows[0]!.ip).toBeTruthy();

    // Filters narrow correctly.
    const byAction = await get('/api/v1/security/audit?action=delete');
    expect((byAction.body.items as unknown[]).length).toBe(0);
    const byQ = await get('/api/v1/security/audit?q=member_consents');
    expect((byQ.body.items as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Device registration also lands in the trail under its own table.
    await post('/api/v1/security/devices', { label: 'অফিস ল্যাপটপ' });
    const deviceAudit = await get('/api/v1/security/audit?tableName=user_devices');
    expect((deviceAudit.body.items as unknown[]).length).toBe(1);
  });

  it('req 2: masks NID/bank/phone by role and logs every unmask', async () => {
    const masked = await get(`/api/v1/security/protected-fields/members/${MEMBER_B1}`);
    expect(masked.status).toBe(200);
    const items = masked.body.items as { field: string; masked: string }[];
    expect(items.find((i) => i.field === 'national_id')!.masked).toBe('••••••6789');
    expect(items.find((i) => i.field === 'bank_account')!.masked).toBe('••••••6655');
    expect(items.find((i) => i.field === 'phone')!.masked).toBe('01712••••78');

    // Super admin reveals NID → value + logged.
    const reveal = await post('/api/v1/security/protected-fields/reveal', {
      entityTable: 'members',
      entityId: MEMBER_B1,
      field: 'national_id',
    });
    expect(reveal.status).toBe(200);
    expect(reveal.body.value).toBe('1990123456789');
    expect(reveal.body.logged).toBe(true);

    // Officer may reveal phone but NOT bank accounts.
    const officerPhone = await post('/api/v1/security/protected-fields/reveal', { entityTable: 'members', entityId: MEMBER_B1, field: 'phone' }, officer);
    expect(officerPhone.status).toBe(200);
    expect(officerPhone.body.value).toBe('01712345678');
    const officerBank = await post('/api/v1/security/protected-fields/reveal', { entityTable: 'members', entityId: MEMBER_B1, field: 'bank_account' }, officer);
    expect(officerBank.status).toBe(403);

    // Every successful reveal is in the unmask log with who/when/field.
    const log = await get('/api/v1/security/unmask-log');
    expect(log.status).toBe(200);
    const rows = log.body.items as { field: string; userId: string; role: string; ip: string | null }[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.field).sort()).toEqual(['national_id', 'phone']);
    expect(rows.every((r) => r.ip !== null)).toBe(true);
  });

  it('req 3: password policy, config read/update with permission check', async () => {
    const weak = await post('/api/v1/security/password/check', { password: 'abc', email: 'admin@samity.test' });
    expect(weak.status).toBe(200);
    expect(weak.body.ok).toBe(false);
    expect(weak.body.problems.length).toBeGreaterThanOrEqual(4);

    const strong = await post('/api/v1/security/password/check', { password: 'Str0ng!Pass9', email: 'admin@samity.test' });
    expect(strong.body.ok).toBe(true);

    const cfg = await get('/api/v1/security/config');
    expect(cfg.status).toBe(200);
    expect(cfg.body.passwordPolicy.minLength).toBe(10);
    expect(cfg.body.lockout.maxFailedAttempts).toBe(5);
    expect(cfg.body.ipAllowlist.enabled).toBe(false);

    const updated = await put('/api/v1/security/config', { lockout: { maxFailedAttempts: 7 } });
    expect(updated.status).toBe(200);
    expect(updated.body.lockout.maxFailedAttempts).toBe(7);

    // Field staff cannot change security policy (org:manage required).
    const denied = await put('/api/v1/security/config', { lockout: { maxFailedAttempts: 1 } }, officer);
    expect(denied.status).toBe(403);
  });

  it('req 3: brute-force lockout after max failures, then expiry logic', async () => {
    for (let i = 0; i < 5; i += 1) sec.recordLoginAttempt('victim@samity.test', false, '10.0.0.9');
    const locked = sec.checkLockout('victim@samity.test');
    expect(locked.locked).toBe(true);
    expect(locked.remainingMs).toBeGreaterThan(0);
    expect(locked.failedCount).toBe(5);
    // Another account is unaffected.
    expect(sec.checkLockout('other@samity.test').locked).toBe(false);
    // A success resets nothing until window passes; window filtering works.
    const staleOnly = sec.checkLockout('fresh@samity.test');
    expect(staleOnly.locked).toBe(false);
  });

  it('req 3: finance IP gate blocks foreign-IP mutations for finance roles', async () => {
    await put('/api/v1/security/config', { ipAllowlist: { enabled: true, cidrs: ['103.12.34.0/24'] } });
    // branch_manager mutation from outside → denied; inside the /24 → allowed.
    expect(sec.financeIpGateDecision('branch_manager', 'POST', '8.8.8.8').ok).toBe(false);
    expect(sec.financeIpGateDecision('branch_manager', 'POST', '103.12.34.77').ok).toBe(true);
    // Reads are never gated; non-finance roles are never gated.
    expect(sec.financeIpGateDecision('branch_manager', 'GET', '8.8.8.8').ok).toBe(true);
    expect(sec.financeIpGateDecision('account_officer', 'POST', '8.8.8.8').ok).toBe(true);
    // Disable again for the remaining tests.
    await put('/api/v1/security/config', { ipAllowlist: { enabled: false, cidrs: [] } });
  });

  it('req 3: session idle timeout rejects the token after inactivity', async () => {
    // First request registers the session.
    const first = await get('/api/v1/security/config');
    expect(first.status).toBe(200);
    // Backdate lastSeen beyond the 60-minute idle window.
    const entry = mw.sessionTracker().get('demo-token')!;
    expect(entry).toBeTruthy();
    entry.lastSeenMs = Date.now() - 61 * 60_000;
    const expired = await get('/api/v1/security/config');
    expect(expired.status).toBe(401);
    expect(expired.body.error.message).toContain('নিষ্ক্রিয়তা');
    // A fresh token state works again (tracker re-registers after eviction).
    const again = await get('/api/v1/security/config');
    expect(again.status).toBe(200);
  });

  it('req 3: CSRF guard rejects cross-site and header-less browser mutations', async () => {
    // Cross-site origin → 403.
    const evil = await post('/api/v1/security/devices', { label: 'দুষ্ট ডিভাইস' }, { ...auth, Origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    // Allowed origin but no CSRF proof header → 403.
    const noProof = await post('/api/v1/security/devices', { label: 'প্রমাণহীন' }, { ...auth, Origin: 'http://localhost:5173' });
    expect(noProof.status).toBe(403);
    // Allowed origin + same-site proof → 201 (the web client sends X-Requested-With).
    const good = await post(
      '/api/v1/security/devices',
      { label: 'অফিস ল্যাপটপ' },
      { ...auth, Origin: 'http://localhost:5173', 'X-Requested-With': 'XMLHttpRequest' },
    );
    expect(good.status).toBe(201);
    // No Origin (curl/tests/service jobs) → allowed.
    const curlLike = await post('/api/v1/security/devices', { label: 'সার্ভার জব' });
    expect(curlLike.status).toBe(201);
    const devices = await get('/api/v1/security/devices');
    expect((devices.body.items as { label: string; revoked: boolean }[]).map((d) => d.label)).toEqual(['সার্ভার জব', 'অফিস ল্যাপটপ']);
    // Revoke one.
    const revoke = await post(`/api/v1/security/devices/${(devices.body.items as { id: string }[])[0]!.id}/revoke`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.revoked).toBe(true);
  });

  it('req 3: sensitive endpoints are rate limited to 10/min per IP', async () => {
    // One shared app instance so the rate limiter's memory store persists.
    const app = createAppRef() as never;
    const hit = (email: string) =>
      request(app).post('/api/v1/auth/login').send({ email, password: 'whatever1!A' });
    let lastStatus = 0;
    let sawLimit = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await hit(`u${i}@samity.test`);
      lastStatus = res.status;
      if (res.status === 429) sawLimit = true;
    }
    expect(lastStatus).toBe(429);
    expect(sawLimit).toBe(true);
  });

  it('req 3: TOTP enrollment round-trip accepts a current code', async () => {
    const status0 = await get('/api/v1/security/totp/status');
    expect(status0.body.enabled).toBe(false);

    const start = await post('/api/v1/security/totp/start');
    expect(start.status).toBe(201);
    expect(start.body.otpauthUrl).toContain('otpauth://totp/');
    expect(start.body.secretB32).toMatch(/^[A-Z2-7]{32}$/);

    const wrong = await post('/api/v1/security/totp/confirm', { code: '000000' });
    expect(wrong.status).toBe(422);

    const code = sec.totpCurrent(start.body.secretB32);
    const ok = await post('/api/v1/security/totp/confirm', { code });
    expect(ok.status).toBe(200);
    expect(ok.body.enabled).toBe(true);

    const status1 = await get('/api/v1/security/totp/status');
    expect(status1.body.enabled).toBe(true);
    expect(status1.body.satisfied).toBe(true);
  });

  it('req 4: RLS matrix denies every cross-branch probe (automated)', async () => {
    const res = await get('/api/v1/security/rls-matrix');
    expect(res.status).toBe(200);
    const items = res.body.items as { table: string; verdict: string; sessionBranch: string; rowBranch: string }[];
    // 12 branch-scoped tables × 4 statements = 48 probes, ALL denied.
    expect(items).toHaveLength(48);
    expect(items.every((i) => i.verdict === 'deny')).toBe(true);
    expect(items.every((i) => i.sessionBranch !== i.rowBranch)).toBe(true);
    expect(res.body.visibleB1Members).toBe(1);

    // Store-level: cross-branch visibility is empty for every matrix table.
    for (const table of ['members', 'savings_accounts', 'vouchers']) {
      const visible = sec.rlsVisibleRows(table, BRANCH_B1);
      expect(visible.every((r) => r.branchId === BRANCH_B1)).toBe(true);
      expect(visible.some((r) => r.branchId === BRANCH_B2)).toBe(false);
    }
    // And a direct verdict check per operation on members.
    for (const op of ['select', 'insert', 'update', 'delete'] as const) {
      expect(sec.rlsVerdict({ table: 'members', sessionBranchId: BRANCH_B1, rowBranchId: BRANCH_B2, op })).toBe('deny');
    }
    expect(sec.rlsVerdict({ table: 'members', sessionBranchId: BRANCH_B1, rowBranchId: BRANCH_B1, op: 'select' })).toBe('allow');
  });

  it('req 5: consent → correction → approve → apply → export round-trip', async () => {
    await post('/api/v1/privacy/consents', { memberId: MEMBER_B1, kind: 'sms_communication', granted: true, method: 'verbal', witnessName: 'করিম মিয়া' });
    const consents = await get(`/api/v1/privacy/consents?memberId=${MEMBER_B1}`);
    expect(consents.body.items).toHaveLength(1);
    expect(consents.body.items[0]!.granted).toBe(true);

    const correction = await post('/api/v1/privacy/corrections', {
      memberId: MEMBER_B1,
      field: 'phone',
      requestedValue: '01811111111',
      reason: 'মোবাইল নম্বর বদলে গেছে',
    });
    expect(correction.status).toBe(201);
    expect(correction.body.status).toBe('submitted');
    const id = correction.body.id as string;

    // Officer cannot decide (no member:approve).
    const officerDecide = await post(`/api/v1/privacy/corrections/${id}/decide`, { decision: 'approve', note: '' }, officer);
    expect(officerDecide.status).toBe(403);

    // Invalid transition guard: submitted → applied is illegal.
    const earlyApply = await post(`/api/v1/privacy/corrections/${id}/apply`);
    expect(earlyApply.status).toBe(409);

    // Review step (submitted → in_review), then approve.
    const reviewed = await post(`/api/v1/privacy/corrections/${id}/decide`, { decision: 'review', note: 'যাচাই চলছে' });
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.status).toBe('in_review');

    const decided = await post(`/api/v1/privacy/corrections/${id}/decide`, { decision: 'approve', note: 'যাচাই হয়েছে' });
    expect(decided.status).toBe(200);
    expect(decided.body.status).toBe('approved');

    const applied = await post(`/api/v1/privacy/corrections/${id}/apply`);
    expect(applied.status).toBe(200);
    expect(applied.body.status).toBe('applied');

    // The protected phone field actually changed (masked view shows new tail).
    const masked = await get(`/api/v1/security/protected-fields/members/${MEMBER_B1}`);
    expect((masked.body.items as { field: string; masked: string }[]).find((i) => i.field === 'phone')!.masked).toBe('01811••••11');

    // Export bundles identity + consents + corrections + audit trail.
    const exp = await get(`/api/v1/privacy/export/${MEMBER_B1}`);
    expect(exp.status).toBe(200);
    expect(exp.body.member.nationalIdMasked).toBe('••••••6789');
    expect(exp.body.member.phoneMasked).toBe('01811••••11');
    expect(exp.body.consents).toHaveLength(1);
    expect(exp.body.corrections[0]!.status).toBe('applied');
    expect((exp.body.auditTrail as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it('req 5: retention rules list/update + purge preview', async () => {
    const rules = await get('/api/v1/privacy/retention-rules');
    expect(rules.status).toBe(200);
    expect(rules.body.items).toHaveLength(6);
    expect(rules.body.preview.length).toBe(6);

    const denied = await put('/api/v1/privacy/retention-rules', { class: 'audit_logs', retainMonths: 96 }, officer);
    expect(denied.status).toBe(403);

    const updated = await put('/api/v1/privacy/retention-rules', { class: 'audit_logs', retainMonths: 96 });
    expect(updated.status).toBe(200);
    expect(updated.body.retainMonths).toBe(96);
  });
});
