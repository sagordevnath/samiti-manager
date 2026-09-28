/**
 * ── Documents demo store (reqs 4–8) ──────────────────────────────────────────
 * In-memory implementation of the document generator, template editor with
 * version history, the QR verification registry and the bulk-job queue with
 * its Express worker tick. Mirrors migrations 0054/0055 and
 * packages/shared/src/documents.ts.
 *
 * PDFs: print-HTML with an embedded Bengali font stack (Noto Sans Bengali →
 * Nirmala UI …); the browser embeds the font at print time — the established
 * project pattern for Bangla PDF output. The QR is generated server-side with
 * the `qrcode` package and embedded into the print-HTML, so every printed
 * document carries its verification code.
 */
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import {
  DOC_KIND_LABELS_BN,
  type BulkJob,
  type BulkJobBody,
  type BulkJobItem,
  type DocKind,
  type DocRegister,
  type DocTemplate,
  type DocTemplateBody,
  type DocTemplateVersion,
  type DocumentRecord,
  type PublicVerifyPayload,
  banglaCalendarDate,
  defaultDocTemplates,
  docVariablesUsed,
  numberToWordsBn,
  renderDocTemplate,
  verifyCodePayload,
} from '@samity/shared';
import { CommError } from './comm-store.js';

function err(status: number, code: string, message: string): never {
  throw new CommError(status, code, message);
}

/* ── store shape ───────────────────────────────────────────────────────────── */

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
export const ORG_NAME_BN = 'স্যামিটি ডেমো সমবায় সমিতি';

interface DocData {
  orgId: string;
  templates: DocTemplate[];
  versions: DocTemplateVersion[];
  documents: DocumentRecord[];
  bulkJobs: BulkJob[];
  /** Document-number counters keyed `${kind}:${yyyy}`. */
  counters: Record<string, number>;
}

const g = globalThis as unknown as { __docDemoData?: DocData };

function seed(): DocData {
  const now = new Date().toISOString();
  const templates = defaultDocTemplates(ORG_ID, 'admin@samity.test', now);
  // Snapshot every seeded template as version 1 so history/restore start sane.
  const versions: DocTemplateVersion[] = templates.map((t) => ({
    id: randomUUID(),
    templateId: t.id,
    version: 1,
    body: t.body,
    orientation: t.orientation,
    updatedBy: t.updatedBy,
    updatedAt: t.updatedAt,
  }));
  return {
    orgId: ORG_ID,
    templates,
    versions,
    documents: [],
    bulkJobs: [],
    counters: {},
  };
}

export function docStore(): DocData {
  if (!g.__docDemoData) g.__docDemoData = seed();
  return g.__docDemoData;
}

export function resetDocStore(): void {
  g.__docDemoData = undefined;
}

/* ── QR + verification codes (req 7) ──────────────────────────────────────── */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1 lookalikes

/** Opaque public verification code, e.g. VRF-K7PQ2M9XRT. */
export function newVerifyCode(): string {
  let tail = '';
  for (let i = 0; i < 10; i += 1) tail += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `VRF-${tail}`;
}

/** The absolute URL the QR points at (web route /verify/:code). */
function publicBaseUrl(): string {
  return process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:5174';
}

/** Server-side QR as a data URL for embedding in print-HTML and the UI. */
export async function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { width: 160, margin: 1, errorCorrectionLevel: 'M' });
}

/* ── Print-HTML shell (req 4: PDF via print with embedded Bengali font) ───── */

