import { z } from 'zod';
import { moneySchema, paginationQuerySchema, phoneBdSchema, uuidSchema } from './schemas.js';

/**
 * ── Member Management ───────────────────────────────────────────────────────
 * Onboarding and lifecycle for microfinance members (mostly women, also
 * farmers and small entrepreneurs). The admission wizard models the field
 * reality: survey → screening → household visit → branch-manager approval →
 * orientation → member number → passbook.
 */

/** ── Lifecycle ───────────────────────────────────────────────────────────── */
export const MEMBER_LIFECYCLE = ['pending', 'active', 'dormant', 'dropout', 'transferred', 'deceased'] as const;
export type MemberLifecycle = (typeof MEMBER_LIFECYCLE)[number];

export const MEMBER_REASON_CODES = [
  'new_admission',
  'rejoined',
  'inactivity',
  'migration',
  'loan_default',
  'voluntary_exit',
  'illness',
  'death',
  'transfer_out',
] as const;
export type MemberReasonCode = (typeof MEMBER_REASON_CODES)[number];

/** Allowed transitions of the member status flow. */
export const LIFECYCLE_TRANSITIONS: Record<MemberLifecycle, readonly MemberLifecycle[]> = {
  pending: ['active', 'dropout'],
  active: ['dormant', 'dropout', 'transferred', 'deceased'],
  dormant: ['active', 'dropout', 'deceased'],
  dropout: ['rejoined' as MemberLifecycle] as readonly MemberLifecycle[], // rejoined is modeled via new admission; block direct exits
  transferred: ['active'],
  deceased: [],
};
// NOTE: dropout is terminal (re-admission creates a fresh membership) — the
// entry above intentionally maps dropout to an empty set.
LIFECYCLE_TRANSITIONS.dropout = [];

/** Statuses counted as "a live membership" for uniqueness rules. */
export const LIVE_MEMBER_STATUSES: readonly MemberLifecycle[] = ['pending', 'active', 'dormant', 'transferred'];

/** ── Admission wizard ────────────────────────────────────────────────────── */
export const ADMISSION_STAGES = [
  'field_survey',
  'eligibility_screening',
  'household_verification',
  'manager_approval',
  'orientation_completed',
  'member_issued',
  'passbook_generated',
] as const;
export type AdmissionStage = (typeof ADMISSION_STAGES)[number];

/** Stages that can be rejected with a note (everything before issuance). */
export const ADMISSION_GATE_STAGES: readonly AdmissionStage[] = [
  'field_survey',
  'eligibility_screening',
  'household_verification',
  'manager_approval',
];

/** Actor permissions per stage — enforced by API and rendered by the wizard. */
export const ADMISSION_STAGE_PERMISSION: Record<AdmissionStage, 'member:write' | 'member:approve'> = {
  field_survey: 'member:write',
  eligibility_screening: 'member:write',
  household_verification: 'member:write',
  manager_approval: 'member:approve',
  orientation_completed: 'member:write',
  member_issued: 'member:approve',
  passbook_generated: 'member:write',
};

export function isAdmissionStage(v: string): v is AdmissionStage {
  return (ADMISSION_STAGES as readonly string[]).includes(v);
}

export function nextAdmissionStage(stage: AdmissionStage): AdmissionStage | null {
  const i = ADMISSION_STAGES.indexOf(stage);
  const next = i >= 0 ? ADMISSION_STAGES[i + 1] : undefined;
  return next ?? null;
}

/** ── Profile primitives ──────────────────────────────────────────────────── */
export const idTypeSchema = z.enum(['nid', 'birth_registration']);
export type IdType = z.infer<typeof idTypeSchema>;

/** NID: 10, 13 or 17 digits. Birth registration: 17 digits. */
export const idNumberSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$|^\d{13}$|^\d{17}$/, 'এনআইডি/জন্ম নিবন্ধন ১০, ১৩ বা ১৭ সংখ্যার হতে হবে / ID must be 10, 13 or 17 digits');

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'তারিখ ফরম্যাট YYYY-MM-DD / Date must be YYYY-MM-DD');

/** Relation of a nominee to the member. */
export const NOMINEE_RELATIONS = ['husband', 'father', 'mother', 'son', 'daughter', 'brother', 'sister', 'other'] as const;
export const nomineeRelationSchema = z.enum(NOMINEE_RELATIONS);

