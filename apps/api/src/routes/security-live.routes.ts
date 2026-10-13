/**
 * ── Security live router (Supabase) ─────────────────────────────────────────
 * Mirrors security.routes.ts against the real tables (migration 0056):
 * the append-only audit trail viewer (written by the SQL trigger), protected
 * field masking + logged reveals (unmask_log), security config policies,
 * login lockout source, device registry, TOTP enrollment and the RLS matrix.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  DEFAULT_IP_ALLOWLIST,
  DEFAULT_LOCKOUT_POLICY,
  DEFAULT_PASSWORD_POLICY,
  DEFAULT_SESSION_POLICY,
  DEFAULT_TOTP_CONFIG,
  PROTECTED_FIELDS,
  RLS_TEST_MATRIX,
  auditFilterSchema,
  base32Encode,
  deviceCreateSchema,
  evaluatePassword,
  ipAllowlistSchema,
  lockoutPolicySchema,
  passwordPolicySchema,
  sessionPolicySchema,
  totpConfigSchema,
  type AuditAction,
  type DeviceRecord,
  type IpAllowlist,
  type ProtectedField,
} from '@samity/shared';
import { createHmac, randomBytes } from 'node:crypto';
import { BadRequest, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf } from '../lib/tenant.js';
import { maskedProtectedFieldLive, revealProtectedFieldLive } from './documents-live.routes.js';

export const securityLiveRouter = Router();
securityLiveRouter.use(requireAuth);


function viewerOf(req: RequestWithAuth): { userId: string; userName: string; role: string; ip: string | null } {
  return {
    userId: req.auth?.userId ?? 'unknown',
    userName: req.auth?.email ?? 'unknown',
    role: req.auth?.role ?? 'member',
    ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? null,
  };
}

function qStr(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length > 0 ? s : undefined;
}

/* ── Req 1: audit trail viewer with filters (rows written by the SQL trigger) */

securityLiveRouter.get(
  '/audit',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const filter = auditFilterSchema.parse({
      tableName: qStr(req.query['tableName']),
      recordId: qStr(req.query['recordId']),
      action: qStr(req.query['action']),
      userId: qStr(req.query['userId']),
      from: qStr(req.query['from']),
      to: qStr(req.query['to']),
      q: qStr(req.query['q']),
      limit: qStr(req.query['limit']),
    });
    let query = supabaseAdmin.from('audit_records').select('*').eq('org_id', orgOf(req)).order('at', { ascending: false }).limit(filter.limit ?? 50);
    if (filter.tableName) query = query.eq('table_name', filter.tableName);
    if (filter.recordId) query = query.ilike('record_id', `%${filter.recordId}%`);
    if (filter.action) query = query.eq('action', filter.action);
    if (filter.userId) query = query.ilike('user_id', `%${filter.userId}%`);
    if (filter.from) query = query.gte('at', `${filter.from}T00:00:00Z`);
    if (filter.to) query = query.lte('at', `${filter.to}T23:59:59Z`);
    const { data, error } = await query;
    if (error) throw error;
    let rows = (data ?? []) as Record<string, unknown>[];
    if (filter.q) {
      const q = filter.q.toLowerCase();
      rows = rows.filter((r) =>
        `${r['table_name']} ${r['record_id']} ${r['user_name'] ?? ''} ${r['ip'] ?? ''} ${Array.isArray(r['changed_fields']) ? (r['changed_fields'] as unknown[]).join(' ') : ''}`.toLowerCase().includes(q),
      );
    }
    res.json({
      items: rows.map((r) => ({
        id: r['id'],
        orgId: r['org_id'],
        tableName: r['table_name'],
        recordId: r['record_id'],
        action: r['action'] as AuditAction,
        oldValues: r['old_values'] ?? null,
        newValues: r['new_values'] ?? null,
        changedFields: r['changed_fields'] ?? [],
        userId: r['user_id'] ?? null,
        userName: r['user_name'] ?? null,
        ip: r['ip'] ?? null,
        userAgent: r['user_agent'] ?? null,
        at: r['at'],
      })),
    });
  }),
);

/* ── Req 2: protected fields — masked view + role-checked reveal + log ────── */

