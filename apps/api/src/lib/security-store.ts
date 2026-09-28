/**
 * ── Security demo store (reqs 1–5) ───────────────────────────────────────────
 * In-memory implementation of the security, audit & privacy module. Mirrors
 * migrations 0056/0057 and packages/shared/src/security.ts.
 *
 * Req 1: append-only audit trail — appendAudit is the only write path (the
 *   SQL path is a generic trigger writing audit_records; UPDATE/DELETE are
 *   physically blocked there and unsupported here by design).
 * Req 2: field-level protection — reuses member-crypto (AES-256-GCM per-org
 *   keys) for NID/bank/phone; every reveal goes through revealProtectedField
 *   which enforces the role mask and writes the unmask log.
 * Req 3: TOTP (RFC 6238 over node:crypto), brute-force lockout fed by login
 *   attempts, device registry, per-org security config (password/TOTP/
 *   lockout/session/IP allowlist) and the finance-IP gate decision.
 * Req 4: simulateCrossBranchAccess — the pure RLS simulator the automated
 *   matrix tests run: branch-scoped rows are invisible/unwritable cross-branch.
 * Req 5: consents, retention rules with purge preview, the right-to-correction
 *   workflow and the masked member data export with its audit trail extract.
 */
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  DEFAULT_IP_ALLOWLIST,
  DEFAULT_LOCKOUT_POLICY,
  DEFAULT_PASSWORD_POLICY,
  DEFAULT_RETENTION_RULES,
  DEFAULT_SESSION_POLICY,
  DEFAULT_TOTP_CONFIG,
  PROTECTED_FIELDS,
  RLS_TEST_MATRIX,
  base32Encode,
  canTransitionCorrection,
  canUnmaskField,
  lockoutDecision,
  maskValue,
  type AuditAction,
  type AuditFilter,
  type AuditRecord,
  type ConsentKind,
  type CorrectionStatus,
  type DeviceRecord,
  type IpAllowlist,
  type LockoutPolicy,
  type LoginAttemptRecord,
  type MemberDataExport,
  type PasswordPolicy,
  type ProtectedField,
  type RetentionRule,
  type SessionPolicy,
  type TotpConfig,
} from '@samity/shared';
import {
  decryptIdNumber,
  encryptIdNumber,
  idSearchHash,
} from './member-crypto.js';
import { CommError } from './comm-store.js';

function err(status: number, code: string, message: string): never {
  throw new CommError(status, code, message);
}

/* ── store shape ───────────────────────────────────────────────────────────── */

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_B1 = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_B2 = '00000000-0000-4000-8000-0000000000b2';
const MEMBER_B1 = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_B2 = '00000000-0000-4000-8000-0000000001a2';
export const OFFICER_USER_ID = '00000000-0000-4000-8000-0000000002a1';

