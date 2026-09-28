/**
 * ── Documents engine (pure) — reqs 4–8 ───────────────────────────────────────
 * Req 4: eleven standard documents rendered from bilingual templates with
 *   {{placeholders}}, in both চলিত (colloquial) and সাধু (formal classical)
 *   registers via template variants; PDF output is print-HTML carrying an
 *   embedded Bengali font stack (browser embeds the font at print time — the
 *   established project pattern, no native PDF dep).
 * Req 5: document template editor data — versions with history.
 * Req 6: numbers to Bangla words (taka/paisa), digit conversion, Bangla
 *   (Bengali) calendar dates.
 * Req 7: opaque verification codes + the minimal public verify payload
 *   (kind, doc number, org, issued date, status only — no personal data).
 * Req 8: bulk job descriptors for samity/branch-wide actions.
 */
import { z } from 'zod';
import { toAsciiDigits, toBanglaDigits } from './format.js';

/** Accepts string or number — format.ts's converter is string-only. */
const bd = (v: string | number): string => toBanglaDigits(String(v));

/* ── Req 4: doc kinds & registers ─────────────────────────────────────────── */

export const DOC_KINDS = [
  'membership_form',
  'loan_application',
  'loan_agreement',
  'guarantor_declaration',
  'receipt',
  'passbook_page',
  'meeting_minutes',
  'notice',
  'appointment_letter',
  'transfer_letter',
  'legal_notice',
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DOC_KIND_LABELS_BN: Record<DocKind, string> = {
  membership_form: 'সদস্য ভর্তি ফরম',
  loan_application: 'ঋণের আবেদন ফরম',
  loan_agreement: 'ঋণ চুক্তিপত্র',
  guarantor_declaration: 'জামানতদারের স্বীকৃতি',
  receipt: 'রশিদ',
  passbook_page: 'পাসবুক পৃষ্ঠা',
  meeting_minutes: 'সভার কার্যবিবরণী',
  notice: 'সাধারণ নোটিশ',
  appointment_letter: 'নিয়োগপত্র',
  transfer_letter: 'বদলির আদেশ',
  legal_notice: 'আইনগত নোটিশ',
};

/** Register variants: cholito (standard modern Bangla) vs sadhu (classical formal). */
export const DOC_REGISTERS = ['cholito', 'sadhu'] as const;
export type DocRegister = (typeof DOC_REGISTERS)[number];

export const DOC_REGISTER_LABELS_BN: Record<DocRegister, string> = {
  cholito: 'চলিত ভাষা',
  sadhu: 'সাধু ভাষা',
};

export const docTemplateSchema = z.object({
  kind: z.enum(DOC_KINDS),
  register: z.enum(DOC_REGISTERS),
  /** Paper orientation for the print/PDF layout. */
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  /** HTML body with {{variable}} placeholders (rendered inside the print shell). */
  body: z.string().trim().min(10).max(20000),
  enabled: z.boolean().default(true),
});
export type DocTemplateBody = z.infer<typeof docTemplateSchema>;

export interface DocTemplate extends DocTemplateBody {
  id: string;
  orgId: string;
  /** Monotonic per-template version, starting at 1. */
  version: number;
  updatedAt: string;
  updatedBy: string;
}

/** An immutable snapshot taken whenever a template is saved (req 5 history). */
export interface DocTemplateVersion {
  id: string;
  templateId: string;
  version: number;
  body: string;
  orientation: 'portrait' | 'landscape';
  updatedBy: string;
  updatedAt: string;
}

/** {{var}} tokens used by a doc body — unknown ones are reported back. */
export function docVariablesUsed(body: string): { known: DocVariable[]; unknown: string[] } {
  const found = [...body.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)].map((m) => m[1]!);
  const known: DocVariable[] = [];
  const unknown: string[] = [];
  for (const v of found) {
    if ((DOC_VARIABLES as readonly string[]).includes(v)) {
      if (!known.includes(v as DocVariable)) known.push(v as DocVariable);
    } else if (!unknown.includes(v)) {
      unknown.push(v);
    }
  }
  return { known, unknown };
}

/** Render {{var}} placeholders; lists missing names. */
export function renderDocTemplate(
  body: string,
  vars: Partial<Record<DocVariable, string>>,
): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, name: string) => {
    const val = vars[name as DocVariable];
    if (val === undefined || val === '') {
      missing.add(name);
      return `{{${name}}}`;
    }
    return val;
  });
  return { text, missing: [...missing] };
}