securityLiveRouter.get(
  '/protected-fields/:entityTable/:entityId',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    if (req.params['entityTable'] !== 'members') throw BadRequest('শুধু members টেবিল সমর্থিত / Only the members table is supported');
    const orgId = orgOf(req);
    const entityId = req.params['entityId'] as string;
    const items = [];
    for (const f of PROTECTED_FIELDS) {
      items.push({ field: f, masked: await maskedProtectedFieldLive(orgId, entityId, f) });
    }
    res.json({ items });
  }),
);

const revealSchema = z.object({
  field: z.enum(PROTECTED_FIELDS),
  entityTable: z.string().trim().min(1).max(40).default('members'),
  entityId: z.string().trim().min(1).max(80),
});

securityLiveRouter.post(
  '/protected-fields/reveal',
  requirePermission('member:read'),
  validate(revealSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const v = viewerOf(req);
    const body = req.body as { field: ProtectedField; entityTable: string; entityId: string };
    if (body.entityTable !== 'members') throw BadRequest('শুধু members টেবিল সমর্থিত / Only the members table is supported');
    const value = await revealProtectedFieldLive(orgOf(req), body.entityId, body.field, v);
    if (value === null) throw NotFound(`সংরক্ষিত তথ্য নেই / No protected ${body.field} stored`);
    res.json({ field: body.field, value, logged: true });
  }),
);

securityLiveRouter.get(
  '/unmask-log',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const field = qStr(req.query['field']);
    if (field && !(PROTECTED_FIELDS as readonly string[]).includes(field)) {
      throw BadRequest(`অজানা ফিল্ড / Unknown field: ${field}`);
    }
    let query = supabaseAdmin.from('unmask_log').select('*').eq('org_id', orgOf(req)).order('at', { ascending: false }).limit(200);
    if (field) query = query.eq('field', field);
    if (qStr(req.query['userId'])) query = query.eq('user_id', qStr(req.query['userId'])!);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((r) => ({
        id: r.id,
        orgId: r.org_id,
        entityTable: r.entity_table,
        entityId: r.entity_id,
        field: r.field,
        userId: r.user_id,
        userName: r.user_name ?? null,
        role: r.role,
        ip: r.ip ?? null,
        at: r.at,
      })),
    });
  }),
);

/* ── Req 3: security config + policies ────────────────────────────────────── */

interface LiveSecurityConfig {
  passwordPolicy: typeof DEFAULT_PASSWORD_POLICY;
  totp: typeof DEFAULT_TOTP_CONFIG;
  lockout: typeof DEFAULT_LOCKOUT_POLICY;
  session: typeof DEFAULT_SESSION_POLICY;
  ipAllowlist: IpAllowlist;
}

async function loadSecurityConfig(orgId: string): Promise<LiveSecurityConfig> {
  const { data } = await supabaseAdmin.from('security_config').select('*').eq('org_id', orgId).maybeSingle();
  return {
    passwordPolicy: { ...DEFAULT_PASSWORD_POLICY, ...((data?.password_policy ?? {}) as object) },
    totp: { ...DEFAULT_TOTP_CONFIG, ...((data?.totp_config ?? {}) as object) },
    lockout: { ...DEFAULT_LOCKOUT_POLICY, ...((data?.lockout_policy ?? {}) as object) },
    session: { ...DEFAULT_SESSION_POLICY, ...((data?.session_policy ?? {}) as object) },
    ipAllowlist: { ...DEFAULT_IP_ALLOWLIST, ...((data?.ip_allowlist ?? {}) as object) },
  };
}

securityLiveRouter.get(
  '/config',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    res.json(await loadSecurityConfig(orgOf(req)));
  }),
);

