/**
 * ── Member demo store ─────────────────────────────────────────────────────────
 * In-memory admissions wizard + member lifecycle for preview/test mode. Mirrors
 * migrations 0005/0006 (member_admissions, members extensions, nominees,
 * eligibility_rules) and packages/shared/src/member.ts exactly.
 *
 * Secrets handling on the demo path: NID/birth-registration numbers are stored
 * encrypted with the production AES-256-GCM helper (member-crypto.ts), searched
 * via the HMAC blind index and only ever returned masked. Document paths are
 * stored as private-bucket object paths; downloads are represented as expiring
 * signed URLs (short TTL, demo-signed) exactly like the Supabase Storage path.
 */
import { randomUUID } from 'node:crypto';
import {
  ADMISSION_STAGES,
  ADMISSION_STAGE_PERMISSION,
  canTransitionMemberStatus,
  checkDuplicateMembership,
  evaluateEligibility,
  LIVE_MEMBER_STATUSES,
  memberBulkRowSchema,
  nextAdmissionStage,
  STATUS_REASON_CODES,
  type AdmissionStage,
  type AdmissionView,
  type DuplicateCheckResult,
  type EligibilityRules,
  type Member360,
  type MemberDraft,
  type MemberDraftPatch,
  type MemberLifecycle,
  type MemberReasonCode,
} from '@samity/shared';
import { decryptIdNumber, encryptIdNumber, idSearchHash, maskIdNumber, maskMobile } from './member-crypto.js';

export class MemberDemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_MYMENSINGH = '00000000-0000-4000-8000-0000000000b2';

/** Working-area (village) ids used by the seeded roster and tests. */
export const AREA_BALIATI = '00000000-0000-4000-8000-0000000000a1';
export const AREA_GAZIPUR = '00000000-0000-4000-8000-0000000000a2';

export interface MemberRecord {
  id: string;
  orgId: string;
  branchId: string;
  branchCode: string;
  memberNumber: string;
  passbookNo: string | null;
  fullName: string;
  fullNameBn: string | null;
  fatherOrHusbandName: string | null;
  motherName: string | null;
  idType: 'nid' | 'birth_registration';
  idNumberEnc: string | null;
  idNumberHash: string | null;
  dob: string | null;
  mobile: string;
  address: string | null;
  workingAreaId: string | null;
  village: string | null;
  samityName: string | null;
  occupation: string | null;
  monthlyHouseholdIncome: string | null;
  landOwnedDecimals: number | null;
  familyMembers: number | null;
  photoPath: string | null;
  signaturePath: string | null;
  nominees: { name: string; relation: string; sharePct: number; phone?: string }[];
  lifecycle: MemberLifecycle;
  joinedOn: string | null;
}

