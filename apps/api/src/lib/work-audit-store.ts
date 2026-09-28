/**
 * ── Work audit demo store (req 5–9) ──────────────────────────────────────────
 * In-memory supervision submissions, audit plans + findings, escalation ledger,
 * approval inbox and daily digests, layered on the work store's tasks.
 * Preview/test only — the Supabase path uses migration 0038 with the same
 * shapes and trigger-enforced rules (SLA default, closed-finding guard).
 */
import { randomUUID } from 'node:crypto';
import {
  buildDailyDigest,
  buildApprovalInbox,
  buildSupervisionSubmission,
  canTransitionFinding,
  escalateOpenTasks,
  GPS_OUT_OF_RANGE_METERS,
  pickRandomSample,
  responseDeadlineFor,
  waitingDaysSince,
  type ApprovalItem,
  type AuditFinding,
  type AuditPlan,
  type AuditPlanCreateBody,
  type AuditSampleBody,
  type DailyDigest,
  type FindingCreateBody,
  type FindingFollowUpBody,
  type FindingRespondBody,
  type FindingSeverity,
  type FindingStatus,
  type SupervisionSubmitBody,
  type SupervisionSubmission,
  type WorkTask,
} from '@samity/shared';
import {
  WorkDemoError,
  listWorkTasks,
  workDemoStore,
  type WorkDemoData,
} from './work-store.js';
import { loanDemoStore, demoMemberName } from './loan-store.js';

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_MYMENSINGH = '00000000-0000-4000-8000-0000000000b2';

export interface WorkAuditDemoData {
  orgId: string;
  submissions: SupervisionSubmission[];
  audits: AuditPlan[];
  findings: AuditFinding[];
  escalations: { id: string; entityType: 'task' | 'finding'; entityId: string; daysOverdue: number; tierRole: string; escalatedAt: string }[];
  digests: DailyDigest[];
}

const globalRef = globalThis as unknown as { __workAuditDemoData?: WorkAuditDemoData };

function seedStore(): WorkAuditDemoData {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const auditId = '00000000-0000-4000-8000-00000000ad01';
  return {
    orgId: ORG_ID,
    submissions: [
      buildSupervisionSubmission(
        {
          branchId: BRANCH_DHAKA,
          formType: 'center_visit',
          linkId: null,
          linkLabel: 'ঢাকা সেন্ট্রাল সমিতি',
          lat: 23.8103,
          lng: 90.4125,
          distanceMeters: 180,
          photos: ['supervision/cv-1.jpg'],
          answers: { cv1: 'yes', cv2: 'yes', cv3: 'no', cv4: 'yes' },
          note: 'কিস্তি রসিদ দেওয়া হয়নি',
        },
        { orgId: ORG_ID, submittedBy: '00000000-0000-4000-8000-0000000000f1', submittedByName: 'কমল হোসেন', submittedAt: yesterday },
      ),
      buildSupervisionSubmission(
        {
          branchId: BRANCH_MYMENSINGH,
          formType: 'cash_verification',
          linkId: null,
          linkLabel: 'ময়মনসিংহ শাখা',
          lat: 24.7506,
          lng: 90.4021,
          distanceMeters: 95,
          photos: [],
          answers: { cav1: 'yes', cav2: 'yes', cav3: 'yes' },
          note: '',
        },
        { orgId: ORG_ID, submittedBy: '00000000-0000-4000-8000-0000000000f3', submittedByName: 'আব্দুল করিম', submittedAt: now },
      ),
    ],
    audits: [
      {
        id: auditId,
        orgId: ORG_ID,
        branchId: BRANCH_DHAKA,
        branchName: 'ঢাকা শাখা',
        title: '২০২৬-০৯ অভ্যন্তরীণ নিরীক্ষা',
        plannedDate: new Date().toISOString().slice(0, 10),
        leadAuditorId: '00000000-0000-4000-8000-0000000000f3',
        leadAuditorName: 'আব্দুল করিম',
        status: 'in_progress',
        loanSample: [],
        memberSample: [],
        sampleSize: 10,
        createdBy: 'seed',
        createdAt: now,
        updatedAt: now,
      },
    ],
    findings: [
      {
        id: '00000000-0000-4000-8000-00000000fd01',
        orgId: ORG_ID,
        auditId,
        ref: 'bi1',
        title: 'নগদ বই ও হার্ড ক্যাশে ২,৪০০ ঘাটতি',
        detail: 'দৈনিক ক্যাশ বইয়ের সাথে হাতে নগদ মেলেনি।',
        severity: 'high',
        status: 'open',
        response: '',
        respondedAt: null,
        deadline: responseDeadlineFor('high', new Date(Date.now() - 6 * 86_400_000).toISOString()),
        followUps: [],
        closedAt: null,
        createdBy: 'seed',
        createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
        updatedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
      },
    ],
    escalations: [],
    digests: [],
  };
}