/* ── Document variables ───────────────────────────────────────────────────── */

export const DOC_VARIABLES = [
  'orgName',
  'branchName',
  'memberName',
  'memberCode',
  'fatherName',
  'spouseName',
  'address',
  'nationalId',
  'mobile',
  'samityName',
  'loanCode',
  'loanAmount',
  'loanAmountWords',
  'installment',
  'installmentCount',
  'termMonths',
  'interestRate',
  'purpose',
  'guarantorName',
  'guarantorAddress',
  'receiptNo',
  'paidAmount',
  'paidAmountWords',
  'paidFor',
  'balance',
  'passbookNo',
  'savingsBalance',
  'meetingDate',
  'meetingVenue',
  'agenda',
  'decisions',
  'attendeeCount',
  'noticeSubject',
  'noticeDate',
  'effectiveDate',
  'staffName',
  'staffDesignation',
  'oldBranch',
  'newBranch',
  'referenceNo',
  'issuedDateBn',
  'issuedDateEn',
] as const;
export type DocVariable = (typeof DOC_VARIABLES)[number];

export const DOC_VARIABLE_LABELS_BN: Record<DocVariable, string> = {
  orgName: 'সংস্থার নাম',
  branchName: 'শাখার নাম',
  memberName: 'সদস্যের নাম',
  memberCode: 'সদস্য কোড',
  fatherName: 'পিতার নাম',
  spouseName: 'স্বামী/স্ত্রীর নাম',
  address: 'ঠিকানা',
  nationalId: 'জাতীয় পরিচয়পত্র নম্বর',
  mobile: 'মোবাইল',
  samityName: 'সমিতির নাম',
  loanCode: 'ঋণ কোড',
  loanAmount: 'ঋণের পরিমাণ',
  loanAmountWords: 'ঋণের পরিমাণ (কথায়)',
  installment: 'কিস্তির পরিমাণ',
  installmentCount: 'কিস্তির সংখ্যা',
  termMonths: 'মেয়াদ (মাস)',
  interestRate: 'সুদের হার (%)',
  purpose: 'ঋণের উদ্দেশ্য',
  guarantorName: 'জামানতদারের নাম',
  guarantorAddress: 'জামানতদারের ঠিকানা',
  receiptNo: 'রশিদ নম্বর',
  paidAmount: 'জমার পরিমাণ',
  paidAmountWords: 'জমার পরিমাণ (কথায়)',
  paidFor: 'জমার খাত',
  balance: 'উদ্বৃত্ত ব্যালেন্স',
  passbookNo: 'পাসবুক নম্বর',
  savingsBalance: 'সঞ্চয়ের ব্যালেন্স',
  meetingDate: 'সভার তারিখ',
  meetingVenue: 'সভার স্থান',
  agenda: 'আলোচ্যসূচি',
  decisions: 'সিদ্ধান্তসমূহ',
  attendeeCount: 'উপস্থিত সদস্য সংখ্যা',
  noticeSubject: 'নোটিশের বিষয়',
  noticeDate: 'নোটিশের তারিখ',
  effectiveDate: 'কার্যকর তারিখ',
  staffName: 'কর্মীর নাম',
  staffDesignation: 'পদবি',
  oldBranch: 'পুরাতন শাখা',
  newBranch: 'নতুন শাখা',
  referenceNo: 'রেফারেন্স নম্বর',
  issuedDateBn: 'ইস্যুর তারিখ (বাংলা)',
  issuedDateEn: 'ইস্যুর তারিখ (ইংরেজি)',
};

/* ── Req 6: numbers → Bangla words, digits, Bangla calendar ───────────────── */

/** Backwards-friendly alias of format.ts's converter (accepts numbers too). */
export function toBanglaDigitsFlexible(v: string | number): string {
  return bd(v);
}

export { toAsciiDigits as toEnglishDigits } from './format.js';

const BN_ONES = [
  '', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'উনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'উনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'উনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বায়ান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'উনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'উনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'উনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'উননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
] as const;

/** 0–99 to Bangla words. */
function twoDigitsBn(n: number): string {
  return BN_ONES[n] ?? '';
}

/**
 * Number → Bangla words using the Bengali system (কোটি/লক্ষ/হাজার/শত).
 * Accepts numeric strings with up to 2 decimals (money). Negative handled.
 */