export interface AdmissionRecord {
  id: string;
  orgId: string;
  branchId: string;
  branchCode: string;
  stage: AdmissionStage;
  stageHistory: AdmissionView['stageHistory'];
  draft: Partial<MemberDraft>;
  memberNumber: string | null;
  passbookNo: string | null;
  memberId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberDemoData {
  orgId: string;
  members: MemberRecord[];
  admissions: AdmissionRecord[];
  eligibilityRules: EligibilityRules;
  counters: Record<string, number>;
  /** Req 6: append-only status-change audit trail. */
  statusHistory: StatusChangeRecord[];
  /** Req 7: transfer proposals with approval state. */
  transfers: TransferRecord[];
  /** Req 8: member notes. */
  notes: NoteRecord[];
}

const globalRef = globalThis as unknown as { __memberDemoData?: MemberDemoData };

interface MemberSeedInput extends Partial<Omit<MemberRecord, 'idNumberEnc' | 'idNumberHash'>> {
  /** Plaintext identity number — encrypted before the record is stored. */
  idNumber: string;
  memberNumber: string;
  fullName: string;
  mobile: string;
}

function mkMember(partial: MemberSeedInput): MemberRecord {
  const { idNumber, ...rest } = partial;
  return {
    orgId: ORG_ID,
    branchId: BRANCH_DHAKA,
    branchCode: 'DHK01',
    passbookNo: null,
    fatherOrHusbandName: null,
    motherName: null,
    idType: 'nid',
    dob: null,
    address: null,
    workingAreaId: null,
    village: null,
    samityName: null,
    occupation: null,
    monthlyHouseholdIncome: null,
    landOwnedDecimals: null,
    familyMembers: null,
    photoPath: null,
    signaturePath: null,
    nominees: [],
    lifecycle: 'active',
    joinedOn: '2026-01-10',
    ...rest,
    // Encrypted-at-rest identity, never kept in plaintext on the record.
    idNumberEnc: encryptIdNumber(idNumber, ORG_ID),
    idNumberHash: idSearchHash(idNumber, ORG_ID),
  } as MemberRecord;
}

function seedStore(): MemberDemoData {
  const members: MemberRecord[] = [
    mkMember({
      id: '00000000-0000-4000-8000-0000000000m1',
      memberNumber: 'DHK01-26-00001',
      passbookNo: 'PB-DHK01-26-00001',
      fullName: 'Rahima Begum',
      fullNameBn: 'রহিমা বেগম',
      fatherOrHusbandName: 'Abdul Karim',
      motherName: 'Jahanara Begum',
      idNumber: '1990123456789',
      dob: '1995-03-15',
      mobile: '01712345678',
      address: 'Village: Baliati, Dhamrai, Dhaka',
      workingAreaId: AREA_BALIATI,
      village: 'Baliati',
      samityName: 'Rupali Samity',
      occupation: 'Poultry farmer',
      monthlyHouseholdIncome: '12000.00',
      landOwnedDecimals: 15,
      familyMembers: 5,
      photoPath: 'org/' + ORG_ID + '/member/00000000-0000-4000-8000-0000000000m1/photo.jpg',
      signaturePath: 'org/' + ORG_ID + '/member/00000000-0000-4000-8000-0000000000m1/signature.png',
      nominees: [{ name: 'Abdul Karim', relation: 'husband', sharePct: 100 }],
      branchId: BRANCH_DHAKA,
    }),
    mkMember({
      id: '00000000-0000-4000-8000-0000000000m2',
      memberNumber: 'DHK01-26-00002',
      passbookNo: 'PB-DHK01-26-00002',
      fullName: 'Nusrat Jahan',
      fullNameBn: 'নুসরাত জাহান',
      idNumber: '1993123456789',
      mobile: '01812345678',
      address: 'Village: Baliati, Dhamrai, Dhaka',
      workingAreaId: AREA_BALIATI,
      village: 'Baliati',
      samityName: 'Jonaki Samity',
      occupation: 'Tailor',
      monthlyHouseholdIncome: '9000.00',
      nominees: [{ name: 'Md Ali', relation: 'husband', sharePct: 100 }],
      branchId: BRANCH_DHAKA,
    }),
    mkMember({
      id: '00000000-0000-4000-8000-0000000000m3',
      memberNumber: 'MYM01-26-00001',
      passbookNo: 'PB-MYM01-26-00001',
      fullName: 'Kamala Khatun',
      fullNameBn: 'কমলা খাতুন',
      idNumber: '1988123456789',
      mobile: '01912345678',
      address: 'Village: Gazipur Sadar',
      workingAreaId: AREA_GAZIPUR,
      village: 'Gazipur Sadar',
      samityName: 'Ashar Alo Samity',
      occupation: 'Cattle rearing',
      monthlyHouseholdIncome: '11000.00',
      nominees: [{ name: 'Rashed Mia', relation: 'husband', sharePct: 100 }],
      branchId: BRANCH_MYMENSINGH,
      branchCode: 'MYM01',
    }),
    // A dropout member: institution-wide duplicate rules still see the NID,
    // but re-admission policy is decided by the caller (blocked here).
    mkMember({
      id: '00000000-0000-4000-8000-0000000000m4',
      memberNumber: 'DHK01-25-00017',
      fullName: 'Salma Khatun',
      fullNameBn: 'সালমা খাতুন',
      idNumber: '1991123456789',
      mobile: '01612345678',
      workingAreaId: AREA_BALIATI,
      village: 'Baliati',
      lifecycle: 'dropout',
      joinedOn: '2025-02-01',
    }),
  ];

  return {
    orgId: ORG_ID,
    members,
    admissions: [],
    eligibilityRules: {
      minAge: 18,
      maxAge: 60,
      maxLandDecimals: 50,
      oneMemberPerHousehold: true,
      maxMonthlyIncome: 0,
      womenOnly: false,
    },
    counters: {},
    statusHistory: [],
    transfers: [],
    notes: [
      {
        id: '00000000-0000-4000-8000-0000000000n1',
        memberId: '00000000-0000-4000-8000-0000000000m1',
        note: 'প্রথম সভায় উপস্থিত ছিলেন; পাসবুক বুঝিয়ে দেওয়া হয়েছে।',
        author: 'কমল হোসেন',
        createdAt: '2026-01-12T10:00:00.000Z',
      },
    ],
  };
}

export function memberDemoStore(): MemberDemoData {
  globalRef.__memberDemoData ??= seedStore();
  return globalRef.__memberDemoData;
}

export function resetMemberDemoStore(): void {
  globalRef.__memberDemoData = undefined;
}

/** ── Membership number issuance ─────────────────────────────────────────── */
function nextMemberNumber(store: MemberDemoData, branchCode: string): { memberNumber: string; passbookNo: string } {
  const yy = new Date().toISOString().slice(2, 4);
  const key = `${branchCode}-${yy}`;
  const seq = (store.counters[key] ?? 0) + 1;
  store.counters[key] = seq;
  const padded = String(seq).padStart(5, '0');
  const clean = branchCode.replace(/-/g, '');
  return { memberNumber: `${clean}-${yy}-${padded}`, passbookNo: `PB-${clean}-${yy}-${padded}` };
}

/** ── Duplicate detection (req 4) ────────────────────────────────────────── */

/** Materialize every stored member into the shape checkDuplicateMembership expects. */
function duplicateContext(store: MemberDemoData, opts: { includeEncryptedIds: boolean }) {
  return store.members.map((m) => ({
    memberId: m.id,
    memberNumber: m.memberNumber,
    fullName: m.fullName,
    phone: m.mobile,
    idNumber:
      opts.includeEncryptedIds && m.idNumberEnc && m.idNumberEnc.startsWith('v1.')
        ? safeDecrypt(m.idNumberEnc)
        : null,
    workingAreaId: m.workingAreaId,
    address: m.address,
    branchId: m.branchId,
    branchCode: m.branchCode,
    status: m.lifecycle,
  }));
}

function safeDecrypt(enc: string): string | null {
  try {
    return decryptIdNumber(enc, ORG_ID);
  } catch {
    return null;
  }
}

export function checkDuplicates(
  store: MemberDemoData,
  query: { fullName?: string; mobile?: string; idNumber?: string; workingAreaId?: string; branchId?: string },
): DuplicateCheckResult {
  const byHash = query.idNumber
    ? store.members.filter((m) => m.idNumberHash === idSearchHash(query.idNumber!, store.orgId)).map((m) => m.id)
    : null;

  const ctx = duplicateContext(store, { includeEncryptedIds: true })
    // Optimization + safety: when the blind index says no member shares this
    // id, drop stored ids entirely so the exact-match rule cannot false-fire.
    .map((m) => (byHash && !byHash.includes(m.memberId) ? { ...m, idNumber: null } : m));

  return checkDuplicateMembership(query, ctx);
}

/** ── Eligibility (req 1 stage 2) ────────────────────────────────────────── */
export function evaluateDraftEligibility(store: MemberDemoData, draft: Partial<MemberDraft>) {
  return evaluateEligibility(
    draft,
    store.eligibilityRules,
    store.members.map((m) => ({
      working_area_id: m.workingAreaId,
      address: m.address,
      lifecycle: m.lifecycle,
      full_name: m.fullName,
    })),
  );
}

export function getEligibilityRules(store: MemberDemoData): EligibilityRules {
  return { ...store.eligibilityRules };
}

export function updateEligibilityRules(store: MemberDemoData, patch: Partial<EligibilityRules>): EligibilityRules {
  store.eligibilityRules = { ...store.eligibilityRules, ...patch };
  return { ...store.eligibilityRules };
}

/** ── Admissions wizard (req 1) ──────────────────────────────────────────── */

export function createAdmission(
  store: MemberDemoData,
  input: { branchId: string; draft: MemberDraft },
  actor: { id: string },
): { admission: AdmissionView; duplicates: DuplicateCheckResult } {
  const branchCode = input.branchId === BRANCH_MYMENSINGH ? 'MYM01' : 'DHK01';

  // Institution-wide duplicate rule: a second live membership for the same
  // person is blocked; cross-branch overlap is flagged for review.
  const duplicates = checkDuplicates(store, {
    fullName: input.draft.fullName,
    mobile: input.draft.mobile,
    idNumber: input.draft.idNumber,
    workingAreaId: input.draft.workingAreaId,
    branchId: input.branchId,
  });
  if (duplicates.blocked) {
    throw new MemberDemoError(409, 'CONFLICT', 'এই প্রতিষ্ঠানে ইতিমধ্যে এই ব্যক্তির সদস্যপদ রয়েছে / A membership already exists for this person in this institution');
  }

  const now = new Date().toISOString();
  const record: AdmissionRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    branchId: input.branchId,
    branchCode,
    stage: 'field_survey',
    stageHistory: [{ stage: 'field_survey', result: 'pass', at: now, by: actor.id }],
    draft: input.draft,
    memberNumber: null,
    passbookNo: null,
    memberId: null,
    createdAt: now,
    updatedAt: now,
  };
  store.admissions.push(record);
  return { admission: admissionView(store, record, duplicates), duplicates };
}