export function printDocHtml(opts: {
  orgName: string;
  titleBn: string;
  bodyHtml: string;
  orientation: 'portrait' | 'landscape';
  verifyCode?: string;
  verifyUrl?: string;
  qrDataUrl?: string;
}): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const verify = opts.verifyCode
    ? `<div class="verify">
        ${opts.qrDataUrl ? `<img class="qr" src="${opts.qrDataUrl}" alt="QR"/>` : ''}
        <div class="verify-text">যাচাই কোড / Verify: <b>${esc(opts.verifyCode)}</b><br/>${esc(opts.verifyUrl ?? '')}</div>
      </div>`
    : '';
  return `<!DOCTYPE html>
<html lang="bn"><head><meta charset="utf-8"/><title>${esc(opts.titleBn)}</title>
<style>
  @page { size: A4 ${opts.orientation}; margin: 14mm; }
  body { font-family: 'Noto Sans Bengali','Nirmala UI','SolaimanLipi','Vrinda',sans-serif; color: #111; }
  h2 { text-align: center; color: #0f766e; margin: 0 0 2px; }
  h3 { text-align: center; margin: 2px 0 12px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #94a3b8; padding: 5px 8px; text-align: left; font-size: 13px; }
  th { background: #f0fdfa; width: 22%; }
  p { font-size: 13px; line-height: 1.7; }
  .sign { margin-top: 28px; display: flex; justify-content: space-between; }
  .verify { margin-top: 26px; border-top: 1px dashed #94a3b8; padding-top: 8px; display: flex; gap: 10px; align-items: center; }
  .qr { width: 84px; height: 84px; }
  .verify-text { font-size: 11px; color: #334155; }
  @media print { .verify { page-break-inside: avoid; } }
</style></head>
<body>
${opts.bodyHtml}
${verify}
</body></html>`;
}

/* ── doc numbers ──────────────────────────────────────────────────────────── */

const DOC_NO_PREFIX: Record<DocKind, string> = {
  membership_form: 'MEM',
  loan_application: 'LAPP',
  loan_agreement: 'AGR',
  guarantor_declaration: 'GUA',
  receipt: 'RCP',
  passbook_page: 'PB',
  meeting_minutes: 'MIN',
  notice: 'NOT',
  appointment_letter: 'APL',
  transfer_letter: 'TRN',
  legal_notice: 'LEG',
};

function nextDocNo(kind: DocKind, now = new Date()): string {
  const store = docStore();
  const key = `${kind}:${now.getUTCFullYear()}`;
  store.counters[key] = (store.counters[key] ?? 0) + 1;
  return `${DOC_NO_PREFIX[kind]}-${now.getUTCFullYear()}-${String(store.counters[key]!).padStart(4, '0')}`;
}

/* ── Req 5: template editor + version history ─────────────────────────────── */

export function listDocTemplates(): DocTemplate[] {
  return [...docStore().templates];
}

export function getDocTemplate(id: string): DocTemplate {
  const t = docStore().templates.find((x) => x.id === id);
  if (!t) err(404, 'NOT_FOUND', `ডক টেমপ্লেট নেই / Doc template not found: ${id}`);
  return t!;
}

export function upsertDocTemplate(
  body: DocTemplateBody & { id?: string },
  viewer: { name: string },
): { template: DocTemplate; version: DocTemplateVersion } {
  const store = docStore();
  const { known, unknown } = docVariablesUsed(body.body);
  if (unknown.length > 0) {
    err(422, 'VALIDATION_ERROR', `অজানা ভেরিয়েবল / Unknown variables: ${unknown.join(', ')}`);
  }
  const now = new Date().toISOString();
  let template: DocTemplate;
  if (body.id) {
    const existing = getDocTemplate(body.id);
    existing.body = body.body;
    existing.orientation = body.orientation ?? existing.orientation;
    existing.enabled = body.enabled;
    existing.version += 1;
    existing.updatedAt = now;
    existing.updatedBy = viewer.name;
    template = existing;
  } else {
    const existing = store.templates.find((t) => t.kind === body.kind && t.register === body.register);
    if (existing) {
      // Editing the seeded kind+register pair in place (no new id from the UI).
      existing.body = body.body;
      existing.orientation = body.orientation ?? existing.orientation;
      existing.enabled = body.enabled;
      existing.version += 1;
      existing.updatedAt = now;
      existing.updatedBy = viewer.name;
      template = existing;
    } else {
      template = {
        id: randomUUID(),
        orgId: store.orgId,
        kind: body.kind,
        register: body.register,
        orientation: body.orientation ?? 'portrait',
        body: body.body,
        enabled: body.enabled,
        version: 1,
        updatedAt: now,
        updatedBy: viewer.name,
      };
      store.templates.push(template);
    }
  }
  const version: DocTemplateVersion = {
    id: randomUUID(),
    templateId: template.id,
    version: template.version,
    body: template.body,
    orientation: template.orientation,
    updatedBy: viewer.name,
    updatedAt: now,
  };
  store.versions.push(version);
  return { template, version };
}

/** Version history for one template, newest first (req 5). */
export function listDocTemplateVersions(templateId: string): DocTemplateVersion[] {
  getDocTemplate(templateId);
  return docStore()
    .versions.filter((v) => v.templateId === templateId)
    .sort((a, b) => b.version - a.version);
}

