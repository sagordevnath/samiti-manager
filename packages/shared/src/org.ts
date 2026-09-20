import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './schemas.js';

/**
 * ── Organization structure ──────────────────────────────────────────────────
 * Head Office → Zone → Area → Branch → Center/Samity/VO → Group.
 * Working areas are villages; a village belongs to at most one branch.
 */

/** ── Primitives ─────────────────────────────────────────────────────────── */
export const BRANCH_STATUSES = ['planned', 'active', 'closed'] as const;
export type BranchStatus = (typeof BRANCH_STATUSES)[number];

export const OPENING_STAGES = ['proposed', 'director_approved', 'checklist_done', 'activated', 'rejected'] as const;
export type OpeningStage = (typeof OPENING_STAGES)[number];

/** Stages that require a sign-off (activation is the final state). */
export type SignableStage = 'proposed' | 'director_approved' | 'checklist_done';

/** The actor roles that may sign each stage of a branch opening. */
export const OPENING_STAGE_ROLES: Record<SignableStage, readonly string[]> = {
  proposed: ['area_manager', 'org_admin', 'super_admin'],
  director_approved: ['org_admin', 'super_admin'],
  checklist_done: ['super_admin'],
};

/** Bilingual name — Bangla first (primary audience), English alongside. */
export const bilingualNameSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().min(2).max(120),
});
export type BilingualName = z.infer<typeof bilingualNameSchema>;

/** GPS point: lat ∈ [-90, 90], lng ∈ [-180, 180]. */
export const gpsPointSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type GpsPoint = z.infer<typeof gpsPointSchema>;

/** ── Zone / Area (management layers between Head Office and branches) ────── */
export const zoneCreateSchema = bilingualNameSchema.extend({
  code: z.string().trim().min(2).max(12).toUpperCase(),
});
export type ZoneCreateInput = z.infer<typeof zoneCreateSchema>;

export const areaCreateSchema = bilingualNameSchema.extend({
  code: z.string().trim().min(2).max(12).toUpperCase(),
  zoneId: uuidSchema,
});
export type AreaCreateInput = z.infer<typeof areaCreateSchema>;

/** ── Branch profile ──────────────────────────────────────────────────────── */
export const branchCreateSchema = bilingualNameSchema.extend({
  code: z.string().trim().min(2).max(12).toUpperCase(),
  areaId: uuidSchema,
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'তারিখ ফরম্যাট YYYY-MM-DD / Date must be YYYY-MM-DD'),
  address: z.string().trim().max(300).optional(),
  gps: gpsPointSchema.optional(),
  managerUserId: uuidSchema.optional(),
});
export type BranchCreateInput = z.infer<typeof branchCreateSchema>;

export const branchUpdateSchema = branchCreateSchema.partial().omit({ code: true }).extend({
  status: z.enum(BRANCH_STATUSES).optional(),
});
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

/** ── Branch opening workflow ─────────────────────────────────────────────── */
export const CHECKLIST_ITEMS = ['office_rent', 'staff_recruited', 'cash_limit_set'] as const;
export type ChecklistItem = (typeof CHECKLIST_ITEMS)[number];

export const branchOpeningCreateSchema = z.object({
  branchId: uuidSchema,
  proposalNote: z.string().trim().min(10).max(2000),
});
export type BranchOpeningCreateInput = z.infer<typeof branchOpeningCreateSchema>;

export const branchOpeningDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(2000).optional(),
});
export type BranchOpeningDecisionInput = z.infer<typeof branchOpeningDecisionSchema>;

export const branchChecklistSchema = z.object({
  items: z.array(z.object({ item: z.enum(CHECKLIST_ITEMS), done: z.boolean(), note: z.string().trim().max(500).optional() })).min(1),
});
export type BranchChecklistInput = z.infer<typeof branchChecklistSchema>;

/** ── Staff assignment (with history + transfer dates) ────────────────────── */
export const staffAssignmentCreateSchema = z.object({
  userId: uuidSchema,
  branchId: uuidSchema,
  /** Transfer date — the day the officer joins the new branch. */
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Optional overlap end for handover. */
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().trim().max(500).optional(),
});
export type StaffAssignmentCreateInput = z.infer<typeof staffAssignmentCreateSchema>;

/** ── Working areas (villages) + survey ───────────────────────────────────── */
export const workingAreaSurveySchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().max(120).optional(),
  division: z.string().trim().min(2).max(60),
  district: z.string().trim().min(2).max(60),
  upazila: z.string().trim().min(2).max(60),
  union: z.string().trim().max(60).optional(),
  village: z.string().trim().min(2).max(120),
  population: z.coerce.number().int().min(0).max(100_000),
  households: z.coerce.number().int().min(0).max(20_000),
  marketDays: z.string().trim().max(120).optional(),
  competitorMfis: z.coerce.number().int().min(0).max(50).default(0),
  /** Market potential 1–5 (5 = best). */
  potentialScore: z.coerce.number().int().min(1).max(5).default(3),
  gps: gpsPointSchema.optional(),
});
export type WorkingAreaSurveyInput = z.infer<typeof workingAreaSurveySchema>;

export const workingAreaAssignSchema = z.object({ branchId: uuidSchema });
export type WorkingAreaAssignInput = z.infer<typeof workingAreaAssignSchema>;

/** ── Geo CSV import (Bangladesh administrative hierarchy) ───────────────── */
export const geoCsvRowSchema = z.object({
  division: z.string().trim().min(1),
  district: z.string().trim().min(1),
  upazila: z.string().trim().min(1),
  union: z.string().trim().optional().default(''),
  village: z.string().trim().optional().default(''),
  divisionBn: z.string().trim().optional().default(''),
  districtBn: z.string().trim().optional().default(''),
  upazilaBn: z.string().trim().optional().default(''),
  unionBn: z.string().trim().optional().default(''),
  villageBn: z.string().trim().optional().default(''),
});
export type GeoCsvRow = z.infer<typeof geoCsvRowSchema>;

export const geoImportResultSchema = z.object({
  rows: z.number().int().min(0),
  workingAreasUpserted: z.number().int().min(0),
  skipped: z.number().int().min(0),
});
export type GeoImportResult = z.infer<typeof geoImportResultSchema>;

/** ── Tree view ───────────────────────────────────────────────────────────── */
export interface TreeNodeCounts {
  members: number;
  centers: number;
  outstandingLoans: string; // numeric(14,2) as string (BDT)
}

export interface OrgTreeNode {
  id: string;
  kind: 'organization' | 'zone' | 'area' | 'branch' | 'working_area';
  name: string;
  nameBn: string | null;
  code?: string;
  status?: BranchStatus;
  counts: TreeNodeCounts;
  children: OrgTreeNode[];
}

export const treeQuerySchema = paginationQuerySchema.omit({ page: true, pageSize: true });
export type OrgTree = OrgTreeNode;

/** ── Map view payloads ───────────────────────────────────────────────────── */
export interface BranchMapPoint {
  id: string;
  name: string;
  code: string;
  status: BranchStatus;
  lat: number;
  lng: number;
}

export interface VillageMapPoint {
  id: string;
  name: string;
  branchId: string | null;
  lat: number;
  lng: number;
  potentialScore: number;
}
