import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardList, HandCoins, HeartPulse, PiggyBank, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useCan } from '@/lib/permissions';
import { STATUS_REASON_CODES } from '@samity/shared';
import type { Member360 } from '@samity/shared';

const STATUS_LABELS: Record<string, string> = {
  pending: 'অপেক্ষমাণ',
  active: 'সক্রিয়',
  dormant: 'নিষ্ক্রিয়',
  dropout: 'ছাড়পত্র',
  transferred: 'স্থানান্তরিত',
  deceased: 'মৃত',
};

const TABS = [
  { key: 'savings', label: 'সঞ্চয়', icon: PiggyBank },
  { key: 'loans', label: 'ঋণ', icon: HandCoins },
  { key: 'attendance', label: 'উপস্থিতি', icon: ClipboardList },
  { key: 'insurance', label: 'বীমা', icon: HeartPulse },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function Member360Page() {
  const { id = '' } = useParams();
  const can = useCan();
  const [tab, setTab] = useState<TabKey>('savings');
  const [note, setNote] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['member-360', id],
    queryFn: () => api.get<Member360>(`/members/${id}/360`),
  });

  const addNote = async () => {
    if (!note.trim()) return;
    await api.post(`/members/${id}/notes`, { note: note.trim() });
    setNote('');
    void refetch();
  };

  if (isLoading || !data) {
    return <p className="p-6 text-sm text-muted-foreground">লোড হচ্ছে…</p>;
  }

  const p = data.profile;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">Member 360</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <UserRound className="h-6 w-6 text-teal-700" /> {p.full_name_bn || p.full_name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {p.member_number} · {p.branch_name} · {p.samity_name ?? '—'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
            {STATUS_LABELS[p.status] ?? p.status}
          </span>
          {can('member:approve') && (
            <Button size="sm" variant="outline" onClick={() => setStatusOpen((v) => !v)}>
              স্ট্যাটাস পরিবর্তন
            </Button>
          )}
          {can('member:write') && (
            <Button size="sm" variant="outline" onClick={() => setTransferOpen((v) => !v)}>
              স্থানান্তর
            </Button>
          )}
        </div>
      </div>

      {statusOpen && can('member:approve') && <StatusChangePanel memberId={id} current={p.status} onDone={() => void refetch()} />}
      {transferOpen && can('member:write') && <TransferPanel memberId={id} onDone={() => void refetch()} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">প্রোফাইল</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-2">
            <Field label="নাম (বাংলা)" value={p.full_name_bn} />
            <Field label="নাম (ইংরেজি)" value={p.full_name} />
            <Field label="পিতা/স্বামী" value={p.father_or_husband_name} />
            <Field label="মাতা" value={p.mother_name} />
            <Field label={p.id_type === 'nid' ? 'এনআইডি' : 'জন্ম নিবন্ধন'} value={p.id_number_masked} mono />
            <Field label="মোবাইল" value={p.mobile_masked} mono />
            <Field label="জন্ম তারিখ" value={p.dob} />
            <Field label="পেশা" value={p.occupation} />
            <Field label="পারিবারিক আয়" value={p.monthly_household_income ? `৳ ${p.monthly_household_income}` : null} />
            <Field label="জমি (ডেসিমাল)" value={p.land_owned_decimals} />
            <Field label="পরিবারের সদস্য" value={p.family_members != null ? String(p.family_members) : null} />
            <Field label="পাসবুক নং" value={p.passbook_no} mono />
            <Field label="ঠিকানা" value={p.address} span />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">নমিনি</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {p.nominees.map((n, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border p-2">
                <span>
                  {n.name} <span className="text-xs text-muted-foreground">({n.relation})</span>
                </span>
                <span className="font-medium">{n.sharePct}%</span>
              </div>
            ))}
            {p.photo_url && (
              <p className="pt-1 text-xs text-muted-foreground">
                ছবি ও স্বাক্ষর সংরক্ষিত আছে (সাইন করা লিংক ৫ মিনিটের জন্য বৈধ)।
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button key={t.key} size="sm" variant={tab === t.key ? 'default' : 'outline'} onClick={() => setTab(t.key)}>
            <t.icon className="h-4 w-4" /> {t.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4">
          {tab === 'savings' && (
            <LinesTable
              rows={data.savings.map((s) => ({ id: s.id, product: s.product, balance: s.balance }))}
              cols={[['product', 'পণ্য'], ['balance', 'জমা']]}
              empty="কোনো সঞ্চয় হিসাব নেই।"
            />
          )}
          {tab === 'loans' && (
            <LinesTable
              rows={data.loans.map((l) => ({ id: l.id, product: l.status, principal: l.principal, outstanding: l.outstanding }))}
              cols={[['product', 'স্ট্যাটাস'], ['principal', 'মূলধন'], ['outstanding', 'বকেয়া']]}
              empty="কোনো ঋণ নেই।"
            />
          )}
          {tab === 'attendance' && (
            <LinesTable
              rows={data.attendance.map((a) => ({ id: a.meeting_date, product: a.samity_name, balance: a.present ? 'উপস্থিত' : 'অনুপস্থিত' }))}
              cols={[['product', 'সমিতি'], ['balance', 'উপস্থিতি']]}
              empty="উপস্থিতি রেকর্ড নেই।"
            />
          )}
          {tab === 'insurance' && (
            <LinesTable
              rows={data.insurance.map((i) => ({ id: i.id, product: i.product, balance: i.status }))}
              cols={[['product', 'পণ্য'], ['balance', 'স্ট্যাটাস']]}
              empty="বীমা পলিসি নেই।"
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">স্ট্যাটাস ইতিহাস</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.statusHistory.length === 0 && <p className="text-muted-foreground">কোনো পরিবর্তন নেই।</p>}
            {data.statusHistory.map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded-md border p-2">
                <span>
                  {STATUS_LABELS[h.status] ?? h.status} <span className="text-xs text-muted-foreground">({h.reason_code})</span>
                </span>
                <span className="text-xs text-muted-foreground">{h.changed_at.slice(0, 10)}</span>
              </div>
            ))}
            {data.transfers.length > 0 && (
              <div className="pt-2">
                <p className="pb-1 text-xs font-semibold text-muted-foreground">স্থানান্তর</p>
                {data.transfers.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-md border p-2">
                    <span className="font-mono text-xs">
                      {t.from_branch_code} → {t.to_branch_code}
                    </span>
                    <span className="text-xs">{t.stage}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">নোট</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {can('member:write') && (
              <div className="flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="নতুন নোট লিখুন…" />
                <Button size="sm" onClick={addNote}>
                  যোগ করুন
                </Button>
              </div>
            )}
            {data.notes.map((n) => (
              <div key={n.id} className="rounded-md border p-2">
                <p>{n.note}</p>
                <p className="mt-1 text-xs text-muted-foreground">{n.author} · {n.created_at.slice(0, 10)}</p>
              </div>
            ))}
            {data.notes.length === 0 && <p className="text-muted-foreground">কোনো নোট নেই।</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const BRANCH_OPTIONS = [
  { id: '00000000-0000-4000-8000-0000000000b1', label: 'ঢাকা শাখা' },
  { id: '00000000-0000-4000-8000-0000000000b2', label: 'ময়মনসিংহ শাখা' },
];

/** Req 6: status change with reason codes paired to the chosen status. */
function StatusChangePanel({ memberId, current, onDone }: { memberId: string; current: string; onDone: () => void }) {
  const [status, setStatus] = useState('dormant');
  const [reasonCode, setReasonCode] = useState<string>(STATUS_REASON_CODES.dormant[0] ?? 'inactivity');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [noteText, setNoteText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reasons = STATUS_REASON_CODES[status as keyof typeof STATUS_REASON_CODES] ?? [];

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/members/${memberId}/status`, {
        status,
        reasonCode,
        effectiveDate,
        note: noteText.trim() || undefined,
      });
      onDone();
      setNoteText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ত্রুটি হয়েছে');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">স্ট্যাটাস পরিবর্তন (বর্তমান: {STATUS_LABELS[current] ?? current})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>নতুন স্ট্যাটাস</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={status}
              onChange={(e) => {
                const next = e.target.value;
                setStatus(next);
                setReasonCode(STATUS_REASON_CODES[next as keyof typeof STATUS_REASON_CODES]?.[0] ?? '');
              }}
            >
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>কারণ</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value)}
            >
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>কার্যকর তারিখ</Label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>নোট (ঐচ্ছিক)</Label>
            <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="সংক্ষিপ্ত ব্যাখ্যা" />
          </div>
        </div>
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={busy}>
            পরিবর্তন করুন
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setError('')}>
            রিসেট
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Req 7: propose a transfer to another branch; approval happens in the workflow. */
function TransferPanel({ memberId, onDone }: { memberId: string; onDone: () => void }) {
  const [toBranchId, setToBranchId] = useState(BRANCH_OPTIONS[1]!.id);
  const [toSamityName, setToSamityName] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.post(`/members/${memberId}/transfers`, {
        toBranchId,
        toSamityName: toSamityName.trim() || undefined,
        reason: reason.trim(),
      });
      setMessage('স্থানান্তরের প্রস্তাব জমা হয়েছে — অনুমোদনের অপেক্ষায়।');
      setReason('');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ত্রুটি হয়েছে');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">শাখা স্থানান্তরের প্রস্তাব</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>গন্তব্য শাখা</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
              value={toBranchId}
              onChange={(e) => setToBranchId(e.target.value)}
            >
              {BRANCH_OPTIONS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>নতুন সমিতি (ঐচ্ছিক)</Label>
            <Input value={toSamityName} onChange={(e) => setToSamityName(e.target.value)} placeholder="সমিতির নাম" />
          </div>
          <div className="space-y-1">
            <Label>কারণ</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="যেমন: স্বামীর বাড়িতে স্থানান্তর" />
          </div>
        </div>
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        {message && <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p>}
        <Button size="sm" onClick={submit} disabled={busy || reason.trim().length < 5}>
          প্রস্তাব জমা দিন
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, mono, span }: { label: string; value: string | null | undefined; mono?: boolean; span?: boolean }) {
  return (
    <div className={span ? 'md:col-span-2' : ''}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={mono ? 'font-mono text-xs' : 'font-medium'}>{value || '—'}</p>
    </div>
  );
}

function LinesTable({ rows, cols, empty }: { rows: Record<string, string>[]; cols: [string, string][]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs text-muted-foreground">
          {cols.map(([key, label]) => (
            <th key={key} className="py-2 pr-3">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b last:border-0">
            {cols.map(([key]) => (
              <td key={key} className="py-2 pr-3">
                {row[key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
