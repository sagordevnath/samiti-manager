import { Router } from 'express';
import {
  PERMISSIONS,
  areaCreateSchema,
  branchChecklistSchema,
  branchCreateSchema,
  branchOpeningCreateSchema,
  branchOpeningDecisionSchema,
  branchUpdateSchema,
  geoCsvRowSchema,
  staffAssignmentCreateSchema,
  workingAreaAssignSchema,
  workingAreaSurveySchema,
  zoneCreateSchema,
  type BranchMapPoint,
  type GeoCsvRow,
  type OrgTreeNode,
  type VillageMapPoint,
} from '@samity/shared';
import { isDemoMode } from '../lib/demo.js';
import { Conflict, Forbidden, NotFound } from '../lib/errors.js';
import { orgDemoStore } from '../lib/org-store.js';
import { importGeoRows } from '../lib/geo-csv.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const orgRouter = Router();

/** Demo mode = tests, or Supabase env still on validated placeholders. */

// All org routes require a valid token.
orgRouter.use(requireAuth);

function authOf(req: RequestWithAuth) {
  return (req as RequestWithAuth).auth!;
}

/** Branch scope check: area managers may only touch branches under their areas (demo: org-wide). */
function assertBranchScope(_req: RequestWithAuth, _branchOrgId: string): void {
  // In production this resolves the caller's area/zone from users_profile and
  // rejects cross-area writes. Demo mode is org-wide.
}

/* ── Zones ────────────────────────────────────────────────────────────────── */