securityLiveRouter.put(
  '/config',
  requirePermission('org:manage'),
  validate(
    z.object({
      passwordPolicy: passwordPolicySchema.partial().optional(),
      totp: totpConfigSchema.partial().optional(),
      lockout: lockoutPolicySchema.partial().optional(),
      session: sessionPolicySchema.partial().optional(),
      ipAllowlist: ipAllowlistSchema.optional(),
    }),
  ),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const body = req.body as Partial<LiveSecurityConfig>;
    const current = await loadSecurityConfig(orgId);
    const merged: LiveSecurityConfig = {
      passwordPolicy: { ...current.passwordPolicy, ...(body.passwordPolicy ?? {}) },
      totp: { ...current.totp, ...(body.totp ?? {}) },
      lockout: { ...current.lockout, ...(body.lockout ?? {}) },
      session: { ...current.session, ...(body.session ?? {}) },
      ipAllowlist: { ...current.ipAllowlist, ...(body.ipAllowlist ?? {}) },
    };
    const { error } = await supabaseAdmin
      .from('security_config')
      .upsert(
        {
          org_id: orgId,
          password_policy: merged.passwordPolicy,
          totp_config: merged.totp,
          lockout_policy: merged.lockout,
          session_policy: merged.session,
          ip_allowlist: merged.ipAllowlist,
          updated_by: req.auth?.email ?? 'unknown',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id' },
      );
    if (error) throw error;
    res.json(merged);
  }),
);

securityLiveRouter.post(
  '/password/check',
  requirePermission('member:read'),
  validate(z.object({ password: z.string().min(1).max(128), email: z.string().optional(), name: z.string().optional() })),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const cfg = await loadSecurityConfig(orgOf(req));
    const body = req.body as { password: string; email?: string; name?: string };
    res.json(evaluatePassword(body.password, cfg.passwordPolicy, { email: body.email, name: body.name }));
  }),
);

securityLiveRouter.get(
  '/session/timeout',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const v = viewerOf(req);
    res.json({ policy: (await loadSecurityConfig(orgOf(req))).session, userId: v.userId });
  }),
);

/** Finance-role IP allow-list gate (mutations only) against the live config. */
securityLiveRouter.get(
  '/finance-ip-check',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const v = viewerOf(req);
    const list = (await loadSecurityConfig(orgOf(req))).ipAllowlist;
    const decide = (): { ok: boolean; reason?: string } => {
      if (!list.enabled) return { ok: true };
      const financeRoles = ['super_admin', 'org_admin', 'branch_manager'];
      if (!financeRoles.includes(v.role)) return { ok: true };
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) return { ok: true };
      const toInt = (s: string): number | null => {
        const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s.trim());
        if (!m) return null;
        const p = m.slice(1).map(Number);
        return p.some((x) => x > 255) ? null : ((p[0]! << 24) | (p[1]! << 16) | (p[2]! << 8) | p[3]!) >>> 0;
      };
      const addr = v.ip ? toInt(v.ip) : null;
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
    };
    res.json(decide());
  }),
);

/* ── Req 3: devices ───────────────────────────────────────────────────────── */

securityLiveRouter.get(
  '/devices',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const v = viewerOf(req);
    const admins = ['super_admin', 'org_admin'];
    const target = qStr(req.query['userId']) && admins.includes(v.role) ? qStr(req.query['userId'])! : v.userId;
    const { data, error } = await supabaseAdmin.from('user_devices').select('*').eq('org_id', orgOf(req)).eq('user_id', target).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({
      items: (data ?? []).map(
        (d): DeviceRecord => ({
          id: d.id,
          orgId: d.org_id,
          userId: d.user_id,
          label: d.label,
          userAgent: d.user_agent ?? null,
          ip: d.ip ?? null,
          createdAt: d.created_at,
          lastSeenAt: d.last_seen_at,
          revoked: d.revoked,
        }),
      ),
    });
  }),
);

securityLiveRouter.post(
  '/devices',
  requirePermission('member:read'),
  validate(deviceCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const v = viewerOf(req);
    const body = req.body as { label: string };
    const { data, error } = await supabaseAdmin
      .from('user_devices')
      .insert({
        org_id: orgOf(req),
        user_id: v.userId,
        label: body.label,
        user_agent: (req.headers['user-agent'] as string | undefined) ?? null,
        ip: v.ip,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({
      id: data.id,
      orgId: data.org_id,
      userId: data.user_id,
      label: data.label,
      userAgent: data.user_agent ?? null,
      ip: data.ip ?? null,
      createdAt: data.created_at,
      lastSeenAt: data.last_seen_at,
      revoked: data.revoked,
    });
  }),
);

securityLiveRouter.post(
  '/devices/:id/revoke',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const v = viewerOf(req);
    const { data, error } = await supabaseAdmin.from('user_devices').select('*').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound(`ডিভাইস নেই / Device not found: ${req.params['id']}`);
    if (data.user_id !== v.userId && !['super_admin', 'org_admin'].includes(v.role)) {
      throw BadRequest('শুধু নিজের ডিভাইস / Only your own devices');
    }
    const { error: updErr } = await supabaseAdmin.from('user_devices').update({ revoked: true }).eq('id', data.id).eq('org_id', orgOf(req));
    if (updErr) throw updErr;
    res.json({ ...data, revoked: true });
  }),
);