export function workAuditStore(): WorkAuditDemoData {
  globalRef.__workAuditDemoData ??= seedStore();
  return globalRef.__workAuditDemoData;
}

export function resetWorkAuditStore(): void {
  delete globalRef.__workAuditDemoData;
}

function err(status: number, code: string, message: string): never {
  throw new WorkDemoError(status, code, message);
}

/* ── 5) Supervision ───────────────────────────────────────────────────────── */

export function listSupervisions(
  store: WorkAuditDemoData,
  filter: { branchId?: string; formType?: string; since?: string } = {},
): SupervisionSubmission[] {
  let rows = [...store.submissions].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  if (filter.branchId) rows = rows.filter((s) => s.branchId === filter.branchId);
  if (filter.formType) rows = rows.filter((s) => s.formType === filter.formType);
  if (filter.since) rows = rows.filter((s) => s.submittedAt.slice(0, 10) >= (filter.since as string));
  return rows;
}

export function submitSupervision(
  store: WorkAuditDemoData,
  body: SupervisionSubmitBody,
  actor: { id: string; name: string },
): SupervisionSubmission {
  const submission = buildSupervisionSubmission(body, { orgId: store.orgId, submittedBy: actor.id, submittedByName: actor.name });
  store.submissions.push(submission);
  return submission;
}

/* ── 6) Internal audit ────────────────────────────────────────────────────── */

export function listAudits(store: WorkAuditDemoData, filter: { branchId?: string; status?: string } = {}): AuditPlan[] {
  let rows = [...store.audits].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  if (filter.branchId) rows = rows.filter((a) => a.branchId === filter.branchId);
  if (filter.status) rows = rows.filter((a) => a.status === filter.status);
  return rows;
}

export function getAudit(store: WorkAuditDemoData, id: string): AuditPlan {
  const a = store.audits.find((x) => x.id === id);
  if (!a) err(404, 'NOT_FOUND', 'অডিট পাওয়া যায়নি / Audit plan not found');
  return a as AuditPlan;
}

export function createAudit(store: WorkAuditDemoData, body: AuditPlanCreateBody, actor: { id: string }): AuditPlan {
  const now = new Date().toISOString();
  const plan: AuditPlan = {
    id: randomUUID(),
    orgId: store.orgId,
    branchId: body.branchId,
    branchName: body.branchName,
    title: body.title,
    plannedDate: body.plannedDate,
    leadAuditorId: body.leadAuditorId,
    leadAuditorName: body.leadAuditorName ?? 'নিরীক্ষক',
    status: 'planned',
    loanSample: [],
    memberSample: [],
    sampleSize: body.sampleSize,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };
  store.audits.push(plan);
  return plan;
}

export function setAuditStatus(store: WorkAuditDemoData, id: string, status: AuditPlan['status']): AuditPlan {
  const a = getAudit(store, id);
  const flow: Record<AuditPlan['status'], AuditPlan['status'][]> = {
    planned: ['in_progress'],
    in_progress: ['draft_report', 'closed'],
    draft_report: ['closed'],
    closed: [],
  };
  if (!flow[a.status].includes(status)) err(409, 'CONFLICT', `অবৈধ অবস্থান্তর ${a.status} → ${status}`);
  a.status = status;
  a.updatedAt = new Date().toISOString();
  return a;
}

/** Random sampling tool over the demo loan/member pools (branch-scoped). */
export function sampleForAudit(store: WorkAuditDemoData, auditId: string, body: AuditSampleBody): AuditPlan {
  const audit = getAudit(store, auditId);
  const loans = loanDemoStore();
  const loanPool = body.loanPool ?? loans.applications.filter((l) => l.branchId === audit.branchId).map((l) => l.id);
  const memberPool = body.memberPool ?? Object.entries(
    {
      a1: '00000000-0000-4000-8000-0000000001a1',
      a2: '00000000-0000-4000-8000-0000000001a2',
      a3: '00000000-0000-4000-8000-0000000001a3',
    },
  ).map(([, id]) => id);
  audit.loanSample = pickRandomSample(loanPool, body.sampleSize);
  audit.memberSample = pickRandomSample(memberPool, body.sampleSize);
  audit.sampleSize = body.sampleSize;
  audit.updatedAt = new Date().toISOString();
  return audit;
}

export function listFindings(store: WorkAuditDemoData, filter: { auditId?: string; status?: string; severity?: string } = {}): AuditFinding[] {
  let rows = [...store.findings].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (filter.auditId) rows = rows.filter((f) => f.auditId === filter.auditId);
  if (filter.status) rows = rows.filter((f) => f.status === filter.status);
  if (filter.severity) rows = rows.filter((f) => f.severity === filter.severity);
  return rows;
}