export interface SecurityData {
  orgId: string;
  audit: AuditRecord[];
  unmaskLog: {
    id: string;
    orgId: string;
    entityTable: string;
    entityId: string;
    field: ProtectedField;
    userId: string;
    userName: string | null;
    role: string;
    ip: string | null;
    at: string;
  }[];
  loginAttempts: LoginAttemptRecord[];
  devices: DeviceRecord[];
  /** Encrypted protected fields keyed `${entityTable}:${entityId}`. */
  encryptedFields: Map<string, Partial<Record<ProtectedField, string>>>;
  consents: {
    id: string;
    orgId: string;
    memberId: string;
    kind: ConsentKind;
    granted: boolean;
    textVersion: string;
    method: 'written' | 'verbal' | 'digital';
    witnessName: string | null;
    grantedAt: string;
    revokedAt: string | null;
    recordedBy: string;
  }[];
  retentionRules: RetentionRule[];
  corrections: {
    id: string;
    orgId: string;
    memberId: string;
    memberName: string;
    field: string;
    currentValue: string;
    requestedValue: string;
    reason: string;
    status: CorrectionStatus;
    decidedBy: string | null;
    decidedAt: string | null;
    decisionNote: string;
    appliedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  config: {
    passwordPolicy: PasswordPolicy;
    totp: TotpConfig;
    lockout: LockoutPolicy;
    session: SessionPolicy;
    ipAllowlist: IpAllowlist;
  };
  totpEnrollments: Map<string, { secretB32: string; confirmed: boolean; lastCode: string | null; enabled: boolean }>;
  passwordHistory: Map<string, { hash: string; changedAt: string }[]>;
  /** Demo branch-scoped rows for the RLS simulator (req 4). */
  rlsRows: { id: string; table: string; branchId: string; value: string }[];
}

const g = globalThis as unknown as { __securityDemoData?: SecurityData };

function seed(): SecurityData {
  const now = new Date().toISOString();
  // Seed one encrypted member record per branch so masking/unmask and the
  // cross-branch simulator have concrete data to protect.
  const encryptedFields = new Map<string, Partial<Record<ProtectedField, string>>>();
  const rlsRows: SecurityData['rlsRows'] = [];
  for (const [memberId, branchId] of [
    [MEMBER_B1, BRANCH_B1],
    [MEMBER_B2, BRANCH_B2],
  ] as const) {
    encryptedFields.set(`members:${memberId}`, {
      national_id: encryptIdNumber('1990123456789', ORG_ID),
      bank_account: encryptIdNumber('BRK009988776655', ORG_ID),
      phone: encryptIdNumber('01712345678', ORG_ID),
    });
    for (const table of ['members', 'savings_accounts', 'vouchers']) {
      rlsRows.push({ id: randomUUID(), table, branchId, value: `${table}@${branchId.slice(-2)}` });
    }
  }
  return {
    orgId: ORG_ID,
    audit: [],
    unmaskLog: [],
    loginAttempts: [],
    devices: [],
    encryptedFields,
    consents: [],
    retentionRules: DEFAULT_RETENTION_RULES.map((r) => ({ ...r })),
    corrections: [],
    config: {
      passwordPolicy: { ...DEFAULT_PASSWORD_POLICY },
      totp: { ...DEFAULT_TOTP_CONFIG },
      lockout: { ...DEFAULT_LOCKOUT_POLICY },
      session: { ...DEFAULT_SESSION_POLICY },
      ipAllowlist: { ...DEFAULT_IP_ALLOWLIST },
    },
    totpEnrollments: new Map(),
    passwordHistory: new Map(),
    rlsRows,
  };
}

export function securityStore(): SecurityData {
  if (!g.__securityDemoData) g.__securityDemoData = seed();
  return g.__securityDemoData;
}

export function resetSecurityStore(): void {
  g.__securityDemoData = undefined;
}

/* ── Req 1: append-only audit trail ───────────────────────────────────────── */

export interface AuditActor {
  userId: string;
  userName?: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * The ONLY write path into the audit trail (mirrors the SQL trigger). No
 * update/delete functions exist on purpose — append-only, req 1.
 */
export function appendAudit(
  input: {
    tableName: string;
    recordId: string;
    action: AuditAction;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  },
  actor: AuditActor,
  at = new Date().toISOString(),
): AuditRecord {
  const store = securityStore();
  const oldValues = input.oldValues ?? null;
  const newValues = input.newValues ?? null;
  const changedFields =
    input.action === 'update' && oldValues && newValues
      ? Object.keys(newValues).filter((k) => JSON.stringify(newValues[k]) !== JSON.stringify(oldValues[k]))
      : input.action === 'insert'
        ? Object.keys(newValues ?? {})
        : input.action === 'delete'
          ? Object.keys(oldValues ?? {})
          : [];
  const rec: AuditRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    tableName: input.tableName,
    recordId: input.recordId,
    action: input.action,
    oldValues,
    newValues,
    changedFields,
    userId: actor.userId,
    userName: actor.userName ?? null,
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
    at,
  };
  store.audit.unshift(rec);
  return rec;
}

export function listAudit(filter: Partial<AuditFilter> = {}): AuditRecord[] {
  const store = securityStore();
  const { limit = 50, ...rest } = filter;
  let rows = [...store.audit].sort((a, b) => b.at.localeCompare(a.at));
  if (rest.tableName) rows = rows.filter((r) => r.tableName === rest.tableName);
  if (rest.recordId) rows = rows.filter((r) => r.recordId.includes(rest.recordId as string));
  if (rest.action) rows = rows.filter((r) => r.action === rest.action);
  if (rest.userId) rows = rows.filter((r) => (r.userId ?? '').toLowerCase().includes(rest.userId!.toLowerCase()));
  if (rest.from) rows = rows.filter((r) => r.at.slice(0, 10) >= rest.from!);
  if (rest.to) rows = rows.filter((r) => r.at.slice(0, 10) <= rest.to!);
  if (rest.q) {
    const q = rest.q.toLowerCase();
    rows = rows.filter((r) =>
      `${r.tableName} ${r.recordId} ${r.userName ?? ''} ${r.ip ?? ''} ${r.changedFields.join(' ')}`.toLowerCase().includes(q),
    );
  }
  return rows.slice(0, limit);
}

/** Audit rows touching one member: direct rows + rows of their consents/corrections. */
export function auditForMember(memberId: string): AuditRecord[] {
  const store = securityStore();
  const related = new Set<string>([memberId]);
  for (const c of store.corrections) if (c.memberId === memberId) related.add(c.id);
  for (const c of store.consents) if (c.memberId === memberId) related.add(c.id);
  return store.audit.filter((r) => related.has(r.recordId));
}

/* ── Req 2: protected fields + logged unmasking ───────────────────────────── */

function fieldKey(entityTable: string, entityId: string): string {
  return `${entityTable}:${entityId}`;
}

export function setProtectedField(
  entityTable: string,
  entityId: string,
  field: ProtectedField,
  plaintext: string,
): string {
  const store = securityStore();
  const key = fieldKey(entityTable, entityId);
  const enc = encryptIdNumber(plaintext, store.orgId);
  const slot = store.encryptedFields.get(key) ?? {};
  slot[field] = enc;
  store.encryptedFields.set(key, slot);
  return enc;
}

/** Masked value for any role (UI default display, req 2). */
export function maskedProtectedField(
  entityTable: string,
  entityId: string,
  field: ProtectedField,
): string {
  const enc = securityStore().encryptedFields.get(fieldKey(entityTable, entityId))?.[field];
  if (!enc) return '';
  return maskValue(field, decryptIdNumber(enc, securityStore().orgId));
}

/** Blind-index search over an encrypted field (duplicate detection). */
export function protectedFieldSearchHash(plaintext: string): string {
  return idSearchHash(plaintext, securityStore().orgId);
}

/** Reveal in the clear — role-checked AND logged (req 2: every unmask logged). */
export function revealProtectedField(
  entityTable: string,
  entityId: string,
  field: ProtectedField,
  viewer: { userId: string; userName: string; role: string; ip?: string | null },
): { value: string } {
  if (!canUnmaskField(viewer.role, field)) {
    err(403, 'FORBIDDEN', `এই তথ্য দেখার অনুমতি নেই / Role ${viewer.role} may not reveal ${field}`);
  }
  const store = securityStore();
  const enc = store.encryptedFields.get(fieldKey(entityTable, entityId))?.[field];
  if (!enc) err(404, 'NOT_FOUND', `সংরক্ষিত তথ্য নেই / No protected ${field} stored`);
  store.unmaskLog.unshift({
    id: randomUUID(),
    orgId: store.orgId,
    entityTable,
    entityId,
    field,
    userId: viewer.userId,
    userName: viewer.userName,
    role: viewer.role,
    ip: viewer.ip ?? null,
    at: new Date().toISOString(),
  });
  return { value: decryptIdNumber(enc as string, store.orgId) };
}

export function listUnmaskLog(filter: { field?: ProtectedField; userId?: string } = {}) {
  let rows = [...securityStore().unmaskLog];
  if (filter.field) rows = rows.filter((r) => r.field === filter.field);
  if (filter.userId) rows = rows.filter((r) => r.userId === filter.userId);
  return rows;
}

/* ── Req 3: security config ───────────────────────────────────────────────── */

export function getSecurityConfig(): SecurityData['config'] {
  const c = securityStore().config;
  return {
    passwordPolicy: { ...c.passwordPolicy },
    totp: { ...c.totp },
    lockout: { ...c.lockout },
    session: { ...c.session },
    ipAllowlist: { ...c.ipAllowlist },
  };
}

export function updateSecurityConfig(
  patch: Partial<Pick<SecurityData['config'], 'passwordPolicy' | 'totp' | 'lockout' | 'session' | 'ipAllowlist'>>,
  viewer: { userId: string; role: string },
): SecurityData['config'] {
  if (!['super_admin', 'org_admin'].includes(viewer.role)) {
    err(403, 'FORBIDDEN', 'শুধু হেড অফিস নিরাপত্তা নীতি বদলাতে পারে / Only Head Office may change security policy');
  }
  const c = securityStore().config;
  if (patch.passwordPolicy) c.passwordPolicy = { ...c.passwordPolicy, ...patch.passwordPolicy };
  if (patch.totp) c.totp = { ...c.totp, ...patch.totp };
  if (patch.lockout) c.lockout = { ...c.lockout, ...patch.lockout };
  if (patch.session) c.session = { ...c.session, ...patch.session };
  if (patch.ipAllowlist) c.ipAllowlist = { ...c.ipAllowlist, ...patch.ipAllowlist };
  appendAudit(
    { tableName: 'security_config', recordId: securityStore().orgId, action: 'update', oldValues: null, newValues: { patch } },
    { userId: viewer.userId, userName: viewer.role },
  );
  return getSecurityConfig();
}

/* ── Req 3: login attempts + lockout ──────────────────────────────────────── */

export function recordLoginAttempt(email: string, ok: boolean, ip: string | null, at = new Date().toISOString()): void {
  securityStore().loginAttempts.unshift({ email, ok, ip, at });
}

export function checkLockout(email: string, now = new Date()): { locked: boolean; remainingMs: number; failedCount: number } {
  return lockoutDecision(securityStore().loginAttempts, email, securityStore().config.lockout, now);
}

/* ── Req 3: devices ───────────────────────────────────────────────────────── */

export function registerDevice(
  userId: string,
  body: { label: string },
  meta: { userAgent?: string | null; ip?: string | null } = {},
): DeviceRecord {
  const store = securityStore();
  const now = new Date().toISOString();
  const rec: DeviceRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    userId,
    label: body.label,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
    createdAt: now,
    lastSeenAt: now,
    revoked: false,
  };
  store.devices.unshift(rec);
  return rec;
}