export function listAdmissions(store: MemberDemoData, filter: { stage?: AdmissionStage; branchId?: string } = {}): AdmissionView[] {
  let rows = [...store.admissions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filter.stage) rows = rows.filter((a) => a.stage === filter.stage);
  if (filter.branchId) rows = rows.filter((a) => a.branchId === filter.branchId);
  return rows.map((a) => admissionView(store, a));
}

export function getAdmission(store: MemberDemoData, id: string): AdmissionView {
  const record = store.admissions.find((a) => a.id === id);
  if (!record) throw new MemberDemoError(404, 'NOT_FOUND', 'ভর্তি পাওয়া যায়নি / Admission not found');
  return admissionView(store, record);
}

function duplicateQueryFor(draft: Partial<MemberDraft>) {
  return {
    fullName: draft.fullName,
    mobile: draft.mobile,
    idNumber: draft.idNumber,
    workingAreaId: draft.workingAreaId,
  };
}

export function patchAdmissionDraft(store: MemberDemoData, id: string, patch: MemberDraftPatch): AdmissionView {
  const record = store.admissions.find((a) => a.id === id);
  if (!record) throw new MemberDemoError(404, 'NOT_FOUND', 'ভর্তি পাওয়া যায়নি / Admission not found');
  if (record.memberId) throw new MemberDemoError(409, 'CONFLICT', 'ভর্তি সম্পন্ন হয়েছে / Admission already completed');
  record.draft = { ...record.draft, ...patch };
  record.updatedAt = new Date().toISOString();
  return admissionView(store, record);
}