function getFinding(store: WorkAuditDemoData, id: string): AuditFinding {
  const f = store.findings.find((x) => x.id === id);
  if (!f) err(404, 'NOT_FOUND', 'ফাইন্ডিং পাওয়া যায়নি / Finding not found');
  return f as AuditFinding;
}

export function createFinding(store: WorkAuditDemoData, body: FindingCreateBody, actor: { id: string }): AuditFinding {
  const audit = getAudit(store, body.auditId);
  if (audit.status === 'closed') err(409, 'CONFLICT', 'বন্ধ অডিটে ফাইন্ডিং যোগ হবে না / Cannot add findings to a closed audit');
  const now = new Date().toISOString();
  const finding: AuditFinding = {
    id: randomUUID(),
    orgId: store.orgId,
    auditId: body.auditId,
    ref: body.ref ?? '',
    title: body.title,
    detail: body.detail ?? '',
    severity: body.severity,
    status: 'open',
    response: '',
    respondedAt: null,
    deadline: responseDeadlineFor(body.severity, now),
    followUps: [],
    closedAt: null,
    createdBy: actor.id,
    createdAt: now,
    updatedAt: now,
  };
  void 0;
  store.findings.push(finding);
  audit.updatedAt = now;
  return finding;
}

export function respondFinding(store: WorkAuditDemoData, id: string, body: FindingRespondBody): AuditFinding {
  const f = getFinding(store, id);
  if (!canTransitionFinding(f.status, f.status === 'open' ? 'responded' : f.status)) {
    err(409, 'CONFLICT', 'এই ফাইন্ডিংয়ে জবাব দেওয়া যাবে না / Response not allowed in this state');
  }
  if (f.status !== 'open') err(409, 'CONFLICT', 'জবাব ইতিমধ্যে জমা হয়েছে / Response already submitted');
  f.response = body.response;
  f.respondedAt = new Date().toISOString();
  f.deadline = body.deadline ?? f.deadline;
  f.status = 'responded';
  f.updatedAt = f.respondedAt;
  return f;
}

export function followUpFinding(store: WorkAuditDemoData, id: string, body: FindingFollowUpBody, actor: { name: string }): AuditFinding {
  const f = getFinding(store, id);
  if (f.status === 'closed') err(409, 'CONFLICT', 'বন্ধ ফাইন্ডিং / Finding is closed');
  const now = new Date().toISOString();
  f.followUps.push({ id: randomUUID(), at: now, note: body.note, byName: actor.name });
  if (body.close) {
    if (!canTransitionFinding(f.status, 'closed')) err(409, 'CONFLICT', 'এই অবস্থা থেকে বন্ধ করা যাবে না / Cannot close from this state');
    f.status = 'closed';
    f.closedAt = now;
  } else if (canTransitionFinding(f.status, 'in_followup')) {
    f.status = 'in_followup';
  }
  f.updatedAt = now;
  return f;
}

export function transitionFinding(store: WorkAuditDemoData, id: string, to: FindingStatus, actor: { name: string }): AuditFinding {
  const f = getFinding(store, id);
  if (!canTransitionFinding(f.status, to)) err(409, 'CONFLICT', `অবৈধ অবস্থান্তর ${f.status} → ${to}`);
  const now = new Date().toISOString();
  f.status = to;
  if (to === 'closed') f.closedAt = now;
  f.updatedAt = now;
  return f;
}

/* ── 8) Escalations ───────────────────────────────────────────────────────── */

/** Sweep once per call: record new escalation ledger rows for aged items. */
export function runEscalationSweep(store: WorkAuditDemoData): { id: string; entityType: 'task' | 'finding'; entityId: string; daysOverdue: number; tierRole: string; escalatedAt: string }[] {
  const work: WorkDemoData = workDemoStore();
  const tasks: WorkTask[] = listWorkTasks(work);
  const now = new Date().toISOString();
  const created: WorkAuditDemoData['escalations'] = [];

  for (const row of escalateOpenTasks(tasks)) {
    const tier = row.decision.tier;
    if (!tier) continue;
    const key = { entityType: 'task' as const, entityId: row.task.id, tierRole: tier.role };
    const exists = store.escalations.some((e) => e.entityType === key.entityType && e.entityId === key.entityId && e.tierRole === key.tierRole);
    if (exists) continue;
    const rec = { id: randomUUID(), ...key, daysOverdue: row.daysOverdue, escalatedAt: now };
    store.escalations.push(rec);
    created.push(rec);
  }

  for (const f of escalateFindings(store.findings)) {
    const tier = f.daysOverdue > 7 ? 'org_admin' : f.daysOverdue > 3 ? 'area_manager' : 'branch_manager';
    const key = { entityType: 'finding' as const, entityId: f.id, tierRole: tier };
    const exists = store.escalations.some((e) => e.entityType === key.entityType && e.entityId === key.entityId && e.tierRole === key.tierRole);
    if (exists) continue;
    const rec = { id: randomUUID(), ...key, daysOverdue: f.daysOverdue, escalatedAt: now };
    store.escalations.push(rec);
    created.push(rec);
  }
  return created;
}