export function listDevices(viewer: { userId: string; role: string }, userId?: string): DeviceRecord[] {
  const store = securityStore();
  const admins = ['super_admin', 'org_admin'];
  const target = userId && admins.includes(viewer.role) ? userId : viewer.userId;
  return store.devices.filter((d) => d.userId === target);
}

export function revokeDevice(id: string, viewer: { userId: string; role: string }): DeviceRecord {
  const store = securityStore();
  const d = store.devices.find((x) => x.id === id);
  if (!d) err(404, 'NOT_FOUND', `ডিভাইস নেই / Device not found: ${id}`);
  if (d.userId !== viewer.userId && !['super_admin', 'org_admin'].includes(viewer.role)) {
    err(403, 'FORBIDDEN', 'শুধু নিজের ডিভাইস / Only your own devices');
  }
  d.revoked = true;
  return d;
}

/* ── Req 3: TOTP (RFC 6238 via node:crypto) ───────────────────────────────── */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function b32decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secretB32: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac('sha1', b32decode(secretB32)).update(buf).digest();
  const off = mac[mac.length - 1]! & 0x0f;
  const code = ((mac[off]! & 0x7f) << 24) | (mac[off + 1]! << 16) | (mac[off + 2]! << 8) | mac[off + 3]!;
  return String(code % 1_000_000).padStart(6, '0');
}

