import { Router } from 'express';
import type { BranchMapPoint, OrgTreeNode, VillageMapPoint } from '@samity/shared';
import { isDemoMode } from '../lib/demo.js';
import { orgDemoStore } from '../lib/org-store.js';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { supabaseAdmin } from '../lib/supabase.js';

export const treeRouter = Router();

treeRouter.use(requireAuth);


const zero = { members: 0, centers: 0, groups: 0, outstandingLoans: '0.00' };
const add = (
  a: { members: number; centers: number; groups?: number; outstandingLoans: string },
  b: { members: number; centers: number; groups?: number; outstandingLoans: string },
) => ({
  members: a.members + b.members,
  centers: a.centers + b.centers,
  groups: (a.groups ?? 0) + (b.groups ?? 0),
  outstandingLoans: (Number(a.outstandingLoans) + Number(b.outstandingLoans)).toFixed(2),
});

/**
 * GET /api/v1/org/tree — full hierarchy with member/center/outstanding counts
 * rolled up: Organization → Zone → Area → Branch → Working area (village).
 * Centers/Groups live under branches (samities); villages show as leaf nodes.
 */
treeRouter.get(
  '/tree',
  requirePermission('branch:manage'),
  asyncHandler(async (_req, res) => {
    if (isDemoMode()) {
      const store = orgDemoStore();
      const statsOf = (branchId: string) => store.branchStats[branchId] ?? { ...zero };

      const branchNodes: OrgTreeNode[] = store.branches.map((b) => {
        const s = statsOf(b.id);
        const villages = store.workingAreas.filter((v) => v.branch_id === b.id);
        const samities = store.samities.filter((c) => c.branch_id === b.id);
        // Member split across the branch's centers (demo data has no per-center
        // roster, so the branch roster is divided evenly for display).
        const perCenter = samities.length > 0 ? Math.round(s.members / samities.length) : 0;
        return {
          id: b.id,
          kind: 'branch' as const,
          name: b.name,
          nameBn: b.name_bn,
          code: b.code,
          status: b.status,
          counts: s,
          children: [
            ...samities.map((c) => ({
              id: c.id,
              kind: 'samity' as const,
              name: c.name,
              nameBn: c.name_bn,
              code: c.code,
              counts: { members: perCenter, centers: 0, groups: 0, outstandingLoans: '0.00' },
              children: [],
            })),
            ...villages.map((v) => ({
              id: v.id,
              kind: 'working_area' as const,
              name: v.village,
              nameBn: v.village_bn,
              counts: { members: 0, centers: 0, groups: 0, outstandingLoans: '0.00' },
              children: [],
            })),
          ],
        };
      });

      const areaNodes: OrgTreeNode[] = store.areas.map((a) => {
        const children = branchNodes.filter((bn) => store.branches.find((b) => b.id === bn.id)?.area_id === a.id);
        return {
          id: a.id,
          kind: 'area' as const,
          name: a.name,
          nameBn: a.name_bn,
          counts: children.reduce((acc, c) => add(acc, c.counts), { ...zero }),
          children,
        };
      });

      const zoneNodes: OrgTreeNode[] = store.zones.map((z) => {
        const children = areaNodes.filter((an) => store.areas.find((a) => a.id === an.id)?.zone_id === z.id);
        return {
          id: z.id,
          kind: 'zone' as const,
          name: z.name,
          nameBn: z.name_bn,
          counts: children.reduce((acc, c) => add(acc, c.counts), { ...zero }),
          children,
        };
      });

      const tree: OrgTreeNode = {
        id: store.orgId,
        kind: 'organization',
        name: 'Samity Manager Demo Organization',
        nameBn: 'স্যামিটি ম্যানেজার ডেমো সংস্থা',
        counts: zoneNodes.reduce((acc, z) => add(acc, z.counts), { ...zero }),
        children: zoneNodes,
      };

      res.json({ tree });
      return;
    }

    // ── DB path ──────────────────────────────────────────────────────────────
    const [zones, areas, branches, villageRows, samityRows, groupRows, memberAgg, loanAgg] = await Promise.all([
      supabaseAdmin.from('zones').select('id, name, name_bn').is('deleted_at', null),
      supabaseAdmin.from('areas').select('id, zone_id, name, name_bn').is('deleted_at', null),
      supabaseAdmin.from('branches').select('id, area_id, name, name_bn, code, status').is('deleted_at', null),
      supabaseAdmin.from('working_areas').select('id, branch_id, village, village_bn').is('deleted_at', null),
      // NOTE: samities has no name_bn column (0007) — the Bangla name lives on
      // the samity `name` itself for this deployment.
      supabaseAdmin.from('samities').select('id, branch_id, code, name, status').is('deleted_at', null),
      supabaseAdmin.from('groups').select('id, samity_id, name, status, member_count').is('deleted_at', null),
      supabaseAdmin.from('members').select('branch_id, samity_id').is('deleted_at', null),
      // The loan table is loan_applications (0012); no soft-delete column.
      supabaseAdmin.from('loan_applications').select('branch_id, requested_amount').eq('status', 'disbursed'),
    ]);
    for (const r of [zones, areas, branches, villageRows, samityRows, groupRows, memberAgg, loanAgg]) {
      if (r.error) throw r.error;
    }

    const statsByBranch = new Map<string, { members: number; centers: number; groups?: number; outstandingLoans: string }>();
    const bump = (branchId: string, d: { members?: number; centers?: number; outstanding?: number }) => {
      const cur = statsByBranch.get(branchId) ?? { ...zero };
      cur.members += d.members ?? 0;
      cur.centers += d.centers ?? 0;
      cur.outstandingLoans = (Number(cur.outstandingLoans) + (d.outstanding ?? 0)).toFixed(2);
      statsByBranch.set(branchId, cur);
    };
    // Per-samity member roll-up (members carry samity_id — 0005).
    const samityMembers = new Map<string, number>();
    for (const m of (memberAgg.data ?? []) as { branch_id: string; samity_id: string | null }[]) {
      bump(m.branch_id, { members: 1 });
      if (m.samity_id) samityMembers.set(m.samity_id, (samityMembers.get(m.samity_id) ?? 0) + 1);
    }
    for (const s of (samityRows.data ?? []) as { branch_id: string }[]) bump(s.branch_id, { centers: 1 });
    for (const l of (loanAgg.data ?? []) as { branch_id: string; requested_amount: string }[]) bump(l.branch_id, { outstanding: Number(l.requested_amount) });

    const groupsBySamity = new Map<string, { id: string; name: string; member_count: number }[]>();
    for (const g of (groupRows.data ?? []) as { id: string; samity_id: string; name: string; member_count: number }[]) {
      const list = groupsBySamity.get(g.samity_id) ?? [];
      list.push({ id: g.id, name: g.name, member_count: g.member_count });
      groupsBySamity.set(g.samity_id, list);
    }
    const samitiesByBranch = new Map<string, { id: string; code: string; name: string }[]>();
    for (const s of (samityRows.data ?? []) as { id: string; branch_id: string; code: string; name: string }[]) {
      const list = samitiesByBranch.get(s.branch_id) ?? [];
      list.push({ id: s.id, code: s.code, name: s.name });
      samitiesByBranch.set(s.branch_id, list);
    }

    const branchNodes: OrgTreeNode[] = (branches.data ?? []).map((b) => {
      const br = b as { id: string; area_id: string | null; name: string; name_bn: string | null; code: string; status: string };
      const villages = (villageRows.data ?? []).filter((v) => (v as { branch_id: string | null }).branch_id === br.id);
      const centers = samitiesByBranch.get(br.id) ?? [];
      return {
        id: br.id,
        kind: 'branch' as const,
        name: br.name,
        nameBn: br.name_bn,
        code: br.code,
        status: br.status as OrgTreeNode['status'],
        counts: statsByBranch.get(br.id) ?? { ...zero },
        children: [
          // Samity (center) nodes with their groups — the field operating unit.
          ...centers.map((c) => {
            const groups = groupsBySamity.get(c.id) ?? [];
            return {
              id: c.id,
              kind: 'samity' as const,
              name: c.name,
              nameBn: null,
              code: c.code,
              counts: {
                members: samityMembers.get(c.id) ?? 0,
                centers: 0,
                groups: groups.length,
                outstandingLoans: '0.00',
              },
              children: groups.map((g) => ({
                id: g.id,
                kind: 'group' as const,
                name: g.name,
                nameBn: null,
                counts: { members: g.member_count, centers: 0, groups: 0, outstandingLoans: '0.00' },
                children: [],
              })),
            };
          }),
          ...villages.map((v) => {
            const wv = v as { id: string; village: string; village_bn: string | null };
            return {
              id: wv.id,
              kind: 'working_area' as const,
              name: wv.village,
              nameBn: wv.village_bn,
              counts: { ...zero },
              children: [],
            };
          }),
        ],
      };
    });

    const areaNodes: OrgTreeNode[] = (areas.data ?? []).map((a) => {
      const ar = a as { id: string; zone_id: string; name: string; name_bn: string | null };
      const children = branchNodes.filter((bn) => (branches.data ?? []).find((b) => (b as { id: string }).id === bn.id)?.area_id === ar.id);
      return {
        id: ar.id,
        kind: 'area' as const,
        name: ar.name,
        nameBn: ar.name_bn,
        counts: children.reduce((acc, c) => add(acc, c.counts), { ...zero }),
        children,
      };
    });

    const zoneNodes: OrgTreeNode[] = (zones.data ?? []).map((z) => {
      const zn = z as { id: string; name: string; name_bn: string | null };
      const children = areaNodes.filter((an) => (areas.data ?? []).find((a) => (a as { id: string }).id === an.id)?.zone_id === zn.id);
      return {
        id: zn.id,
        kind: 'zone' as const,
        name: zn.name,
        nameBn: zn.name_bn,
        counts: children.reduce((acc, c) => add(acc, c.counts), { ...zero }),
        children,
      };
    });

    const orgRow = await supabaseAdmin.from('organizations').select('id, name, name_bn').is('deleted_at', null).limit(1).maybeSingle();
    if (orgRow.error) throw orgRow.error;

    const org = orgRow.data as { id: string; name: string; name_bn: string | null } | null;
    const tree: OrgTreeNode = {
      id: org?.id ?? 'unknown',
      kind: 'organization',
      name: org?.name ?? 'Organization',
      nameBn: org?.name_bn ?? null,
      counts: zoneNodes.reduce((acc, z) => add(acc, z.counts), { ...zero }),
      children: zoneNodes,
    };

    res.json({ tree });
  }),
);