/** Restore a previous version: copies its body in as a NEW version. */
export function restoreDocTemplateVersion(templateId: string, version: number, viewer: { name: string }): DocTemplate {
  const store = docStore();
  const snap = store.versions.find((v) => v.templateId === templateId && v.version === version);
  if (!snap) err(404, 'NOT_FOUND', `ভার্সন নেই / Version not found: v${version}`);
  return upsertDocTemplate(
    {
      id: templateId,
      kind: getDocTemplate(templateId).kind,
      register: getDocTemplate(templateId).register,
      orientation: snap!.orientation,
      body: snap!.body,
      enabled: true,
    },
    viewer,
  ).template;
}

/* ── preview ──────────────────────────────────────────────────────────────── */

const SAMPLE_DOC_VARS: Record<string, string> = {
  orgName: ORG_NAME_BN,
  branchName: 'ধানমন্ডি শাখা',
  memberName: 'রহিমা বেগম',
  memberCode: 'M-0001',
  fatherName: 'মোঃ আব্দুল জলিল',
  spouseName: 'মোঃ রফিকুল ইসলাম',
  address: 'গাজীপুর, ঢাকা',
  nationalId: '১৯৯০১২৩৪৫৬৭৮৯',
  mobile: '01711000001',
  samityName: 'গাজীপুর সমিতি',
  loanCode: 'LN-2026-0001',
  loanAmount: '25000',
  installment: '2500',
  installmentCount: '১০',
  termMonths: '১০',
  interestRate: '১২',
  purpose: 'গরুর পালন',
  guarantorName: 'করিম মিয়া',
  guarantorAddress: 'গাজীপুর, ঢাকা',
  receiptNo: 'RCP-2026-0001',
  paidAmount: '১২০০',
  paidFor: 'সঞ্চয় জমা',
  balance: '৫০০',
  passbookNo: 'PB-0001',
  savingsBalance: '৫০০০',
  meetingDate: '২০২৬-১০-০৫',
  meetingVenue: 'গাজীপুর সমিতি অফিস',
  agenda: '১. কিস্তি আদায় ২. নতুন সদস্য',
  decisions: 'কিস্তি প্রতি সপ্তাহে আদায় করা হবে',
  attendeeCount: '১৮',
  noticeSubject: 'মাসিক সভা',
  noticeDate: '২০২৬-১০-০১',
  effectiveDate: '২০২৬-১০-০১',
  staffName: 'নাসরিন সুলতানা',
  staffDesignation: 'অ্যাকাউন্ট অফিসার',
  oldBranch: 'ধানমন্ডি শাখা',
  newBranch: 'মিরপুর শাখা',
  referenceNo: 'REF-2026-0001',
};

export async function previewDocTemplate(
  id: string,
  overrides: Record<string, string>,
): Promise<{ html: string; missing: string[] }> {
  const t = getDocTemplate(id);
  const vars = { ...SAMPLE_DOC_VARS, ...autoVars(), ...overrides };
  const r = renderDocTemplate(t.body, vars);
  const html = printDocHtml({
    orgName: ORG_NAME_BN,
    titleBn: DOC_KIND_LABELS_BN[t.kind],
    bodyHtml: r.text,
    orientation: t.orientation,
  });
  return { html, missing: r.missing };
}

/* ── auto variables (req 6 wiring) ────────────────────────────────────────── */

function autoVars(now = new Date()): Record<string, string> {
  const iso = now.toISOString().slice(0, 10);
  return {
    orgName: ORG_NAME_BN,
    issuedDateEn: iso,
    issuedDateBn: banglaCalendarDate(iso).text,
  };
}

/** Fill amount-words automatically from the amount (req 6). */
function withAmountWords(vars: Record<string, string>): Record<string, string> {
  const out = { ...vars };
  if (out['loanAmount'] && !out['loanAmountWords']) out['loanAmountWords'] = numberToWordsBn(out['loanAmount']!);
  if (out['paidAmount'] && !out['paidAmountWords']) out['paidAmountWords'] = numberToWordsBn(out['paidAmount']!);
  return out;
}

/* ── Req 4: generation ────────────────────────────────────────────────────── */

export interface GenerateDocBody {
  kind: DocKind;
  register?: DocRegister;
  referenceId?: string;
  vars?: Record<string, string>;
}