export function numberToWordsBn(input: string | number): string {
  const neg = String(input).trim().startsWith('-');
  const [intPart, decPart = ''] = toAsciiDigits(String(input)).replace('-', '').split('.');
  const int = Math.floor(Number(intPart || '0'));
  const paisa = Number((decPart + '00').slice(0, 2) || '0');

  const below100 = (n: number): string => twoDigitsBn(n);
  const below1000 = (n: number): string => {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const parts: string[] = [];
    if (h > 0) parts.push(`${below100(h)} শত`);
    if (rest > 0) parts.push(below100(rest));
    return parts.join(' ');
  };
  const indian = (n: number): string => {
    if (n === 0) return 'শূন্য';
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;
    const parts: string[] = [];
    if (crore > 0) parts.push(`${indian(crore)} কোটি`);
    if (lakh > 0) parts.push(`${below100(lakh)} লক্ষ`);
    if (thousand > 0) parts.push(`${below100(thousand)} হাজার`);
    if (rest > 0) parts.push(below1000(rest));
    return parts.join(' ');
  };

  let words = indian(int);
  if (words === '') words = 'শূন্য';
  if (neg) words = `ঋণাত্মক ${words}`;
  if (paisa > 0) words += ` টাকা ${twoDigitsBn(paisa)} পয়সা`;
  else words += ' টাকা';
  return words.trim();
}

/** Money → words with an explicit taka/paisa suffix (alias for clarity). */
export function takaWords(input: string | number): string {
  return numberToWordsBn(input);
}

/**
 * Convert a Gregorian date to the Bangladeshi Bangla calendar date
 * (বৈশাখ–চৈত্র). Anchored on Pohela Boishakh = 14 April (2019 reform); months
 * 1–6 have 31 days, 7–9 have 30, and the Falgun/Choitro pair absorbs the
 * Gregorian leap day. Bangla year = Gregorian − 593 (on/after 14 April).
 */
export function banglaCalendarDate(iso: string): { day: number; month: number; year: number; text: string } {
  const BN_MONTHS = [
    'বৈশাখ', 'জ্যৈষ্ঠ', 'আষাঢ়', 'শ্রাবণ', 'ভাদ্র', 'আশ্বিন',
    'কার্তিক', 'অগ্রহায়ণ', 'পৌষ', 'মাঘ', 'ফাল্গুন', 'চৈত্র',
  ] as const;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const y = d.getUTCFullYear();
  // Last Pohela Boishakh (Apr 14) on or before the date.
  let anchor = Date.UTC(y, 3, 14);
  let anchorYear = y;
  if (d.getTime() < anchor) {
    anchor = Date.UTC(y - 1, 3, 14);
    anchorYear = y - 1;
  }
  const bYear = anchorYear - 593;
  const dayDiff = Math.floor((d.getTime() - anchor) / 86_400_000); // 0-based
  // Month lengths: Boishakh–Ashwin (1–6) 31 days, Kartik–Poush (7–9) 30,
  // Falgun 30/31 (leap), Choitro 30/29 so the year totals 365/366.
  const leap = isLeap(anchorYear + 1); // Feb 29 falls inside Falgun's window
  const lens = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, leap ? 31 : 30, leap ? 30 : 29];
  let month = 1;
  let day = dayDiff + 1;
  for (let i = 0; i < 12; i += 1) {
    const len = lens[i]!;
    if (day <= len) break;
    day -= len;
    month += 1;
  }
  const text = `${bd(day)} ${BN_MONTHS[month - 1] ?? 'বৈশাখ'} ${bd(bYear)}`;
  return { day, month, year: bYear, text };
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/* ── Req 7: public verification (no personal data) ────────────────────────── */

export const VERIFY_CODE_RE = /^VRF-[A-HJ-NP-Z2-9]{10}$/; // no I/L/O/0/1 confusion

/** Build the opaque code content for the QR — resolves to the public verify URL. */
export function verifyCodePayload(baseUrl: string, code: string): string {
  return `${baseUrl.replace(/\/$/, '')}/verify/${code}`;
}

/** The ONLY fields the public verify page exposes (no personal data). */
export interface PublicVerifyPayload {
  kind: DocKind;
  kindLabelBn: string;
  docNo: string;
  orgName: string;
  issuedAt: string;
  status: 'valid' | 'revoked' | 'unknown';
}