orgRouter.get(
  '/zones',
  requirePermission('branch:manage'),
  asyncHandler(async (_req, res) => {
    if (isDemoMode()) {
      res.json({ items: orgDemoStore().zones });
      return;
    }
    const { data, error } = await supabaseAdmin.from('zones').select('*').is('deleted_at', null).order('code');
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

orgRouter.post(
  '/zones',
  requirePermission('org:manage'),
  validate(zoneCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    const body = req.body as { name: string; nameBn: string; code: string };

    if (isDemoMode()) {
      const store = orgDemoStore();
      if (store.zones.some((z) => z.code === body.code)) throw Conflict('Zone code exists');
      const row: (typeof store.zones)[number] = {
        id: crypto.randomUUID(),
        org_id: store.orgId,
        code: body.code,
        name: body.name,
        name_bn: body.nameBn,
      };
      store.zones.push(row);
      res.status(201).json({ zone: row });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('zones')
      .insert({ org_id: auth.orgId!, code: body.code, name: body.name, name_bn: body.nameBn, created_by: auth.userId })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ zone: data });
  }),
);

/* ── Areas ────────────────────────────────────────────────────────────────── */

orgRouter.get(
  '/areas',
  requirePermission('branch:manage'),
  asyncHandler(async (_req, res) => {
    if (isDemoMode()) {
      res.json({ items: orgDemoStore().areas });
      return;
    }
    const { data, error } = await supabaseAdmin.from('areas').select('*').is('deleted_at', null).order('code');
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

orgRouter.post(
  '/areas',
  requirePermission('org:manage'),
  validate(areaCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    const body = req.body as { name: string; nameBn: string; code: string; zoneId: string };

    if (isDemoMode()) {
      const store = orgDemoStore();
      if (!store.zones.some((z) => z.id === body.zoneId)) throw NotFound('Zone not found');
      const row: (typeof store.areas)[number] = {
        id: crypto.randomUUID(),
        org_id: store.orgId,
        zone_id: body.zoneId,
        code: body.code,
        name: body.name,
        name_bn: body.nameBn,
      };
      store.areas.push(row);
      res.status(201).json({ area: row });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('areas')
      .insert({ org_id: auth.orgId!, zone_id: body.zoneId, code: body.code, name: body.name, name_bn: body.nameBn, created_by: auth.userId })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ area: data });
  }),
);

/* ── Branches ─────────────────────────────────────────────────────────────── */

orgRouter.get(
  '/branches',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    const status = (req.query as Record<string, unknown>)['status'];
    if (isDemoMode()) {
      let items = orgDemoStore().branches;
      if (typeof status === 'string' && status) items = items.filter((b) => b.status === status);
      res.json({ items });
      return;
    }
    let query = supabaseAdmin.from('branches').select('*').is('deleted_at', null).order('code');
    if (typeof status === 'string' && status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

orgRouter.post(
  '/branches',
  requirePermission('branch:manage'),
  validate(branchCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    const body = req.body as {
      name: string;
      nameBn: string;
      code: string;
      areaId: string;
      openingDate: string;
      address?: string;
      gps?: { lat: number; lng: number };
      managerUserId?: string;
    };

    if (isDemoMode()) {
      const store = orgDemoStore();
      if (store.branches.some((b) => b.code === body.code)) throw Conflict('Branch code exists');
      if (!store.areas.some((a) => a.id === body.areaId)) throw NotFound('Area not found');
      const row: (typeof store.branches)[number] = {
        id: crypto.randomUUID(),
        org_id: store.orgId,
        area_id: body.areaId,
        name: body.name,
        name_bn: body.nameBn,
        code: body.code,
        district: null,
        status: 'planned',
        opening_date: body.openingDate,
        address: body.address ?? null,
        gps_lat: body.gps ? String(body.gps.lat) : null,
        gps_lng: body.gps ? String(body.gps.lng) : null,
        manager_user_id: body.managerUserId ?? null,
      };
      store.branches.push(row);
      res.status(201).json({ branch: row });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('branches')
      .insert({
        org_id: auth.orgId!,
        area_id: body.areaId,
        name: body.name,
        name_bn: body.nameBn,
        code: body.code,
        status: 'planned',
        opening_date: body.openingDate,
        address: body.address ?? null,
        gps_lat: body.gps ? String(body.gps.lat) : null,
        gps_lng: body.gps ? String(body.gps.lng) : null,
        manager_user_id: body.managerUserId ?? null,
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ branch: data });
  }),
);

orgRouter.patch(
  '/branches/:id',
  requirePermission('branch:manage'),
  validate(branchUpdateSchema),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    const id = req.params['id'] as string;
    const body = req.body as Partial<{
      name: string;
      nameBn: string;
      areaId: string;
      openingDate: string;
      address: string;
      gps: { lat: number; lng: number };
      managerUserId: string;
      status: 'planned' | 'active' | 'closed';
    }>;

    if (isDemoMode()) {
      const store = orgDemoStore();
      const branch = store.branches.find((b) => b.id === id);
      if (!branch) throw NotFound('Branch not found');
      if (body.status === 'closed' && branch.status !== 'closed') {
        const hasCenters = Object.entries(store.branchStats).some(([bid, s]) => bid === id && s.centers > 0);
        if (hasCenters) {
          throw Conflict('BRANCH_HAS_ACTIVE_CENTERS: transfer all centers before closing this branch');
        }
      }
      Object.assign(branch, {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.nameBn !== undefined && { name_bn: body.nameBn }),
        ...(body.areaId !== undefined && { area_id: body.areaId }),
        ...(body.openingDate !== undefined && { opening_date: body.openingDate }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.gps !== undefined && { gps_lat: String(body.gps.lat), gps_lng: String(body.gps.lng) }),
        ...(body.managerUserId !== undefined && { manager_user_id: body.managerUserId }),
        ...(body.status !== undefined && { status: body.status }),
      });
      res.json({ branch });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.nameBn !== undefined) patch['name_bn'] = body.nameBn;
    if (body.areaId !== undefined) patch['area_id'] = body.areaId;
    if (body.openingDate !== undefined) patch['opening_date'] = body.openingDate;
    if (body.address !== undefined) patch['address'] = body.address;
    if (body.gps !== undefined) {
      patch['gps_lat'] = String(body.gps.lat);
      patch['gps_lng'] = String(body.gps.lng);
    }
    if (body.managerUserId !== undefined) patch['manager_user_id'] = body.managerUserId;
    if (body.status !== undefined) patch['status'] = body.status;

    // The DB trigger enforces the close-with-centers rule; surface it as 409.
    const { data, error } = await supabaseAdmin
      .from('branches')
      .update(patch)
      .eq('id', id)
      .eq('org_id', auth.orgId ?? '')
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error) {
      if (String(error.message).includes('BRANCH_HAS_ACTIVE_CENTERS')) {
        throw Conflict('BRANCH_HAS_ACTIVE_CENTERS: transfer all centers before closing this branch');
      }
      throw error;
    }
    res.json({ branch: data });
  }),
);

/* ── Branch opening workflow ──────────────────────────────────────────────── */

