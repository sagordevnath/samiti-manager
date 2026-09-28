/**
 * ── Communication page (reqs 1–3) ────────────────────────────────────────────
 * Tab 1 নোটিফিকেশন: in-app notification center (Supabase Realtime pushes in
 *   production; the demo polls), mark-read and staff broadcast.
 * Tab 2 টেমপ্লেট: bilingual message templates with a placeholder picker and
 *   live preview before send.
 * Tab 3 পাঠানো ও লগ: guarded send form (window/opt-out/caps apply) and the
 *   delivery log with stats + retry pass.
 * Tab 4 নিয়ম ও খরচ: send window, retries, cost caps, spend counters, opt-outs.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Send, SlidersHorizontal, FileSignature } from 'lucide-react';
import type { CommRules, DeliveryRecord, DeliveryStatus, MessageTemplate, NotificationRecord, SendChannel, TemplateKind, TemplateVariable } from '@samity/shared';
import {
  DELIVERY_STATUS_LABELS_BN,
  SEND_CHANNELS,
  SEND_CHANNEL_LABELS_BN,
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABELS_BN,
  TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLE_LABELS_BN,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

const TABS = ['notifications', 'templates', 'send', 'rules'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  notifications: 'নোটিফিকেশন',
  templates: 'টেমপ্লেট',
  send: 'পাঠানো ও লগ',
  rules: 'নিয়ম ও খরচ',
};

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className ?? ''}`}>{children}</td>;
}

/* ── Tab 1: notification center ───────────────────────────────────────────── */