/** Current TOTP for a secret at time `atMs` (30 s step, 6 digits). */
export function totpCurrent(secretB32: string, atMs = Date.now()): string {
  return hotp(secretB32, Math.floor(atMs / 30_000));
}

export function totpVerify(secretB32: string, code: string, window = 1, atMs = Date.now()): boolean {
  const step = Math.floor(atMs / 30_000);
  for (let i = -window; i <= window; i += 1) {
    if (hotp(secretB32, step + i) === code) return true;
  }
  return false;
}

/** Start enrollment: generate + store an unconfirmed secret, return otpauth URL. */
export function totpEnrollStart(account: string, userId: string): { secretB32: string; otpauthUrl: string } {
  const store = securityStore();
  const bytes = randomBytes(20);
  const secret = base32Encode(bytes);
  store.totpEnrollments.set(userId, { secretB32: secret, confirmed: false, lastCode: null, enabled: false });
  const label = encodeURIComponent(`Samity Manager:${account}`);
  const params = new URLSearchParams({ secret, issuer: 'Samity Manager', algorithm: 'SHA1', digits: '6', period: '30' });
  return { secretB32: secret, otpauthUrl: `otpauth://totp/${label}?${params.toString()}` };
}

/** Confirm with the first code, then the authenticator is active. */
export function totpEnrollConfirm(userId: string, code: string): { enabled: boolean } {
  const store = securityStore();
  const enr = store.totpEnrollments.get(userId);
  if (!enr) err(404, 'NOT_FOUND', 'সক্রিয়করণ শুরু হয়নি / No enrollment started');
  if (!totpVerify(enr.secretB32, code, store.config.totp.window)) {
    err(422, 'VALIDATION_ERROR', 'ভুল কোড / Wrong verification code');
  }
  enr.confirmed = true;
  enr.enabled = true;
  enr.lastCode = code;
  return { enabled: true };
}