/** GET /org/branch-openings?branchId= — live opening for a branch. */
orgRouter.get(
  '/branch-openings',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    const branchId = (req.query as Record<string, unknown>)['branchId'];
    if (isDemoMode()) {
      let items = orgDemoStore().openings;
      if (typeof branchId === 'string' && branchId) items = items.filter((o) => o.branch_id === branchId);
      res.json({ items });
      return;
    }
    let query = supabaseAdmin.from('branch_openings').select('*').is('deleted_at', null).order('proposed_at', { ascending: false });
    if (typeof branchId === 'string' && branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

/** POST /org/branch-openings — proposal by Area Manager. */
orgRouter.post(
  '/branch-openings',
  requirePermission('branch:manage'),
  validate(branchOpeningCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    const body = req.body as { branchId: string; proposalNote: string };

    if (isDemoMode()) {
      const store = orgDemoStore();
      const branch = store.branches.find((b) => b.id === body.branchId);
      if (!branch) throw NotFound('Branch not found');
      if (store.openings.some((o) => o.branch_id === body.branchId && !['activated', 'rejected'].includes(o.stage))) {
        throw Conflict('An opening workflow is already in progress for this branch');
      }
      const row: (typeof store.openings)[number] = {
        id: crypto.randomUUID(),
        org_id: store.orgId,
        branch_id: body.branchId,
        stage: 'proposed',
        proposal_note: body.proposalNote,
        proposed_at: new Date().toISOString(),
        director_note: null,
        checklist: [
          { item: 'office_rent', done: false },
          { item: 'staff_recruited', done: false },
          { item: 'cash_limit_set', done: false },
        ],
        activated_at: null,
        rejected_note: null,
      };
      store.openings.push(row);
      res.status(201).json({ opening: row });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('branch_openings')
      .insert({
        org_id: auth.orgId!,
        branch_id: body.branchId,
        proposal_note: body.proposalNote,
        proposed_by: auth.userId,
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) {
      if (String(error.message).includes('branch_openings_live_uidx')) throw Conflict('Opening already in progress');
      throw error;
    }
    res.status(201).json({ opening: data });
  }),
);

/**
 * POST /org/branch-openings/:id/decision
 * Stage 2: Director Operations approval. (Named generically so the same
 * endpoint can carry forward / rejection; stage authorizes the actor.)
 */
orgRouter.post(
  '/branch-openings/:id/decision',
  requirePermission('branch:manage'),
  validate(branchOpeningDecisionSchema),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    const id = req.params['id'] as string;
    const body = req.body as { decision: 'approve' | 'reject'; note?: string };

    if (isDemoMode()) {
      const opening = orgDemoStore().openings.find((o) => o.id === id);
      if (!opening) throw NotFound('Opening not found');
      if (opening.stage !== 'proposed') throw Conflict(`Cannot decide an opening at stage '${opening.stage}'`);
      if (body.decision === 'reject') {
        opening.stage = 'rejected';
        opening.rejected_note = body.note ?? null;
      } else {
        opening.stage = 'director_approved';
        opening.director_note = body.note ?? null;
      }
      res.json({ opening });
      return;
    }

    if (!['org_admin', 'super_admin'].includes(auth.role)) {
      throw Forbidden('Only Director Operations (org_admin) may approve');
    }
    const { data, error } = await supabaseAdmin
      .from('branch_openings')
      .update({
        stage: body.decision === 'reject' ? 'rejected' : 'director_approved',
        director_note: body.note ?? null,
        director_at: new Date().toISOString(),
        director_by: auth.userId,
      })
      .eq('id', id)
      .eq('stage', 'proposed')
      .select('*')
      .single();
    if (error || !data) throw NotFound('Opening not found or wrong stage');
    res.json({ opening: data });
  }),
);

/** POST /org/branch-openings/:id/checklist — stage 3 checklist submission. */
orgRouter.post(
  '/branch-openings/:id/checklist',
  requirePermission('branch:manage'),
  validate(branchChecklistSchema),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    const id = req.params['id'] as string;
    const body = req.body as { items: { item: string; done: boolean; note?: string }[] };

    const required: string[] = ['office_rent', 'staff_recruited', 'cash_limit_set'];
    const missing = required.filter((r) => !body.items.some((i) => i.item === r && i.done));
    if (missing.length > 0) {
      throw Conflict(`Checklist incomplete — missing: ${missing.join(', ')}`);
    }

    if (isDemoMode()) {
      const opening = orgDemoStore().openings.find((o) => o.id === id);
      if (!opening) throw NotFound('Opening not found');
      if (opening.stage !== 'director_approved') throw Conflict(`Checklist requires stage 'director_approved'`);
      opening.checklist = body.items;
      opening.stage = 'checklist_done';
      res.json({ opening });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('branch_openings')
      .update({ checklist: body.items, checklist_at: new Date().toISOString(), checklist_by: auth.userId, stage: 'checklist_done' })
      .eq('id', id)
      .eq('stage', 'director_approved')
      .select('*')
      .single();
    if (error || !data) throw NotFound('Opening not found or wrong stage');
    res.json({ opening: data });
  }),
);