/**
 * Advance the wizard one stage. Gate order, actor permission and the
 * previous-gates-passed invariant all come from the shared engine.
 */
export function advanceAdmission(
  store: MemberDemoData,
  id: string,
  action: { stage: AdmissionStage; result: 'pass' | 'fail'; note?: string },
  actor: { id: string; role: string; permissions: readonly string[] },
): AdmissionView {
  const record = store.admissions.find((a) => a.id === id);
  if (!record) throw new MemberDemoError(404, 'NOT_FOUND', 'ভর্তি পাওয়া যায়নি / Admission not found');
  if (action.stage !== record.stage) {
    throw new MemberDemoError(409, 'CONFLICT', `ধাপ মিলছে না: প্রত্যাশিত ${record.stage} / Stage mismatch: expected ${record.stage}`);
  }

  const required = ADMISSION_STAGE_PERMISSION[action.stage];
  if (required === 'member:approve' && !actor.permissions.includes('member:approve')) {
    throw new MemberDemoError(403, 'FORBIDDEN', 'অনুমোদনের অনুমতি নেই / Approval permission required');
  }

  if (action.result === 'fail') {
    record.stageHistory.push({ stage: action.stage, result: 'fail', at: new Date().toISOString(), by: actor.id, note: action.note });
    record.updatedAt = new Date().toISOString();
    return admissionView(store, record);
  }

  // Every earlier gate must have passed before this stage can pass.
  const stageIndex = ADMISSION_STAGES.indexOf(action.stage);
  for (let i = 0; i < stageIndex; i += 1) {
    const prior = ADMISSION_STAGES[i]!;
    const lastForStage = [...record.stageHistory].reverse().find((h) => h.stage === prior);
    if (!lastForStage || lastForStage.result !== 'pass') {
      throw new MemberDemoError(409, 'CONFLICT', `আগের ধাপ সম্পন্ন হয়নি: ${prior} / Previous stage not passed: ${prior}`);
    }
  }

  // The eligibility gate is re-evaluated server-side at screening time.
  if (action.stage === 'eligibility_screening') {
    const eligibility = evaluateDraftEligibility(store, record.draft);
    if (!eligibility.eligible) {
      record.stageHistory.push({
        stage: action.stage,
        result: 'fail',
        at: new Date().toISOString(),
        by: actor.id,
        note: `ineligible: ${eligibility.failures.join(', ')}`,
      });
      record.updatedAt = new Date().toISOString();
      return admissionView(store, record);
    }
  }

  record.stageHistory.push({ stage: action.stage, result: 'pass', at: new Date().toISOString(), by: actor.id, note: action.note });

  if (action.stage === 'member_issued') {
    const { memberNumber, passbookNo } = nextMemberNumber(store, record.branchCode);
    record.memberNumber = memberNumber;
    record.passbookNo = passbookNo;
  }

  if (action.stage === 'passbook_generated') {
    finalizeMember(store, record);
  }

  const next = nextAdmissionStage(action.stage);
  record.stage = next ?? record.stage;
  record.updatedAt = new Date().toISOString();
  return admissionView(store, record);
}

function finalizeMember(store: MemberDemoData, record: AdmissionRecord): void {
  const draft = record.draft as MemberDraft;
  const now = new Date().toISOString();
  const member = mkMember({
    orgId: store.orgId,
    branchCode: record.branchCode,
    id: randomUUID(),
    memberNumber: record.memberNumber!,
    passbookNo: record.passbookNo,
    fullName: draft.fullName,
    fullNameBn: draft.fullNameBn,
    fatherOrHusbandName: draft.fatherOrHusbandName,
    motherName: draft.motherName,
    idType: draft.idType,
    idNumber: draft.idNumber,
    dob: draft.dob,
    mobile: draft.mobile,
    address: draft.address,
    workingAreaId: draft.workingAreaId,
    village: null,
    samityName: draft.samityName,
    occupation: draft.occupation,
    monthlyHouseholdIncome: draft.monthlyHouseholdIncome,
    landOwnedDecimals: draft.landOwnedDecimals,
    familyMembers: draft.familyMembers,
    photoPath: draft.photoPath ?? null,
    signaturePath: draft.signaturePath ?? null,
    nominees: draft.nominees.map((n) => ({ name: n.name, relation: n.relation, sharePct: n.sharePct, phone: n.phone })),
    lifecycle: 'pending',
    joinedOn: now.slice(0, 10),
    branchId: record.branchId,
  });
  store.members.push(member);
  record.memberId = member.id;
}

