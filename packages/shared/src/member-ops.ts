/**
 * ── Member Management: maintenance requirements 5–9 ──────────────────────────
 * These engines were already in packages/shared/src/member.ts from the
 * foundation; this file re-exports them so the module surface stays explicit
 * and tests can import the full set from one place:
 *   req 5  eligibilityRulesSchema + evaluateEligibility (org-configurable)
 *   req 6  MEMBER_LIFECYCLE, MEMBER_REASON_CODES, LIFECYCLE_TRANSITIONS,
 *          memberStatusChangeSchema (reason codes + effectiveDate)
 *   req 7  memberTransferSchema + transferDecisionSchema
 *   req 9  memberSearchQuerySchema, memberBulkImportSchema (Excel/CSV rows)
 * New here: status-flow helper + the reason↔status pairing map used by the
 * status-change UI.
 */

// ── Re-exports (reqs 5–9 engines) ────────────────────────────────────────────
export {
  ADMISSION_STAGES,
  ADMISSION_STAGE_PERMISSION,
  ADMISSION_GATE_STAGES,
  MEMBER_LIFECYCLE,
  MEMBER_REASON_CODES,
  LIFECYCLE_TRANSITIONS,
  LIVE_MEMBER_STATUSES,
  eligibilityRulesSchema,
  evaluateEligibility,
  memberStatusChangeSchema,
  memberTransferSchema,
  transferDecisionSchema,
  memberSearchQuerySchema,
  memberBulkImportSchema,
  memberBulkRowSchema,
  nomineesSchema,
  memberDraftSchema,
  memberDraftPatchSchema,
  admissionCreateSchema,
  admissionStageActionSchema,
  duplicateCheckQuerySchema,
  checkDuplicateMembership,
  nextAdmissionStage,
  isAdmissionStage,
  type AdmissionStage,
  type AdmissionView,
  type MemberLifecycle,
  type MemberReasonCode,
  type EligibilityRules,
  type MemberDraft,
  type MemberDraftPatch,
  type MemberStatusChange,
  type MemberTransferInput,
  type TransferDecision,
  type MemberTransferView,
  type MemberSearchQuery,
  type MemberListRow,
  type MemberBulkImportInput,
  type MemberBulkRow,
  type MemberBulkImportResult,
  type DuplicateCheckResult,
  type DuplicateMatch,
  type Member360,
  type MemberNote,
} from './member.js';

import { z } from 'zod';
import { MEMBER_LIFECYCLE, MEMBER_REASON_CODES, LIFECYCLE_TRANSITIONS, type MemberLifecycle, type MemberReasonCode } from './member.js';

/**
 * Which reason codes pair with which target status (req 6). Drives the
 * status-change dropdown so the UI can never post a mismatched pair, and is
 * the server-side reference for the schema's refine rule.
 */
export const STATUS_REASON_CODES: Record<MemberLifecycle, readonly MemberReasonCode[]> = {
  pending: ['new_admission', 'rejoined'],
  active: ['new_admission', 'rejoined'],
  dormant: ['inactivity'],
  dropout: MEMBER_REASON_CODES.filter((c) => c !== 'death' && c !== 'transfer_out'),
  transferred: ['transfer_out'],
  deceased: ['death'],
};

/** Check a lifecycle transition against the allowed map (req 6). */
export function canTransitionMemberStatus(from: MemberLifecycle, to: MemberLifecycle): boolean {
  return from !== to && LIFECYCLE_TRANSITIONS[from].includes(to);
}

/** Zod schema for the status-change query the UI builds from STATUS_REASON_CODES. */
export const statusChangeRequestSchema = z.object({
  status: z.enum(MEMBER_LIFECYCLE),
  reasonCode: z.enum(MEMBER_REASON_CODES),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional(),
});

/** Terminal statuses: no further transitions and they leave the live roster. */
export const TERMINAL_MEMBER_STATUSES: readonly MemberLifecycle[] = ['deceased'];

/** Statuses that may still hold a passbook / appear on collection sheets. */
export const COLLECTION_ELIGIBLE_STATUSES: readonly MemberLifecycle[] = ['active', 'dormant'];
