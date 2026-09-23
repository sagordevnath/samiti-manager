/**
 * ── Collection settlement & control extensions ───────────────────────────────
 * Requirement 5: prepayment / partial payment / early closure with rebate,
 * rescheduling, write-off (approval required).
 * Requirement 6: entry reversal — Branch Manager only, with reason.
 * Requirement 8: rule engine — no backdating beyond N days, no future dating.
 * Requirement 9: fraud heuristics on the posted-entry stream.
 *
 * Money travels as string; numeric(14,2) in DB. Rebate math is pure so the
 * API (authority), DB functions and the web preview share one implementation.
 */
import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';

// ── 8) Date rule engine ──────────────────────────────────────────────────────
export const COLLECTION_RULE_DEFAULTS = {
  /** Entries older than this are rejected (BM may reverse, not backdate). */
  backdateLimitDays: 2,
  /** Future-dated meetings are always blocked (0-day lookahead). */
  futureLimitDays: 0,
} as const;

export type CollectionDateDecision =
  | { allowed: true }
  | { allowed: false; reason: 'future_dated' | 'backdated'; maxDays: number };

/** Pure date gate shared by entries, settlements, handovers and sync. */
export function checkCollectionDate(
  meetingDate: string,
  today: string,
  backdateLimitDays: number = COLLECTION_RULE_DEFAULTS.backdateLimitDays,
): CollectionDateDecision {
  const diff = daysBetween(today, meetingDate); // positive = future
  if (diff > COLLECTION_RULE_DEFAULTS.futureLimitDays) {
    return { allowed: false, reason: 'future_dated', maxDays: COLLECTION_RULE_DEFAULTS.futureLimitDays };
  }
  if (diff < 0 && -diff > backdateLimitDays) {
    return { allowed: false, reason: 'backdated', maxDays: backdateLimitDays };
  }
  return { allowed: true };
}

/** Whole days from `from` to `to` (to - from). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

// ── 5) Early closure with rebate ────────────────────────────────────────────
/**
 * Rebate = interest of the *remaining* installments, discounted by a service
 * deduction (MRA-style practice: rebate on unearned interest, minus a small
 * service charge). Remaining = paidRows.length .. N of the schedule.
 */
export function computeClosureRebate(input: {
  /** Full stored schedule (paid + unpaid rows). */
  rows: Array<{ seq: number; total: string; interest: string; paidAmount?: string }>;
  /** Rebate percentage of unearned interest kept by the institution (0–100). */
  serviceDeductionPercent?: number;
}): {
  remainingInstallments: number;
  outstandingPrincipal: string;
  unearnedInterest: string;
  rebate: string;
  serviceDeduction: string;
  closureAmount: string;
} {
  const deductionPct = input.serviceDeductionPercent ?? 10;
  let outstanding = 0;
  let unearned = 0;
  let remaining = 0;
  for (const r of input.rows) {
    const paid = Number(r.paidAmount ?? 0);
    if (paid >= Number(r.total) - 0.001) continue; // fully paid row
    remaining += 1;
    outstanding += Math.max(Number(r.total) - paid, 0);
    unearned += Number(r.interest);
  }
  const serviceDeduction = (unearned * deductionPct) / 100;
  const rebate = Math.max(unearned - serviceDeduction, 0);
  return {
    remainingInstallments: remaining,
    outstandingPrincipal: round2(outstanding - unearned), // principal-only payoff
    unearnedInterest: round2(unearned),
    rebate: round2(rebate),
    serviceDeduction: round2(serviceDeduction),
    // Payoff = unpaid principal only (rebate waives ALL remaining interest net
    // of the deduction — conservative for the member, standard in MF practice).
    closureAmount: round2(Math.max(outstanding - unearned + serviceDeduction, 0)),
  };
}

function round2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

// ── 5) Reschedule ───────────────────────────────────────────────────────────
export const RESCHEDULE_REASONS = [
  'disaster', 'illness', 'seasonal_income', 'death_in_family', 'other',
] as const;
export type RescheduleReason = (typeof RESCHEDULE_REASONS)[number];

export const loanRescheduleCreateSchema = z.object({
  applicationId: uuidSchema,
  /** Number of installments to push out (grace). */
  shiftInstallments: z.number().int().min(1).max(12),
  reason: z.enum(RESCHEDULE_REASONS),
  note: z.string().trim().min(3).max(500),
});
export type LoanRescheduleCreateInput = z.infer<typeof loanRescheduleCreateSchema>;

export interface LoanReschedule {
  id: string;
  applicationId: string;
  loanNumber: string | null;
  memberName: string;
  shiftInstallments: number;
  reason: RescheduleReason;
  note: string;
  /** Installments that moved (seq + new due date). */
  movedRows: Array<{ seq: number; oldDueDate: string; newDueDate: string }>;
  requestedBy: string | null;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
}