function admissionView(store: MemberDemoData, record: AdmissionRecord, duplicates?: DuplicateCheckResult): AdmissionView {
  return {
    id: record.id,
    branchId: record.branchId,
    branchCode: record.branchCode,
    stage: record.stage,
    stageHistory: record.stageHistory,
    draft: record.draft,
    duplicates: duplicates ?? checkDuplicates(store, duplicateQueryFor(record.draft)),
    eligibility: evaluateDraftEligibility(store, record.draft),
    memberNumber: record.memberNumber,
    passbookNo: record.passbookNo,
    status: record.memberId ? 'pending' : 'pending',
  };
}

/** ── Member listing / 360 / lifecycle (maintenance) ─────────────────────── */

export interface MemberListRowApi {
  id: string;
  member_number: string;
  full_name: string;
  full_name_bn: string | null;
  mobile_masked: string;
  branch_code: string;
  samity_name: string | null;
  status: MemberLifecycle;
  joined_on: string | null;
}

export function listMembers(store: MemberDemoData, filter: { q?: string; branchId?: string; status?: MemberLifecycle; page?: number; pageSize?: number } = {}): { items: MemberListRowApi[]; total: number; page: number; pageSize: number } {
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;
  let rows = [...store.members].sort((a, b) => a.memberNumber.localeCompare(b.memberNumber));
  if (filter.branchId) rows = rows.filter((m) => m.branchId === filter.branchId);
  if (filter.status) rows = rows.filter((m) => m.lifecycle === filter.status);
  if (filter.q) {
    const q = filter.q.trim().toLowerCase();
    rows = rows.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        (m.fullNameBn ?? '').includes(q) ||
        m.memberNumber.toLowerCase().includes(q) ||
        m.mobile.includes(q) ||
        (m.idNumberHash !== null && q.replace(/\D/g, '').length >= 6 && m.idNumberHash === idSearchHash(q, store.orgId)),
    );
  }
  const total = rows.length;
  return { items: rows.slice((page - 1) * pageSize, page * pageSize).map(toListRow), total, page, pageSize };
}

function toListRow(m: MemberRecord): MemberListRowApi {
  return {
    id: m.id,
    member_number: m.memberNumber,
    full_name: m.fullName,
    full_name_bn: m.fullNameBn,
    mobile_masked: maskMobile(m.mobile),
    branch_code: m.branchCode,
    samity_name: m.samityName,
    status: m.lifecycle,
    joined_on: m.joinedOn,
  };
}

export interface MemberProfileView {
  id: string;
  memberNumber: string;
  fullName: string;
  fullNameBn: string | null;
  fatherOrHusbandName: string | null;
  motherName: string | null;
  idType: 'nid' | 'birth_registration';
  idNumberMasked: string;
  dob: string | null;
  mobileMasked: string;
  address: string | null;
  occupation: string | null;
  monthlyHouseholdIncome: string | null;
  landOwnedDecimals: number | null;
  familyMembers: number | null;
  photoUrl: string | null;
  signatureUrl: string | null;
  branchCode: string;
  samityName: string | null;
  village: string | null;
  status: MemberLifecycle;
  joinedOn: string | null;
  passbookNo: string | null;
  nominees: { name: string; relation: string; sharePct: number; phone?: string }[];
}

export function getMemberProfile(store: MemberDemoData, id: string): MemberProfileView {
  const m = store.members.find((x) => x.id === id);
  if (!m) throw new MemberDemoError(404, 'NOT_FOUND', 'সদস্য পাওয়া যায়নি / Member not found');
  let idMasked = '••••••';
  if (m.idNumberEnc) {
    const plain = safeDecrypt(m.idNumberEnc);
    if (plain) idMasked = maskIdNumber(plain);
  }
  return {
    id: m.id,
    memberNumber: m.memberNumber,
    fullName: m.fullName,
    fullNameBn: m.fullNameBn,
    fatherOrHusbandName: m.fatherOrHusbandName,
    motherName: m.motherName,
    idType: m.idType,
    idNumberMasked: idMasked,
    dob: m.dob,
    mobileMasked: maskMobile(m.mobile),
    address: m.address,
    occupation: m.occupation,
    monthlyHouseholdIncome: m.monthlyHouseholdIncome,
    landOwnedDecimals: m.landOwnedDecimals,
    familyMembers: m.familyMembers,
    photoUrl: m.photoPath ? signedUrlFor(m.photoPath) : null,
    signatureUrl: m.signaturePath ? signedUrlFor(m.signaturePath) : null,
    branchCode: m.branchCode,
    samityName: m.samityName,
    village: m.village,
    status: m.lifecycle,
    joinedOn: m.joinedOn,
    passbookNo: m.passbookNo,
    nominees: m.nominees,
  };
}

/**
 * Demo stand-in for a Supabase Storage signed URL: same contract (expiring
 * HTTPS link to a private-bucket object), locally scoped and short-lived.
 */
function signedUrlFor(objectPath: string): string {
  const expires = Math.floor(Date.now() / 1000) + 300; // 5 minutes
  return `/api/v1/members/documents/${encodeURIComponent(objectPath)}?expires=${expires}`;
}