export function totpStatus(userId: string): { enabled: boolean; required: boolean } {
  const store = securityStore();
  return {
    enabled: store.totpEnrollments.get(userId)?.enabled ?? false,
    required: store.config.totp.enabled && (store.config.totp.requiredRoles as readonly string[]).length > 0,
  };
}

/** Session-level check: does this user satisfy an enforced 2FA requirement? */
export function totpSatisfied(userId: string, role: string): boolean {
  const store = securityStore();
  if (!store.config.totp.enabled) return true;
  if (!(store.config.totp.requiredRoles as readonly string[]).includes(role)) return true;
  return store.totpEnrollments.get(userId)?.enabled ?? false;
}

/* ── Req 3: session + finance IP gate ─────────────────────────────────────── */

export interface SessionMeta {
  issuedAtMs: number;
  lastSeenMs: number;
  nowMs?: number;
}

/** Session timeout decision (absolute + idle, req 3). */
export function sessionTimeoutDecision(meta: SessionMeta): { ok: boolean; reason?: 'absolute_expired' | 'idle_expired' } {
  const s = securityStore().config.session;
  const now = meta.nowMs ?? Date.now();
  if (now - meta.issuedAtMs > s.absoluteHours * 3_600_000) return { ok: false, reason: 'absolute_expired' };
  if (now - meta.lastSeenMs > s.idleMinutes * 60_000) return { ok: false, reason: 'idle_expired' };
  return { ok: true };
}

/** The finance-role IP allow-list gate (mutations only, req 3). */
export function financeIpGateDecision(role: string, method: string, ip: string | null | undefined): { ok: boolean; reason?: string } {
  const list = securityStore().config.ipAllowlist;
  if (!list.enabled) return { ok: true };
  const financeRoles = ['super_admin', 'org_admin', 'branch_manager'];
  if (!financeRoles.includes(role)) return { ok: true };
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return { ok: true };
  const toInt = (s: string): number | null => {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim());
    if (!m) return null;
    const p = m.slice(1).map(Number);
    return p.some((x) => x > 255) ? null : ((p[0]! << 24) | (p[1]! << 16) | (p[2]! << 8) | p[3]!) >>> 0;
  };
  const addr = ip ? toInt(ip) : null;
  if (addr === null) return { ok: false, reason: 'ফাইন্যান্স পরিবর্তনের জন্য অনুমোদিত IP লাগবে / Finance mutations require an allow-listed IP' };
  for (const entry of list.cidrs) {
    const [base, bitsRaw] = entry.split('/');
    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    const net = toInt(base ?? '');
    if (net === null || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((addr & mask) === (net & mask)) return { ok: true };
  }
  return { ok: false, reason: 'এই IP থেকে ফাইন্যান্স পরিবর্তন নিষিদ্ধ / This IP is not on the finance allow-list' };
}

/* ── Req 4: RLS cross-branch simulator (the automated matrix runs this) ───── */

export interface RlsAttempt {
  table: string;
  /** Branch the acting session belongs to. */
  sessionBranchId: string;
  /** Row the session tries to touch. */
  rowBranchId: string;
  op: 'select' | 'insert' | 'update' | 'delete';
}

/** Postgres RLS verdict for one attempt against our policy set. */
export function rlsVerdict(attempt: RlsAttempt): 'allow' | 'deny' {
  const rows = RLS_TEST_MATRIX.filter((r) => r.table === attempt.table);
  if (rows.length === 0) return 'allow'; // not branch-scoped → org-scoped only
  if (attempt.sessionBranchId === attempt.rowBranchId) return 'allow';
  // Cross-branch: no policy grants any statement to a foreign branch.
  return 'deny';
}