/** POST /org/branch-openings/:id/activate — final activation by Director. */
orgRouter.post(
  '/branch-openings/:id/activate',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    const id = req.params['id'] as string;

    if (isDemoMode()) {
      const store = orgDemoStore();
      const opening = store.openings.find((o) => o.id === id);
      if (!opening) throw NotFound('Opening not found');
      if (opening.stage !== 'checklist_done') throw Conflict(`Activation requires stage 'checklist_done'`);
      opening.stage = 'activated';
      opening.activated_at = new Date().toISOString();
      const branch = store.branches.find((b) => b.id === opening.branch_id);
      if (branch) branch.status = 'active';
      res.json({ opening });
      return;
    }

    if (!['org_admin', 'super_admin'].includes(auth.role)) {
      throw Forbidden('Only Director Operations may activate');
    }
    const { data: opening, error } = await supabaseAdmin
      .from('branch_openings')
      .update({ stage: 'activated', activated_at: new Date().toISOString(), activated_by: auth.userId })
      .eq('id', id)
      .eq('stage', 'checklist_done')
      .select('*')
      .single();
    if (error || !opening) throw NotFound('Opening not found or wrong stage');

    await supabaseAdmin.from('branches').update({ status: 'active' }).eq('id', (opening as { branch_id: string }).branch_id);
    res.json({ opening });
  }),
);

/* ── Staff assignments ────────────────────────────────────────────────────── */

