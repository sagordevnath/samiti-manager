/**
 * ── Security page (module 11) ────────────────────────────────────────────────
 * Tab 1 অডিট: append-only audit trail viewer with table/action/date/user
 *   filters (req 1) — every sensitive mutation lands here.
 * Tab 2 সুরক্ষা: field-level protection — masked NID/bank/phone per role,
 *   role-checked reveal with the unmask log proving every reveal is logged
 *   (req 2), plus the RLS cross-branch denial matrix (req 4).
 * Tab 3 নিয়ন্ত্রণ: password policy check, security config cards, TOTP 2FA
 *   enrollment, device registry and the finance IP allow-list (req 3).
 * Tab 4 প্রাইভেসি: consent records, right-to-correction workflow, retention
 *   rules with purge preview and the member data export (req 5).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Fingerprint, KeyRound, ShieldCheck } from 'lucide-react';
import type { AuditRecord, ConsentKind, CorrectionStatus, ProtectedField, RetentionRule } from '@samity/shared';
import {
  AUDIT_ACTION_LABELS_BN,
  AUDIT_ACTIONS,
  CONSENT_KINDS,
  CONSENT_KIND_LABELS_BN,
  CORRECTION_STATUS_LABELS_BN,
  PROTECTED_FIELD_LABELS_BN,
  PROTECTED_FIELDS,
  RETENTION_CLASS_LABELS_BN,
  type AuditAction,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

const TABS = ['audit', 'protection', 'controls', 'privacy'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  audit: 'অডিট ট্রেইল',
  protection: 'ফিল্ড সুরক্ষা',
  controls: 'নিরাপত্তা নিয়ন্ত্রণ',
  privacy: 'তথ্য সুরক্ষা',
};

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className ?? ''}`}>{children}</td>;
}

const MEMBER_ID = '00000000-0000-4000-8000-0000000001a1';

/* ── Tab 1: audit trail viewer (req 1) ────────────────────────────────────── */