/** GET /api/v1/org/map-points — branches + villages with GPS for Leaflet. */
treeRouter.get(
  '/map-points',
  requirePermission('branch:manage'),
  asyncHandler(async (_req, res) => {
    if (isDemoMode()) {
      const store = orgDemoStore();
      const branches: BranchMapPoint[] = store.branches
        .filter((b) => b.gps_lat && b.gps_lng)
        .map((b) => ({ id: b.id, name: b.name, code: b.code, status: b.status, lat: Number(b.gps_lat), lng: Number(b.gps_lng) }));
      const villages: VillageMapPoint[] = store.workingAreas
        .filter((v) => v.gps_lat && v.gps_lng)
        .map((v) => ({
          id: v.id,
          name: v.village,
          branchId: v.branch_id,
          lat: Number(v.gps_lat),
          lng: Number(v.gps_lng),
          potentialScore: v.potential_score,
        }));
      res.json({ branches, villages });
      return;
    }

    const [bRes, vRes] = await Promise.all([
      supabaseAdmin.from('branches').select('id, name, code, status, gps_lat, gps_lng').is('deleted_at', null).not('gps_lat', 'is', null),
      supabaseAdmin.from('working_areas').select('id, village, branch_id, gps_lat, gps_lng, potential_score').is('deleted_at', null).not('gps_lat', 'is', null),
    ]);
    if (bRes.error) throw bRes.error;
    if (vRes.error) throw vRes.error;

    const branches: BranchMapPoint[] = (bRes.data ?? []).map((b) => {
      const br = b as { id: string; name: string; code: string; status: string; gps_lat: string; gps_lng: string };
      return { id: br.id, name: br.name, code: br.code, status: br.status as BranchMapPoint['status'], lat: Number(br.gps_lat), lng: Number(br.gps_lng) };
    });
    const villages: VillageMapPoint[] = (vRes.data ?? []).map((v) => {
      const wv = v as { id: string; village: string; branch_id: string | null; gps_lat: string; gps_lng: string; potential_score: number };
      return { id: wv.id, name: wv.village, branchId: wv.branch_id, lat: Number(wv.gps_lat), lng: Number(wv.gps_lng), potentialScore: wv.potential_score };
    });

    res.json({ branches, villages });
  }),
);