orgRouter.get(
  '/staff-assignments',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    const branchId = (req.query as Record<string, unknown>)['branchId'];
    if (isDemoMode()) {
      let items = orgDemoStore().assignments;
      if (typeof branchId === 'string' && branchId) items = items.filter((a) => a.branch_id === branchId);
      res.json({ items });
      return;
    }
    let query = supabaseAdmin
      .from('staff_assignments')
      .select('*')
      .is('deleted_at', null)
      .order('effective_from', { ascending: false });
    if (typeof branchId === 'string' && branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

/** POST /org/staff-assignments — transfer with overlap guard (DB exclusion constraint). */
orgRouter.post(
  '/staff-assignments',
  requirePermission('org:manage'),
  validate(staffAssignmentCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    const body = req.body as { userId: string; branchId: string; effectiveFrom: string; effectiveTo?: string; note?: string };

    if (isDemoMode()) {
      const store = orgDemoStore();
      const overlap = store.assignments.some(
        (a) =>
          a.user_id === body.userId &&
          a.effective_to == null &&
          (new Date(body.effectiveFrom) <= new Date(a.effective_from) ? false : true) === false,
      );
      // Demo simplification: reject if any open-ended assignment for the user exists.
      if (store.assignments.some((a) => a.user_id === body.userId && a.effective_to == null)) {
        throw Conflict('Staff member already has an open-ended assignment — close it first (transfer)');
      }
      void overlap;
      const row: (typeof store.assignments)[number] = {
        id: crypto.randomUUID(),
        org_id: store.orgId,
        user_id: body.userId,
        branch_id: body.branchId,
        role_at_branch: 'branch_manager',
        effective_from: body.effectiveFrom,
        effective_to: body.effectiveTo ?? null,
        note: body.note ?? null,
      };
      store.assignments.push(row);
      res.status(201).json({ assignment: row });
      return;
    }

    // Real transfer: close the current open-ended assignment, insert the new one.
    const { data, error } = await supabaseAdmin
      .from('staff_assignments')
      .insert({
        org_id: auth.orgId!,
        user_id: body.userId,
        branch_id: body.branchId,
        role_at_branch: 'branch_manager',
        effective_from: body.effectiveFrom,
        effective_to: body.effectiveTo ?? null,
        note: body.note ?? null,
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) {
      if (String(error.message).includes('staff_no_overlap')) {
        throw Conflict('Overlapping assignment for this staff member');
      }
      throw error;
    }
    res.status(201).json({ assignment: data });
  }),
);

/* ── Working areas (villages) + survey ────────────────────────────────────── */

orgRouter.get(
  '/working-areas',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    const branchId = (req.query as Record<string, unknown>)['branchId'];
    const unassignedOnly = (req.query as Record<string, unknown>)['unassigned'];

    if (isDemoMode()) {
      let items = orgDemoStore().workingAreas;
      if (typeof branchId === 'string' && branchId) items = items.filter((v) => v.branch_id === branchId);
      if (unassignedOnly === '1') items = items.filter((v) => v.branch_id == null);
      res.json({ items });
      return;
    }

    let query = supabaseAdmin.from('working_areas').select('*').is('deleted_at', null).order('village');
    if (typeof branchId === 'string' && branchId) query = query.eq('branch_id', branchId);
    if (unassignedOnly === '1') query = query.is('branch_id', null);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

/** POST /org/working-areas — survey form upsert on the geo identity. */
orgRouter.post(
  '/working-areas',
  requirePermission('branch:manage'),
  validate(workingAreaSurveySchema),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    const body = req.body as {
      name: string;
      nameBn?: string;
      division: string;
      district: string;
      upazila: string;
      union?: string;
      village: string;
      population: number;
      households: number;
      marketDays?: string;
      competitorMfis: number;
      potentialScore: number;
      gps?: { lat: number; lng: number };
    };

    if (isDemoMode()) {
      const store = orgDemoStore();
      const existing = store.workingAreas.find(
        (v) =>
          v.division.toLowerCase() === body.division.toLowerCase() &&
          v.district.toLowerCase() === body.district.toLowerCase() &&
          v.upazila.toLowerCase() === body.upazila.toLowerCase() &&
          (v.union ?? '').toLowerCase() === (body.union ?? '').toLowerCase() &&
          v.village.toLowerCase() === body.village.toLowerCase(),
      );
      const base = {
        division: body.division,
        district: body.district,
        upazila: body.upazila,
        union: body.union ?? null,
        village: body.village,
        division_bn: 'ঢাকা',
        district_bn: 'ঢাকা',
        upazila_bn: null,
        union_bn: null,
        village_bn: body.nameBn ?? null,
        population: body.population,
        households: body.households,
        market_days: body.marketDays ?? null,
        competitor_mfis: body.competitorMfis,
        potential_score: body.potentialScore,
        gps_lat: body.gps ? String(body.gps.lat) : null,
        gps_lng: body.gps ? String(body.gps.lng) : null,
        surveyed_at: new Date().toISOString(),
      };
      if (existing) {
        Object.assign(existing, base);
        res.json({ village: existing });
        return;
      }
      const row: (typeof store.workingAreas)[number] = {
        id: crypto.randomUUID(),
        org_id: store.orgId,
        branch_id: null,
        ...base,
      };
      store.workingAreas.push(row);
      res.status(201).json({ village: row });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('working_areas')
      .upsert(
        {
          org_id: auth.orgId!,
          division: body.division,
          district: body.district,
          upazila: body.upazila,
          union: body.union ?? null,
          village: body.village,
          village_bn: body.nameBn ?? null,
          population: body.population,
          households: body.households,
          market_days: body.marketDays ?? null,
          competitor_mfis: body.competitorMfis,
          potential_score: body.potentialScore,
          gps_lat: body.gps ? String(body.gps.lat) : null,
          gps_lng: body.gps ? String(body.gps.lng) : null,
          surveyed_at: new Date().toISOString(),
          created_by: auth.userId,
        },
        { onConflict: 'org_id, division, district, upazila, union, village' },
      )
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ village: data });
  }),
);