export const nomineeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  relation: nomineeRelationSchema,
  /** Share of benefits in percent; all nominees together must total 100. */
  sharePct: z.coerce.number().int().min(1).max(100),
  phone: phoneBdSchema.optional(),
});
export type Nominee = z.infer<typeof nomineeSchema>;

export const nomineesSchema = z
  .array(nomineeSchema)
  .min(1, 'অন্তত একজন নমিনি দিন / At least one nominee is required')
  .max(4)
  .refine((list) => list.reduce((sum, n) => sum + n.sharePct, 0) === 100, {
    message: 'নমিনিদের মোট অংশ ১০০% হতে হবে / Nominee shares must total 100%',
  });

/** ── Admission draft (wizard payload, persisted per stage) ───────────────── */
export const memberDraftSchema = z.object({
  // Identity
  fullName: z.string().trim().min(3).max(120),
  fullNameBn: z.string().trim().min(2).max(120),
  fatherOrHusbandName: z.string().trim().min(2).max(120),
  motherName: z.string().trim().min(2).max(120),
  idType: idTypeSchema,
  idNumber: idNumberSchema,
  dob: dateSchema.refine((d) => {
    const age = (Date.now() - new Date(`${d}T00:00:00Z`).getTime()) / (365.2425 * 24 * 3600 * 1000);
    return age >= 12 && age <= 100;
  }, 'বয়স ১২–১০০ এর মধ্যে হতে হবে / Age must be between 12 and 100'),
  // Contact & placement
  mobile: phoneBdSchema,
  address: z.string().trim().max(400),
  workingAreaId: uuidSchema,
  samityName: z.string().trim().min(2).max(80),
  // Socio-economic
  occupation: z.string().trim().min(2).max(80),
  monthlyHouseholdIncome: moneySchema,
  landOwnedDecimals: z.coerce.number().min(0).max(10_000),
  familyMembers: z.coerce.number().int().min(1).max(30),
  // Documents (Supabase Storage object paths; uploaded before submit)
  photoPath: z.string().trim().max(400).optional(),
  signaturePath: z.string().trim().max(400).optional(), // or thumbprint
  // Nominees
  nominees: nomineesSchema,
});
export type MemberDraft = z.infer<typeof memberDraftSchema>;

/** Partial update of the draft at any wizard stage. */
export const memberDraftPatchSchema = memberDraftSchema.partial();
export type MemberDraftPatch = z.infer<typeof memberDraftPatchSchema>;

export const admissionCreateSchema = z.object({
  branchId: uuidSchema,
  draft: memberDraftSchema,
});
export type AdmissionCreateInput = z.infer<typeof admissionCreateSchema>;

export const admissionStageActionSchema = z.object({
  stage: z.enum(ADMISSION_STAGES),
  /** pass/fail gates; issuing requires pass on all previous gates */
  result: z.enum(['pass', 'fail']),
  note: z.string().trim().max(1000).optional(),
});
export type AdmissionStageAction = z.infer<typeof admissionStageActionSchema>;

export interface AdmissionView {
  id: string;
  branchId: string;
  branchCode: string;
  stage: AdmissionStage;
  stageHistory: { stage: AdmissionStage; result: 'pass' | 'fail'; at: string; by: string; note?: string }[];
  draft: Partial<MemberDraft>;
  duplicates: DuplicateMatch[];
  eligibility: { eligible: boolean; failures: string[] } | null;
  memberNumber: string | null;
  passbookNo: string | null;
  status: MemberLifecycle;
}

/** ── Eligibility rules (configurable per organization) ───────────────────── */
export const eligibilityRulesSchema = z.object({
  minAge: z.coerce.number().int().min(12).max(70).default(18),
  maxAge: z.coerce.number().int().min(18).max(100).default(60),
  /** Land ownership ceiling in decimals (landless/smallholder focus). */
  maxLandDecimals: z.coerce.number().min(0).max(1000).default(50),
  /** One member per household (household = village + address hash). */
  oneMemberPerHousehold: z.boolean().default(true),
  /** Optional monthly household income ceiling in BDT (0 = no limit). */
  maxMonthlyIncome: z.coerce.number().min(0).max(1_000_000).default(0),
  /** Women-only intake flag (BRAC/Grameen style village organizations). */
  womenOnly: z.boolean().default(false),
});
export type EligibilityRules = z.infer<typeof eligibilityRulesSchema>;