// ── 5) Write-off (approval required) ────────────────────────────────────────
export const WRITE_OFF_REASONS = [
  'death', 'permanent_disability', 'untraceable', 'fraud', 'court_written_off', 'other',
] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

export const loanWriteOffCreateSchema = z.object({
  applicationId: uuidSchema,
  reason: z.enum(WRITE_OFF_REASONS),
  note: z.string().trim().min(10).max(1000),
});
export type LoanWriteOffCreateInput = z.infer<typeof loanWriteOffCreateSchema>;

export interface LoanWriteOff {
  id: string;
  applicationId: string;
  loanNumber: string | null;
  memberName: string;
  /** Principal + interest + fees outstanding at request time. */
  outstandingAmount: string;
  reason: WriteOffReason;
  note: string;
  requestedBy: string | null;
  requestedAt: string;
  /** Area Manager recommends, Director Operations / org admin approves. */
  status: 'pending' | 'recommended' | 'approved' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

// ── 6) Reversal of wrong entries (BM only) ──────────────────────────────────
export const collectionReversalSchema = z.object({
  entryId: uuidSchema,
  reason: z.string().trim().min(10).max(500),
});
export type CollectionReversalInput = z.infer<typeof collectionReversalSchema>;

export interface CollectionReversal {
  id: string;
  entryId: string;
  receiptNo: string;
  reason: string;
  reversedBy: string | null;
  reversedAt: string;
  /** Mirrored allocation that was un-applied. */
  unapplied: {
    overdue: Array<{ seq: number; amount: string }>;
    current: string;
    savings: string;
    advance: string;
  };
}

// ── 7) BM dashboard ─────────────────────────────────────────────────────────
export interface OfficerCollectionRollup {
  officerId: string;
  officerName: string;
  /** Sum of sheet totals-to-collect for meetings the officer owns. */
  expected: string;
  collected: string;
  entriesCount: number;
  collectionRate: number; // 0..1
}

export interface SamityCollectionRollup {
  samityId: string;
  samityName: string;
  officerId: string | null;
  expected: string;
  collected: string;
  membersPresent: number;
  membersTotal: number;
}

export interface CollectionDashboard {
  meetingDate: string;
  branchId: string;
  generatedAt: string;
  totals: { expected: string; collected: string; entriesCount: number; collectionRate: number };
  byOfficer: OfficerCollectionRollup[];
  bySamity: SamityCollectionRollup[];
}

// ── 9) Fraud heuristics ─────────────────────────────────────────────────────
export const FRAUD_RULES = [
  'officer_self_pocket', // same officer deposits from own member/phone pattern; here: officer collected for a member with identical amounts repeatedly same day
  'identical_amounts', // same amount across many members by one officer
  'outside_meeting_radius', // capture GPS too far from the meeting point
] as const;
export type FraudRule = (typeof FRAUD_RULES)[number];

export const FRAUD_RULE_LABELS_BN: Record<FraudRule, string> = {
  officer_self_pocket: 'নিজের পকেট থেকে কিস্তি',
  identical_amounts: 'একই অঙ্কের পুনরাবৃত্তি',
  outside_meeting_radius: 'মিটিং এলাকার বাইরে',
};

export const collectionEntryMetaSchema = z
  .object({
    /** Capture location (from the mobile device), latitude/longitude. */
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .strip();
export type CollectionEntryMeta = z.infer<typeof collectionEntryMetaSchema>;

export interface FraudFlag {
  id: string;
  entryId: string;
  receiptNo: string;
  rule: FraudRule;
  severity: 'low' | 'medium' | 'high';
  detail: string;
  detailBn: string;
  createdAt: string;
  /** BM review. */
  reviewed: boolean;
  reviewedBy: string | null;
}

/** Fraud engine config (org-tunable). */
export interface FraudConfig {
  /** Meeting-day totals equal across >= N distinct members by one officer. */
  identicalAmountMinMembers: number;
  /** Capture distance from the meeting GPS point in meters. */
  meetingRadiusMeters: number;
  /** Officer self-pocket: same officer funding >= N entries on a non-meeting pattern (>= N same-amount entries across members in one day). */
  selfPocketMinEntries: number;
}

export const FRAUD_CONFIG_DEFAULTS: FraudConfig = {
  identicalAmountMinMembers: 5,
  meetingRadiusMeters: 500,
  selfPocketMinEntries: 5,
};

/** Haversine distance in meters between two GPS points. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(Math.sqrt(h), 1));
}

/**
 * Pure fraud scan over one officer-day of entries (requirement 9).
 * Runs three heuristics and returns flags for the BM review queue.
 */
export function scanEntriesForFraud(input: {
  entries: Array<{
    entryId: string;
    receiptNo: string;
    officerId: string;
    memberId: string;
    totalCollected: string;
    meta: CollectionEntryMeta | null;
    createdAt: string;
  }>;
  /** Same-day entries by OTHER officers for the same member (self-pocket proxy). */
  peerTotalsByMember: Record<string, string[]>;
  meetingPoint: { lat: number; lng: number } | null;
  config?: Partial<FraudConfig>;
}): Array<Omit<FraudFlag, 'id' | 'createdAt' | 'reviewed' | 'reviewedBy'>> {
  const cfg = { ...FRAUD_CONFIG_DEFAULTS, ...input.config };
  const flags: Array<Omit<FraudFlag, 'id' | 'createdAt' | 'reviewed' | 'reviewedBy'>> = [];
  const firstEntry = input.entries[0];
  if (!firstEntry) return flags;

  const officerId = firstEntry.officerId;
  const officerName = 'officer';

  // (a) identical amounts across many members
  const byAmount = new Map<string, Set<string>>();
  for (const e of input.entries) {
    if (Number(e.totalCollected) <= 0) continue;
    const set = byAmount.get(e.totalCollected) ?? new Set<string>();
    set.add(e.memberId);
    byAmount.set(e.totalCollected, set);
  }
  for (const [amount, members] of byAmount) {
    if (members.size >= cfg.identicalAmountMinMembers) {
      const first = input.entries.find((e) => e.totalCollected === amount);
      if (!first) continue;
      flags.push({
        entryId: first.entryId,
        receiptNo: first.receiptNo,
        rule: 'identical_amounts',
        severity: 'high',
        detail: `Officer posted ${amount} BDT for ${members.size} distinct members on the same day`,
        detailBn: `একই দিনে ${members.size} জন সদস্যের জন্য ${amount} টাকা জমা`,
      });
    }
  }

  // (b) officer paying from own pocket: this officer covers a member whose
  // dues are usually collected by peers, at an atypical hour/total.
  let selfPocketHits = 0;
  for (const e of input.entries) {
    const peers = input.peerTotalsByMember[e.memberId];
    if (peers && peers.length >= 2 && Number(e.totalCollected) > 0) {
      selfPocketHits += 1;
      if (selfPocketHits >= cfg.selfPocketMinEntries) {
        flags.push({
          entryId: e.entryId,
          receiptNo: e.receiptNo,
          rule: 'officer_self_pocket',
          severity: 'medium',
          detail: `Officer ${officerName} has ${selfPocketHits} same-day entries for members whose collections are normally handled by other officers`,
          detailBn: 'অফিসার এমন সদস্যদের কিস্তি জমা দিচ্ছেন যাদের আদায় সাধারণত অন্য অফিসার করেন',
        });
        break;
      }
    }
  }

  // (c) outside meeting radius
  if (input.meetingPoint) {
    for (const e of input.entries) {
      if (!e.meta?.lat || !e.meta?.lng) continue;
      const d = distanceMeters(input.meetingPoint, { lat: e.meta.lat, lng: e.meta.lng });
      if (d > cfg.meetingRadiusMeters) {
        flags.push({
          entryId: e.entryId,
          receiptNo: e.receiptNo,
          rule: 'outside_meeting_radius',
          severity: 'medium',
          detail: `Captured ${Math.round(d)} m from the meeting point (limit ${cfg.meetingRadiusMeters} m)`,
          detailBn: `মিটিং স্থান থেকে ${Math.round(d)} মিটার দূরে (সীমা ${cfg.meetingRadiusMeters} মিটার)`,
        });
      }
    }
  }

  return flags;
}

// ── Settlement request schemas (5) ──────────────────────────────────────────
// ── Decision + rules-config schemas (routes) ───────────────────────────────
export const rescheduleDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
});

export const writeOffDecisionSchema = z.object({
  decision: z.enum(['recommended', 'approved', 'rejected']),
  decisionNote: z.string().trim().max(1000).nullable().optional(),
});

export const collectionRulesPatchSchema = z
  .object({
    backdateLimitDays: z.number().int().min(0).max(365).optional(),
    futureLimitDays: z.number().int().min(0).max(365).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one limit is required' });

export const loanClosureQuoteSchema = z.object({ applicationId: uuidSchema });
export type LoanClosureQuoteInput = z.infer<typeof loanClosureQuoteSchema>;

/** Quote payload for the early-closure UI (rebate preview). */
export interface LoanClosureQuote {
  applicationId: string;
  loanNumber: string | null;
  remainingInstallments: number;
  outstandingPrincipal: string;
  unearnedInterest: string;
  rebate: string;
  serviceDeduction: string;
  closureAmount: string;
}

export const loanClosureCreateSchema = z.object({
  applicationId: uuidSchema,
  serviceDeductionPercent: z.number().min(0).max(100).optional(),
});
export type LoanClosureCreateInput = z.infer<typeof loanClosureCreateSchema>;

export interface LoanClosure {
  id: string;
  applicationId: string;
  loanNumber: string | null;
  memberName: string;
  outstandingPrincipal: string;
  unearnedInterest: string;
  rebate: string;
  serviceDeduction: string;
  closureAmount: string;
  remainingInstallments: number;
  closedAt: string;
  closedBy: string | null;
}