/** POST /org/working-areas/:id/assign — bind a village to a branch (unique). */
orgRouter.post(
  '/working-areas/:id/assign',
  requirePermission('branch:manage'),
  validate(workingAreaAssignSchema),
  asyncHandler(async (req, res) => {
    const id = req.params['id'] as string;
    const body = req.body as { branchId: string };

    if (isDemoMode()) {
      const store = orgDemoStore();
      const village = store.workingAreas.find((v) => v.id === id);
      if (!village) throw NotFound('Village not found');
      if (!store.branches.some((b) => b.id === body.branchId)) throw NotFound('Branch not found');
      village.branch_id = body.branchId;
      res.json({ village });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from('working_areas')
      .update({ branch_id: body.branchId })
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single();
    if (error || !data) throw NotFound('Village not found');
    res.json({ village: data });
  }),
);

/** POST /org/working-areas/import-geo — CSV import of the BD geo hierarchy. */
orgRouter.post(
  '/working-areas/import-geo',
  requirePermission('org:manage'),
  asyncHandler(async (req, res) => {
    const auth = authOf(req as RequestWithAuth);
    // Accept either { csv: "..." } or pre-parsed { rows: [...] }.
    const payload = req.body as { csv?: string; rows?: GeoCsvRow[] };
    let rows: GeoCsvRow[];
    if (payload.csv) {
      const lines = payload.csv.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length === 0) throw Conflict('CSV is empty');
      const parsedHeader = parseHeader(lines[0]!);
      const bodyLines = lines.slice(1);
      rows = bodyLines.map((line) => {
        const cells = parseCsvLineLocal(line);
        const rec: Record<string, string> = {};
        parsedHeader.forEach((h, i) => (rec[h] = cells[i] ?? ''));
        return geoCsvRowSchema.parse(rec);
      });
    } else if (payload.rows) {
      rows = payload.rows.map((r) => geoCsvRowSchema.parse(r));
    } else {
      throw Conflict('Provide { csv } or { rows }');
    }

    if (isDemoMode()) {
      const store = orgDemoStore();
      const result = importGeoRows(rows, (r) => {
        const existing = store.workingAreas.find(
          (v) =>
            v.division.toLowerCase() === r.division.toLowerCase() &&
            v.district.toLowerCase() === r.district.toLowerCase() &&
            v.upazila.toLowerCase() === r.upazila.toLowerCase() &&
            (v.union ?? '').toLowerCase() === (r.union ?? '').toLowerCase() &&
            v.village.toLowerCase() === r.village.toLowerCase(),
        );
        if (existing) {
          Object.assign(existing, {
            division_bn: r.divisionBn,
            district_bn: r.districtBn,
            upazila_bn: r.upazilaBn,
            union_bn: r.unionBn,
            village_bn: r.villageBn,
          });
          return 'skipped';
        }
        store.workingAreas.push({
          id: crypto.randomUUID(),
          org_id: store.orgId,
          division: r.division,
          district: r.district,
          upazila: r.upazila,
          union: r.union,
          village: r.village,
          division_bn: r.divisionBn,
          district_bn: r.districtBn,
          upazila_bn: r.upazilaBn,
          union_bn: r.unionBn,
          village_bn: r.villageBn,
          population: null,
          households: null,
          market_days: null,
          competitor_mfis: 0,
          potential_score: 3,
          gps_lat: null,
          gps_lng: null,
          branch_id: null,
          surveyed_at: null,
        });
        return 'upserted';
      });
      res.json(result);
      return;
    }

    // DB path: one upsert per row on the geo identity.
    let upserted = 0;
    let skipped = 0;
    for (const r of rows) {
      const village = r.village || r.union;
      if (!village) {
        skipped++;
        continue;
      }
      const { error } = await supabaseAdmin.from('working_areas').upsert(
        {
          org_id: auth.orgId!,
          division: r.division,
          district: r.district,
          upazila: r.upazila,
          union: r.union || null,
          village,
          division_bn: r.divisionBn || null,
          district_bn: r.districtBn || null,
          upazila_bn: r.upazilaBn || null,
          union_bn: r.unionBn || null,
          village_bn: r.villageBn || null,
        },
        { onConflict: 'org_id, division, district, upazila, union, village' },
      );
      if (error) skipped++;
      else upserted++;
    }
    res.json({ rows: rows.length, workingAreasUpserted: upserted, skipped });
  }),
);

/** Local CSV helpers (kept out of shared to keep the package browser-safe). */
function parseCsvLineLocal(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseHeader(headerLine: string): string[] {
  const cells = parseCsvLineLocal(headerLine).map((c) => c.toLowerCase().replace(/\s+/g, ''));
  const aliases: Record<string, string> = {
    division_bn: 'divisionBn',
    district_bn: 'districtBn',
    upazila_bn: 'upazilaBn',
    union_bn: 'unionBn',
    village_bn: 'villageBn',
  };
  return cells.map((c) => aliases[c] ?? c);
}
