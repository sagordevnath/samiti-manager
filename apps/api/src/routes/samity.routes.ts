import { Router } from 'express';
import {
  groupCreateSchema,
  meetingCreateSchema,
  samityCreateSchema,
  samityUpdateSchema,
  meetingAttendanceLimitCheck,
} from '@samity/shared';
import { Conflict, NotFound } from '../lib/errors.js';
import { isDemoMode } from '../lib/demo.js';
import { orgDemoStore } from '../lib/org-store.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

export const samityRouter = Router();
samityRouter.use(requireAuth);

samityRouter.get(
  '/',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    // Demo mode serves the in-memory org dataset (same shapes as the DB rows).
    if (isDemoMode()) {
      res.json({ items: orgDemoStore().samities });
      return;
    }
    // Embed the parent branch so the UI can show the branch name next to each
    // samity (list + edit form) straight from the database.
    let query = supabaseAdmin
      .from('samities')
      .select('*, branches(code, name, name_bn)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

samityRouter.post(
  '/',
  requirePermission('member:write'),
  validate(samityCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as {
      branchId: string;
      code: string;
      name: string;
      village: string;
      meetingDay: string;
      meetingTime: string;
      meetingPlace: string;
      fieldOfficerId: string;
      status?: string;
    };

    const { data, error } = await supabaseAdmin
      .from('samities')
      .insert({
        org_id: auth.orgId,
        branch_id: body.branchId,
        code: body.code,
        name: body.name,
        village: body.village,
        meeting_day: body.meetingDay,
        meeting_time: body.meetingTime,
        meeting_place: body.meetingPlace,
        field_officer_id: body.fieldOfficerId,
        status: body.status ?? 'forming',
        formation_stage: 'projection_recorded',
        created_by: auth.userId,
      })
      .select('*')
      .single();

    if (error) throw error;
    res.status(201).json({ samity: data });
  }),
);

/** PATCH /api/v1/samities/:id — partial update of samity attributes. */
samityRouter.patch(
  '/:id',
  requirePermission('member:write'),
  validate(samityUpdateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as {
      branchId?: string;
      code?: string;
      name?: string;
      village?: string;
      meetingDay?: string;
      meetingTime?: string;
      meetingPlace?: string;
      fieldOfficerId?: string;
      status?: string;
    };

    const patch: Record<string, unknown> = {};
    if (body.branchId !== undefined) patch['branch_id'] = body.branchId;
    if (body.code !== undefined) patch['code'] = body.code;
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.village !== undefined) patch['village'] = body.village;
    if (body.meetingDay !== undefined) patch['meeting_day'] = body.meetingDay;
    if (body.meetingTime !== undefined) patch['meeting_time'] = body.meetingTime;
    if (body.meetingPlace !== undefined) patch['meeting_place'] = body.meetingPlace;
    if (body.fieldOfficerId !== undefined) patch['field_officer_id'] = body.fieldOfficerId;
    if (body.status !== undefined) patch['status'] = body.status;

    let query = supabaseAdmin
      .from('samities')
      .update(patch)
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);

    const { data, error } = await query.select('*').single();
    if (error || !data) throw NotFound('Samity not found');
    res.json({ samity: data });
  }),
);

/** DELETE /api/v1/samities/:id — soft delete only (sets deleted_at). */
samityRouter.delete(
  '/:id',
  requirePermission('member:write'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;

    let query = supabaseAdmin
      .from('samities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);

    const { error } = await query;
    if (error) throw error;
    res.status(204).send();
  }),
);

samityRouter.get(
  '/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from('samities').select('*').eq('id', req.params['id']).is('deleted_at', null).single();
    if (error || !data) throw NotFound('Samity not found');
    res.json({ samity: data });
  }),
);

samityRouter.get(
  '/:id/groups',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.from('groups').select('*').eq('samity_id', req.params['id']).is('deleted_at', null).order('created_at');
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

samityRouter.post(
  '/:id/groups',
  requirePermission('member:write'),
  validate(groupCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { samityId: string; name: string; memberIds: string[]; status?: string };

    const { data, error } = await supabaseAdmin
      .from('groups')
      .insert({
        org_id: auth.orgId,
        samity_id: body.samityId,
        name: body.name,
        member_count: body.memberIds.length,
        status: body.status ?? 'forming',
        created_by: auth.userId,
      })
      .select('*')
      .single();

    if (error) throw error;

    if (body.memberIds.length > 0) {
      const memberships = body.memberIds.map((memberId) => ({
        org_id: auth.orgId,
        group_id: data.id,
        member_id: memberId,
        status: 'active',
      }));
      const { error: memberError } = await supabaseAdmin.from('group_members').insert(memberships);
      if (memberError) throw memberError;
    }

    res.status(201).json({ group: data });
  }),
);

samityRouter.post(
  '/:id/meetings',
  requirePermission('member:write'),
  validate(meetingCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as {
      samityId: string;
      meetingDate: string;
      startTime: string;
      endTime: string;
      status?: string;
    };

    const limitChecks = await supabaseAdmin
      .from('samity_meetings')
      .select('id, meeting_date')
      .eq('samity_id', body.samityId)
      .eq('meeting_date', body.meetingDate)
      .is('deleted_at', null);

    if (limitChecks.error) throw limitChecks.error;
    if (limitChecks.data && limitChecks.data.length >= 1) {
      throw Conflict('A meeting is already scheduled for this samity on that date');
    }

    const { data, error } = await supabaseAdmin
      .from('samity_meetings')
      .insert({
        org_id: auth.orgId,
        samity_id: body.samityId,
        meeting_date: body.meetingDate,
        start_time: body.startTime,
        end_time: body.endTime,
        status: body.status ?? 'scheduled',
        created_by: auth.userId,
      })
      .select('*')
      .single();

    if (error) throw error;

    const officerId = (await supabaseAdmin.from('samities').select('field_officer_id').eq('id', body.samityId).single()).data?.field_officer_id;
    const sameDay = await supabaseAdmin
      .from('samity_meetings')
      .select('id, samity_id, meeting_date')
      .eq('meeting_date', body.meetingDate)
      .is('deleted_at', null);

    if (!sameDay.error && officerId) {
      const hasLimit = meetingAttendanceLimitCheck(
        (sameDay.data ?? []).map(() => ({ officerId, day: body.meetingDate })),
        2,
      );
      if (!hasLimit) {
        throw Conflict('Field officer meeting limit exceeded for this day');
      }
    }

    res.status(201).json({ meeting: data });
  }),
);

samityRouter.get(
  '/:id/attendance',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('meeting_attendance')
      .select('*, members(full_name)')
      .eq('meeting_id', req.params['id'])
      .is('deleted_at', null);
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);