function escalateFindings(
  findings: readonly { id: string; status: FindingStatus; deadline: string | null }[],
  todayIso = new Date().toISOString().slice(0, 10),
): { id: string; daysOverdue: number }[] {
  const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`).getTime();
  const today = day(todayIso);
  return findings
    .filter((f) => f.status !== 'closed' && f.deadline && day(f.deadline) < today)
    .map((f) => ({ id: f.id, daysOverdue: Math.floor((today - day(f.deadline as string)) / 86_400_000) }));
}

export function listEscalations(store: WorkAuditDemoData, entityType?: string) {
  let rows = [...store.escalations].sort((a, b) => b.escalatedAt.localeCompare(a.escalatedAt));
  if (entityType) rows = rows.filter((e) => e.entityType === entityType);
  return rows;
}

/* ── 7) Approval inbox ────────────────────────────────────────────────────── */

/** Pull pending approvals from every demo module and normalize them. */
export function buildInbox(): ApprovalItem[] {
  const groups: { items: ApprovalItem[] }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Loan applications awaiting decision (demo pipeline).
  const loans = loanDemoStore();
  const loanPending = loans.applications
    .filter((l) => l.status === 'bm_review' || l.status === 'am_review')
    .map((l) => {
      const requestedAt = l.createdAt;
      const waiting = waitingDaysSince(requestedAt, today);
      return {
        kind: 'loan_application',
        kindLabelBn: 'ঋণের আবেদন',
        refId: l.id,
        title: `${demoMemberName(l.memberId)} — ${l.applicationNumber}`,
        subtitle: `${l.requestedAmount} ৳ • ${l.status === 'am_review' ? 'এরিয়া অনুমোদন' : 'শাখা পর্যালোচনা'}`,
        linkTo: `/loans/${l.id}`,
        requestedAt,
        requesterName: demoMemberName(l.memberId),
        amount: l.requestedAmount,
        waitingDays: waiting,
        escalated: waiting >= 3,
      } satisfies ApprovalItem;
    });
  groups.push({ items: loanPending });

  // Findings awaiting branch response (deadline-driven escalation).
  const store = workAuditStore();
  const findingPending = store.findings
    .filter((f) => f.status === 'open')
    .map((f) => {
      const waiting = waitingDaysSince(f.createdAt, today);
      return {
        kind: 'audit_finding_response',
        kindLabelBn: 'অডিট জবাব',
        refId: f.id,
        title: f.title,
        subtitle: `গুরুত্ব: ${f.severity} • শেষ তারিখ ${f.deadline ?? '—'}`,
        linkTo: null,
        requestedAt: f.createdAt,
        requesterName: 'নিরীক্ষা',
        amount: null,
        waitingDays: waiting,
        escalated: Boolean(f.deadline && f.deadline < today),
      } satisfies ApprovalItem;
    });
  groups.push({ items: findingPending });

  return buildApprovalInbox(groups);
}

/* ── 9) Digest ────────────────────────────────────────────────────────────── */

export function dailyDigest(store: WorkAuditDemoData, role: string, date?: string): DailyDigest {
  const work: WorkDemoData = workDemoStore();
  const tasks: WorkTask[] = listWorkTasks(work);
  const today = date ?? new Date().toISOString().slice(0, 10);
  const submissionsToday = store.submissions.filter((s) => s.submittedAt.slice(0, 10) === today).length;
  const digest = buildDailyDigest(role, today, {
    tasks,
    audits: store.audits.map((a) => ({ id: a.id, title: a.title, branchName: a.branchName, plannedDate: a.plannedDate })),
    submissionsToday,
    findings: store.findings.map((f) => ({ id: f.id, title: f.title, severity: f.severity as FindingSeverity, status: f.status, deadline: f.deadline })),
  });
  store.digests.push(digest);
  return digest;
}

export function listDigests(store: WorkAuditDemoData, role?: string): DailyDigest[] {
  let rows = [...store.digests].sort((a, b) => b.date.localeCompare(a.date));
  if (role) rows = rows.filter((d) => d.role === role);
  return rows;
}

/** Severity roll-up used by the audit report card in the UI. */
export function severityRollup(store: WorkAuditDemoData, auditId?: string): Record<FindingSeverity, number> {
  const rows = auditId ? store.findings.filter((f) => f.auditId === auditId) : store.findings;
  return {
    low: rows.filter((f) => f.severity === 'low').length,
    medium: rows.filter((f) => f.severity === 'medium').length,
    high: rows.filter((f) => f.severity === 'high').length,
    critical: rows.filter((f) => f.severity === 'critical').length,
  };
}