export async function generateDocument(
  body: GenerateDocBody,
  viewer: { name: string },
  now = new Date(),
): Promise<DocumentRecord & { qrDataUrl: string }> {
  const store = docStore();
  const register: DocRegister = body.register ?? 'cholito';
  const t = store.templates.find((x) => x.kind === body.kind && x.register === register && x.enabled);
  if (!t) err(404, 'NOT_FOUND', `সক্রিয় টেমপ্লেট নেই / No enabled template for ${body.kind}/${register}`);
  const docNo = nextDocNo(body.kind, now);
  const vars = withAmountWords({ ...autoVars(now), ...(body.vars ?? {}) });
  // The receipt's own number is generated here — templates reference {{receiptNo}}.
  if (!vars['receiptNo']) vars['receiptNo'] = docNo;
  const r = renderDocTemplate(t!.body, vars);
  if (r.missing.length > 0) {
    err(422, 'VALIDATION_ERROR', `ভেরিয়েবল অনুপস্থিত / Missing variables: ${r.missing.join(', ')}`);
  }
  const verifyCode = newVerifyCode();
  const verifyUrl = verifyCodePayload(publicBaseUrl(), verifyCode);
  const qr = await qrDataUrl(verifyUrl);
  const html = printDocHtml({
    orgName: ORG_NAME_BN,
    titleBn: DOC_KIND_LABELS_BN[t!.kind],
    bodyHtml: r.text,
    orientation: t!.orientation,
    verifyCode,
    verifyUrl,
    qrDataUrl: qr,
  });
  const titleSnippet = r.text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  const rec: DocumentRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    kind: body.kind,
    register,
    docNo,
    verifyCode,
    titleSnippet,
    templateId: t!.id,
    templateVersion: t!.version,
    referenceId: body.referenceId ?? null,
    issuedBy: viewer.name,
    issuedAt: now.toISOString(),
    status: 'active',
    html,
  };
  store.documents.unshift(rec);
  return { ...rec, qrDataUrl: qr };
}

export interface DocFilter {
  kind?: DocKind;
  q?: string;
}

/** List without the heavy html column (use getDocumentHtml for the body). */
export function listDocuments(filter: DocFilter = {}): Omit<DocumentRecord, 'html'>[] {
  let rows = [...docStore().documents];
  if (filter.kind) rows = rows.filter((d) => d.kind === filter.kind);
  if (filter.q) {
    const q = filter.q.toLowerCase();
    rows = rows.filter((d) => d.docNo.toLowerCase().includes(q) || d.titleSnippet.toLowerCase().includes(q) || d.verifyCode.toLowerCase().includes(q));
  }
  return rows.map(({ html, ...rest }) => {
    void html;
    return rest;
  });
}

export function getDocumentHtml(id: string): { html: string; filename: string } {
  const d = docStore().documents.find((x) => x.id === id);
  if (!d) err(404, 'NOT_FOUND', `দলিল নেই / Document not found: ${id}`);
  return { html: d.html, filename: `${d.docNo}.html` };
}

export function revokeDocument(id: string, viewer: { name: string; role: string }): DocumentRecord {
  const d = docStore().documents.find((x) => x.id === id);
  if (!d) err(404, 'NOT_FOUND', `দলিল নেই / Document not found: ${id}`);
  if (!['super_admin', 'org_admin', 'branch_manager', 'area_manager'].includes(viewer.role)) {
    err(403, 'FORBIDDEN', 'বাতিলের অনুমতি নেই / Only managers may revoke');
  }
  d.status = 'revoked';
  return d;
}

/* ── Req 7: public verification — no personal data ────────────────────────── */

export function publicVerify(code: string): PublicVerifyPayload {
  const d = docStore().documents.find((x) => x.verifyCode === code.toUpperCase());
  if (!d) {
    return { kind: 'notice', kindLabelBn: '', docNo: '', orgName: '', issuedAt: '', status: 'unknown' };
  }
  return {
    kind: d.kind,
    kindLabelBn: DOC_KIND_LABELS_BN[d.kind],
    docNo: d.docNo,
    orgName: ORG_NAME_BN,
    issuedAt: d.issuedAt,
    status: d.status === 'active' ? 'valid' : 'revoked',
  };
}

/* ── Req 8: bulk jobs over a samity or branch ─────────────────────────────── */

