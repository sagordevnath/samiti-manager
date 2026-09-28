/**
 * ── Security, audit & privacy engine (pure) ──────────────────────────────────
 * Req 1: generic audit trail record + append-only guarantees and the viewer
 *   filter schema for all sensitive tables.
 * Req 2: field-level protection — which fields are encrypted, per-role masking
 *   rules and the unmask-request record (every reveal is logged).
 * Req 3: security controls — password policy evaluation, TOTP (RFC 6238)
 *   enrollment/verification helpers, brute-force lockout policy, device
 *   registry, IP allow-list for finance roles, session timeout policy.
 * Req 4: RLS test matrix — branch-scoped tables × cross-branch expectations,
 *   the automated cross-branch suite asserts these all FAIL to leak.
 * Req 5: data protection — consent records, retention rules, the
 *   right-to-correction workflow and the member data export builder.
 *
 * Everything here is pure: the API store owns IO (DB/crypto/HTTP) and calls
 * into these helpers, mirroring the communication/documents pattern.
 */
import { z } from 'zod';

/* ── Req 1: audit trail ───────────────────────────────────────────────────── */

/** Actions the generic trigger records. */
export const AUDIT_ACTIONS = ['insert', 'update', 'delete'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS_BN: Record<AuditAction, string> = {
  insert: 'সন্নিবেশ',
  update: 'পরিবর্তন',
  delete: 'মুছে ফেলা',
};

/**
 * One audit trail row. Written ONLY by the generic trigger (migration 0056):
 * the table itself is append-only (no update/delete policy + trigger guard),
 * so old_values/new_values can never be rewritten.
 */
export interface AuditRecord {
  id: string;
  orgId: string;
  /** Sensitive table that changed, e.g. 'members', 'vouchers'. */
  tableName: string;
  /** Primary key of the affected row (text — works for uuid and bigint keys). */
  recordId: string;
  action: AuditAction;
  /** Pre-change values (null for inserts). */
  oldValues: Record<string, unknown> | null;
  /** Post-change values (null for deletes). */
  newValues: Record<string, unknown> | null;
  changedFields: string[];
  /** Acting user (auth uid, or 'system' for service-role jobs). */
  userId: string | null;
  userName: string | null;
  /** Request origin captured by the API layer. */
  ip: string | null;
  userAgent: string | null;
  at: string;
}

/** Sensitive tables the generic trigger covers (branch/finance/personal). */
export const AUDIT_SENSITIVE_TABLES = [
  'members',
  'member_nominees',
  'savings_accounts',
  'savings_transactions',
  'loans',
  'loan_applications',
  'loan_disbursements',
  'collection_entries',
  'cash_handovers',
  'vouchers',
  'voucher_lines',
  'payroll_lines',
  'hr_staff',
  'users_profile',
] as const;
export type SensitiveTable = (typeof AUDIT_SENSITIVE_TABLES)[number];

/** Viewer filters for the audit UI (all optional, AND-combined). */
export const auditFilterSchema = z.object({
  tableName: z.string().trim().max(63).optional(),
  recordId: z.string().trim().max(80).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  userId: z.string().trim().max(80).optional(),
  /** Inclusive ISO date bounds (compared on the `at` timestamp). */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditFilter = z.infer<typeof auditFilterSchema>;

/** Apply one filter row-by-row (pure; the store feeds it sorted rows). */
export function auditRecordMatches(r: AuditRecord, f: AuditFilter): boolean {
  if (f.tableName && r.tableName !== f.tableName) return false;
  if (f.recordId && !r.recordId.includes(f.recordId)) return false;
  if (f.action && r.action !== f.action) return false;
  if (f.userId && !(r.userId ?? '').toLowerCase().includes(f.userId.toLowerCase())) return false;
  const day = r.at.slice(0, 10);
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = `${r.tableName} ${r.recordId} ${r.userName ?? ''} ${r.ip ?? ''} ${r.changedFields.join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/* ── Req 2: field-level protection & masking ──────────────────────────────── */

/** Personal fields protected with encryption + masking. */
export const PROTECTED_FIELDS = ['national_id', 'bank_account', 'phone'] as const;
export type ProtectedField = (typeof PROTECTED_FIELDS)[number];

export const PROTECTED_FIELD_LABELS_BN: Record<ProtectedField, string> = {
  national_id: 'জাতীয় পরিচয়পত্র নম্বর',
  bank_account: 'ব্যাংক হিসাব নম্বর',
  phone: 'মোবাইল নম্বর',
};

/** Which fields each role may see in the clear (req 2 — mask in UI by role). */
export const UNMASK_ALLOWED_ROLES: Record<ProtectedField, readonly string[]> = {
  national_id: ['super_admin', 'org_admin', 'area_manager', 'branch_manager'],
  bank_account: ['super_admin', 'org_admin', 'branch_manager'],
  phone: ['super_admin', 'org_admin', 'area_manager', 'branch_manager', 'account_officer'],
};

export function canUnmaskField(role: string, field: ProtectedField): boolean {
  return (UNMASK_ALLOWED_ROLES[field] as readonly string[]).includes(role);
}

/** Mask for display: keep last4 (phone keeps prefix + last2). */
export function maskValue(field: ProtectedField, raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (field === 'phone') return digits.length >= 11 ? `${digits.slice(0, 5)}••••${digits.slice(-2)}` : '••••••';
  return digits.length >= 4 ? `••••••${digits.slice(-4)}` : '••••••';
}

/** Every reveal is logged as one of these rows (req 2). */
export interface UnmaskLog {
  id: string;
  orgId: string;
  /** 'members:<recordId>' style target. */
  entityTable: string;
  entityId: string;
  field: ProtectedField;
  userId: string;
  userName: string | null;
  role: string;
  ip: string | null;
  /** The revealed value stays out of the log — only who/when/what field. */
  at: string;
}

/** Pure unmask decision — the store encrypts, logs and returns the value. */
export function unmaskDecision(
  role: string,
  field: ProtectedField,
): { ok: boolean; reason?: string } {
  if (!canUnmaskField(role, field)) {
    return { ok: false, reason: `এই তথ্য দেখার অনুমতি নেই / Role ${role} may not reveal ${field}` };
  }
  return { ok: true };
}

/* ── Req 3: password policy ───────────────────────────────────────────────── */

export const passwordPolicySchema = z.object({
  minLength: z.number().int().min(8).max(64).default(10),
  requireUpper: z.boolean().default(true),
  requireLower: z.boolean().default(true),
  requireDigit: z.boolean().default(true),
  requireSpecial: z.boolean().default(true),
  /** Reject if the password contains the email local-part or org name. */
  rejectPersonalInfo: z.boolean().default(true),
  /** Cannot reuse the last N passwords. */
  historyCount: z.number().int().min(0).max(24).default(3),
  maxAgeDays: z.number().int().min(0).max(3650).default(365),
});
export type PasswordPolicy = z.infer<typeof passwordPolicySchema>;

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 10,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSpecial: true,
  rejectPersonalInfo: true,
  historyCount: 3,
  maxAgeDays: 365,
};

export const PASSWORD_POLICY_LABELS_BN: Record<keyof PasswordPolicy, string> = {
  minLength: 'সর্বনিম্ন দৈর্ঘ্য',
  requireUpper: 'বড় হাতের অক্ষর আবশ্যক',
  requireLower: 'ছোট হাতের অক্ষর আবশ্যক',
  requireDigit: 'সংখ্যা আবশ্যক',
  requireSpecial: 'বিশেষ অক্ষর আবশ্যক',
  rejectPersonalInfo: 'ব্যক্তিগত তথ্য নিষিদ্ধ',
  historyCount: 'পুরোনো পাসওয়ার্ড পুনর্ব্যবহার নিষেধ (সংখ্যা)',
  maxAgeDays: 'পাসওয়ার্ডের সর্বোচ্চ বয়স (দিন)',
};

/** Evaluate a candidate password; Bangla error reasons for the UI. */
export function evaluatePassword(
  password: string,
  policy: PasswordPolicy,
  context: { email?: string; name?: string } = {},
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (password.length < policy.minLength) problems.push(`কমপক্ষে ${policy.minLength} অক্ষর হতে হবে`);
  if (policy.requireUpper && !/[A-Z]/.test(password)) problems.push('অন্তত একটি বড় হাতের অক্ষর লাগবে');
  if (policy.requireLower && !/[a-z]/.test(password)) problems.push('অন্তত একটি ছোট হাতের অক্ষর লাগবে');
  if (policy.requireDigit && !/\d/.test(password)) problems.push('অন্তত একটি সংখ্যা লাগবে');
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) problems.push('অন্তত একটি বিশেষ অক্ষর লাগবে');
  if (policy.rejectPersonalInfo) {
    const local = (context.email ?? '').split('@')[0]?.toLowerCase() ?? '';
    if (local.length >= 3 && password.toLowerCase().includes(local)) problems.push('পাসওয়ার্ডে ইমেইলের অংশ থাকতে পারবে না');
    const nm = (context.name ?? '').trim().toLowerCase();
    if (nm.length >= 3 && password.toLowerCase().includes(nm)) problems.push('পাসওয়ার্ডে নাম থাকতে পারবে না');
  }
  return { ok: problems.length === 0, problems };
}

/* ── Req 3: TOTP 2FA (RFC 6238, pure helpers) ─────────────────────────────── */

/** Head-office roles 2FA may be enforced for. */
export const TOTP_ELIGIBLE_ROLES = ['super_admin', 'org_admin', 'area_manager'] as const;
export type TotpEligibleRole = (typeof TOTP_ELIGIBLE_ROLES)[number];

export const totpConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Roles that MUST enroll before the session is considered fully valid. */
  requiredRoles: z.array(z.enum(TOTP_ELIGIBLE_ROLES)).default([]),
  /** Allowed drift in ± steps (30 s each). */
  stepSeconds: z.literal(30).default(30),
  window: z.number().int().min(0).max(5).default(1),
  digits: z.literal(6).default(6),
  issuer: z.string().trim().min(1).max(40).default('Samity Manager'),
});
export type TotpConfig = z.infer<typeof totpConfigSchema>;

export const DEFAULT_TOTP_CONFIG: TotpConfig = {
  enabled: true,
  requiredRoles: ['super_admin', 'org_admin'],
  stepSeconds: 30,
  window: 1,
  digits: 6,
  issuer: 'Samity Manager',
};

export function totpRequiredForRole(cfg: TotpConfig, role: string): boolean {
  return cfg.enabled && (cfg.requiredRoles as readonly string[]).includes(role);
}

/** RFC 4648 base32 (no padding) encode — pure. */
export function base32Encode(buf: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/** base32 decode (accepts padded or not, case-insensitive). */
export function base32Decode(s: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(bytes);
}

/** otpauth:// URL for QR enrollment (Google Authenticator / Authy compatible). */
export function otpauthUrl(account: string, secretB32: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** The pure TOTP interface — implemented in the API store with node:crypto. */
export interface TotpVerifier {
  /** HOTP(code) for the current ± window steps. */
  verify(secretB32: string, code: string, atMs?: number): boolean;
  current(secretB32: string, atMs?: number): string;
}

/* ── Req 3: brute-force lockout ───────────────────────────────────────────── */

export const lockoutPolicySchema = z.object({
  maxFailedAttempts: z.number().int().min(3).max(20).default(5),
  lockMinutes: z.number().int().min(1).max(1440).default(15),
  /** Rolling window in which the failed attempts count. */
  windowMinutes: z.number().int().min(1).max(1440).default(15),
});
export type LockoutPolicy = z.infer<typeof lockoutPolicySchema>;

export const DEFAULT_LOCKOUT_POLICY: LockoutPolicy = {
  maxFailedAttempts: 5,
  lockMinutes: 15,
  windowMinutes: 15,
};

export interface LoginAttemptRecord {
  email: string;
  ok: boolean;
  ip: string | null;
  at: string;
}

/** Pure lockout decision from the recent failed-attempt history. */
export function lockoutDecision(
  history: LoginAttemptRecord[],
  email: string,
  policy: LockoutPolicy,
  now = new Date(),
): { locked: boolean; remainingMs: number; failedCount: number } {
  const since = now.getTime() - policy.windowMinutes * 60_000;
  const failed = history.filter(
    (h) => h.email.toLowerCase() === email.toLowerCase() && !h.ok && Date.parse(h.at) >= since,
  );
  if (failed.length < policy.maxFailedAttempts) return { locked: false, remainingMs: 0, failedCount: failed.length };
  const lastAt = Math.max(...failed.map((h) => Date.parse(h.at)));
  const remainingMs = Math.max(0, lastAt + policy.lockMinutes * 60_000 - now.getTime());
  return { locked: remainingMs > 0, remainingMs, failedCount: failed.length };
}

/* ── Req 3: sessions, devices, IP allow-list ──────────────────────────────── */

export const sessionPolicySchema = z.object({
  /** Absolute session lifetime. */
  absoluteHours: z.number().int().min(1).max(720).default(24),
  /** Idle timeout — the API rejects tokens issued longer than this ago when idle. */
  idleMinutes: z.number().int().min(5).max(1440).default(60),
  /** Re-authentication required for finance mutations after this many minutes idle. */
  financeReauthMinutes: z.number().int().min(5).max(1440).default(30),
});
export type SessionPolicy = z.infer<typeof sessionPolicySchema>;

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  absoluteHours: 24,
  idleMinutes: 60,
  financeReauthMinutes: 30,
};

/** Tracked browser/device per user (req 3 device list). */
export interface DeviceRecord {
  id: string;
  orgId: string;
  userId: string;
  /** Free label the user assigns, e.g. 'অফিস ল্যাপটপ'. */
  label: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  revoked: boolean;
}

export const deviceCreateSchema = z.object({
  label: z.string().trim().min(2).max(60),
});

/** Finance roles the IP allow-list may restrict (req 3). */
export const FINANCE_ROLES = ['super_admin', 'org_admin', 'branch_manager'] as const;

export const ipAllowlistSchema = z.object({
  enabled: z.boolean().default(false),
  /** CIDR or exact IP entries, e.g. '103.12.34.0/24', '203.0.113.9'. */
  cidrs: z.array(z.string().trim().regex(/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/)).max(50).default([]),
});
export type IpAllowlist = z.infer<typeof ipAllowlistSchema>;

export const DEFAULT_IP_ALLOWLIST: IpAllowlist = { enabled: false, cidrs: [] };

/** Pure CIDR match for IPv4 (accepts bare IPs as /32). */
export function ipInAllowlist(ip: string | null | undefined, list: IpAllowlist): boolean {
  if (!list.enabled) return true;
  if (!ip) return false;
  const toInt = (s: string): number | null => {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim());
    if (!m) return null;
    const parts = m.slice(1).map(Number);
    if (parts.some((p) => p > 255)) return null;
    return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  };
  const addr = toInt(ip);
  if (addr === null) return false;
  for (const entry of list.cidrs) {
    const [base, bitsRaw] = entry.split('/');
    const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
    const net = toInt(base ?? '');
    if (net === null || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((addr & mask) === (net & mask)) return true;
  }
  return false;
}

/** Does this request need the finance IP gate? (role × mutation × policy) */
export function financeIpGateApplies(role: string, method: string, list: IpAllowlist): boolean {
  if (!list.enabled || (FINANCE_ROLES as readonly string[]).every((r) => r !== role)) return false;
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

/* ── Req 5: consent, retention, correction, export ────────────────────────── */

export const CONSENT_KINDS = ['data_processing', 'photo_use', 'sms_communication', 'biometric'] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

export const CONSENT_KIND_LABELS_BN: Record<ConsentKind, string> = {
  data_processing: 'তথ্য প্রক্রিয়াকরণে সম্মতি',
  photo_use: 'ছবি ব্যবহারে সম্মতি',
  sms_communication: 'এসএমএস যোগাযোগে সম্মতি',
  biometric: 'বায়োমেট্রিক সম্মতি',
};

/** Consent captured at admission and versioned on every change (req 5). */
export interface ConsentRecord {
  id: string;
  orgId: string;
  memberId: string;
  kind: ConsentKind;
  granted: boolean;
  /** Which consent text version they agreed to. */
  textVersion: string;
  method: 'written' | 'verbal' | 'digital';
  witnessName: string | null;
  grantedAt: string;
  revokedAt: string | null;
  recordedBy: string;
}

export const consentCreateSchema = z.object({
  memberId: z.string().trim().uuid(),
  kind: z.enum(CONSENT_KINDS),
  granted: z.boolean(),
  textVersion: z.string().trim().min(1).max(40).default('v1'),
  method: z.enum(['written', 'verbal', 'digital']).default('written'),
  witnessName: z.string().trim().max(80).nullish(),
});

/** Retention rule: how long each record class lives before purge (req 5). */
export const RETENTION_CLASSES = [
  'member_core',
  'savings_transactions',
  'loan_records',
  'audit_logs',
  'sms_deliveries',
  'documents',
] as const;
export type RetentionClass = (typeof RETENTION_CLASSES)[number];

export const RETENTION_CLASS_LABELS_BN: Record<RetentionClass, string> = {
  member_core: 'সদস্য মূল তথ্য',
  savings_transactions: 'সঞ্চয় লেনদেন',
  loan_records: 'ঋণের রেকর্ড',
  audit_logs: 'অডিট লগ',
  sms_deliveries: 'এসএমএস ডেলিভারি লগ',
  documents: 'দলিল',
};

export const retentionRuleSchema = z.object({
  class: z.enum(RETENTION_CLASSES),
  /** Months after last activity before the record becomes purge-eligible. */
  retainMonths: z.number().int().min(6).max(600),
  /** Legal hold pauses purging regardless of age. */
  legalHold: z.boolean().default(false),
});
export type RetentionRule = z.infer<typeof retentionRuleSchema>;

export const DEFAULT_RETENTION_RULES: RetentionRule[] = [
  { class: 'member_core', retainMonths: 60, legalHold: false },
  { class: 'savings_transactions', retainMonths: 120, legalHold: false },
  { class: 'loan_records', retainMonths: 120, legalHold: false },
  { class: 'audit_logs', retainMonths: 84, legalHold: false },
  { class: 'sms_deliveries', retainMonths: 24, legalHold: false },
  { class: 'documents', retainMonths: 120, legalHold: false },
];

/** Right-to-correction workflow states (req 5). */
export const CORRECTION_STATUSES = ['submitted', 'in_review', 'approved', 'rejected', 'applied'] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];

export const CORRECTION_STATUS_LABELS_BN: Record<CorrectionStatus, string> = {
  submitted: 'জমা হয়েছে',
  in_review: 'পর্যালোচনাধীন',
  approved: 'অনুমোদিত',
  rejected: 'প্রত্যাখ্যাত',
  applied: 'সংশোধন প্রয়োগ হয়েছে',
};

/** Legal transition table for the correction workflow. */
export const CORRECTION_FLOW: Record<CorrectionStatus, readonly CorrectionStatus[]> = {
  submitted: ['in_review', 'rejected'],
  in_review: ['approved', 'rejected'],
  approved: ['applied'],
  rejected: [],
  applied: [],
};

export function canTransitionCorrection(from: CorrectionStatus, to: CorrectionStatus): boolean {
  return CORRECTION_FLOW[from].includes(to);
}

export interface CorrectionRequest {
  id: string;
  orgId: string;
  memberId: string;
  memberName: string;
  /** Field the member wants corrected, e.g. 'phone', 'address'. */
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
}

export const correctionCreateSchema = z.object({
  memberId: z.string().trim().uuid(),
  field: z.string().trim().min(2).max(40),
  requestedValue: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(3).max(500),
});
export const correctionDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'review']),
  note: z.string().trim().max(500).default(''),
});

/** The member data export bundle (req 5 right-to-export). */
export interface MemberDataExport {
  exportedAt: string;
  orgId: string;
  member: {
    id: string;
    memberCode: string;
    name: string;
    /** Encrypted-at-rest fields are included masked unless unmask was granted. */
    nationalIdMasked: string;
    phoneMasked: string;
    address: string;
    status: string;
    joinedAt: string | null;
  };
  consents: { kind: ConsentKind; granted: boolean; grantedAt: string; textVersion: string }[];
  savings: { accountNo: string; product: string; balance: string }[];
  loans: { code: string; product: string; principal: string; status: string }[];
  corrections: { field: string; requestedValue: string; status: CorrectionStatus; createdAt: string }[];
  /** Full audit trail touching this member (req 1 × req 5 cross-link). */
  auditTrail: { at: string; action: AuditAction; tableName: string; userId: string | null }[];
}

/* ── Req 4: RLS verification matrix ───────────────────────────────────────── */

/**
 * Branch-scoped sensitive tables the automated cross-branch suite exercises:
 * a session bound to branch B1 must NEVER select/insert/update rows of branch
 * B2 (and vice versa). The API tests replay this matrix against the demo
 * scoping rules; the live RLS path enforces the same predicates in SQL
 * (migrations 0002…0057).
 */
export interface RlsMatrixRow {
  table: string;
  branchColumn: string;
  /** How the test must fail: select leaks, cross-branch write rejected. */
  expect: 'deny_cross_branch_select' | 'deny_cross_branch_write';
}

export const RLS_TEST_MATRIX: RlsMatrixRow[] = [
  { table: 'members', branchColumn: 'branch_id', expect: 'deny_cross_branch_select' },
  { table: 'member_nominees', branchColumn: 'branch_id', expect: 'deny_cross_branch_select' },
  { table: 'savings_accounts', branchColumn: 'branch_id', expect: 'deny_cross_branch_select' },
  { table: 'savings_transactions', branchColumn: 'branch_id', expect: 'deny_cross_branch_write' },
  { table: 'loans', branchColumn: 'branch_id', expect: 'deny_cross_branch_select' },
  { table: 'loan_applications', branchColumn: 'branch_id', expect: 'deny_cross_branch_write' },
  { table: 'loan_disbursements', branchColumn: 'branch_id', expect: 'deny_cross_branch_write' },
  { table: 'collection_entries', branchColumn: 'branch_id', expect: 'deny_cross_branch_write' },
  { table: 'cash_handovers', branchColumn: 'branch_id', expect: 'deny_cross_branch_write' },
  { table: 'vouchers', branchColumn: 'branch_id', expect: 'deny_cross_branch_write' },
  { table: 'payroll_lines', branchColumn: 'branch_id', expect: 'deny_cross_branch_select' },
  { table: 'hr_staff', branchColumn: 'branch_id', expect: 'deny_cross_branch_select' },
];

/** Label + branch map used by the demo RLS simulator (test + UI). */
export const RLS_DEMO_BRANCHES = {
  b1: { id: '00000000-0000-4000-8000-0000000000b1', nameBn: 'ধানমন্ডি শাখা' },
  b2: { id: '00000000-0000-4000-8000-0000000000b2', nameBn: 'ময়মনসিংহ শাখা' },
} as const;