/** Minimal shape eligibility needs from an existing member row. */
export interface EligibilityContextMember {
  working_area_id: string | null;
  address: string | null;
  lifecycle: MemberLifecycle;
  full_name: string;
}

/**
 * Evaluate an admission draft against org-configurable eligibility rules.
 * Pure function — used by the API for the gate and by the wizard for live
 * pre-screening, so both sides can never disagree.
 */
export function evaluateEligibility(
  draft: Partial<MemberDraft>,
  rules: EligibilityRules,
  sameOrgMembers: EligibilityContextMember[],
): { eligible: boolean; failures: string[] } {
  const failures: string[] = [];

  if (draft.dob) {
    const age = (Date.now() - new Date(`${draft.dob}T00:00:00Z`).getTime()) / (365.2425 * 24 * 3600 * 1000);
    if (age < rules.minAge) failures.push(`age_below_min:${Math.floor(age)}`);
    if (age > rules.maxAge) failures.push(`age_above_max:${Math.floor(age)}`);
  }
  if (rules.maxMonthlyIncome > 0 && draft.monthlyHouseholdIncome) {
    if (Number(draft.monthlyHouseholdIncome) > rules.maxMonthlyIncome) failures.push('income_above_max');
  }
  if (draft.landOwnedDecimals != null && draft.landOwnedDecimals > rules.maxLandDecimals) {
    failures.push('land_above_limit');
  }
  if (rules.oneMemberPerHousehold && draft.workingAreaId && draft.address) {
    const sameHousehold = sameOrgMembers.some(
      (m) =>
        LIVE_MEMBER_STATUSES.includes(m.lifecycle) &&
        m.working_area_id === draft.workingAreaId &&
        (m.address ?? '').trim().toLowerCase() === draft.address!.trim().toLowerCase(),
    );
    if (sameHousehold) failures.push('household_already_member');
  }
  if (rules.womenOnly && draft.fullNameBn) {
    // Heuristic only in absence of a gender field: common Bangla female
    // name suffixes. Kept permissive to avoid false rejects.
    const femaleHints = /(বেগম|খাতুন|আক্তার|মনি|রানী)$/;
    const lastWord = (draft.fullName ?? '').trim().split(/\s+/).pop() ?? '';
    if (!femaleHints.test(draft.fullNameBn) && !/a$|i$/.test(lastWord)) {
      failures.push('women_only_policy');
    }
  }
  return { eligible: failures.length === 0, failures };
}

/** ── Duplicate detection ─────────────────────────────────────────────────── */
export const duplicateCheckQuerySchema = z.object({
  idNumber: z.string().trim().regex(/^\d{6,17}$/).optional(),
  mobile: z.string().trim().regex(/^01\d{9}$/).optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  workingAreaId: uuidSchema.optional(),
});
export type DuplicateCheckQuery = z.infer<typeof duplicateCheckQuerySchema>;

export interface DuplicateMatch {
  memberId: string;
  memberNumber: string;
  fullName: string;
  branchCode: string;
  status: MemberLifecycle;
  /** Why this matched: exact id, exact mobile, or fuzzy name+village. */
  matchedBy: ('id_number' | 'mobile' | 'name_village')[];
  /** 0..1 fuzzy similarity of the name (only when name matched). */
  nameSimilarity?: number;
}

export interface DuplicateCheckResult {
  matches: DuplicateMatch[];
  /** true → institution-wide duplicate (second membership must be blocked). */
  blocked: boolean;
  /** true → different branch same person (overlap risk to flag). */
  overlapRisk: boolean;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function normalizePhone(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '').replace(/^88/, '');
}

function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const left = normalizeText(a);
  const right = normalizeText(b);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftWords = left.split(/\s+/).filter(Boolean);
  const rightWords = right.split(/\s+/).filter(Boolean);

  const common = leftWords.filter((word) => rightWords.includes(word));
  const sharedRatio = common.length / Math.max(leftWords.length, rightWords.length);
  if (sharedRatio >= 0.8) return 0.9;

  const minLen = Math.min(left.length, right.length);
  if (minLen === 0) return 0;

  let distance = 0;
  const maxLen = Math.max(left.length, right.length);
  for (let i = 0; i < maxLen; i += 1) {
    if (left[i] !== right[i]) {
      distance += 1;
    }
  }

  return 1 - distance / maxLen;
}

