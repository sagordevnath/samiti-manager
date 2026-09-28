/**
 * ── Documents page (reqs 4–8) ────────────────────────────────────────────────
 * Tab 1 তৈরি: generate any of the 11 doc kinds in cholito/sadhu register —
 *   amount-words and the Bangla calendar date auto-fill; the print-HTML
 *   (embedded Bengali font stack) opens in a new tab for print-to-PDF.
 * Tab 2 টেমপ্লেট: admin editor with placeholder picker, live preview and
 *   version history with restore (req 5).
 * Tab 3 দলিল: issued documents with verify codes and QR download; revoke.
 * Tab 4 গুচ্ছ: bulk jobs over a samity or branch with queue progress (req 8).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, FilePlus2, History, Layers } from 'lucide-react';
import type { BulkJob, DocKind, DocRegister, DocTemplate, DocTemplateVersion, DocumentRecord } from '@samity/shared';
import {
  DOC_KINDS,
  DOC_KIND_LABELS_BN,
  DOC_REGISTERS,
  DOC_REGISTER_LABELS_BN,
  DOC_VARIABLES,
  DOC_VARIABLE_LABELS_BN,
  BULK_JOB_KINDS,
  BULK_JOB_LABELS_BN,
  banglaCalendarDate,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

const TABS = ['generate', 'templates', 'documents', 'bulk'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  generate: 'দলিল তৈরি',
  templates: 'টেমপ্লেট সম্পাদক',
  documents: 'ইস্যুকৃত দলিল',
  bulk: 'গুচ্ছ কার্যক্রম',
};

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className ?? ''}`}>{children}</td>;
}

interface DocListItem extends Omit<DocumentRecord, 'html'> {}
interface GeneratedDoc extends DocListItem { qrDataUrl: string }

/* ── Tab 1: generate ──────────────────────────────────────────────────────── */