/** ── Duplicate check endpoint ───────────────────────────────────────────── */
export function duplicateCheck(store: MemberDemoData, query: { fullName?: string; mobile?: string; idNumber?: string; workingAreaId?: string; branchId?: string }): DuplicateCheckResult {
  return checkDuplicates(store, query);
}

/** Live member count for a household check used in tests. */
export function liveMembersInHousehold(store: MemberDemoData, workingAreaId: string, address: string): number {
  const needle = address.trim().toLowerCase();
  return store.members.filter(
    (m) => LIVE_MEMBER_STATUSES.includes(m.lifecycle) && m.workingAreaId === workingAreaId && (m.address ?? '').trim().toLowerCase() === needle,
  ).length;
}

/** Stored members whose blind-index hash equals the given plaintext id. */
export function membersWithIdNumber(store: MemberDemoData, idNumber: string): MemberRecord[] {
  const hash = idSearchHash(idNumber, store.orgId);
  return store.members.filter((m) => m.idNumberHash === hash);
}

/** ── Req 6: status flow with reason codes and dates ────────────────────── */

export interface StatusChangeRecord {
  id: string;
  memberId: string;
  status: MemberLifecycle;
  reasonCode: string;
  note?: string;
  effectiveDate: string;
  changedBy: string;
  changedAt: string;
}

function findMember(store: MemberDemoData, id: string): MemberRecord {
  const m = store.members.find((x) => x.id === id);
  if (!m) throw new MemberDemoError(404, 'NOT_FOUND', 'সদস্য পাওয়া যায়নি / Member not found');
  return m;
}

/**
 * Apply a status change. The Zod schema has already validated the shape; this
 * enforces the transition map + reason pairing and appends to the audit trail.
 */
export function changeMemberStatus(
  store: MemberDemoData,
  memberId: string,
  input: { status: MemberLifecycle; reasonCode: string; note?: string; effectiveDate: string },
  actor: { id: string },
): { member: MemberProfileView; change: StatusChangeRecord } {
  const m = findMember(store, memberId);
  if (!canTransitionMemberStatus(m.lifecycle, input.status)) {
    throw new MemberDemoError(409, 'CONFLICT', `অবৈধ স্থানান্তর ${m.lifecycle} → ${input.status} / Invalid status transition`);
  }
  const allowedReasons = STATUS_REASON_CODES[input.status];
  if (!allowedReasons.includes(input.reasonCode as MemberReasonCode)) {
    throw new MemberDemoError(422, 'VALIDATION_ERROR', `কারণ কোড স্ট্যাটাসের সাথে মেলে না / Reason code does not pair with status ${input.status}`);
  }
  const change: StatusChangeRecord = {
    id: randomUUID(),
    memberId: m.id,
    status: input.status,
    reasonCode: input.reasonCode,
    note: input.note,
    effectiveDate: input.effectiveDate,
    changedBy: actor.id,
    changedAt: new Date().toISOString(),
  };
  store.statusHistory.push(change);
  m.lifecycle = input.status;
  return { member: getMemberProfile(store, memberId), change };
}

export function listStatusHistory(store: MemberDemoData, memberId: string): StatusChangeRecord[] {
  findMember(store, memberId);
  return store.statusHistory.filter((c) => c.memberId === memberId).sort((a, b) => b.changedAt.localeCompare(a.changedAt));
}

/** ── Req 7: transfers between branches/centers with approval ───────────── */

export interface TransferRecord {
  id: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  fromBranchId: string;
  fromBranchCode: string;
  toBranchId: string;
  toBranchCode: string;
  toSamityName?: string;
  reason: string;
  stage: 'proposed' | 'approved' | 'rejected' | 'completed';
  proposedBy: string;
  proposedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote?: string;
  completedAt: string | null;
}

export function proposeTransfer(
  store: MemberDemoData,
  memberId: string,
  input: { toBranchId: string; toSamityName?: string; reason: string },
  actor: { id: string },
): TransferRecord {
  const m = findMember(store, memberId);
  if (!LIVE_MEMBER_STATUSES.includes(m.lifecycle)) {
    throw new MemberDemoError(409, 'CONFLICT', 'শুধু চলমান সদস্য স্থানান্তর করা যায় / Only live members can be transferred');
  }
  if (m.branchId === input.toBranchId) {
    throw new MemberDemoError(422, 'VALIDATION_ERROR', 'সদস্য ইতিমধ্যে এই শাখায় / Member already belongs to this branch');
  }
  const open = store.transfers.find((t) => t.memberId === memberId && (t.stage === 'proposed' || t.stage === 'approved'));
  if (open) {
    throw new MemberDemoError(409, 'CONFLICT', 'একজন সদস্যের একটি খোলা স্থানান্তর আগেই আছে / An open transfer already exists for this member');
  }
  const record: TransferRecord = {
    id: randomUUID(),
    memberId: m.id,
    memberNumber: m.memberNumber,
    memberName: m.fullName,
    fromBranchId: m.branchId,
    fromBranchCode: m.branchCode,
    toBranchId: input.toBranchId,
    toBranchCode: input.toBranchId === BRANCH_MYMENSINGH ? 'MYM01' : 'DHK01',
    toSamityName: input.toSamityName,
    reason: input.reason,
    stage: 'proposed',
    proposedBy: actor.id,
    proposedAt: new Date().toISOString(),
    decidedBy: null,
    decidedAt: null,
    completedAt: null,
  };
  store.transfers.push(record);
  return record;
}