function NotificationsTab() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const feed = useQuery({
    queryKey: ['comms-notifications'],
    queryFn: () => api.get<{ items: NotificationRecord[] }>('/comms/notifications'),
    refetchInterval: 15_000, // Realtime push in production; poll in demo
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.post<{ read: boolean }>(`/comms/notifications/${id}/read`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['comms-notifications'] }),
  });
  const broadcast = useMutation({
    mutationFn: () => api.post<{ items: NotificationRecord[] }>('/comms/broadcast', { title, message }),
    onSuccess: () => {
      setTitle('');
      setMessage('');
      void qc.invalidateQueries({ queryKey: ['comms-notifications'] });
    },
  });
  const items = feed.data?.items ?? [];
  const unread = items.filter((n) => !n.read).length;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" /> নোটিফিকেশন ফিড <span className="rounded-full bg-teal-100 px-2 text-xs text-teal-800">{unread} অপঠিত</span></CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">কোনো নোটিফিকেশন নেই।</p>}
          {items.map((n) => (
            <div key={n.id} className={`rounded-md border p-3 ${n.read ? 'opacity-60' : 'border-teal-300 bg-teal-50/40'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{n.title}</p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                </div>
                {!n.read && (
                  <Button size="sm" variant="outline" onClick={() => markRead.mutate(n.id)}>পড়া হয়েছে</Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">সব কর্মীকে ঘোষণা</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="b-title">শিরোনাম</Label>
            <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="b-msg">বার্তা</Label>
            <textarea id="b-msg" className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          {broadcast.isError && <p className="text-xs text-red-600">{(broadcast.error as Error).message}</p>}
          <Button className="w-full" disabled={title.length < 2 || message.length < 2 || broadcast.isPending} onClick={() => broadcast.mutate()}>
            প্রকাশ করুন
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab 2: template editor with placeholder picker + live preview ────────── */

function TemplatesTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [subject, setSubject] = useState('');
  const list = useQuery({
    queryKey: ['comms-templates'],
    queryFn: () => api.get<{ items: MessageTemplate[] }>('/comms/templates'),
  });
  const items = list.data?.items ?? [];
  const selected = items.find((t) => t.id === selectedId) ?? null;
  const pick = (id: string | null) => {
    setSelectedId(id);
    const t = items.find((x) => x.id === id);
    setDraft(t?.body ?? '');
    setSubject(t?.subject ?? '');
  };
  const preview = useQuery({
    queryKey: ['comms-template-preview', selectedId, draft, subject],
    queryFn: () => api.post<{ text: string; subject: string; missing: string[] }>(`/comms/templates/${selectedId}/preview`, { overrides: { subject } , body: draft }),
    enabled: !!selectedId,
    retry: false,
  });
  const save = useMutation({
    mutationFn: () =>
      api.put<MessageTemplate>('/comms/templates', {
        kind: selected!.kind, name: selected!.name, locale: selected!.locale, channel: selected!.channel,
        subject, body: draft, enabled: selected!.enabled,
      }),
    onSuccess: () => void list.refetch(),
  });
  const missing = preview.data?.missing ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-4">
        <CardHeader><CardTitle className="text-base">মেসেজ টেমপ্লেট ({items.length})</CardTitle></CardHeader>
        <CardContent className="max-h-[70vh] space-y-1 overflow-auto">
          {items.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${t.id === selectedId ? 'border-teal-500 bg-teal-50' : 'hover:bg-muted'}`}
            >
              <span className="font-medium">{TEMPLATE_KIND_LABELS_BN[t.kind]}</span>
              <span className="ml-1 text-xs text-muted-foreground">({t.locale === 'bn' ? 'বাংলা' : 'EN'} · {SEND_CHANNEL_LABELS_BN[t.channel]})</span>
            </button>
          ))}
        </CardContent>
      </Card>
      <Card className="lg:col-span-4">
        <CardHeader><CardTitle className="text-base">সম্পাদনা</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!selected && <p className="text-sm text-muted-foreground">একটি টেমপ্লেট বাছুন।</p>}
          {selected && (
            <>
              <div className="flex flex-wrap gap-1">
                {TEMPLATE_VARIABLES.map((v) => (
                  <button
                    key={v}
                    title={TEMPLATE_VARIABLE_LABELS_BN[v]}
                    className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] hover:bg-teal-100"
                    onClick={() => setDraft((d) => `${d}{{${v}}}`)}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
              {selected.channel === 'email' && (
                <div className="space-y-1">
                  <Label htmlFor="t-subject">ইমেইল বিষয়</Label>
                  <Input id="t-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="t-body">বডি</Label>
                <textarea id="t-body" className="min-h-40 w-full rounded-md border px-3 py-2 font-mono text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} />
              </div>
              {save.isError && <p className="text-xs text-red-600">{(save.error as Error).message}</p>}
              {save.isSuccess && <p className="text-xs text-teal-700">সংরক্ষিত হয়েছে।</p>}
              <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>সংরক্ষণ</Button>
            </>
          )}
        </CardContent>
      </Card>
      <Card className="lg:col-span-4">
        <CardHeader><CardTitle className="text-base">লাইভ প্রিভিউ</CardTitle></CardHeader>
        <CardContent>
          {!selected && <p className="text-sm text-muted-foreground">প্রিভিউ এখানে দেখা যাবে।</p>}
          {selected && (
            <>
              {missing.length > 0 && (
                <p className="mb-2 text-xs text-amber-700">অনুপস্থিত: {missing.join(', ')}</p>
              )}
              <div className="whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-sm">{preview.data?.text ?? preview.error?.message ?? '…'}</div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab 3: send + delivery log ───────────────────────────────────────────── */

interface DeliveryStats {
  byStatus: { status: DeliveryStatus; labelBn: string; count: number }[];
  total: number;
  costToday: number;
  costMonth: number;
}

function SendTab() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<TemplateKind>('installment_reminder');
  const [channel, setChannel] = useState<SendChannel>('sms');
  const [recipientName, setRecipientName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [memberName, setMemberName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const log = useQuery({
    queryKey: ['comms-deliveries'],
    queryFn: () => api.get<{ items: DeliveryRecord[]; stats: DeliveryStats }>('/comms/deliveries'),
    refetchInterval: 20_000,
  });
  const send = useMutation({
    mutationFn: () =>
      api.post<DeliveryRecord>('/comms/send', {
        kind, channel, recipientName, recipient,
        vars: { memberName, amount, dueDate },
      }),
    onSuccess: () => {
      setRecipientName('');
      setRecipient('');
      void qc.invalidateQueries({ queryKey: ['comms-deliveries'] });
    },
  });
  const retry = useMutation({
    mutationFn: () => api.post<{ retried: number }>('/comms/deliveries/retry-due'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['comms-deliveries'] }),
  });
  const items = log.data?.items ?? [];
  const stats = log.data?.stats;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4" /> বার্তা পাঠান</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>ধরন</Label>
                <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value as TemplateKind)}>
                  {TEMPLATE_KINDS.map((k) => <option key={k} value={k}>{TEMPLATE_KIND_LABELS_BN[k]}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>চ্যানেল</Label>
                <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={channel} onChange={(e) => setChannel(e.target.value as SendChannel)}>
                  {SEND_CHANNELS.map((c) => <option key={c} value={c}>{SEND_CHANNEL_LABELS_BN[c]}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1"><Label>প্রাপকের নাম</Label><Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} /></div>
            <div className="space-y-1"><Label>প্রাপক (ফোন/ইমেইল/আইডি)</Label><Input value={recipient} onChange={(e) => setRecipient(e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label>সদস্য</Label><Input value={memberName} onChange={(e) => setMemberName(e.target.value)} /></div>
              <div className="space-y-1"><Label>amount</Label><Input value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div className="space-y-1"><Label>dueDate</Label><Input value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            </div>
            {send.isError && <p className="text-xs text-red-600">{(send.error as Error).message}</p>}
            {send.isSuccess && (
              <p className="text-xs text-teal-700">
                অবস্থা: {DELIVERY_STATUS_LABELS_BN[send.data.status]}{send.data.error ? ` — ${send.data.error}` : ''}
              </p>
            )}
            <Button className="w-full" disabled={recipientName.length < 1 || recipient.length < 3 || send.isPending} onClick={() => send.mutate()}>পাঠান</Button>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSignature className="h-4 w-4" /> ডেলিভারি লগ {stats ? `— আজ ৳${stats.costToday.toFixed(2)} · মাস ৳${stats.costMonth.toFixed(2)}` : ''}</CardTitle></CardHeader>
          <CardContent>
            {stats && stats.byStatus.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {stats.byStatus.map((s) => (
                  <span key={s.status} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{s.labelBn}: {s.count}</span>
                ))}
                <Button size="sm" variant="outline" className="ml-auto h-6" onClick={() => retry.mutate()} disabled={retry.isPending}>নির্ধারিত পুনরায় পাঠান</Button>
              </div>
            )}
            <div className="max-h-[50vh] overflow-auto">
              <table className="w-full text-sm">
                <thead><tr><Th>প্রাপক</Th><Th>চ্যানেল</Th><Th>ধরন</Th><Th>অবস্থা</Th><Th right>খরচ</Th><Th>সময়</Th></tr></thead>
                <tbody>
                  {items.slice(0, 50).map((d) => (
                    <tr key={d.id} className="border-t">
                      <Td>{d.recipientName}<span className="block text-xs text-muted-foreground">{d.recipient}</span></Td>
                      <Td>{SEND_CHANNEL_LABELS_BN[d.channel]}</Td>
                      <Td className="text-xs">{d.kind === 'custom' ? 'কাস্টম' : TEMPLATE_KIND_LABELS_BN[d.kind as TemplateKind]}</Td>
                      <Td><span className={`rounded px-1.5 py-0.5 text-xs ${d.status === 'sent' ? 'bg-teal-100 text-teal-800' : d.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{DELIVERY_STATUS_LABELS_BN[d.status]}</span>{d.error && <span className="block text-[10px] text-muted-foreground">{d.error}</span>}</Td>
                      <Td right>{d.cost > 0 ? `৳${d.cost.toFixed(2)}` : '—'}</Td>
                      <Td className="text-xs">{new Date(d.createdAt).toLocaleString('bn-BD')}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── Tab 4: rules + spend + opt-outs ──────────────────────────────────────── */

interface OptOutT { recipient: string; email: boolean; sms: boolean; note: string }
interface SpendT { day: string; dailyCost: number; month: string; monthlyCost: number; rules: CommRules }

function RulesTab() {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ['comms-rules'],
    queryFn: () => api.get<{ rules: CommRules; spend: SpendT }>('/comms/rules'),
  });
  const optOuts = useQuery({
    queryKey: ['comms-optouts'],
    queryFn: () => api.get<{ items: OptOutT[] }>('/comms/opt-outs'),
  });
  const [draft, setDraft] = useState<Partial<CommRules>>({});
  const rules = data.data?.rules;
  const merged: CommRules | undefined = useMemo(
    () => (rules ? { ...rules, ...draft } : undefined),
    [rules, draft],
  );
  const save = useMutation({
    mutationFn: () => api.put<CommRules>('/comms/rules', merged),
    onSuccess: () => {
      setDraft({});
      void qc.invalidateQueries({ queryKey: ['comms-rules'] });
    },
  });
  const toggle = useMutation({
    mutationFn: (o: OptOutT) => api.put<OptOutT>('/comms/opt-outs', { recipient: o.recipient, sms: !o.sms, email: o.email }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['comms-optouts'] }),
  });
  if (!merged) return <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>;
  const spend = data.data?.spend;
  const num = (k: keyof CommRules) => Number(merged[k]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="h-4 w-4" /> পাঠানোর নিয়ম</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>জানালা শুরু (ঢাকা)</Label><Input value={merged.sendWindowStart} onChange={(e) => setDraft((d) => ({ ...d, sendWindowStart: e.target.value }))} /></div>
            <div className="space-y-1"><Label>জানালা শেষ</Label><Input value={merged.sendWindowEnd} onChange={(e) => setDraft((d) => ({ ...d, sendWindowEnd: e.target.value }))} /></div>
            <div className="space-y-1"><Label>সর্বোচ্চ পুনরায় চেষ্টা</Label><Input type="number" value={num('maxRetries')} onChange={(e) => setDraft((d) => ({ ...d, maxRetries: Number(e.target.value) }))} /></div>
            <div className="space-y-1"><Label>ব্যাকঅফ (মিনিট)</Label><Input type="number" value={num('retryBackoffMinutes')} onChange={(e) => setDraft((d) => ({ ...d, retryBackoffMinutes: Number(e.target.value) }))} /></div>
            <div className="space-y-1"><Label>দৈনিক খরচ সীমা (৳)</Label><Input type="number" step="0.05" value={num('dailyCostCap')} onChange={(e) => setDraft((d) => ({ ...d, dailyCostCap: Number(e.target.value) }))} /></div>
            <div className="space-y-1"><Label>মাসিক খরচ সীমা (৳)</Label><Input type="number" step="0.05" value={num('monthlyCostCap')} onChange={(e) => setDraft((d) => ({ ...d, monthlyCostCap: Number(e.target.value) }))} /></div>
          </div>
          {spend && (
            <p className="text-xs text-muted-foreground">
              আজ ({spend.day}): ৳{spend.dailyCost.toFixed(2)} · মাস ({spend.month}): ৳{spend.monthlyCost.toFixed(2)}
            </p>
          )}
          {save.isError && <p className="text-xs text-red-600">{(save.error as Error).message}</p>}
          {save.isSuccess && <p className="text-xs text-teal-700">নিয়ম হালনাগাদ হয়েছে।</p>}
          <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>সংরক্ষণ</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">অপ্ট-আউট তালিকা</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead><tr><Th>প্রাপক</Th><Th>ইমেইল</Th><Th>এসএমএস</Th><Th>নোট</Th></tr></thead>
            <tbody>
              {(optOuts.data?.items ?? []).map((o) => (
                <tr key={o.recipient} className="border-t">
                  <Td className="font-mono text-xs">{o.recipient}</Td>
                  <Td>{o.email ? 'হ্যাঁ' : 'না'}</Td>
                  <Td>
                    <button className={`rounded px-2 py-0.5 text-xs ${o.sms ? 'bg-red-100 text-red-800' : 'bg-teal-100 text-teal-800'}`} onClick={() => toggle.mutate(o)}>
                      {o.sms ? 'অপ্ট-আউট' : 'অনুমোদিত'}
                    </button>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{o.note}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── page shell ───────────────────────────────────────────────────────────── */

export default function CommsPage() {
  const [tab, setTab] = useState<Tab>('notifications');
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm ${t === tab ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'send' && <SendTab />}
      {tab === 'rules' && <RulesTab />}
    </div>
  );
}