function GenerateTab() {
  const [kind, setKind] = useState<DocKind>('receipt');
  const [register, setRegister] = useState<DocRegister>('cholito');
  const [vars, setVars] = useState<Record<string, string>>({
    memberName: 'রহিমা বেগম',
    memberCode: 'M-0001',
    branchName: 'ধানমন্ডি শাখা',
    samityName: 'গাজীপুর সমিতি',
    paidAmount: '12500.50',
    paidFor: 'সঞ্চয় জমা',
    balance: '500',
  });
  const [last, setLast] = useState<GeneratedDoc | null>(null);
  const generate = useMutation({
    mutationFn: () => api.post<GeneratedDoc>('/documents/generate', { kind, register, vars }),
    onSuccess: (doc) => setLast(doc),
  });
  const openPrint = (id: string) => {
    window.open(`${import.meta.env.VITE_API_URL ?? '/api/v1'}/documents/${id}/download`, '_blank');
  };
  const bnToday = banglaCalendarDate(new Date().toISOString().slice(0, 10)).text;
  const varFields: [string, string][] =
    kind === 'receipt'
      ? [['memberName', 'সদস্যের নাম'], ['memberCode', 'সদস্য কোড'], ['branchName', 'শাখা'], ['samityName', 'সমিতি'], ['paidAmount', 'জমার পরিমাণ'], ['paidFor', 'জমার খাত'], ['balance', 'পূর্বের ব্যালেন্স']]
      : kind === 'loan_application' || kind === 'loan_agreement' || kind === 'guarantor_declaration'
        ? [['memberName', 'সদস্যের নাম'], ['memberCode', 'সদস্য কোড'], ['branchName', 'শাখা'], ['samityName', 'সমিতি'], ['loanCode', 'ঋণ কোড'], ['loanAmount', 'ঋণের পরিমাণ'], ['installment', 'কিস্তি'], ['installmentCount', 'কিস্তি সংখ্যা'], ['termMonths', 'মেয়াদ (মাস)'], ['interestRate', 'সুদের হার'], ['purpose', 'উদ্দেশ্য'], ['guarantorName', 'জামানতদার'], ['guarantorAddress', 'জামানতদারের ঠিকানা']]
        : [['memberName', 'সদস্যের নাম'], ['memberCode', 'সদস্য কোড'], ['branchName', 'শাখা'], ['samityName', 'সমিতি'], ['noticeSubject', 'বিষয়'], ['noticeDate', 'তারিখ'], ['staffName', 'কর্মীর নাম'], ['staffDesignation', 'পদবি'], ['effectiveDate', 'কার্যকর তারিখ']];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FilePlus2 className="h-4 w-4" /> নতুন দলিল</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">আজ: {bnToday} · টাকা-কথায় স্বয়ংক্রিয়ভাবে বসে (যেমন 12500.50 → বারো হাজার পাঁচ শত টাকা পঞ্চাশ পয়সা)</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>দলিলের ধরন</Label>
              <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
                {DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_LABELS_BN[k]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>ভাষার রীতি</Label>
              <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={register} onChange={(e) => setRegister(e.target.value as DocRegister)}>
                {DOC_REGISTERS.map((r) => <option key={r} value={r}>{DOC_REGISTER_LABELS_BN[r]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {varFields.map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input
                  value={vars[key] ?? ''}
                  onChange={(e) => setVars((v) => ({ ...v, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {generate.isError && <p className="text-xs text-red-600">{(generate.error as Error).message}</p>}
          <Button className="w-full" disabled={generate.isPending} onClick={() => generate.mutate()}>তৈরি করুন</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">তৈরি হয়েছে</CardTitle></CardHeader>
        <CardContent>
          {!last && <p className="text-sm text-muted-foreground">দলিল তৈরি হলে এখানে QR-সহ প্রিভিউ দেখা যাবে।</p>}
          {last && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {last.qrDataUrl && <img src={last.qrDataUrl} alt="QR" className="h-20 w-20" />}
                <div className="text-sm">
                  <p className="font-semibold">{DOC_KIND_LABELS_BN[last.kind]} · {last.docNo}</p>
                  <p className="text-xs text-muted-foreground">যাচাই কোড: <span className="font-mono">{last.verifyCode}</span></p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => openPrint(last.id)}>প্রিন্ট / PDF</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab 2: template editor (placeholder picker, live preview, versions) ─── */

function DocTemplatesTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const list = useQuery({ queryKey: ['doc-templates'], queryFn: () => api.get<{ items: DocTemplate[] }>('/documents/templates') });
  const items = list.data?.items ?? [];
  const selected = items.find((t) => t.id === selectedId) ?? null;
  const pick = (t: DocTemplate) => {
    setSelectedId(t.id);
    setDraft(t.body);
    setOrientation(t.orientation);
    setVersionsOpen(false);
  };
  const preview = useQuery({
    queryKey: ['doc-template-preview', selectedId, draft],
    queryFn: () => api.post<{ html: string; missing: string[] }>(`/documents/templates/${selectedId}/preview`, {}),
    enabled: !!selectedId && !!selected && draft === selected.body,
    retry: false,
  });
  const versions = useQuery({
    queryKey: ['doc-template-versions', selectedId],
    queryFn: () => api.get<{ items: DocTemplateVersion[] }>(`/documents/templates/${selectedId}/versions`),
    enabled: !!selectedId && versionsOpen,
  });
  const save = useMutation({
    mutationFn: () =>
      api.put<{ template: DocTemplate; version: DocTemplateVersion }>('/documents/templates', {
        id: selected!.id, kind: selected!.kind, register: selected!.register, orientation, enabled: true, body: draft,
      }),
    onSuccess: () => void list.refetch(),
  });
  const restore = useMutation({
    mutationFn: (v: number) => api.post<{ template: DocTemplate }>(`/documents/templates/${selectedId}/restore/${v}`),
    onSuccess: () => {
      void list.refetch();
      void versions.refetch();
    },
  });
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-3">
        <CardHeader><CardTitle className="text-base">ডক টেমপ্লেট ({items.length})</CardTitle></CardHeader>
        <CardContent className="max-h-[70vh] space-y-1 overflow-auto">
          {items.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t)}
              className={`w-full rounded-md border px-3 py-2 text-left text-sm ${t.id === selectedId ? 'border-teal-500 bg-teal-50' : 'hover:bg-muted'}`}
            >
              <span className="font-medium">{DOC_KIND_LABELS_BN[t.kind]}</span>
              <span className="ml-1 text-xs text-muted-foreground">({DOC_REGISTER_LABELS_BN[t.register]} · v{t.version})</span>
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
                {DOC_VARIABLES.slice(0, 24).map((v) => (
                  <button
                    key={v}
                    title={DOC_VARIABLE_LABELS_BN[v]}
                    className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] hover:bg-teal-100"
                    onClick={() => setDraft((d) => `${d}{{${v}}}`)}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <Label>কাগজ</Label>
                <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={orientation} onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}>
                  <option value="portrait">পোর্ট্রেট</option>
                  <option value="landscape">ল্যান্ডস্কেপ</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="dt-body">HTML বডি</Label>
                <textarea id="dt-body" className="min-h-52 w-full rounded-md border px-3 py-2 font-mono text-xs" value={draft} onChange={(e) => setDraft(e.target.value)} />
              </div>
              {save.isError && <p className="text-xs text-red-600">{(save.error as Error).message}</p>}
              {save.isSuccess && <p className="text-xs text-teal-700">সংরক্ষিত — নতুন ভার্সন v{save.data.template.version}।</p>}
              <div className="flex gap-2">
                <Button className="flex-1" disabled={save.isPending} onClick={() => save.mutate()}>সংরক্ষণ (নতুন ভার্সন)</Button>
                <Button variant="outline" onClick={() => setVersionsOpen((o) => !o)}><History className="h-4 w-4" /> ভার্সন</Button>
              </div>
              {versionsOpen && selectedId && (
                <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2">
                  {(versions.data?.items ?? []).map((v) => (
                    <div key={v.id} className="flex items-center justify-between text-xs">
                      <span>v{v.version} · {new Date(v.updatedAt).toLocaleString('bn-BD')} · {v.updatedBy}</span>
                      <Button size="sm" variant="ghost" className="h-6" onClick={() => restore.mutate(v.version)} disabled={restore.isPending}>পুনরুদ্ধার</Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <Card className="lg:col-span-5">
        <CardHeader><CardTitle className="text-base">লাইভ প্রিভিউ (প্রিন্ট লেআউট)</CardTitle></CardHeader>
        <CardContent>
          {!selected && <p className="text-sm text-muted-foreground">প্রিভিউ এখানে দেখা যাবে।</p>}
          {selected && draft !== selected.body && <p className="text-xs text-amber-700">সংরক্ষণ করলে প্রিভিউ হালনাগাদ হবে।</p>}
          {selected && preview.data && (
            <iframe title="doc preview" srcDoc={preview.data.html} className="h-[60vh] w-full rounded-md border bg-white" sandbox="allow-same-origin" />
          )}
          {selected && preview.data && preview.data.missing.length > 0 && (
            <p className="mt-2 text-xs text-amber-700">নমুনায় অনুপস্থিত: {preview.data.missing.join(', ')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab 3: issued documents + verification ──────────────────────────────── */

function DocumentsTab() {
  const qc = useQueryClient();
  const [kindFilter, setKindFilter] = useState('');
  const docs = useQuery({
    queryKey: ['documents', kindFilter],
    queryFn: () => api.get<{ items: DocListItem[] }>(`/documents${kindFilter ? `?kind=${kindFilter}` : ''}`),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.post<DocListItem>(`/documents/${id}/revoke`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents'] }),
  });
  const items = docs.data?.items ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> ইস্যুকৃত দলিল ({items.length})</CardTitle>
        <select className="mt-2 w-56 rounded-md border px-2 py-1.5 text-sm" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
          <option value="">সব ধরন</option>
          {DOC_KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_LABELS_BN[k]}</option>)}
        </select>
      </CardHeader>
      <CardContent>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead><tr><Th>নম্বর</Th><Th>ধরন</Th><Th>রীতি</Th><Th>যাচাই কোড</Th><Th>ইস্যু</Th><Th>অবস্থা</Th><Th>অ্যাকশন</Th></tr></thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-t">
                  <Td className="font-mono text-xs">{d.docNo}</Td>
                  <Td>{DOC_KIND_LABELS_BN[d.kind]}</Td>
                  <Td className="text-xs">{DOC_REGISTER_LABELS_BN[d.register]}</Td>
                  <Td className="font-mono text-xs">{d.verifyCode}</Td>
                  <Td className="text-xs">{new Date(d.issuedAt).toLocaleString('bn-BD')}</Td>
                  <Td><span className={`rounded px-1.5 py-0.5 text-xs ${d.status === 'active' ? 'bg-teal-100 text-teal-800' : 'bg-red-100 text-red-800'}`}>{d.status === 'active' ? 'সক্রিয়' : 'বাতিল'}</span></Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7" onClick={() => window.open(`${import.meta.env.VITE_API_URL ?? '/api/v1'}/documents/${d.id}/download`, '_blank')}>খুলুন</Button>
                      {d.status === 'active' && (
                        <Button size="sm" variant="ghost" className="h-7 text-red-700" onClick={() => revoke.mutate(d.id)} disabled={revoke.isPending}>বাতিল</Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">পাবলিক যাচাই: যে কেউ QR স্ক্যান করে /verify/&lt;কোড&gt; পেজে গিয়ে দলিলের সত্যতা যাচাই করতে পারেন — ব্যক্তিগত তথ্য দেখানো হয় না।</p>
      </CardContent>
    </Card>
  );
}

/* ── Tab 4: bulk jobs over a samity or branch (req 8) ─────────────────────── */

const SAMITIES = [
  { id: '00000000-0000-4000-8000-0000000000s1', name: 'গাজীপুর সমিতি' },
  { id: '00000000-0000-4000-8000-0000000000s2', name: 'আশুলিয়া সমিতি' },
];
const BRANCHES = [
  { id: '00000000-0000-4000-8000-0000000000b1', name: 'ঢাকা শাখা' },
  { id: '00000000-0000-4000-8000-0000000000b2', name: 'ময়মনসিংহ শাখা' },
];

function BulkTab() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<BulkJob['kind']>('documents_batch');
  const [scope, setScope] = useState<'samity' | 'branch'>('samity');
  const [scopeId, setScopeId] = useState(SAMITIES[0]!.id);
  const [body, setBody] = useState('সুপ্রিয় {name}, আগামীকাল সভায় উপস্থিত থাকার অনুরোধ।');
  const jobs = useQuery({
    queryKey: ['bulk-jobs'],
    queryFn: () => api.get<{ items: BulkJob[] }>('/documents/bulk-jobs'),
    refetchInterval: 5_000,
  });
  const create = useMutation({
    mutationFn: () =>
      api.post<BulkJob>('/documents/bulk-jobs', {
        kind, scope, scopeId, scopeName: [...SAMITIES, ...BRANCHES].find((s) => s.id === scopeId)?.name ?? scopeId,
        params: kind === 'documents_batch' ? { docKind: 'receipt', register: 'cholito', paidFor: 'সঞ্চয় জমা' } : { body },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bulk-jobs'] }),
  });
  const tick = useMutation({
    mutationFn: (id: string) => api.post<BulkJob>(`/documents/bulk-jobs/${id}/tick`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bulk-jobs'] }),
  });
  const items = jobs.data?.items ?? [];
  const scopeOptions = scope === 'samity' ? SAMITIES : BRANCHES;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4" /> নতুন গুচ্ছ কাজ</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>কাজের ধরন</Label>
            <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value as BulkJob['kind'])}>
              {BULK_JOB_KINDS.map((k) => <option key={k} value={k}>{BULK_JOB_LABELS_BN[k]}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>পরিসর</Label>
              <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={scope} onChange={(e) => { const s = e.target.value as 'samity' | 'branch'; setScope(s); setScopeId(s === 'samity' ? SAMITIES[0]!.id : BRANCHES[0]!.id); }}>
                <option value="samity">সমিতি</option>
                <option value="branch">শাখা</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>টার্গেট</Label>
              <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
                {scopeOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          {kind === 'sms_batch' && (
            <div className="space-y-1">
              <Label htmlFor="bulk-body">এসএমএস ({'{name}'} বসান)</Label>
              <textarea id="bulk-body" className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          )}
          {create.isError && <p className="text-xs text-red-600">{(create.error as Error).message}</p>}
          <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate()}>সারি (Queue) তে পাঠান</Button>
          <p className="text-xs text-muted-foreground">কাজ Express ওয়ার্কারে স্বয়ংক্রিয়ভাবে চলে; এখানে টিক দিয়ে সাথে সাথেও চালানো যায়।</p>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">কাজের অগ্রগতি</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {items.length === 0 && <p className="text-sm text-muted-foreground">এখনো কোনো কাজ নেই।</p>}
            {items.map((j) => {
              const pct = j.total > 0 ? Math.round((j.processed / j.total) * 100) : 0;
              return (
                <div key={j.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{BULK_JOB_LABELS_BN[j.kind]} · {j.scopeName}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${j.status === 'done' ? 'bg-teal-100 text-teal-800' : j.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                      {j.status === 'done' ? 'সম্পন্ন' : j.status === 'failed' ? 'ব্যর্থ' : j.status === 'running' ? 'চলছে' : 'অপেক্ষমাণ'}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded bg-slate-100">
                    <div className="h-2 rounded bg-teal-600" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{j.processed}/{j.total} · ব্যর্থ {j.failed} · {j.createdBy}</span>
                    {j.status === 'pending' && (
                      <Button size="sm" variant="outline" className="h-6" onClick={() => tick.mutate(j.id)} disabled={tick.isPending}>এখনই চালান</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── page shell ───────────────────────────────────────────────────────────── */

export default function DocsPage() {
  const [tab, setTab] = useState<Tab>('generate');
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
      {tab === 'generate' && <GenerateTab />}
      {tab === 'templates' && <DocTemplatesTab />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'bulk' && <BulkTab />}
    </div>
  );
}
