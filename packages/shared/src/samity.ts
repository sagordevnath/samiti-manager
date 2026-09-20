import { z } from 'zod';
import { uuidSchema } from './schemas.js';

export const SAMITY_STATUS = ['forming', 'active', 'paused', 'closed', 'merged', 'split'] as const;
export type SamityStatus = (typeof SAMITY_STATUS)[number];

export const GROUP_STATUS = ['forming', 'active', 'paused', 'closed'] as const;
export type GroupStatus = (typeof GROUP_STATUS)[number];

export const MEETING_STATUS = ['scheduled', 'in_progress', 'closed', 'cancelled', 'rescheduled'] as const;
export type MeetingStatus = (typeof MEETING_STATUS)[number];

export const SAMITY_FORMATION_STAGES = ['projection_recorded', 'group_formed', 'observation_period', 'active'] as const;
export type SamityFormationStage = (typeof SAMITY_FORMATION_STAGES)[number];

export const meetingDays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
export type MeetingDay = (typeof meetingDays)[number];

export const meetingDaySchema = z.enum(meetingDays);

export const samityCreateSchema = z.object({
  branchId: uuidSchema,
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  village: z.string().trim().min(2).max(120),
  meetingDay: meetingDaySchema,
  meetingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Meeting time must be HH:MM'),
  meetingPlace: z.string().trim().min(2).max(200),
  fieldOfficerId: uuidSchema,
  status: z.enum(SAMITY_STATUS).default('forming'),
});
export type SamityCreateInput = z.infer<typeof samityCreateSchema>;

export const groupCreateSchema = z.object({
  samityId: uuidSchema,
  name: z.string().trim().min(2).max(80),
  memberIds: z.array(uuidSchema).min(1).max(10),
  status: z.enum(GROUP_STATUS).default('forming'),
});
export type GroupCreateInput = z.infer<typeof groupCreateSchema>;

export const groupMemberSchema = z.object({
  groupId: uuidSchema,
  memberId: uuidSchema,
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isLeader: z.boolean().default(false),
  status: z.enum(['active', 'left', 'transferred']).default('active'),
});
export type GroupMemberInput = z.infer<typeof groupMemberSchema>;

export const samityLeaderSchema = z.object({
  samityId: uuidSchema,
  chiefName: z.string().trim().min(2).max(120),
  deputyName: z.string().trim().min(2).max(120),
  secretaryName: z.string().trim().min(2).max(120),
  rotationStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rotationEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['active', 'review']).default('active'),
});
export type SamityLeaderInput = z.infer<typeof samityLeaderSchema>;

export function samityFormationFlow(stage: SamityStatus | SamityFormationStage): SamityFormationStage[] {
  if (stage === 'forming') return [...SAMITY_FORMATION_STAGES];
  if (stage === 'active') return [...SAMITY_FORMATION_STAGES];
  return SAMITY_FORMATION_STAGES.filter((s) => s !== 'active') as SamityFormationStage[];
}

export const meetingCreateSchema = z.object({
  samityId: uuidSchema,
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Meeting time must be HH:MM'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Meeting time must be HH:MM'),
  status: z.enum(MEETING_STATUS).default('scheduled'),
});
export type MeetingCreateInput = z.infer<typeof meetingCreateSchema>;

export function leaderRotationReminder(currentDate: string, lastRotationDate: string): string {
  const current = new Date(`${currentDate}T00:00:00Z`).getTime();
  const last = new Date(`${lastRotationDate}T00:00:00Z`).getTime();
  const diffDays = Math.floor((current - last) / (1000 * 60 * 60 * 24));
  return diffDays >= 365 ? 'rotation reminder: leader rotation due this cycle' : 'rotation ok: leadership remains within cycle';
}

export function meetingAttendanceLimitCheck(
  meetings: Array<{ officerId: string; day: string }>,
  maxPerDay: number,
): boolean {
  const counts = new Map<string, number>();
  for (const entry of meetings) {
    const key = `${entry.officerId}:${entry.day}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.values()).every((count) => count <= maxPerDay);
}

export const holidayCalendarSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(2).max(200),
  isClosed: z.boolean().default(true),
});
export type HolidayCalendarInput = z.infer<typeof holidayCalendarSchema>;

export const rescheduleRequestSchema = z.object({
  meetingId: uuidSchema,
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(4).max(500),
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
});
export type RescheduleRequestInput = z.infer<typeof rescheduleRequestSchema>;

export interface MeetingAttendanceEntry {
  memberId: string;
  present: boolean;
  savingsAmount: string;
  installmentAmount: string;
}

export interface MeetingDecision {
  type: 'attendance' | 'savings' | 'decision';
  note: string;
}