/** A document record stored with its verification code. */
export interface DocumentRecord {
  id: string;
  orgId: string;
  kind: DocKind;
  register: DocRegister;
  /** Human document number, e.g. RCP-2026-0001. */
  docNo: string;
  /** Opaque verification code, e.g. VRF-K7PQ2M9XRT. */
  verifyCode: string;
  /** Snippet of rendered body kept for verify-page title only. */
  titleSnippet: string;
  templateId: string | null;
  templateVersion: number | null;
  referenceId: string | null;
  issuedBy: string;
  issuedAt: string;
  status: 'active' | 'revoked';
  /** Print-HTML body with the Bengali font stack — served as the PDF. */
  html: string;
}

/* ── Req 8: bulk jobs ─────────────────────────────────────────────────────── */

export const BULK_JOB_KINDS = [
  'documents_batch',
  'sms_batch',
  'notification_batch',
  'status_flip',
] as const;
export type BulkJobKind = (typeof BULK_JOB_KINDS)[number];

export const BULK_JOB_LABELS_BN: Record<BulkJobKind, string> = {
  documents_batch: 'গুচ্ছ দলিল তৈরি',
  sms_batch: 'গুচ্ছ এসএমএস',
  notification_batch: 'গুচ্ছ নোটিফিকেশন',
  status_flip: 'সদস্য স্ট্যাটাস পরিবর্তন',
};

export const BULK_JOB_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type BulkJobStatus = (typeof BULK_JOB_STATUSES)[number];

export const bulkJobSchema = z.object({
  kind: z.enum(BULK_JOB_KINDS),
  /** 'samity' or 'branch' scope. */
  scope: z.enum(['samity', 'branch']),
  scopeId: z.string().trim().min(1).max(60),
  scopeName: z.string().trim().min(1).max(120),
  /** Kind-specific params (doc kind/register, message body, status value…). */
  params: z.record(z.string(), z.unknown()).default({}),
});

export type BulkJobBody = z.infer<typeof bulkJobSchema>;

export interface BulkJobItem {
  targetId: string;
  targetName: string;
  status: 'pending' | 'done' | 'failed';
  refId: string | null;
  error: string | null;
}

export interface BulkJob {
  id: string;
  orgId: string;
  kind: BulkJobKind;
  scope: 'samity' | 'branch';
  scopeId: string;
  scopeName: string;
  params: Record<string, unknown>;
  status: BulkJobStatus;
  total: number;
  processed: number;
  failed: number;
  items: BulkJobItem[];
  createdBy: string;
  createdAt: string;
  finishedAt: string | null;
}

/* ── Default doc templates: 11 kinds × cholito + sadhu variants ───────────── */