/** Approve/reject a proposed transfer; approval moves the member on completion. */
export function decideTransfer(
  store: MemberDemoData,
  transferId: string,
  decision: 'approve' | 'reject',
  actor: { id: string },
  note?: string,
): TransferRecord {
  const t = store.transfers.find((x) => x.id === transferId);
  if (!t) throw new MemberDemoError(404, 'NOT_FOUND', 'স্থানান্তর পাওয়া যায়নি / Transfer not found');
  if (t.stage !== 'proposed') {
    throw new MemberDemoError(409, 'CONFLICT', `স্থানান্তর ইতিমধ্যে ${t.stage} / Transfer already ${t.stage}`);
  }
  t.stage = decision === 'approve' ? 'approved' : 'rejected';
  t.decidedBy = actor.id;
  t.decidedAt = new Date().toISOString();
  t.decisionNote = note;
  return t;
}

/** Completion flips the member's branch and records the transfer_out history. */
export function completeTransfer(store: MemberDemoData, transferId: string, actor: { id: string }): TransferRecord {
  const t = store.transfers.find((x) => x.id === transferId);
  if (!t) throw new MemberDemoError(404, 'NOT_FOUND', 'স্থানান্তর পাওয়া যায়নি / Transfer not found');
  if (t.stage !== 'approved') {
    throw new MemberDemoError(409, 'CONFLICT', 'অনুমোদিত নয় — আগে অনুমোদন করুন / Not approved — approve first');
  }
  const m = findMember(store, t.memberId);
  m.branchId = t.toBranchId;
  m.branchCode = t.toBranchCode;
  if (t.toSamityName) m.samityName = t.toSamityName;
  t.stage = 'completed';
  t.completedAt = new Date().toISOString();
  store.statusHistory.push({
    id: randomUUID(),
    memberId: m.id,
    status: m.lifecycle,
    reasonCode: 'transfer_out',
    note: `${t.fromBranchCode} → ${t.toBranchCode}`,
    effectiveDate: t.completedAt.slice(0, 10),
    changedBy: actor.id,
    changedAt: t.completedAt,
  });
  return t;
}

export function listTransfers(store: MemberDemoData, filter: { memberId?: string; stage?: TransferRecord['stage'] } = {}): TransferRecord[] {
  let rows = [...store.transfers].sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
  if (filter.memberId) rows = rows.filter((t) => t.memberId === filter.memberId);
  if (filter.stage) rows = rows.filter((t) => t.stage === filter.stage);
  return rows;
}

/** ── Req 8: Member 360 ──────────────────────────────────────────────────── */

export function getMember360(
  store: MemberDemoData,
  memberId: string,
  ctx: { savings: { id: string; product: string; balance: string }[]; loans: Member360['loans']; attendance: Member360['attendance']; insurance: Member360['insurance'] },
): Member360 {
  const m = findMember(store, memberId);
  return {
    profile: {
      id: m.id,
      member_number: m.memberNumber,
      full_name: m.fullName,
      full_name_bn: m.fullNameBn,
      father_or_husband_name: m.fatherOrHusbandName,
      mother_name: m.motherName,
      id_type: m.idType,
      id_number_masked: m.idNumberEnc ? maskIdNumber(safeDecrypt(m.idNumberEnc) ?? '') : '••••••',
      dob: m.dob,
      mobile_masked: maskMobile(m.mobile),
      address: m.address,
      occupation: m.occupation,
      monthly_household_income: m.monthlyHouseholdIncome,
      land_owned_decimals: m.landOwnedDecimals != null ? String(m.landOwnedDecimals) : null,
      family_members: m.familyMembers,
      photo_url: m.photoPath ? signedUrlFor(m.photoPath) : null,
      signature_url: m.signaturePath ? signedUrlFor(m.signaturePath) : null,
      branch_id: m.branchId,
      branch_code: m.branchCode,
      branch_name: m.branchCode === 'MYM01' ? 'ময়মনসিংহ শাখা' : 'ঢাকা শাখা',
      samity_name: m.samityName,
      working_area: m.workingAreaId ? { id: m.workingAreaId, village: m.village ?? '', village_bn: null } : null,
      status: m.lifecycle,
      status_reason_code: store.statusHistory.filter((c) => c.memberId === m.id).at(-1)?.reasonCode ?? null,
      status_changed_at: store.statusHistory.filter((c) => c.memberId === m.id).at(-1)?.changedAt ?? null,
      joined_on: m.joinedOn,
      passbook_no: m.passbookNo,
      nominees: m.nominees.map((n) => ({ name: n.name, relation: n.relation as never, sharePct: n.sharePct, phone: n.phone })),
      eligibility_flags: [],
    },
    savings: ctx.savings,
    loans: ctx.loans,
    attendance: ctx.attendance,
    insurance: ctx.insurance,
    notes: store.notes.filter((n) => n.memberId === m.id).map((n) => ({ id: n.id, note: n.note, author: n.author, created_at: n.createdAt })),
    statusHistory: store.statusHistory
      .filter((c) => c.memberId === m.id)
      .map((c) => ({ status: c.status, reason_code: c.reasonCode, changed_at: c.changedAt, changed_by: c.changedBy, note: c.note })),
    transfers: listTransfers(store, { memberId: m.id }).map((t) => ({
      id: t.id,
      member_id: t.memberId,
      member_number: t.memberNumber,
      from_branch_code: t.fromBranchCode,
      to_branch_code: t.toBranchCode,
      reason: t.reason,
      stage: t.stage,
      proposed_by: t.proposedBy,
      proposed_at: t.proposedAt,
      decided_by: t.decidedBy,
      decided_at: t.decidedAt,
    })),
  };
}