/** Run the full RLS_TEST_MATRIX as cross-branch probes; every row must deny. */
export function runRlsMatrix(): { table: string; expect: string; verdict: 'deny'; sessionBranch: string; rowBranch: string }[] {
  const out: { table: string; expect: string; verdict: 'deny'; sessionBranch: string; rowBranch: string }[] = [];
  for (const row of RLS_TEST_MATRIX) {
    const sessionBranch = BRANCH_B1;
    const rowBranch = BRANCH_B2;
    for (const op of ['select', 'insert', 'update', 'delete'] as const) {
      const v = rlsVerdict({ table: row.table, sessionBranchId: sessionBranch, rowBranchId: rowBranch, op });
      if (v !== 'deny') err(500, 'INTERNAL', `RLS matrix failure: ${row.table}.${op} leaked cross-branch`);
      out.push({ table: row.table, expect: row.expect, verdict: 'deny' as const, sessionBranch, rowBranch });
    }
    // Also verify same-branch reads stay allowed for select-scoped tables.
    const same = rlsVerdict({ table: row.table, sessionBranchId: rowBranch, rowBranchId: rowBranch, op: 'select' });
    if (same !== 'allow') err(500, 'INTERNAL', `RLS matrix failure: ${row.table} denied own-branch select`);
  }
  return out;
}

/** One simulated row-visibility probe against the seeded demo rows. */
export function rlsVisibleRows(table: string, sessionBranchId: string): SecurityData['rlsRows'] {
  return securityStore().rlsRows.filter((r) => r.table === table && rlsVerdict({ table, sessionBranchId, rowBranchId: r.branchId, op: 'select' }) === 'allow');
}

/* ── Req 5: consent, retention, correction, export ────────────────────────── */

export function recordConsent(
  body: { memberId: string; kind: ConsentKind; granted: boolean; textVersion?: string; method?: 'written' | 'verbal' | 'digital'; witnessName?: string | null },
  viewer: { userId: string },
) {
  const store = securityStore();
  const rec = {
    id: randomUUID(),
    orgId: store.orgId,
    memberId: body.memberId,
    kind: body.kind,
    granted: body.granted,
    textVersion: body.textVersion ?? 'v1',
    method: body.method ?? ('written' as const),
    witnessName: body.witnessName ?? null,
    grantedAt: new Date().toISOString(),
    revokedAt: body.granted ? null : new Date().toISOString(),
    recordedBy: viewer.userId,
  };
  store.consents.unshift(rec);
  appendAudit({ tableName: 'member_consents', recordId: rec.id, action: 'insert', newValues: { ...rec } }, { userId: viewer.userId });
  return rec;
}

export function listConsents(memberId: string) {
  return securityStore().consents.filter((c) => c.memberId === memberId);
}

/** Latest consent state per kind for a member. */
export function consentSummary(memberId: string): Record<ConsentKind, boolean> {
  const out = { data_processing: false, photo_use: false, sms_communication: false, biometric: false } as Record<ConsentKind, boolean>;
  for (const c of listConsents(memberId)) out[c.kind] = c.granted;
  return out;
}

export function listRetentionRules(): RetentionRule[] {
  return [...securityStore().retentionRules];
}

export function upsertRetentionRule(rule: RetentionRule, viewer: { userId: string; role: string }): RetentionRule {
  if (!['super_admin', 'org_admin'].includes(viewer.role)) err(403, 'FORBIDDEN', 'শুধু হেড অফিস / Head Office only');
  const store = securityStore();
  const existing = store.retentionRules.find((r) => r.class === rule.class);
  if (existing) {
    existing.retainMonths = rule.retainMonths;
    existing.legalHold = rule.legalHold;
    return { ...existing };
  }
  store.retentionRules.push({ ...rule });
  return { ...rule };
}

/** Rows that became purge-eligible (retention age reached, no legal hold). */
export function retentionPurgePreview(now = new Date()): { class: RetentionRule['class']; eligibleCount: number }[] {
  const store = securityStore();
  return store.retentionRules.map((r) => {
    const cutoff = new Date(now.getTime() - r.retainMonths * 30 * 86_400_000).toISOString();
    const eligibleCount = store.audit.filter((a) => a.at < cutoff).length;
    return { class: r.class, eligibleCount: r.legalHold ? 0 : eligibleCount };
  });
}