export function checkDuplicateMembership(
  query: {
    fullName?: string;
    mobile?: string;
    idNumber?: string;
    workingAreaId?: string;
    branchId?: string;
  },
  existingMembers: Array<{
    memberId: string;
    memberNumber: string;
    fullName: string;
    phone?: string | null;
    idNumber?: string | null;
    workingAreaId?: string | null;
    address?: string | null;
    branchId?: string | null;
    branchCode: string;
    status: MemberLifecycle;
  }>,
): DuplicateCheckResult {
  const matches: DuplicateMatch[] = [];

  for (const member of existingMembers) {
    if (!member || !['pending', 'active', 'dormant', 'transferred'].includes(member.status)) continue;

    const matchedBy: DuplicateMatch['matchedBy'] = [];

    if (query.idNumber && member.idNumber && query.idNumber === member.idNumber) {
      matchedBy.push('id_number');
    }

    if (query.mobile && member.phone && normalizePhone(query.mobile) === normalizePhone(member.phone)) {
      matchedBy.push('mobile');
    }

    if (query.fullName && member.fullName && query.workingAreaId && member.workingAreaId && query.workingAreaId === member.workingAreaId) {
      const similarity = nameSimilarity(query.fullName, member.fullName);
      if (similarity >= 0.75) {
        matchedBy.push('name_village');
      }
    }

    if (matchedBy.length === 0) continue;

    matches.push({
      memberId: member.memberId,
      memberNumber: member.memberNumber,
      fullName: member.fullName,
      branchCode: member.branchCode,
      status: member.status,
      matchedBy,
      nameSimilarity: matchedBy.includes('name_village') ? nameSimilarity(query.fullName ?? null, member.fullName) : undefined,
    });
  }

  const blocked = matches.length > 0 &&
    matches.some((match) => {
      const sameBranch = !!query.branchId && match.memberId && !match.memberId.startsWith('');
      return sameBranch || match.matchedBy.includes('id_number') || match.matchedBy.includes('mobile');
    });

  const overlapRisk = matches.some((match) => {
    if (!query.branchId || !match.memberId) return false;
    return match.matchedBy.length > 0 && match.matchedBy.some((reason) => reason === 'id_number' || reason === 'mobile' || reason === 'name_village');
  });

  return { matches, blocked, overlapRisk };
}

/** ── Search & list ───────────────────────────────────────────────────────── */
export const memberSearchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(), // member number, name, NID or mobile
  branchId: uuidSchema.optional(),
  status: z.enum(MEMBER_LIFECYCLE).optional(),
});
export type MemberSearchQuery = z.infer<typeof memberSearchQuerySchema>;

export interface MemberListRow {
  id: string;
  member_number: string;
  full_name: string;
  full_name_bn: string | null;
  mobile_masked: string;
  branch_code: string;
  samity_name: string | null;
  status: MemberLifecycle;
  joined_on: string | null;
  photo_url: string | null;
}

/** ── Status change & transfer ────────────────────────────────────────────── */
export const memberStatusChangeSchema = z
  .object({
    status: z.enum(MEMBER_LIFECYCLE),
    reasonCode: z.enum(MEMBER_REASON_CODES),
    note: z.string().trim().max(500).optional(),
    effectiveDate: dateSchema,
  })
  .refine(
    ({ status, reasonCode }) =>
      !(
        (status === 'deceased' && reasonCode !== 'death') ||
        (status === 'transferred' && reasonCode !== 'transfer_out') ||
        (status === 'dropout' && reasonCode === 'death')
      ),
    { message: 'স্ট্যাটাস ও কারণ মিলছে না / Reason code does not match the status' },
  );
export type MemberStatusChange = z.infer<typeof memberStatusChangeSchema>;

export const memberTransferSchema = z.object({
  toBranchId: uuidSchema,
  toSamityName: z.string().trim().min(2).max(80).optional(),
  reason: z.string().trim().min(5).max(500),
});
export type MemberTransferInput = z.infer<typeof memberTransferSchema>;

export const transferDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional(),
});
export type TransferDecision = z.infer<typeof transferDecisionSchema>;

