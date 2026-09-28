/**
 * ── Work Distribution page ───────────────────────────────────────────────────
 * Task board (create → work → verify, comments, overdue flags), auto-generated
 * tasks from other modules, the AM→BM→officer monthly target cascade with live
 * achievement bars, delegation / bulk reassignment, plus req 5–9: supervision
 * checklists (GPS + photos), internal audit (plans, sampling, findings),
 * approval inbox, escalation view, calendar/kanban and the daily digest.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import type { Staff, TargetMetrics, WorkTarget } from '@samity/shared';
import {
  AUTO_TASK_DEFS,
  DEFAULT_CHECKLISTS,
  FINDING_SEVERITY_LABELS_BN,
  FINDING_STATUS_LABELS_BN,
  SUPERVISION_FORM_LABELS_BN,
  TASK_PRIORITIES_BN,
  TASK_STATUSES_BN,
  TASK_TYPE_LABELS_BN,
  buildCalendar,
  buildKanban,
  targetAchievement,
  type ApprovalItem,
  type AuditFinding,
  type AuditPlan,
  type AutoTaskSource,
  type DailyDigest,
  type SupervisionFormType,
  type SupervisionSubmission,
  type TaskPriority,
  type TaskStatus,
  type WorkTask,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

type StaffResponse = { items: Staff[] };
type TasksResponse = { items: WorkTask[] };
type DelegationsResponse = { items: WorkStoreDelegation[] };
type TargetsResponse = { period: string; items: { target: WorkTarget; actual: TargetMetrics }[] };

interface WorkStoreDelegation {
  id: string;
  taskId: string | null;
  fromStaffId: string;
  toStaffId: string;
  reason: string;
  note: string;
  createdAt: string;
}

type Tab = 'tasks' | 'kanban' | 'calendar' | 'auto' | 'targets' | 'delegation' | 'supervision' | 'audit' | 'inbox';

const TAB_LABELS: Record<Tab, string> = {
  tasks: 'কাজের তালিকা',
  kanban: 'কানবান',
  calendar: 'ক্যালেন্ডার',
  auto: 'স্বয়ংক্রিয় কাজ',
  targets: 'লক্ষ্যমাত্রা',
  delegation: 'প্রতিনিধিত্ব',
  supervision: 'তত্ত্বাবধান',
  audit: 'অভ্যন্তরীণ নিরীক্ষা',
  inbox: 'অনুমোদন ইনবক্স',
};

/** Mirrors the shared transition rules: legal forward statuses for the buttons. */
const NEXT_STATUSES: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in_progress', 'blocked', 'done'],
  in_progress: ['blocked', 'done'],
  blocked: ['in_progress', 'done'],
  done: ['verified'],
  verified: [],
};

const DELEGATION_REASONS_BN: Record<string, string> = {
  leave: 'ছুটি',
  transfer: 'বদলি',
  workload: 'কর্মভার',
  other: 'অন্যান্য',
};

const DESIGNATION_BN: Record<string, string> = {
  field_officer: 'ফিল্ড অফিসার',
  branch_manager: 'শাখা ব্যবস্থাপক',
  area_manager: 'এরিয়া ব্যবস্থাপক',
  accountant: 'হিসাবরক্ষক',
  other: 'কর্মী',
};

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '—';
}

function statusChipClass(status: TaskStatus): string {
  if (status === 'done' || status === 'verified') return 'bg-primary/10 text-primary';
  if (status === 'blocked') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-foreground';
}