/** ── Req 8 (companion): member notes ───────────────────────────────────── */

export interface NoteRecord {
  id: string;
  memberId: string;
  note: string;
  author: string;
  createdAt: string;
}

export function addMemberNote(store: MemberDemoData, memberId: string, note: string, author: string): NoteRecord {
  findMember(store, memberId);
  const record: NoteRecord = { id: randomUUID(), memberId, note, author, createdAt: new Date().toISOString() };
  store.notes.push(record);
  return record;
}

/** ── Req 9: bulk import with per-row error report ───────────────────────── */

export interface BulkImportRowError {
  row: number;
  field?: string;
  message: string;
}

export interface BulkImportResult {
  received: number;
  created: number;
  duplicateSkipped: number;
  errors: BulkImportRowError[];
  members: { member_number: string; full_name: string }[];
}

/**
 * Validates every row through memberBulkRowSchema (shared), applies the
 * duplicate rule per row, fast-forwards the wizard, and reports each failing
 * row instead of failing the whole batch.
 */
export function bulkImportMembers(
  store: MemberDemoData,
  body: { branchCode?: string; rows: unknown[] },
  actor: { id: string },
): BulkImportResult {
  const result: BulkImportResult = { received: body.rows.length, created: 0, duplicateSkipped: 0, errors: [], members: [] };
  const adminActor = { id: actor.id, role: 'super_admin', permissions: ['member:approve', 'member:write', 'branch:manage'] };

  body.rows.forEach((raw, index) => {
    const rowNo = index + 1;
    const parsed = memberBulkRowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      result.errors.push({ row: rowNo, field: issue.path.join('.'), message: issue.message });
      return;
    }
    const row = parsed.data;

    const duplicates = duplicateCheck(store, { fullName: row.fullName, mobile: row.mobile, idNumber: row.idNumber });
    if (duplicates.blocked) {
      result.duplicateSkipped += 1;
      result.errors.push({ row: rowNo, message: 'duplicate — এই ব্যক্তির সদস্যপদ ইতিমধ্যে আছে / membership already exists' });
      return;
    }

    const branchId = row.branchCode.startsWith('MYM') ? BRANCH_MYMENSINGH : BRANCH_DHAKA;
    const workingAreaId = row.village.toLowerCase().includes('gazipur') ? AREA_GAZIPUR : AREA_BALIATI;
    try {
      const { admission } = createAdmission(store, {
        branchId,
        draft: {
          fullName: row.fullName,
          fullNameBn: row.fullNameBn || row.fullName,
          fatherOrHusbandName: row.fatherOrHusbandName,
          motherName: row.motherName,
          idType: row.idType,
          idNumber: row.idNumber,
          dob: row.dob,
          mobile: row.mobile,
          address: row.address || row.village,
          workingAreaId,
          samityName: row.samityName,
          occupation: row.occupation,
          monthlyHouseholdIncome: row.monthlyHouseholdIncome,
          landOwnedDecimals: row.landOwnedDecimals,
          familyMembers: row.familyMembers,
          nominees: [{ name: row.nomineeName, relation: row.nomineeRelation, sharePct: row.nomineeSharePct, phone: row.nomineePhone }],
        } as MemberDraft,
      }, actor);
      for (const stage of ADMISSION_STAGES) {
        advanceAdmission(store, admission.id, { stage, result: 'pass' }, adminActor);
      }
      const done = getAdmission(store, admission.id);
      result.created += 1;
      result.members.push({ member_number: done.memberNumber ?? '', full_name: row.fullName });
    } catch (err) {
      if (err instanceof MemberDemoError) {
        if (err.status === 409) {
          result.duplicateSkipped += 1;
          result.errors.push({ row: rowNo, message: err.message });
        } else {
          result.errors.push({ row: rowNo, message: err.message });
        }
      } else {
        result.errors.push({ row: rowNo, message: err instanceof Error ? err.message : 'unknown error' });
      }
    }
  });
  return result;
}