/** Demo roster reused as bulk targets (the Supabase path queries members). */
interface BulkTarget {
  id: string;
  name: string;
  memberCode: string;
  phone: string;
}

const BULK_TARGETS: Record<string, BulkTarget[]> = {
  '00000000-0000-4000-8000-0000000000s1': [
    { id: '00000000-0000-4000-8000-0000000000m1', name: 'রহিমা বেগম', memberCode: 'M-0001', phone: '01711000001' },
    { id: '00000000-0000-4000-8000-0000000000m2', name: 'সালমা খাতুন', memberCode: 'M-0002', phone: '01700000001' },
    { id: '00000000-0000-4000-8000-0000000000m3', name: 'নাজমা আক্তার', memberCode: 'M-0003', phone: '01711000003' },
  ],
  '00000000-0000-4000-8000-0000000000s2': [
    { id: '00000000-0000-4000-8000-0000000000m4', name: 'ফাতেমা বেগম', memberCode: 'M-0004', phone: '01711000004' },
    { id: '00000000-0000-4000-8000-0000000000m5', name: 'আয়েশা সিদ্দিকা', memberCode: 'M-0005', phone: '01711000005' },
  ],
  '00000000-0000-4000-8000-0000000000b1': [
    { id: '00000000-0000-4000-8000-0000000000m1', name: 'রহিমা বেগম', memberCode: 'M-0001', phone: '01711000001' },
    { id: '00000000-0000-4000-8000-0000000000m2', name: 'সালমা খাতুন', memberCode: 'M-0002', phone: '01700000001' },
    { id: '00000000-0000-4000-8000-0000000000m3', name: 'নাজমা আক্তার', memberCode: 'M-0003', phone: '01711000003' },
    { id: '00000000-0000-4000-8000-0000000000m4', name: 'ফাতেমা বেগম', memberCode: 'M-0004', phone: '01711000004' },
    { id: '00000000-0000-4000-8000-0000000000m5', name: 'আয়েশা সিদ্দিকা', memberCode: 'M-0005', phone: '01711000005' },
  ],
  '00000000-0000-4000-8000-0000000000b2': [
    { id: '00000000-0000-4000-8000-0000000000m6', name: 'জেসমিন আরা', memberCode: 'M-0006', phone: '01711000006' },
  ],
};

function resolveTargets(scope: 'samity' | 'branch', scopeId: string): BulkTarget[] {
  return BULK_TARGETS[scopeId] ?? [];
}

export function createBulkJob(body: BulkJobBody, viewer: { name: string }): BulkJob {
  const store = docStore();
  const targets = resolveTargets(body.scope, body.scopeId);
  if (targets.length === 0) {
    err(422, 'VALIDATION_ERROR', 'নিশ্চিত সমিতি/শাখায় সদস্য নেই / No members found for the given scope');
  }
  const items: BulkJobItem[] = targets.map((t) => ({
    targetId: t.id,
    targetName: t.name,
    status: 'pending',
    refId: null,
    error: null,
  }));
  const job: BulkJob = {
    id: randomUUID(),
    orgId: store.orgId,
    kind: body.kind,
    scope: body.scope,
    scopeId: body.scopeId,
    scopeName: body.scopeName,
    params: body.params,
    status: 'pending',
    total: items.length,
    processed: 0,
    failed: 0,
    items,
    createdBy: viewer.name,
    createdAt: new Date().toISOString(),
    finishedAt: null,
  };
  store.bulkJobs.unshift(job);
  return job;
}

export function listBulkJobs(): BulkJob[] {
  return [...docStore().bulkJobs];
}

export function getBulkJob(id: string): BulkJob {
  const j = docStore().bulkJobs.find((x) => x.id === id);
  if (!j) err(404, 'NOT_FOUND', `জব নেই / Job not found: ${id}`);
  return j!;
}