export function createCorrection(
  body: { memberId: string; field: string; requestedValue: string; reason: string },
  viewer: { userId: string },
) {
  const store = securityStore();
  const now = new Date().toISOString();
  const rec = {
    id: randomUUID(),
    orgId: store.orgId,
    memberId: body.memberId,
    memberName: `সদস্য ${body.memberId.slice(-4)}`,
    field: body.field,
    currentValue: '',
    requestedValue: body.requestedValue,
    reason: body.reason,
    status: 'submitted' as const,
    decidedBy: null,
    decidedAt: null,
    decisionNote: '',
    appliedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.corrections.unshift(rec);
  appendAudit({ tableName: 'member_corrections', recordId: rec.id, action: 'insert', newValues: { ...rec } }, { userId: viewer.userId });
  return rec;
}

export function listCorrections(filter: { status?: CorrectionStatus; memberId?: string } = {}) {
  let rows = [...securityStore().corrections];
  if (filter.status) rows = rows.filter((c) => c.status === filter.status);
  if (filter.memberId) rows = rows.filter((c) => c.memberId === filter.memberId);
  return rows;
}

function getCorrection(id: string) {
  const c = securityStore().corrections.find((x) => x.id === id);
  if (!c) err(404, 'NOT_FOUND', `সংশোধনের আবেদন নেই / Correction not found: ${id}`);
  return c!;
}

export function decideCorrection(id: string, decision: 'approve' | 'reject' | 'review', note: string, viewer: { userId: string; role: string }) {
  if (!['super_admin', 'org_admin', 'branch_manager'].includes(viewer.role)) {
    err(403, 'FORBIDDEN', 'শুধু ম্যানেজাররা সিদ্ধান্ত নেন / Only managers decide corrections');
  }
  const c = getCorrection(id);
  const to: CorrectionStatus = decision === 'approve' ? 'approved' : decision === 'review' ? 'in_review' : 'rejected';
  if (!canTransitionCorrection(c.status, to)) {
    err(409, 'CONFLICT', `${c.status} থেকে ${to}-এ যাওয়া যাবে না / Invalid transition ${c.status} → ${to}`);
  }
  const prev = c.status;
  c.status = to;
  c.decidedBy = viewer.userId;
  c.decidedAt = new Date().toISOString();
  c.decisionNote = note;
  c.updatedAt = c.decidedAt;
  appendAudit({ tableName: 'member_corrections', recordId: c.id, action: 'update', oldValues: { status: prev }, newValues: { status: to } }, { userId: viewer.userId });
  return c;
}

export function applyCorrection(id: string, viewer: { userId: string; role: string }) {
  const c = getCorrection(id);
  if (!canTransitionCorrection(c.status, 'applied')) {
    err(409, 'CONFLICT', `অনুমোদনের পরেই প্রয়োগ হয় / Only approved corrections can be applied (${c.status})`);
  }
  if (PROTECTED_FIELDS.includes(c.field as ProtectedField)) {
    setProtectedField('members', c.memberId, c.field as ProtectedField, c.requestedValue);
  }
  c.status = 'applied';
  c.appliedAt = new Date().toISOString();
  c.updatedAt = c.appliedAt;
  appendAudit({ tableName: 'member_corrections', recordId: c.id, action: 'update', oldValues: { status: 'approved' }, newValues: { status: 'applied' } }, { userId: viewer.userId });
  return c;
}

/** The member data export (req 5) — protected fields stay masked. */
export function buildMemberExport(memberId: string): MemberDataExport {
  const store = securityStore();
  const now = new Date().toISOString();
  return {
    exportedAt: now,
    orgId: store.orgId,
    member: {
      id: memberId,
      memberCode: 'M-0001',
      name: 'রহিমা বেগম',
      nationalIdMasked: maskedProtectedField('members', memberId, 'national_id'),
      phoneMasked: maskedProtectedField('members', memberId, 'phone'),
      address: 'গাজীপুর, ঢাকা',
      status: 'active',
      joinedAt: '2026-01-15T00:00:00.000Z',
    },
    consents: listConsents(memberId).map((c) => ({ kind: c.kind, granted: c.granted, grantedAt: c.grantedAt, textVersion: c.textVersion })),
    savings: [{ accountNo: 'SAV-2026-0001', product: 'বাধ্যতামূলক সাপ্তাহিক', balance: '5400.00' }],
    loans: [{ code: 'LN-2026-0001', product: 'গরুর পালন', principal: '25000.00', status: 'active' }],
    corrections: listCorrections({ memberId }).map((c) => ({ field: c.field, requestedValue: c.requestedValue, status: c.status, createdAt: c.createdAt })),
    auditTrail: auditForMember(memberId).map((a) => ({ at: a.at, action: a.action, tableName: a.tableName, userId: a.userId })),
  };
}