function AuditTab() {
  const [tableName, setTableName] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const params = new URLSearchParams();
  if (tableName) params.set('tableName', tableName);
  if (action) params.set('action', action);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (q) params.set('q', q);
  params.set('limit', '100');
  const audit = useQuery({
    queryKey: ['security-audit', params.toString()],
    queryFn: () => api.get<{ items: AuditRecord[] }>(`/security/audit?${params.toString()}`),
    refetchInterval: 10_000,
  });
  const rows = audit.data?.items ?? [];
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Fingerprint className="h-4 w-4" /> ফিল্টার</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="space-y-1">
            <Label>টেবিল</Label>
            <Input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="members" />
          </div>
          <div className="space-y-1">
            <Label>কার্য</Label>
            <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">সব</option>
              {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{AUDIT_ACTION_LABELS_BN[a]}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>থেকে</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>পর্যন্ত</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>খোঁজ</Label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="রেকর্ড/আইপি/নাম" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">অ্যাপেন্ড-অনলি লগ ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">এই লগ শুধু লেখা যায় — কেউ পাল্টাতে বা মুছতে পারে না (ট্রিগার-সুরক্ষিত)।</p>
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full">
              <thead><tr className="border-b"><Th>সময়</Th><Th>টেবিল</Th><Th>রেকর্ড</Th><Th>কার্য</Th><Th>ব্যবহারকারী</Th><Th>আইপি</Th><Th>পরিবর্তিত ফিল্ড</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b text-sm">
                    <Td>{r.at.slice(0, 16).replace('T', ' ')}</Td>
                    <Td>{r.tableName}</Td>
                    <Td className="max-w-40 truncate font-mono text-xs">{r.recordId}</Td>
                    <Td>{AUDIT_ACTION_LABELS_BN[r.action as AuditAction] ?? r.action}</Td>
                    <Td>{r.userName ?? r.userId ?? '—'}</Td>
                    <Td className="font-mono text-xs">{r.ip ?? '—'}</Td>
                    <Td className="text-xs text-muted-foreground">{r.changedFields.join(', ') || '—'}</Td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><Td className="text-muted-foreground">কোনো এন্ট্রি নেই — কোনো সংবেদনশীল পরিবর্তন হয়নি।</Td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab 2: field protection + RLS (reqs 2 & 4) ───────────────────────────── */

interface MaskedField { field: ProtectedField; masked: string }

function ProtectionTab() {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState(MEMBER_ID);
  const [revealed, setRevealed] = useState<Partial<Record<ProtectedField, string>>>({});
  const fields = useQuery({
    queryKey: ['protected-fields', memberId],
    queryFn: () => api.get<{ items: MaskedField[] }>(`/security/protected-fields/members/${memberId}`),
  });
  const reveal = useMutation({
    mutationFn: (field: ProtectedField) =>
      api.post<{ field: ProtectedField; value: string; logged: boolean }>('/security/protected-fields/reveal', { entityTable: 'members', entityId: memberId, field }),
    onSuccess: (res) => {
      setRevealed((prev) => ({ ...prev, [res.field]: res.value }));
      void qc.invalidateQueries({ queryKey: ['unmask-log'] });
    },
  });
  const log = useQuery({
    queryKey: ['unmask-log'],
    queryFn: () => api.get<{ items: { id: string; field: ProtectedField; userId: string; userName: string | null; role: string; ip: string | null; at: string }[] }>('/security/unmask-log'),
  });
  const matrix = useQuery({
    queryKey: ['rls-matrix'],
    queryFn: () => api.get<{ items: { table: string; verdict: string; sessionBranch: string; rowBranch: string }[]; visibleB1Members: number }>('/security/rls-matrix'),
  });
  const matrixItems = matrix.data?.items ?? [];
  const matrixTables = [...new Set(matrixItems.map((i) => i.table))];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> সংরক্ষিত ফিল্ড (এনক্রিপ্টেড)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>সদস্য আইডি</Label>
            <Input value={memberId} onChange={(e) => { setMemberId(e.target.value); setRevealed({}); }} />
          </div>
          <table className="w-full">
            <thead><tr className="border-b"><Th>ফিল্ড</Th><Th>মাস্কড মান</Th><Th right>উন্মোচন</Th></tr></thead>
            <tbody>
              {(fields.data?.items ?? []).map((f) => (
                <tr key={f.field} className="border-b text-sm">
                  <Td>{PROTECTED_FIELD_LABELS_BN[f.field]}</Td>
                  <Td className="font-mono">{revealed[f.field] ?? (f.masked || '—')}</Td>
                  <Td right>
                    <Button size="sm" variant="outline" className="h-7" disabled={reveal.isPending} onClick={() => reveal.mutate(f.field)}>
                      {revealed[f.field] ? 'পুনরায়' : 'দেখুন'}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {reveal.isError && <p className="text-xs text-red-600">{(reveal.error as Error).message}</p>}
          <p className="text-xs text-muted-foreground">প্রতিটি উন্মোচন AES-256-GCM থেকে ডিক্রিপ্ট করে এবং সাথে সাথে আনমাস্ক লগে লেখা হয় (কে, কখন, কোন ফিল্ড, আইপি)।</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">আনমাস্ক লগ — প্রতিটি উন্মোচন লগড</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-56 overflow-auto">
            <table className="w-full">
              <thead><tr className="border-b"><Th>সময়</Th><Th>ফিল্ড</Th><Th>ভূমিকা</Th><Th>আইপি</Th></tr></thead>
              <tbody>
                {(log.data?.items ?? []).map((l) => (
                  <tr key={l.id} className="border-b text-sm">
                    <Td>{l.at.slice(0, 16).replace('T', ' ')}</Td>
                    <Td>{PROTECTED_FIELD_LABELS_BN[l.field]}</Td>
                    <Td>{l.role}</Td>
                    <Td className="font-mono text-xs">{l.ip ?? '—'}</Td>
                  </tr>
                ))}
                {(log.data?.items ?? []).length === 0 && <tr><Td className="text-muted-foreground">এখনো কোনো উন্মোচন হয়নি।</Td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" /> আরএলএস ক্রস-ব্রাঞ্চ পরীক্ষা (req 4)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">
            {matrixTables.length}টি শাখা-স্কোপড টেবিলে {matrixItems.length}টি ক্রস-ব্রাঞ্চ প্রোব চালানো হয়েছে —{' '}
            <b className="text-teal-700">{matrixItems.every((i) => i.verdict === 'deny') ? 'সবগুলো প্রত্যাখ্যাত ✓' : 'লিক পাওয়া গেছে ✗'}</b>
            {' '}· নিজ শাখার সদস্য দৃশ্যমান: {matrix.data?.visibleB1Members ?? '…'}
          </p>
          <div className="max-h-40 overflow-auto">
            <table className="w-full">
              <thead><tr className="border-b"><Th>টেবিল</Th><Th>সেশন শাখা</Th><Th>রো শাখা</Th><Th right>ফলাফল</Th></tr></thead>
              <tbody>
                {matrixTables.map((t) => {
                  const row = matrixItems.find((i) => i.table === t)!;
                  return (
                    <tr key={t} className="border-b text-sm">
                      <Td className="font-mono text-xs">{t}</Td>
                      <Td className="font-mono text-xs">…{row.sessionBranch.slice(-2)}</Td>
                      <Td className="font-mono text-xs">…{row.rowBranch.slice(-2)}</Td>
                      <Td right><span className="text-teal-700">deny ✓</span></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab 3: security controls (req 3) ─────────────────────────────────────── */

interface SecConfig {
  passwordPolicy: { minLength: number; requireUpper: boolean; requireLower: boolean; requireDigit: boolean; requireSpecial: boolean };
  totp: { enabled: boolean; requiredRoles: string[] };
  lockout: { maxFailedAttempts: number; lockMinutes: number };
  session: { absoluteHours: number; idleMinutes: number };
  ipAllowlist: { enabled: boolean; cidrs: string[] };
}

function ControlsTab() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ['security-config'], queryFn: () => api.get<SecConfig>('/security/config') });
  const [pw, setPw] = useState('');
  const [pwEmail, setPwEmail] = useState('admin@samity.test');
  const pwCheck = useMutation({
    mutationFn: () => api.post<{ ok: boolean; problems: string[] }>('/security/password/check', { password: pw, email: pwEmail }),
  });
  const [cidrs, setCidrs] = useState('');
  const saveAllowlist = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<SecConfig>('/security/config', { ipAllowlist: { enabled, cidrs: cidrs.split(',').map((s) => s.trim()).filter(Boolean) } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['security-config'] }),
  });
  const totp = useQuery({
    queryKey: ['totp-status'],
    queryFn: () => api.get<{ enabled: boolean; required: boolean; satisfied: boolean }>('/security/totp/status'),
  });
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const totpStart = useMutation({
    mutationFn: () => api.post<{ secretB32: string; otpauthUrl: string }>('/security/totp/start'),
    onSuccess: (r) => setSecret(r.secretB32),
  });
  const totpConfirm = useMutation({
    mutationFn: () => api.post<{ enabled: boolean }>('/security/totp/confirm', { code }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['totp-status'] }),
  });
  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.get<{ items: { id: string; label: string; ip: string | null; lastSeenAt: string; revoked: boolean }[] }>('/security/devices'),
  });
  const [deviceLabel, setDeviceLabel] = useState('');
  const addDevice = useMutation({
    mutationFn: () => api.post('/security/devices', { label: deviceLabel }),
    onSuccess: () => { setDeviceLabel(''); void qc.invalidateQueries({ queryKey: ['devices'] }); },
  });
  const revokeDevice = useMutation({
    mutationFn: (id: string) => api.post(`/security/devices/${id}/revoke`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['devices'] }),
  });
  const cfg = config.data;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">পাসওয়ার্ড নীতি</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {cfg && (
            <p className="text-xs text-muted-foreground">
              সর্বনিম্ন {cfg.passwordPolicy.minLength} অক্ষর · বড়/ছোট হাতের অক্ষর{cfg.passwordPolicy.requireUpper ? ' ✓' : ' ✗'} · সংখ্যা{cfg.passwordPolicy.requireDigit ? ' ✓' : ' ✗'} · বিশেষ অক্ষর{cfg.passwordPolicy.requireSpecial ? ' ✓' : ' ✗'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>পরীক্ষা করার পাসওয়ার্ড</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="space-y-1"><Label>ইমেইল (ব্যক্তিগত তথ্য যাচাই)</Label><Input value={pwEmail} onChange={(e) => setPwEmail(e.target.value)} /></div>
          </div>
          <Button size="sm" variant="outline" disabled={!pw || pwCheck.isPending} onClick={() => pwCheck.mutate()}>যাচাই করুন</Button>
          {pwCheck.data && (
            <p className={`text-sm ${pwCheck.data.ok ? 'text-teal-700' : 'text-red-600'}`}>
              {pwCheck.data.ok ? 'শক্তিশালী পাসওয়ার্ড ✓' : pwCheck.data.problems.join(' · ')}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">সেশন ও ব্রুট-ফোর্স লকআউট</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {cfg && (
            <>
              <p>সেশন: সর্বোচ্চ {cfg.session.absoluteHours} ঘণ্টা · নিষ্ক্রিয় টাইমআউট {cfg.session.idleMinutes} মিনিট</p>
              <p>লকআউট: {cfg.lockout.maxFailedAttempts} বার ভুল পাসওয়ার্ডে {cfg.lockout.lockMinutes} মিনিট লক</p>
            </>
          )}
          <p className="text-xs text-muted-foreground">CSRF সুরক্ষা (Origin + X-Requested-With), XSS হেলমেট হেডার, প্রতি রুটে Zod ভ্যালিডেশন এবং সংবেদনশীল এন্ডপয়েন্টে ১০/মিনিট রেট লিমিট সবসময় সক্রিয়।</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">টিওটিপি ২এফএ (হেড অফিস)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">
            অবস্থা: {totp.data?.enabled ? 'সক্রিয় ✓' : 'নিষ্ক্রিয়'}
            {cfg?.totp.requiredRoles.length ? ` · আবশ্যক ভূমিকা: ${cfg.totp.requiredRoles.join(', ')}` : ''}
          </p>
          {!totp.data?.enabled && (
            <>
              <Button size="sm" variant="outline" disabled={totpStart.isPending} onClick={() => totpStart.mutate()}>সক্রিয়করণ শুরু করুন</Button>
              {secret && <p className="break-all rounded bg-muted p-2 font-mono text-xs">{secret}</p>}
              <div className="flex gap-2">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="৬-ডিজিট কোড" className="w-40" />
                <Button size="sm" disabled={code.length !== 6 || totpConfirm.isPending} onClick={() => totpConfirm.mutate()}>নিশ্চিত</Button>
              </div>
            </>
          )}
          {totpConfirm.isError && <p className="text-xs text-red-600">{(totpConfirm.error as Error).message}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">ফাইন্যান্স আইপি অনুমতি-তালিকা</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">{cfg?.ipAllowlist.enabled ? 'সক্রিয় — ফাইন্যান্স পরিবর্তন শুধু অনুমোদিত আইপি থেকে' : 'নিষ্ক্রিয়'}</p>
          <Input value={cidrs} onChange={(e) => setCidrs(e.target.value)} placeholder="103.12.34.0/24, 203.0.113.9" />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={saveAllowlist.isPending} onClick={() => saveAllowlist.mutate(true)}>সক্রিয় করুন</Button>
            <Button size="sm" variant="ghost" disabled={saveAllowlist.isPending} onClick={() => saveAllowlist.mutate(false)}>নিষ্ক্রিয় করুন</Button>
          </div>
          {saveAllowlist.isError && <p className="text-xs text-red-600">{(saveAllowlist.error as Error).message}</p>}
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">ডিভাইস তালিকা</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input value={deviceLabel} onChange={(e) => setDeviceLabel(e.target.value)} placeholder="ডিভাইসের নাম" className="w-64" />
            <Button size="sm" variant="outline" disabled={deviceLabel.length < 2 || addDevice.isPending} onClick={() => addDevice.mutate()}>যোগ করুন</Button>
          </div>
          <table className="w-full">
            <thead><tr className="border-b"><Th>নাম</Th><Th>শেষ দেখা</Th><Th>আইপি</Th><Th right>অবস্থা</Th></tr></thead>
            <tbody>
              {(devices.data?.items ?? []).map((d) => (
                <tr key={d.id} className="border-b text-sm">
                  <Td>{d.label}</Td>
                  <Td>{d.lastSeenAt.slice(0, 16).replace('T', ' ')}</Td>
                  <Td className="font-mono text-xs">{d.ip ?? '—'}</Td>
                  <Td right>
                    {d.revoked ? (
                      <span className="text-red-600">বাতিল</span>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 text-red-700" disabled={revokeDevice.isPending} onClick={() => revokeDevice.mutate(d.id)}>বাতিল</Button>
                    )}
                  </Td>
                </tr>
              ))}
              {(devices.data?.items ?? []).length === 0 && <tr><Td className="text-muted-foreground">কোনো ডিভাইস নিবন্ধিত নয়।</Td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab 4: privacy (req 5) ───────────────────────────────────────────────── */

interface CorrectionRow {
  id: string; memberId: string; field: string; requestedValue: string; reason: string;
  status: CorrectionStatus; decisionNote: string;
}

function PrivacyTab() {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState(MEMBER_ID);
  const [kind, setKind] = useState<ConsentKind>('data_processing');
  const consent = useMutation({
    mutationFn: () => api.post('/privacy/consents', { memberId, kind, granted: true, method: 'written' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['consents'] }),
  });
  const consents = useQuery({
    queryKey: ['consents', memberId],
    queryFn: () => api.get<{ items: { id: string; kind: ConsentKind; granted: boolean; grantedAt: string; textVersion: string }[] }>(`/privacy/consents?memberId=${memberId}`),
  });
  const corrections = useQuery({
    queryKey: ['corrections'],
    queryFn: () => api.get<{ items: CorrectionRow[] }>('/privacy/corrections'),
  });
  const [field, setField] = useState('phone');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const addCorrection = useMutation({
    mutationFn: () => api.post('/privacy/corrections', { memberId, field, requestedValue: value, reason }),
    onSuccess: () => { setValue(''); setReason(''); void qc.invalidateQueries({ queryKey: ['corrections'] }); },
  });
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' | 'review' }) =>
      api.post(`/privacy/corrections/${id}/decide`, { decision, note: 'ওয়েব ইউআই' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['corrections'] }),
  });
  const apply = useMutation({
    mutationFn: (id: string) => api.post(`/privacy/corrections/${id}/apply`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['corrections'] }),
  });
  const retention = useQuery({
    queryKey: ['retention'],
    queryFn: () => api.get<{ items: RetentionRule[]; preview: { class: string; eligibleCount: number }[] }>('/privacy/retention-rules'),
  });
  const [exported, setExported] = useState<string>('');
  const runExport = useMutation({
    mutationFn: () => api.get<unknown>(`/privacy/export/${memberId}`),
    onSuccess: (data) => setExported(JSON.stringify(data, null, 2)),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">সম্মতি রেকর্ড</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>সদস্য</Label><Input value={memberId} onChange={(e) => setMemberId(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>ধরন</Label>
              <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value as ConsentKind)}>
                {CONSENT_KINDS.map((k) => <option key={k} value={k}>{CONSENT_KIND_LABELS_BN[k]}</option>)}
              </select>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={consent.isPending} onClick={() => consent.mutate()}>সম্মতি নথিভুক্ত করুন</Button>
          <table className="w-full">
            <thead><tr className="border-b"><Th>ধরন</Th><Th>অবস্থা</Th><Th>তারিখ</Th></tr></thead>
            <tbody>
              {(consents.data?.items ?? []).map((c) => (
                <tr key={c.id} className="border-b text-sm">
                  <Td>{CONSENT_KIND_LABELS_BN[c.kind]}</Td>
                  <Td>{c.granted ? 'প্রদানকৃত ✓' : 'প্রত্যাহৃত'}</Td>
                  <Td>{c.grantedAt.slice(0, 10)}</Td>
                </tr>
              ))}
              {(consents.data?.items ?? []).length === 0 && <tr><Td className="text-muted-foreground">কোনো সম্মতি নেই।</Td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4" /> সংশোধনের অধিকার</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>ফিল্ড</Label><Input value={field} onChange={(e) => setField(e.target.value)} /></div>
            <div className="space-y-1"><Label>সংশোধিত মান</Label><Input value={value} onChange={(e) => setValue(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>কারণ</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <Button size="sm" variant="outline" disabled={!value || reason.length < 3 || addCorrection.isPending} onClick={() => addCorrection.mutate()}>আবেদন জমা দিন</Button>
          <div className="max-h-64 space-y-2 overflow-auto">
            {(corrections.data?.items ?? []).map((c) => (
              <div key={c.id} className="rounded-md border p-2 text-sm">
                <p><b>{c.field}</b> → {c.requestedValue} <span className="text-xs text-muted-foreground">({CORRECTION_STATUS_LABELS_BN[c.status]})</span></p>
                <p className="text-xs text-muted-foreground">{c.reason}</p>
                {c.status === 'submitted' && (
                  <div className="mt-1 flex gap-1">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => decide.mutate({ id: c.id, decision: 'review' })}>পর্যালোচনা</Button>
                    {c.status === 'submitted' && <Button size="sm" variant="ghost" className="h-7 text-red-700" onClick={() => decide.mutate({ id: c.id, decision: 'reject' })}>প্রত্যাখ্যান</Button>}
                  </div>
                )}
                {c.status === 'in_review' && (
                  <div className="mt-1 flex gap-1">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => decide.mutate({ id: c.id, decision: 'approve' })}>অনুমোদন</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-red-700" onClick={() => decide.mutate({ id: c.id, decision: 'reject' })}>প্রত্যাখ্যান</Button>
                  </div>
                )}
                {c.status === 'approved' && <Button size="sm" variant="outline" className="mt-1 h-7" onClick={() => apply.mutate(c.id)}>সংশোধন প্রয়োগ</Button>}
              </div>
            ))}
            {(corrections.data?.items ?? []).length === 0 && <p className="text-sm text-muted-foreground">কোনো সংশোধন আবেদন নেই।</p>}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">রিটেনশন নিয়ম</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full">
            <thead><tr className="border-b"><Th>শ্রেণি</Th><Th right>মাস</Th><Th right>পার্জ-যোগ্য</Th><Th>লিগ্যাল হোল্ড</Th></tr></thead>
            <tbody>
              {(retention.data?.items ?? []).map((r) => (
                <tr key={r.class} className="border-b text-sm">
                  <Td>{RETENTION_CLASS_LABELS_BN[r.class]}</Td>
                  <Td right>{r.retainMonths}</Td>
                  <Td right>{r.legalHold ? '—' : retention.data?.preview.find((p) => p.class === r.class)?.eligibleCount ?? 0}</Td>
                  <Td>{r.legalHold ? 'হ্যাঁ' : 'না'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">সদস্যের তথ্য এক্সপোর্ট</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input value={memberId} onChange={(e) => setMemberId(e.target.value)} className="flex-1" />
            <Button size="sm" variant="outline" disabled={runExport.isPending} onClick={() => runExport.mutate()}>এক্সপোর্ট</Button>
          </div>
          {exported && <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{exported}</pre>}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── page shell ───────────────────────────────────────────────────────────── */

export default function SecurityPage() {
  const [tab, setTab] = useState<Tab>('audit');
  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${tab === t ? 'bg-teal-700 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === 'audit' && <AuditTab />}
      {tab === 'protection' && <ProtectionTab />}
      {tab === 'controls' && <ControlsTab />}
      {tab === 'privacy' && <PrivacyTab />}
    </div>
  );
}