/** Tasks + auto tasks + target cascade + delegation (Work module UI). */
export function WorkPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('tasks');
  const [error, setError] = useState('');
  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});
  const [taskForm, setTaskForm] = useState({
    type: 'manual',
    title: '',
    description: '',
    assigneeId: '',
    dueDate: '',
    priority: 'normal',
  });
  const [autoForm, setAutoForm] = useState<{ source: AutoTaskSource; linkId: string; linkLabel: string; eventDate: string; note: string }>({
    source: 'overdue_followup',
    linkId: '',
    linkLabel: '',
    eventDate: '',
    note: '',
  });
  const [targetForm, setTargetForm] = useState({
    scope: 'branch',
    ownerBranchId: '',
    ownerName: '',
    period: new Date().toISOString().slice(0, 7),
    newMembers: '20',
    disbursement: '200000',
    collection: '180000',
    savings: '120000',
    parLimit: '5',
  });
  const [reassignForm, setReassignForm] = useState({ fromStaffId: '', toStaffId: '', reason: 'leave', note: '' });
  const [supForm, setSupForm] = useState<{ formType: SupervisionFormType; linkLabel: string; lat: string; lng: string; answers: Record<string, 'yes' | 'no' | 'na'>; note: string }>({
    formType: 'center_visit',
    linkLabel: '',
    lat: '23.8103',
    lng: '90.4125',
    answers: {},
    note: '',
  });
  const [auditForm, setAuditForm] = useState({ branchId: '00000000-0000-4000-8000-0000000000b1', branchName: 'ঢাকা শাখা', title: '', plannedDate: '', sampleSize: '8' });
  const [findingForm, setFindingForm] = useState<{ auditId: string; title: string; detail: string; severity: 'low' | 'medium' | 'high' | 'critical' }>({
    auditId: '',
    title: '',
    detail: '',
    severity: 'medium',
  });
  const [responseForm, setResponseForm] = useState<{ id: string; response: string }>({ id: '', response: '' });
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const supervisionQ = useQuery<{ items: SupervisionSubmission[] }>({
    queryKey: ['work', 'supervision'],
    queryFn: () => api.get<{ items: SupervisionSubmission[] }>('/work/supervision'),
  });
  const auditsQ = useQuery<{ items: AuditPlan[] }>({
    queryKey: ['work', 'audits'],
    queryFn: () => api.get<{ items: AuditPlan[] }>('/work/audits'),
  });
  const findingsQ = useQuery<{ items: AuditFinding[] }>({
    queryKey: ['work', 'findings'],
    queryFn: () => api.get<{ items: AuditFinding[] }>('/work/findings'),
  });
  const inboxQ = useQuery<{ items: ApprovalItem[] }>({
    queryKey: ['work', 'inbox'],
    queryFn: () => api.get<{ items: ApprovalItem[] }>('/work/inbox'),
  });
  const digestQ = useQuery<DailyDigest>({
    queryKey: ['work', 'digest'],
    queryFn: () => api.get<DailyDigest>('/work/digest'),
  });
  const escalationsQ = useQuery<{ items: { id: string; entityType: string; entityId: string; daysOverdue: number; tierRole: string }[] }>({
    queryKey: ['work', 'escalations'],
    queryFn: () => api.get<{ items: { id: string; entityType: string; entityId: string; daysOverdue: number; tierRole: string }[] }>('/work/escalations'),
  });

  const staffQ = useQuery<StaffResponse>({
    queryKey: ['work', 'staff'],
    queryFn: () => api.get<StaffResponse>('/hr/staff'),
  });
  const tasksQ = useQuery<TasksResponse>({
    queryKey: ['work', 'tasks'],
    queryFn: () => api.get<TasksResponse>('/work/tasks'),
  });
  const delegationsQ = useQuery<DelegationsResponse>({
    queryKey: ['work', 'delegations'],
    queryFn: () => api.get<DelegationsResponse>('/work/delegations'),
  });
  const targetsQ = useQuery<TargetsResponse>({
    queryKey: ['work', 'targets'],
    queryFn: () => api.get<TargetsResponse>('/work/targets'),
  });

  const staff = (staffQ.data?.items ?? []).filter((s) => s.status === 'probation' || s.status === 'confirmed');
  const staffName = (id: string | null | undefined) => {
    if (!id) return '—';
    const s = staff.find((x) => x.id === id);
    if (s) return s.nameBn || s.name;
    return FALLBACK_NAMES[id] ?? id.slice(0, 8);
  };
  // Fallback names for seeded/unknown staff ids so the history list never crashes.
  const FALLBACK_NAMES: Record<string, string> = {
    '00000000-0000-4000-8000-0000000000f1': 'কমল হোসেন',
    '00000000-0000-4000-8000-0000000000f2': 'নুসরাত জাহান',
    '00000000-0000-4000-8000-0000000000f3': 'আব্দুল করিম',
  };
  const tasks = tasksQ.data?.items ?? [];
  const delegations = delegationsQ.data?.items ?? [];
  const today = day(new Date().toISOString());
  const openCount = tasks.filter((x) => x.status !== 'done' && x.status !== 'verified').length;
  const overdueCount = tasks.filter((x) => x.status !== 'done' && x.status !== 'verified' && day(x.dueDate) < today).length;
  const blockedCount = tasks.filter((x) => x.status === 'blocked').length;

  function onErr(err: unknown) {
    const body = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
    setError(body ?? (err instanceof Error ? err.message : 'ত্রুটি হয়েছে'));
    setTimeout(() => setError(''), 4000);
  }

  const createTask = useMutation({
    mutationFn: async () => {
      const assignee = staff.find((s) => s.id === taskForm.assigneeId) ?? staff[0];
      return api.post<WorkTask>('/work/tasks', {
        type: taskForm.type,
        title: taskForm.title,
        description: taskForm.description || undefined,
        assigneeId: assignee?.id,
        dueDate: taskForm.dueDate,
        priority: taskForm.priority,
        branchId: user?.branchId ?? undefined,
      });
    },
    onSuccess: () => {
      setError('');
      setTaskForm((f) => ({ ...f, title: '', description: '' }));
      qc.invalidateQueries({ queryKey: ['work', 'tasks'] });
    },
    onError: onErr,
  });

  const transition = useMutation({
    mutationFn: (p: { id: string; status: TaskStatus }) => api.patch<WorkTask>(`/work/tasks/${p.id}`, { status: p.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work', 'tasks'] }),
    onError: onErr,
  });

  const comment = useMutation({
    mutationFn: (p: { id: string; text: string }) => api.post<WorkTask>(`/work/tasks/${p.id}/comments`, { text: p.text }),
    onSuccess: (_d, vars) => {
      setCommentDraft((d) => ({ ...d, [vars.id]: '' }));
      qc.invalidateQueries({ queryKey: ['work', 'tasks'] });
    },
    onError: onErr,
  });

  const generateAuto = useMutation({
    mutationFn: () =>
      api.post<WorkTask>('/work/tasks/auto', {
        source: autoForm.source,
        linkId: autoForm.linkId,
        linkLabel: autoForm.linkLabel,
        eventDate: autoForm.eventDate || undefined,
        note: autoForm.note || undefined,
        assigneeId: staff[0]?.id,
        branchId: user?.branchId ?? undefined,
      }),
    onSuccess: () => {
      setError('');
      setAutoForm((f) => ({ ...f, linkId: '', linkLabel: '', note: '' }));
      qc.invalidateQueries({ queryKey: ['work', 'tasks'] });
    },
    onError: onErr,
  });

  const saveTarget = useMutation({
    mutationFn: () =>
      api.post<WorkTarget>('/work/targets', {
        scope: targetForm.scope,
        ownerBranchId: targetForm.ownerBranchId || null,
        ownerStaffId: null,
        ownerName: targetForm.ownerName || 'ঢাকা শাখা',
        parentId: null,
        period: targetForm.period,
        metrics: {
          newMembers: targetForm.newMembers,
          disbursement: targetForm.disbursement,
          collection: targetForm.collection,
          savings: targetForm.savings,
          parLimit: targetForm.parLimit,
        },
      }),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['work', 'targets'] });
    },
    onError: onErr,
  });

  const reassignBulk = useMutation({
    mutationFn: () =>
      api.post<{ moved: number }>('/work/reassign-bulk', {
        fromStaffId: reassignForm.fromStaffId,
        toStaffId: reassignForm.toStaffId,
        toStaffName: staffName(reassignForm.toStaffId),
        reason: reassignForm.reason,
        note: reassignForm.note || undefined,
      }),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['work', 'tasks'] });
      qc.invalidateQueries({ queryKey: ['work', 'delegations'] });
    },
    onError: onErr,
  });

  const submitSupervision = useMutation({
    mutationFn: () =>
      api.post<SupervisionSubmission>('/work/supervision', {
        branchId: user?.branchId ?? '00000000-0000-4000-8000-0000000000b1',
        formType: supForm.formType,
        linkLabel: supForm.linkLabel,
        lat: supForm.lat ? Number(supForm.lat) : null,
        lng: supForm.lng ? Number(supForm.lng) : null,
        photos: [],
        answers: supForm.answers,
        note: supForm.note,
      }),
    onSuccess: () => {
      setError('');
      setSupForm((f) => ({ ...f, linkLabel: '', answers: {}, note: '' }));
      qc.invalidateQueries({ queryKey: ['work', 'supervision'] });
    },
    onError: onErr,
  });

  const createAuditPlan = useMutation({
    mutationFn: () =>
      api.post<AuditPlan>('/work/audits', {
        branchId: auditForm.branchId,
        branchName: auditForm.branchName,
        title: auditForm.title,
        plannedDate: auditForm.plannedDate,
        leadAuditorId: staff[0]?.id ?? '00000000-0000-4000-8000-0000000000f3',
        sampleSize: auditForm.sampleSize,
      }),
    onSuccess: () => {
      setError('');
      setAuditForm((f) => ({ ...f, title: '' }));
      qc.invalidateQueries({ queryKey: ['work', 'audits'] });
    },
    onError: onErr,
  });

  const drawSample = useMutation({
    mutationFn: (id: string) =>
      api.post<AuditPlan>(`/work/audits/${id}/sample`, { sampleSize: auditForm.sampleSize }),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['work', 'audits'] });
    },
    onError: onErr,
  });

  const advanceAudit = useMutation({
    mutationFn: (p: { id: string; status: string }) => api.post<AuditPlan>(`/work/audits/${p.id}/status`, { status: p.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work', 'audits'] }),
    onError: onErr,
  });

  const createFinding = useMutation({
    mutationFn: () => api.post<AuditFinding>('/work/findings', { ...findingForm, auditId: findingForm.auditId || auditsQ.data?.items?.[0]?.id }),
    onSuccess: () => {
      setError('');
      setFindingForm((f) => ({ ...f, title: '', detail: '' }));
      qc.invalidateQueries({ queryKey: ['work', 'findings'] });
    },
    onError: onErr,
  });

  const respondFindingM = useMutation({
    mutationFn: (p: { id: string; response: string }) => api.post<AuditFinding>(`/work/findings/${p.id}/respond`, { response: p.response }),
    onSuccess: () => {
      setResponseForm({ id: '', response: '' });
      qc.invalidateQueries({ queryKey: ['work', 'findings'] });
    },
    onError: onErr,
  });

  const followUpFindingM = useMutation({
    mutationFn: (p: { id: string; close: boolean }) =>
      api.post<AuditFinding>(`/work/findings/${p.id}/followup`, { note: p.close ? 'চূড়ান্ত যাচাই সম্পন্ন' : 'অনুসরণ করা হয়েছে', close: p.close }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work', 'findings'] }),
    onError: onErr,
  });

  const sweep = useMutation({
    mutationFn: () => api.post<{ created: unknown[] }>('/work/escalations/sweep'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work', 'escalations'] });
    },
    onError: onErr,
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">কাজ বণ্টন ও তত্ত্বাবধান</h1>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="rounded-full border px-2 py-0.5">চলমান {openCount}</span>
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
              <AlertTriangle className="h-3 w-3" /> বকেয়া {overdueCount}
            </span>
          )}
          {blockedCount > 0 && <span className="rounded-full bg-muted px-2 py-0.5">আটকে আছে {blockedCount}</span>}
        </div>
      </div>

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {(Object.keys(TAB_LABELS) as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>

      {/* ── Task board ─────────────────────────────────────────────────── */}
      {tab === 'tasks' && (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">নতুন কাজ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>ধরন</Label>
                  <select
                    value={taskForm.type}
                    onChange={(e) => setTaskForm((f) => ({ ...f, type: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    {Object.entries(TASK_TYPE_LABELS_BN).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>দায়িত্বপ্রাপ্ত</Label>
                  <select
                    value={taskForm.assigneeId}
                    onChange={(e) => setTaskForm((f) => ({ ...f, assigneeId: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    <option value="">স্বয়ংক্রিয় (প্রথম কর্মী)</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nameBn || s.name} ({DESIGNATION_BN[s.designation] ?? s.designation})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>শেষ তারিখ</Label>
                  <Input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>অগ্রাধিকার</Label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    {(Object.keys(TASK_PRIORITIES_BN) as TaskPriority[]).map((p) => (
                      <option key={p} value={p}>
                        {TASK_PRIORITIES_BN[p]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>শিরোনাম</Label>
                <Input value={taskForm.title} onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))} placeholder="কাজের বিবরণ" />
              </div>
              <div className="space-y-1">
                <Label>বিবরণ (ঐচ্ছিক)</Label>
                <Input value={taskForm.description} onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <Button
                className="w-full"
                disabled={taskForm.title.trim().length < 3 || !taskForm.dueDate || createTask.isPending}
                onClick={() => createTask.mutate()}
              >
                {createTask.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} তৈরি করুন
              </Button>
            </CardContent>
          </Card>

          {tasksQ.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">কোনো কাজ নেই</p>
          ) : (
            tasks.map((task) => {
              const overdue = task.status !== 'done' && task.status !== 'verified' && day(task.dueDate) < today;
              const nexts = NEXT_STATUSES[task.status] ?? [];
              return (
                <Card key={task.id} className={overdue ? 'border-destructive' : undefined}>
                  <CardContent className="space-y-2 pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {TASK_TYPE_LABELS_BN[task.type]} • {task.assigneeName} • {TASK_PRIORITIES_BN[task.priority]} • শেষ {day(task.dueDate)}
                        </p>
                        {task.link?.label && <p className="text-xs text-muted-foreground">সংযুক্ত: {task.link.label}</p>}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusChipClass(task.status)}`}>
                        {TASK_STATUSES_BN[task.status]}
                      </span>
                    </div>
                    {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
                    {overdue && (
                      <p className="flex items-center gap-1 text-xs font-medium text-destructive">
                        <AlertTriangle className="h-3 w-3" /> নির্ধারিত সময় অতিক্রান্ত
                      </p>
                    )}
                    {nexts.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {nexts.map((s) => (
                          <Button
                            key={s}
                            size="sm"
                            variant="outline"
                            disabled={transition.isPending}
                            onClick={() => transition.mutate({ id: task.id, status: s })}
                          >
                            {TASK_STATUSES_BN[s]}
                          </Button>
                        ))}
                      </div>
                    )}
                    {task.comments.length > 0 && (
                      <ul className="space-y-1 rounded bg-muted/40 p-2 text-xs">
                        {task.comments.map((c) => (
                          <li key={c.id}>
                            <span className="font-medium">{c.authorName}</span> ({day(c.createdAt)}): {c.text}
                          </li>
                        ))}
                      </ul>
                    )}
                    {task.status !== 'verified' && (
                      <div className="flex gap-1">
                        <Input
                          placeholder="মন্তব্য লিখুন…"
                          value={commentDraft[task.id] ?? ''}
                          onChange={(e) => setCommentDraft((d) => ({ ...d, [task.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!(commentDraft[task.id] ?? '').trim() || comment.isPending}
                          onClick={() => comment.mutate({ id: task.id, text: commentDraft[task.id] ?? '' })}
                        >
                          পাঠান
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── Auto-generated tasks ───────────────────────────────────────── */}
      {tab === 'auto' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" /> অন্য মডিউল থেকে কাজ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="space-y-1">
              <Label>উৎস</Label>
              <select
                value={autoForm.source}
                onChange={(e) => setAutoForm((f) => ({ ...f, source: e.target.value as AutoTaskSource }))}
                className="w-full rounded-md border bg-background px-2 py-2 text-sm"
              >
                {(Object.keys(AUTO_TASK_DEFS) as AutoTaskSource[]).map((k) => (
                  <option key={k} value={k}>
                    {AUTO_TASK_DEFS[k].titleBn}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>সংযুক্ত রেকর্ড আইডি</Label>
              <Input value={autoForm.linkId} onChange={(e) => setAutoForm((f) => ({ ...f, linkId: e.target.value }))} placeholder="UUID" />
            </div>
            <div className="space-y-1">
              <Label>সংযুক্ত রেকর্ডের নাম</Label>
              <Input value={autoForm.linkLabel} onChange={(e) => setAutoForm((f) => ({ ...f, linkLabel: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>ঘটনার তারিখ</Label>
                <Input type="date" value={autoForm.eventDate} onChange={(e) => setAutoForm((f) => ({ ...f, eventDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>নোট</Label>
                <Input value={autoForm.note} onChange={(e) => setAutoForm((f) => ({ ...f, note: e.target.value }))} />
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!autoForm.linkId.trim() || !autoForm.linkLabel.trim() || generateAuto.isPending}
              onClick={() => generateAuto.mutate()}
            >
              {generateAuto.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} কাজ তৈরি করুন
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Targets ────────────────────────────────────────────────────── */}
      {tab === 'targets' && (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">শাখায় মাসিক লক্ষ্য নির্ধারণ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>পরিধি</Label>
                  <select
                    value={targetForm.scope}
                    onChange={(e) => setTargetForm((f) => ({ ...f, scope: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    <option value="area">এরিয়া</option>
                    <option value="branch">শাখা</option>
                    <option value="officer">কর্মকর্তা</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>মাস</Label>
                  <Input type="month" value={targetForm.period} onChange={(e) => setTargetForm((f) => ({ ...f, period: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>শাখা আইডি</Label>
                  <Input value={targetForm.ownerBranchId} onChange={(e) => setTargetForm((f) => ({ ...f, ownerBranchId: e.target.value }))} placeholder="UUID" />
                </div>
                <div className="space-y-1">
                  <Label>নাম</Label>
                  <Input value={targetForm.ownerName} onChange={(e) => setTargetForm((f) => ({ ...f, ownerName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>নতুন সদস্য</Label>
                  <Input type="number" min={0} value={targetForm.newMembers} onChange={(e) => setTargetForm((f) => ({ ...f, newMembers: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>PAR সীমা %</Label>
                  <Input type="number" min={0} step="0.1" value={targetForm.parLimit} onChange={(e) => setTargetForm((f) => ({ ...f, parLimit: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>বিতরণ (৳)</Label>
                  <Input type="number" min={0} value={targetForm.disbursement} onChange={(e) => setTargetForm((f) => ({ ...f, disbursement: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>আদায় (৳)</Label>
                  <Input type="number" min={0} value={targetForm.collection} onChange={(e) => setTargetForm((f) => ({ ...f, collection: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>সঞ্চয় (৳)</Label>
                  <Input type="number" min={0} value={targetForm.savings} onChange={(e) => setTargetForm((f) => ({ ...f, savings: e.target.value }))} />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!targetForm.ownerBranchId.trim() || !targetForm.ownerName.trim() || saveTarget.isPending}
                onClick={() => saveTarget.mutate()}
              >
                {saveTarget.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} লক্ষ্য সংরক্ষণ
              </Button>
            </CardContent>
          </Card>

          {(targetsQ.data?.items ?? []).map(({ target, actual }) => (
            <Card key={target.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {target.ownerName} <span className="text-xs text-muted-foreground">({target.period})</span>
                  </p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {target.scope === 'area' ? 'এরিয়া' : target.scope === 'branch' ? 'শাখা' : 'কর্মকর্তা'}
                  </span>
                </div>
                {targetAchievement(target.metrics, actual).map((row) => (
                  <div key={row.metric} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span>{row.labelBn}</span>
                      <span className={row.pct >= 100 ? 'font-medium text-primary' : row.pct < 50 ? 'text-destructive' : ''}>
                        {row.actual} / {row.target} ({row.pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${row.pct >= 100 ? 'bg-primary' : row.pct < 50 ? 'bg-destructive' : 'bg-primary/60'}`}
                        style={{ width: `${Math.min(100, row.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Delegation & bulk reassignment ─────────────────────────────── */}
      {tab === 'delegation' && (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ছুটি/বদলিতে কাজ হস্তান্তর</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="space-y-1">
                <Label>যার কাজ হস্তান্তর হবে</Label>
                <select
                  value={reassignForm.fromStaffId}
                  onChange={(e) => setReassignForm((f) => ({ ...f, fromStaffId: e.target.value }))}
                  className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                >
                  <option value="">নির্বাচন করুন…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameBn || s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>যিনি দায়িত্ব নেবেন</Label>
                <select
                  value={reassignForm.toStaffId}
                  onChange={(e) => setReassignForm((f) => ({ ...f, toStaffId: e.target.value }))}
                  className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                >
                  <option value="">নির্বাচন করুন…</option>
                  {staff
                    .filter((s) => s.id !== reassignForm.fromStaffId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nameBn || s.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>কারণ</Label>
                  <select
                    value={reassignForm.reason}
                    onChange={(e) => setReassignForm((f) => ({ ...f, reason: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    {Object.entries(DELEGATION_REASONS_BN).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>নোট</Label>
                  <Input value={reassignForm.note} onChange={(e) => setReassignForm((f) => ({ ...f, note: e.target.value }))} />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!reassignForm.fromStaffId || !reassignForm.toStaffId || reassignBulk.isPending}
                onClick={() => reassignBulk.mutate()}
              >
                {reassignBulk.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} সব চলমান কাজ হস্তান্তর
              </Button>
            </CardContent>
          </Card>

          {delegations.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">কোনো হস্তান্তর নেই</p>
          ) : (
            delegations.map((d) => (
              <Card key={d.id}>
                <CardContent className="pt-4">
                  <p className="text-sm font-medium">
                    {staffName(d.fromStaffId)} → {staffName(d.toStaffId)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {DELEGATION_REASONS_BN[d.reason] ?? d.reason}
                    {d.taskId ? ' • নির্দিষ্ট কাজ' : ' • সব চলমান কাজ'}
                    {d.note ? ` • ${d.note}` : ''} • {day(d.createdAt)}
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Kanban board (req 9) ───────────────────────────────────────── */}
      {tab === 'kanban' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {buildKanban(tasks).map((col) => (
            <div key={col.status} className="space-y-2 rounded-lg border bg-muted/30 p-2">
              <p className="flex items-center justify-between px-1 text-sm font-medium">
                {col.labelBn}
                <span className="rounded-full bg-muted px-2 text-xs">{col.tasks.length}</span>
              </p>
              {col.tasks.map((t) => (
                <div key={t.id} className="rounded-md border bg-background p-2 text-xs">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-muted-foreground">
                    {t.assigneeName} • {TASK_PRIORITIES_BN[t.priority]} • {day(t.dueDate)}
                  </p>
                </div>
              ))}
              {col.tasks.length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">খালি</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Calendar (req 9) ───────────────────────────────────────────── */}
      {tab === 'calendar' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
            <div className="rounded-lg border bg-muted/40 p-1 text-xs">
              {digestQ.data?.summaryBn ?? 'ডাইজেস্ট লোড হচ্ছে…'}
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহঃ', 'শুক্র', 'শনি'].map((d) => (
              <p key={d} className="py-1 font-medium text-muted-foreground">{d}</p>
            ))}
            {(() => {
              const days = buildCalendar(tasks, auditsQ.data?.items ?? [], supervisionQ.data?.items ?? [], month);
              const first = new Date(`${days[0]?.date ?? month + '-01'}T00:00:00Z`).getUTCDay();
              const blanks = Array.from({ length: first }, (_, i) => <div key={`b${i}`} />);
              return [
                ...blanks,
                ...days.map((d) => {
                  const badges = d.taskIds.length + d.auditDates.length + d.supervisionCount;
                  const isToday = d.date === today;
                  return (
                    <div
                      key={d.date}
                      className={`min-h-12 rounded border p-1 text-left ${isToday ? 'border-primary bg-primary/5' : ''} ${badges ? 'bg-muted/40' : ''}`}
                    >
                      <p className={isToday ? 'font-bold text-primary' : ''}>{Number(d.date.slice(-2))}</p>
                      {d.taskIds.length > 0 && <p className="text-[10px] text-primary">কাজ {d.taskIds.length}</p>}
                      {d.auditDates.length > 0 && <p className="text-[10px] text-destructive">অডিট {d.auditDates.length}</p>}
                      {d.supervisionCount > 0 && <p className="text-[10px] text-muted-foreground">তত্ত্বাবধান {d.supervisionCount}</p>}
                    </div>
                  );
                }),
              ];
            })()}
          </div>
        </div>
      )}

      {/* ── Supervision (req 5) ────────────────────────────────────────── */}
      {tab === 'supervision' && (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">তত্ত্বাবধান ফর্ম (মোবাইল: GPS + ছবি)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>ফর্ম</Label>
                  <select
                    value={supForm.formType}
                    onChange={(e) => {
                      setSupForm((f) => ({ ...f, formType: e.target.value as SupervisionFormType, answers: {} }));
                    }}
                    className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    {(Object.keys(SUPERVISION_FORM_LABELS_BN) as SupervisionFormType[]).map((k) => (
                      <option key={k} value={k}>
                        {SUPERVISION_FORM_LABELS_BN[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>স্থান/রেকর্ড</Label>
                  <Input value={supForm.linkLabel} onChange={(e) => setSupForm((f) => ({ ...f, linkLabel: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>অক্ষাংশ</Label>
                  <Input value={supForm.lat} onChange={(e) => setSupForm((f) => ({ ...f, lat: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>দ্রাঘিমাংশ</Label>
                  <Input value={supForm.lng} onChange={(e) => setSupForm((f) => ({ ...f, lng: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                {DEFAULT_CHECKLISTS[supForm.formType].map((q) => (
                  <div key={q.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                    <span>{q.questionBn}</span>
                    <div className="flex gap-1">
                      {(['yes', 'no', 'na'] as const).map((a) => (
                        <button
                          key={a}
                          onClick={() =>
                            setSupForm((f) => ({
                              ...f,
                              answers: { ...f.answers, [q.id]: a },
                            }))
                          }
                          className={`rounded px-2 py-0.5 text-xs ${
                            supForm.answers[q.id] === a
                              ? a === 'no'
                                ? 'bg-destructive text-destructive-foreground'
                                : a === 'yes'
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted'
                              : 'border'
                          }`}
                        >
                          {a === 'yes' ? 'হ্যাঁ' : a === 'no' ? 'না' : 'প্রযোজ্য নয়'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label>নোট</Label>
                <Input value={supForm.note} onChange={(e) => setSupForm((f) => ({ ...f, note: e.target.value }))} />
              </div>
              <Button className="w-full" disabled={submitSupervision.isPending} onClick={() => submitSupervision.mutate()}>
                {submitSupervision.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} জমা দিন
              </Button>
            </CardContent>
          </Card>

          {(supervisionQ.data?.items ?? []).map((s) => (
            <Card key={s.id} className={s.distanceMeters && s.distanceMeters > 2000 ? 'border-destructive' : undefined}>
              <CardContent className="space-y-1 pt-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{SUPERVISION_FORM_LABELS_BN[s.formType]} • {s.linkLabel || '—'}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s.exceptions > 0 ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                    ব্যতিক্রম {s.exceptions}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.submittedByName} • {day(s.submittedAt)}
                  {s.lat != null && s.lng != null ? ` • GPS ${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}` : ''}
                  {s.distanceMeters != null ? ` • ${Math.round(s.distanceMeters)} মি` : ''}
                  {s.photos.length > 0 ? ` • ছবি ${s.photos.length}` : ''}
                </p>
                {s.note && <p className="text-sm">{s.note}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Internal audit (req 6 + 8) ─────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">নতুন অডিট পরিকল্পনা</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>শিরোনাম</Label>
                  <Input value={auditForm.title} onChange={(e) => setAuditForm((f) => ({ ...f, title: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>তারিখ</Label>
                  <Input type="date" value={auditForm.plannedDate} onChange={(e) => setAuditForm((f) => ({ ...f, plannedDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>নমুনা সংখ্যা</Label>
                  <Input type="number" min={1} max={50} value={auditForm.sampleSize} onChange={(e) => setAuditForm((f) => ({ ...f, sampleSize: e.target.value }))} />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={auditForm.title.trim().length < 3 || !auditForm.plannedDate || createAuditPlan.isPending}
                onClick={() => createAuditPlan.mutate()}
              >
                {createAuditPlan.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} পরিকল্পনা তৈরি
              </Button>
            </CardContent>
          </Card>

          {(auditsQ.data?.items ?? []).map((a) => (
            <Card key={a.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{a.title} • {a.branchName}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {a.status === 'planned' ? 'পরিকল্পিত' : a.status === 'in_progress' ? 'চলমান' : a.status === 'draft_report' ? 'প্রতিবেদন' : 'সমাপ্ত'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  তারিখ {a.plannedDate} • নিরীক্ষক {a.leadAuditorName} • নমুনা ঋণ {a.loanSample.length}, সদস্য {a.memberSample.length}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" disabled={drawSample.isPending} onClick={() => drawSample.mutate(a.id)}>
                    <Sparkles className="mr-1 h-3 w-3" /> এলোমেলো নমুনা
                  </Button>
                  {a.status === 'planned' && (
                    <Button size="sm" variant="outline" onClick={() => advanceAudit.mutate({ id: a.id, status: 'in_progress' })}>
                      শুরু
                    </Button>
                  )}
                  {a.status === 'in_progress' && (
                    <Button size="sm" variant="outline" onClick={() => advanceAudit.mutate({ id: a.id, status: 'draft_report' })}>
                      প্রতিবেদন
                    </Button>
                  )}
                  {a.status === 'draft_report' && (
                    <Button size="sm" variant="outline" onClick={() => advanceAudit.mutate({ id: a.id, status: 'closed' })}>
                      সমাপ্ত
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">ফাইন্ডিং যোগ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>অডিট</Label>
                  <select
                    value={findingForm.auditId}
                    onChange={(e) => setFindingForm((f) => ({ ...f, auditId: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    <option value="">প্রথম অডিট</option>
                    {(auditsQ.data?.items ?? []).map((a) => (
                      <option key={a.id} value={a.id}>{a.title}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>গুরুত্ব</Label>
                  <select
                    value={findingForm.severity}
                    onChange={(e) => setFindingForm((f) => ({ ...f, severity: e.target.value as typeof findingForm.severity }))}
                    className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  >
                    {(Object.keys(FINDING_SEVERITY_LABELS_BN) as (keyof typeof FINDING_SEVERITY_LABELS_BN)[]).map((k) => (
                      <option key={k} value={k}>{FINDING_SEVERITY_LABELS_BN[k]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Input placeholder="শিরোনাম" value={findingForm.title} onChange={(e) => setFindingForm((f) => ({ ...f, title: e.target.value }))} />
              <Input placeholder="বিবরণ" value={findingForm.detail} onChange={(e) => setFindingForm((f) => ({ ...f, detail: e.target.value }))} />
              <Button className="w-full" disabled={findingForm.title.trim().length < 3 || createFinding.isPending} onClick={() => createFinding.mutate()}>
                {createFinding.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} ফাইন্ডিং যোগ
              </Button>
            </CardContent>
          </Card>

          {(findingsQ.data?.items ?? []).map((f) => (
            <Card key={f.id} className={f.status !== 'closed' && f.deadline && f.deadline < today ? 'border-destructive' : undefined}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{f.title}</p>
                  <div className="flex gap-1 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${
                      f.severity === 'critical' || f.severity === 'high' ? 'bg-destructive/10 text-destructive' : 'bg-muted'
                    }`}>
                      {FINDING_SEVERITY_LABELS_BN[f.severity]}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5">{FINDING_STATUS_LABELS_BN[f.status]}</span>
                  </div>
                </div>
                {f.detail && <p className="text-sm text-muted-foreground">{f.detail}</p>}
                <p className="text-xs text-muted-foreground">শেষ তারিখ {f.deadline ?? '—'}</p>
                {f.response && <p className="rounded bg-muted/40 p-2 text-sm">শাখার জবাব: {f.response}</p>}
                {f.followUps.length > 0 && (
                  <ul className="space-y-1 rounded bg-muted/40 p-2 text-xs">
                    {f.followUps.map((fu) => (
                      <li key={fu.id}>{day(fu.at)} • {fu.byName}: {fu.note}</li>
                    ))}
                  </ul>
                )}
                {f.status === 'open' && (
                  <div className="flex gap-1">
                    <Input
                      placeholder="শাখার জবাব…"
                      value={responseForm.id === f.id ? responseForm.response : ''}
                      onChange={(e) => setResponseForm({ id: f.id, response: e.target.value })}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={responseForm.id !== f.id || responseForm.response.trim().length < 3 || respondFindingM.isPending}
                      onClick={() => respondFindingM.mutate({ id: f.id, response: responseForm.response })}
                    >
                      জবাব
                    </Button>
                  </div>
                )}
                {(f.status === 'responded' || f.status === 'in_followup') && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" disabled={followUpFindingM.isPending} onClick={() => followUpFindingM.mutate({ id: f.id, close: false })}>
                      অনুসরণ
                    </Button>
                    <Button size="sm" variant="outline" disabled={followUpFindingM.isPending} onClick={() => followUpFindingM.mutate({ id: f.id, close: true })}>
                      বন্ধ করুন
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                এসক্যালেশন খাতা
                <Button size="sm" variant="outline" disabled={sweep.isPending} onClick={() => sweep.mutate()}>
                  সুইপ চালান
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {(escalationsQ.data?.items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">কোনো এসক্যালেশন নেই</p>
              ) : (
                (escalationsQ.data?.items ?? []).map((e) => (
                  <p key={e.id} className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-3 w-3 text-destructive" />
                    {e.entityType === 'task' ? 'কাজ' : 'ফাইন্ডিং'} {e.entityId.slice(0, 8)}… • {e.daysOverdue} দিন •
                    {e.tierRole === 'branch_manager' ? ' শাখা ব্যবস্থাপক' : e.tierRole === 'area_manager' ? ' এরিয়া ব্যবস্থাপক' : ' প্রধান কার্যালয়'}
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Approval inbox (req 7) ─────────────────────────────────────── */}
      {tab === 'inbox' && (
        <div className="space-y-2">
          {(inboxQ.data?.items ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">সব অনুমোদন সম্পন্ন</p>
          ) : (
            (inboxQ.data?.items ?? []).map((it) => (
              <Card key={`${it.kind}-${it.refId}`} className={it.escalated ? 'border-destructive' : undefined}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
                  <div className="min-w-0">
                    <p className="font-medium">{it.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {it.kindLabelBn} • {it.subtitle} • {it.requesterName} • {it.waitingDays} দিন অপেক্ষা
                      {it.escalated ? ' • এসক্যালেটেড' : ''}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline">অনুমোদন</Button>
                    <Button size="sm" variant="outline">বাতিল</Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