export interface MemberTransferView {
  id: string;
  member_id: string;
  member_number: string;
  from_branch_code: string;
  to_branch_code: string;
  reason: string;
  stage: 'proposed' | 'approved' | 'rejected' | 'completed';
  proposed_by: string;
  proposed_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

/** ── Notes ───────────────────────────────────────────────────────────────── */
export const memberNoteSchema = z.object({ note: z.string().trim().min(2).max(1000) });
export type MemberNoteInput = z.infer<typeof memberNoteSchema>;

export interface MemberNote {
  id: string;
  note: string;
  author: string;
  created_at: string;
}

/** ── Member 360 ──────────────────────────────────────────────────────────── */
export interface MemberSavingsLine {
  id: string;
  product: string;
  balance: string;
}
export interface MemberLoanLine {
  id: string;
  principal: string;
  outstanding: string;
  installment_cnt: number;
  status: string;
  disbursed_at: string | null;
}
export interface MemberAttendanceLine {
  meeting_date: string;
  samity_name: string;
  present: boolean;
}
export interface MemberInsuranceLine {
  id: string;
  product: string;
  premium: string;
  coverage: string;
  status: string;
}

export interface Member360 {
  profile: {
    id: string;
    member_number: string;
    full_name: string;
    full_name_bn: string | null;
    father_or_husband_name: string | null;
    mother_name: string | null;
    id_type: IdType;
    /** Masked: only last 4 digits visible in the UI. */
    id_number_masked: string;
    dob: string | null;
    mobile_masked: string;
    address: string | null;
    occupation: string | null;
    monthly_household_income: string | null;
    land_owned_decimals: string | null;
    family_members: number | null;
    photo_url: string | null;
    signature_url: string | null;
    branch_id: string;
    branch_code: string;
    branch_name: string;
    samity_name: string | null;
    working_area: { id: string; village: string; village_bn: string | null } | null;
    status: MemberLifecycle;
    status_reason_code: string | null;
    status_changed_at: string | null;
    joined_on: string | null;
    passbook_no: string | null;
    nominees: Nominee[];
    eligibility_flags: string[];
  };
  savings: MemberSavingsLine[];
  loans: MemberLoanLine[];
  attendance: MemberAttendanceLine[];
  insurance: MemberInsuranceLine[];
  notes: MemberNote[];
  statusHistory: { status: MemberLifecycle; reason_code: string; changed_at: string; changed_by: string; note?: string }[];
  transfers: MemberTransferView[];
}

/** ── Bulk import (Excel/CSV) ─────────────────────────────────────────────── */
export const memberBulkRowSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  fullNameBn: z.string().trim().max(120).optional().default(''),
  fatherOrHusbandName: z.string().trim().min(2).max(120),
  motherName: z.string().trim().min(2).max(120),
  idType: idTypeSchema.default('nid'),
  idNumber: idNumberSchema,
  dob: dateSchema,
  mobile: phoneBdSchema,
  address: z.string().trim().max(400).optional().default(''),
  occupation: z.string().trim().min(2).max(80),
  monthlyHouseholdIncome: moneySchema,
  landOwnedDecimals: z.coerce.number().min(0).max(10_000).default(0),
  familyMembers: z.coerce.number().int().min(1).max(30).default(4),
  branchCode: z.string().trim().min(2).max(12),
  samityName: z.string().trim().min(2).max(80),
  village: z.string().trim().min(2).max(120), // matched against working_areas
  nomineeName: z.string().trim().min(2).max(120),
  nomineeRelation: nomineeRelationSchema,
  nomineeSharePct: z.coerce.number().int().min(1).max(100).default(100),
  nomineePhone: phoneBdSchema.optional(),
});
export type MemberBulkRow = z.infer<typeof memberBulkRowSchema>;

export const memberBulkImportSchema = z.object({
  branchCode: z.string().trim().min(2).max(12).optional(), // default branch when row lacks one
  rows: z.array(memberBulkRowSchema).min(1).max(500),
});
export type MemberBulkImportInput = z.infer<typeof memberBulkImportSchema>;

export interface BulkRowError {
  row: number;
  field?: string;
  message: string;
}

export interface MemberBulkImportResult {
  received: number;
  created: number;
  duplicateSkipped: number;
  errors: BulkRowError[];
  members: { member_number: string; full_name: string }[];
}