/** Execute one pending item of a job. Returns the created/derived ref. */
async function runBulkItem(job: BulkJob, item: BulkJobItem): Promise<{ refId: string | null; error: string | null }> {
  const p = job.params as Record<string, string | undefined>;
  const target = BULK_TARGETS[job.scopeId]?.find((t) => t.id === item.targetId);
  if (!target) return { refId: null, error: 'target vanished' };
  if (job.kind === 'documents_batch') {
    const doc = await generateDocument(
      {
        kind: (p['docKind'] as DocKind) ?? 'receipt',
        register: (p['register'] as DocRegister | undefined) ?? 'cholito',
        referenceId: target.id,
        vars: {
          memberName: target.name,
          memberCode: target.memberCode,
          samityName: job.scope === 'samity' ? job.scopeName : 'গাজীপুর সমিতি',
          branchName: job.scope === 'branch' ? job.scopeName : 'ধানমন্ডি শাখা',
          paidAmount: p['amount'] ?? '১২০০',
          paidFor: p['paidFor'] ?? 'সঞ্চয় জমা',
          balance: '০',
          receiptNo: '',
          ...(p['vars'] as unknown as Record<string, string> | undefined),
        },
      },
      { name: job.createdBy },
    );
    // Keep the receipt docNo consistent with the generated one.
    if (p['docKind'] === 'receipt' || !p['docKind']) {
      const generated = docStore().documents[0];
      if (generated) generated.titleSnippet = `${target.name}: ${generated.titleSnippet}`.slice(0, 60);
    }
    return { refId: doc.id, error: null };
  }
  if (job.kind === 'sms_batch') {
    const { sendMessage } = await import('./comm-store.js');
    const delivery = await sendMessage(
      {
        kind: 'custom',
        channel: 'sms',
        recipientName: target.name,
        recipient: target.phone,
        body: (p['body'] ?? '').replaceAll('{name}', target.name),
        locale: 'bn',
        force: p['force'] === 'true',
      },
      { userId: 'system', name: job.createdBy, role: 'super_admin' },
    );
    return { refId: delivery.id, error: delivery.status === 'sent' ? null : `${delivery.status}: ${delivery.error ?? ''}` };
  }
  if (job.kind === 'notification_batch') {
    const { broadcast } = await import('./comm-store.js');
    const rows = broadcast(
      { title: `${p['title'] ?? 'ঘোষণা'} (${job.scopeName})`, message: (p['message'] ?? '').replaceAll('{name}', target.name) },
      { name: job.createdBy },
    );
    return { refId: rows[0]?.id ?? null, error: null };
  }
  // status_flip — demo store has no member table write; the Supabase path
  // updates members.status in one statement per target.
  return { refId: null, error: null };
}

/** Process every pending item of one job (used by the tick endpoint). */
export async function processJob(jobId: string): Promise<BulkJob> {
  const job = getBulkJob(jobId);
  job.status = 'running';
  for (const item of job.items) {
    if (item.status !== 'pending') continue;
    try {
      const res = await runBulkItem(job, item);
      item.refId = res.refId;
      item.error = res.error;
      item.status = res.error ? 'failed' : 'done';
    } catch (e) {
      item.status = 'failed';
      item.error = (e as Error).message.slice(0, 200);
    }
    job.processed += 1;
    if (item.status === 'failed') job.failed += 1;
  }
  job.status = job.failed === job.total ? 'failed' : 'done';
  job.finishedAt = new Date().toISOString();
  return job;
}

/**
 * Queue-worker tick: picks up pending jobs (oldest first) and processes each
 * item. Invoked by the Express worker (server.ts) and by POST
 * /documents/bulk-jobs/:id/tick for on-demand progress in tests.
 */
export async function processPendingJobs(maxJobs = 5): Promise<{ jobsTouched: number; itemsProcessed: number }> {
  const store = docStore();
  const pending = store.bulkJobs.filter((j) => j.status === 'pending').slice(0, maxJobs);
  let itemsProcessed = 0;
  for (const job of pending) {
    job.status = 'running';
    for (const item of job.items) {
      if (item.status !== 'pending') continue;
      try {
        const res = await runBulkItem(job, item);
        item.refId = res.refId;
        item.error = res.error;
        item.status = res.error ? 'failed' : 'done';
      } catch (e) {
        item.status = 'failed';
        item.error = (e as Error).message.slice(0, 200);
      }
      job.processed += 1;
      if (item.status === 'failed') job.failed += 1;
      itemsProcessed += 1;
    }
    job.status = job.failed === job.total ? 'failed' : 'done';
    job.finishedAt = new Date().toISOString();
  }
  return { jobsTouched: pending.length, itemsProcessed };
}

/** Express-side worker loop (started from server.ts in demo mode). */
export function startBulkJobWorker(intervalMs = 2_500): () => void {
  const timer = setInterval(() => {
    void processPendingJobs().catch(() => undefined);
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}