/** Built-in {{variables}} substituted at generation time. */
export function defaultDocTemplates(orgId: string, updatedBy: string, nowIso: string): DocTemplate[] {
  const mk = (
    id: string,
    kind: DocKind,
    register: DocRegister,
    body: string,
    orientation: 'portrait' | 'landscape' = 'portrait',
  ): DocTemplate => ({
    id,
    orgId,
    kind,
    register,
    orientation,
    body,
    enabled: true,
    version: 1,
    updatedAt: nowIso,
    updatedBy,
  });

  return [
    mk(
      'doc-membership-cholito',
      'membership_form',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>সদস্য ভর্তি ফরম</h3>
<p>শাখা: {{branchName}} · সমিতি: {{samityName}}</p>
<table>
<tr><th>সদস্যের নাম</th><td>{{memberName}}</td><th>সদস্য কোড</th><td>{{memberCode}}</td></tr>
<tr><th>পিতার নাম</th><td>{{fatherName}}</td><th>স্বামী/স্ত্রী</th><td>{{spouseName}}</td></tr>
<tr><th>ঠিকানা</th><td>{{address}}</td><th>এনআইডি</th><td>{{nationalId}}</td></tr>
<tr><th>মোবাইল</th><td>{{mobile}}</td></tr>
</table>
<p>আমি উপরোক্ত তথ্য সঠিক বলে ঘোষণা করছি এবং সংস্থার নিয়মাবলি মেনে চলার প্রতিশ্রুতি দিচ্ছি।</p>
<p class="sign">আবেদনকারীর স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-membership-sadhu',
      'membership_form',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>সদস্য ভর্তি ফরম (সাধু)</h3>
<p>শাখা: {{branchName}} · সমিতি: {{samityName}}</p>
<table>
<tr><th>সদস্যের নাম</th><td>{{memberName}}</td><th>সদস্য কোড</th><td>{{memberCode}}</td></tr>
<tr><th>পিতার নাম</th><td>{{fatherName}}</td><th>স্বামী/স্ত্রী</th><td>{{spouseName}}</td></tr>
<tr><th>ঠিকানা</th><td>{{address}}</td><th>এনআইডি</th><td>{{nationalId}}</td></tr>
</table>
<p>অহং উপরোক্ত তথ্য সম্পূর্ণরূপে সত্য বলিয়া ঘোষণা করিতেছি এবং সংস্থার নিয়মাবলি পালনের প্রতিজ্ঞা করিতেছি।</p>
<p class="sign">আবেদনকারীর স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-loan-app-cholito',
      'loan_application',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>ঋণের আবেদন ফরম</h3>
<table>
<tr><th>সদস্যের নাম</th><td>{{memberName}}</td><th>সদস্য কোড</th><td>{{memberCode}}</td></tr>
<tr><th>সমিতি</th><td>{{samityName}}</td><th>শাখা</th><td>{{branchName}}</td></tr>
<tr><th>ঋণের পরিমাণ</th><td>৳{{loanAmount}} ({{loanAmountWords}})</td><th>মেয়াদ</th><td>{{termMonths}} মাস</td></tr>
<tr><th>কিস্তি</th><td>৳{{installment}} × {{installmentCount}}</td><th>সুদের হার</th><td>{{interestRate}}%</td></tr>
<tr><th>উদ্দেশ্য</th><td colspan="3">{{purpose}}</td></tr>
</table>
<p>আমি উক্ত ঋণ নিয়মিত পরিশোধের জন্য অঙ্গীকার করছি।</p>
<p class="sign">আবেদনকারীর স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-loan-app-sadhu',
      'loan_application',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>ঋণের আবেদন ফরম (সাধু)</h3>
<table>
<tr><th>সদস্যের নাম</th><td>{{memberName}}</td><th>সদস্য কোড</th><td>{{memberCode}}</td></tr>
<tr><th>ঋণের পরিমাণ</th><td>৳{{loanAmount}} ({{loanAmountWords}})</td><th>মেয়াদ</th><td>{{termMonths}} মাস</td></tr>
</table>
<p>অহং উক্ত ঋণ নিয়মিতরূপে পরিশোধের জন্য অঙ্গীকার করিতেছি।</p>
<p class="sign">আবেদনকারীর স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-loan-agr-cholito',
      'loan_agreement',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>ঋণ চুক্তিপত্র</h3>
<p>স্থান: {{branchName}} · তারিখ: {{issuedDateBn}}</p>
<table>
<tr><th>ঋণ কোড</th><td>{{loanCode}}</td><th>সদস্য</th><td>{{memberName}}</td></tr>
<tr><th>ঋণের পরিমাণ</th><td>৳{{loanAmount}} ({{loanAmountWords}})</td><th>কিস্তি</th><td>৳{{installment}} × {{installmentCount}}</td></tr>
<tr><th>সুদের হার</th><td>{{interestRate}}%</td><th>মেয়াদ</th><td>{{termMonths}} মাস</td></tr>
<tr><th>জামানতদার</th><td colspan="3">{{guarantorName}}, {{guarantorAddress}}</td></tr>
</table>
<p>উভয় পক্ষ উপরোক্ত শর্তে সম্মত হয়ে স্বাক্ষর করলেন।</p>
<p class="sign">ঋণগ্রহীতা: ______________ জামানতদার: ______________ সংস্থার পক্ষে: ______________</p>`,
    ),
    mk(
      'doc-loan-agr-sadhu',
      'loan_agreement',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>ঋণ চুক্তিপত্র (সাধু)</h3>
<p>ঋণ কোড: {{loanCode}} · তারিখ: {{issuedDateBn}}</p>
<p>অহং {{memberName}} আপনাদের সংস্থা হইতে ৳{{loanAmount}} ({{loanAmountWords}}) ঋণ গ্রহণ করিলাম, যাহা {{termMonths}} মাসে {{installmentCount}}টি কিস্তিতে ৳{{installment}} হারে পরিশোধ করিব।</p>
<p>জামানতদার: {{guarantorName}} — তিনিও দায়িত্ব স্বীকার করিলেন।</p>
<p class="sign">ঋণগ্রহীতা: ______________ জামানতদার: ______________</p>`,
    ),
    mk(
      'doc-guarantor-cholito',
      'guarantor_declaration',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>জামানতদারের স্বীকৃতি</h3>
<p>আমি {{guarantorName}}, ঠিকানা: {{guarantorAddress}}, এই মর্মে ঘোষণা করছি যে {{memberName}}-এর {{loanCode}} ঋণ ৳{{loanAmount}}-এর জামানত আমি প্রদান করছি এবং তিনি বকেয়া থাকলে তা পরিশোধের দায়িত্ব আমি নিচ্ছি।</p>
<p class="sign">জামানতদারের স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-guarantor-sadhu',
      'guarantor_declaration',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>জামানতদারের স্বীকৃতি (সাধু)</h3>
<p>অহং {{guarantorName}}, নিবাস: {{guarantorAddress}}, এহাঁ এই মর্মে ঘোষণা করিতেছি যে, {{memberName}}-এর {{loanCode}} ঋণ ৳{{loanAmount}}-এর জামানত অহং প্রদান করিলাম; তাহার বকেয়া হইলে তাহা পরিশোধের ভার অহং গ্রহণ করিলাম।</p>
<p class="sign">জামানতদারের স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-receipt-cholito',
      'receipt',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>জমার রশিদ</h3>
<table>
<tr><th>রশিদ নম্বর</th><td>{{receiptNo}}</td><th>তারিখ</th><td>{{issuedDateBn}}</td></tr>
<tr><th>সদস্য</th><td>{{memberName}} ({{memberCode}})</td><th>সমিতি</th><td>{{samityName}}</td></tr>
<tr><th>জমার খাত</th><td>{{paidFor}}</td><th>পরিমাণ</th><td>৳{{paidAmount}} ({{paidAmountWords}})</td></tr>
<tr><th>পূর্বের ব্যালেন্স</th><td>৳{{balance}}</td></tr>
</table>
<p class="sign">গ্রহীতার স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-receipt-sadhu',
      'receipt',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>জমার রশিদ (সাধু)</h3>
<p>রশিদ নং {{receiptNo}}, তারিখ {{issuedDateBn}} — {{memberName}} ({{memberCode}}) হইতে {{paidFor}} খাতে ৳{{paidAmount}} ({{paidAmountWords}}) গৃহীত হইল।</p>
<p class="sign">গ্রহীতার স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-passbook-cholito',
      'passbook_page',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>পাসবুক পৃষ্ঠা</h3>
<p>পাসবুক নং: {{passbookNo}} · সদস্য: {{memberName}} ({{memberCode}})</p>
<table>
<tr><th>তারিখ</th><th>খাত</th><th>জমা</th><th>উদ্বৃত্ত</th></tr>
<tr><td>{{issuedDateBn}}</td><td>{{paidFor}}</td><td>৳{{paidAmount}}</td><td>৳{{savingsBalance}}</td></tr>
</table>
<p>সঞ্চয়ের বর্তমান ব্যালেন্স: ৳{{savingsBalance}}</p>`,
    ),
    mk(
      'doc-passbook-sadhu',
      'passbook_page',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>পাসবুক পৃষ্ঠা (সাধু)</h3>
<p>পাসবুক নং {{passbookNo}} — সদস্যা {{memberName}} ({{memberCode}})। {{issuedDateBn}} তারিখে {{paidFor}} খাতে ৳{{paidAmount}} জমা হইয়াছে; বর্তমান ব্যালেন্স ৳{{savingsBalance}}।</p>`,
    ),
    mk(
      'doc-minutes-cholito',
      'meeting_minutes',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>সভার কার্যবিবরণী</h3>
<p>তারিখ: {{meetingDate}} · স্থান: {{meetingVenue}} · উপস্থিতি: {{attendeeCount}} জন</p>
<h4>আলোচ্যসূচি</h4>
<p>{{agenda}}</p>
<h4>সিদ্ধান্ত</h4>
<p>{{decisions}}</p>
<p class="sign">সভাপতির স্বাক্ষর: ______________ সম্পাদকের স্বাক্ষর: ______________</p>`,
      'landscape',
    ),
    mk(
      'doc-minutes-sadhu',
      'meeting_minutes',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>সভার কার্যবিবরণী (সাধু)</h3>
<p>{{meetingDate}} তারিখে {{meetingVenue}}-এ সভা অনুষ্ঠিত হইয়াছে; উপস্থিত ছিলেন {{attendeeCount}} জন।</p>
<p>আলোচ্যসূচি: {{agenda}}</p>
<p>গৃহীত সিদ্ধান্ত: {{decisions}}</p>
<p class="sign">সভাপতির স্বাক্ষর: ______________ সম্পাদকের স্বাক্ষর: ______________</p>`,
      'landscape',
    ),
    mk(
      'doc-notice-cholito',
      'notice',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>নোটিশ</h3>
<p>বিষয়: {{noticeSubject}}</p>
<p>তারিখ: {{noticeDate}} · স্থান: {{branchName}}</p>
<p>সকল সংশ্লিষ্টকে জানানো যাইতেছে যে {{noticeSubject}} বিষয়ে সিদ্ধান্ত জারি করা হইয়াছে।</p>
<p class="sign">ব্যবস্থাপকের স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-notice-sadhu',
      'notice',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>নোটিশ (সাধু)</h3>
<p>বিষয়: {{noticeSubject}} · তারিখ: {{noticeDate}}</p>
<p>সকলের অবগতির জন্য জানানো যাইতেছে যে, {{noticeSubject}} বিষয়ক নির্দেশ জারীকৃত হইল।</p>
<p class="sign">ব্যবস্থাপকের স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-appointment-cholito',
      'appointment_letter',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>নিয়োগপত্র</h3>
<p>জনাব/মোসাহিমা {{staffName}}-কে {{staffDesignation}} পদে {{branchName}}-এ নিয়োগ দেওয়া হলো। কার্যকর তারিখ: {{effectiveDate}}।</p>
<p>শর্তাবলি সংস্থার সেবা বিধিমালা অনুসারে প্রযোজ্য হবে।</p>
<p class="sign">চেয়ারম্যানের স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-appointment-sadhu',
      'appointment_letter',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>নিয়োগপত্র (সাধু)</h3>
<p>অহং {{staffName}}-কে {{staffDesignation}} পদে {{branchName}}-এ নিযুক্ত করিলাম, যাহার কার্যকর তারিখ {{effectiveDate}} হইবে।</p>
<p class="sign">চেয়ারম্যানের স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-transfer-cholito',
      'transfer_letter',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>বদলির আদেশ</h3>
<p>জনাব/মোসাহিমা {{staffName}} ({{staffDesignation}})-কে {{oldBranch}} হইতে {{newBranch}}-এ বদলি করা হলো। কার্যকর তারিখ: {{effectiveDate}}।</p>
<p class="sign">ব্যবস্থাপকের স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-transfer-sadhu',
      'transfer_letter',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>বদলির আদেশ (সাধু)</h3>
<p>{{staffName}} ({{staffDesignation}})-কে {{oldBranch}} হইতে {{newBranch}}-এ বদলি করা হইল, কার্যকর {{effectiveDate}} হইতে।</p>
<p class="sign">ব্যবস্থাপকের স্বাক्षর: ______________</p>`,
    ),
    mk(
      'doc-legal-cholito',
      'legal_notice',
      'cholito',
      `<h2>{{orgName}}</h2>
<h3>আইনগত নোটিশ</h3>
<p>রেফারেন্স: {{referenceNo}} · তারিখ: {{noticeDate}}</p>
<p>জনাব {{memberName}}, আপনার {{loanCode}} ঋণের ৳{{loanAmount}} বকেয়া রয়েছে। {{noticeDate}}-এর মধ্যে পরিশোধ না করলে আইনানুগ ব্যবস্থা গ্রহণ করা হবে।</p>
<p class="sign">আইন উপদেষ্টার স্বাক্ষর: ______________</p>`,
    ),
    mk(
      'doc-legal-sadhu',
      'legal_notice',
      'sadhu',
      `<h2>{{orgName}}</h2>
<h3>আইনগত নোটিশ (সাধু)</h3>
<p>রেফারেন্স {{referenceNo}} — জনাব {{memberName}}, আপনার {{loanCode}} ঋণের ৳{{loanAmount}} টাকা বকেয়া অহংকৃত। {{noticeDate}} তারিখের মধ্যে পরিশোধ করিলে নহিলে আইনগত ব্যবস্থা গ্রহণার্থ প্রেরিত হইল।</p>
<p class="sign">আইন উপদেষ্টার স্বাক্ষর: ______________</p>`,
    ),
  ];
}