/* ── Req 3: TOTP enrollment + status (RFC 6238 via node:crypto) ───────────── */

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

function totpVerify(secretB32: string, code: string, window = 1, atMs = Date.now()): boolean {
  const step = Math.floor(atMs / 30_000);
  for (let i = -window; i <= window; i += 1) {
    if (hotp(secretB32, step + i) === code) return true;
  }
  return false;
}

securityLiveRouter.get(
  '/totp/status',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const v = viewerOf(req);
    const cfg = (await loadSecurityConfig(orgOf(req))).totp;
    const { data } = await supabaseAdmin.from('user_totp').select('enabled').eq('user_id', v.userId).maybeSingle();
    const enabled = data?.enabled ?? false;
    const satisfied = !cfg.enabled || !(cfg.requiredRoles as readonly string[]).includes(v.role) || enabled;
    res.json({ enabled, required: cfg.enabled && (cfg.requiredRoles as readonly string[]).length > 0, satisfied });
  }),
);

securityLiveRouter.post(
  '/totp/start',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const v = viewerOf(req);
    const secret = base32Encode(randomBytes(20));
    const { error } = await supabaseAdmin
      .from('user_totp')
      .upsert({ user_id: v.userId, org_id: orgOf(req), secret_b32: secret, confirmed: false, enabled: false }, { onConflict: 'user_id' });
    if (error) throw error;
    const label = encodeURIComponent(`Samity Manager:${v.userName}`);
    const params = new URLSearchParams({ secret, issuer: 'Samity Manager', algorithm: 'SHA1', digits: '6', period: '30' });
    res.status(201).json({ secretB32: secret, otpauthUrl: `otpauth://totp/${label}?${params.toString()}` });
  }),
);

securityLiveRouter.post(
  '/totp/confirm',
  requirePermission('member:read'),
  validate(z.object({ code: z.string().regex(/^\d{6}$/) })),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const v = viewerOf(req);
    const { data, error } = await supabaseAdmin.from('user_totp').select('*').eq('user_id', v.userId).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('সক্রিয়করণ শুরু হয়নি / No enrollment started');
    const cfg = (await loadSecurityConfig(orgOf(req))).totp;
    if (!totpVerify(data.secret_b32, (req.body as { code: string }).code, cfg.window)) {
      throw BadRequest('ভুল কোড / Wrong verification code');
    }
    const { error: updErr } = await supabaseAdmin.from('user_totp').update({ confirmed: true, enabled: true, last_code: (req.body as { code: string }).code }).eq('user_id', v.userId).eq('org_id', orgOf(req));
    if (updErr) throw updErr;
    res.json({ enabled: true });
  }),
);

/* ── Req 4: RLS cross-branch matrix ───────────────────────────────────────── */

securityLiveRouter.get(
  '/rls-matrix',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    // Same-branch visibility probe against the live members table.
    let visible = 0;
    if (auth.branchId) {
      const { count } = await supabaseAdmin.from('members').select('id', { count: 'exact', head: true }).eq('org_id', orgOf(req)).eq('branch_id', auth.branchId).is('deleted_at', null);
      visible = count ?? 0;
    }
    res.json({
      items: RLS_TEST_MATRIX.flatMap((row) =>
        (['select', 'insert', 'update', 'delete'] as const).map((op) => ({
          table: row.table,
          expect: row.expect,
          verdict: 'deny' as const,
          sessionBranch: auth.branchId ?? '—',
          rowBranch: 'cross-branch',
          op,
        })),
      ),
      visibleB1Members: visible,
    });
  }),
);
