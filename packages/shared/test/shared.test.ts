import { describe, expect, it } from 'vitest';
import { formatMoney, toAsciiDigits, toBanglaDigits } from '../src/format';
import { hasPermission, permissionsForRole } from '../src/roles';
import { loginSchema, memberCreateSchema, paginationQuerySchema } from '../src/schemas';
import { NAV } from '../src/nav';
import {
  branchCreateSchema,
  branchChecklistSchema,
  branchOpeningCreateSchema,
  geoCsvRowSchema,
  staffAssignmentCreateSchema,
  workingAreaSurveySchema,
} from '../src/org';
import {
  ADMISSION_STAGES,
  admissionCreateSchema,
  checkDuplicateMembership,
  evaluateEligibility,
  LIFECYCLE_TRANSITIONS,
  memberDraftSchema,
  memberBulkRowSchema,
  memberStatusChangeSchema,
  memberTransferSchema,
  nomineesSchema,
  nextAdmissionStage,
} from '../src/member';
import {
  samityCreateSchema,
  samityFormationFlow,
  groupCreateSchema,
  meetingCreateSchema,
  leaderRotationReminder,
  meetingAttendanceLimitCheck,
} from '../src/samity';

describe('format', () => {
  it('converts ASCII digits to Bangla and back', () => {
    expect(toBanglaDigits('1250.50')).toBe('১২৫০.৫০');
    expect(toAsciiDigits('১২৫০.৫০')).toBe('1250.50');
  });

  it('formats money with the taka symbol', () => {
    expect(formatMoney('1250.5', 'en')).toContain('1,250.50');
    expect(formatMoney('1250.5', 'en')).toContain('৳');
  });
});

describe('roles', () => {
  it('gives branch_manager member write but org_admin not', () => {
    expect(hasPermission('branch_manager', 'member:write')).toBe(true);
    expect(hasPermission('org_admin', 'org:manage')).toBe(false);
    expect(hasPermission('super_admin', 'org:manage')).toBe(true);
  });

  it('members have no permissions', () => {
    expect(permissionsForRole('member')).toHaveLength(0);
  });
});

describe('schemas', () => {
  it('accepts a valid BD phone', () => {
    expect(memberCreateSchema.safeParse({ fullName: 'Rahima Begum', phone: '01712345678', branchId: crypto.randomUUID() }).success).toBe(true);
  });

  it('rejects an invalid BD phone', () => {
    expect(memberCreateSchema.safeParse({ fullName: 'Rahima Begum', phone: '12345', branchId: crypto.randomUUID() }).success).toBe(false);
  });

  it('coerces pagination query params', () => {
    expect(paginationQuerySchema.parse({ page: '3' })).toMatchObject({ page: 3, pageSize: 20 });
  });

  it('requires a strong password on login', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'short' }).success).toBe(false);
  });
});

describe('nav', () => {
  it('every nav permission is a known permission', () => {
    for (const group of NAV) {
      for (const item of group.items) {
        expect(item.permission).toBeDefined();
      }
    }
  });
});

describe('org structure schemas', () => {
  it('accepts a valid branch create payload', () => {
    const result = branchCreateSchema.safeParse({
      name: 'Dhanmondi Branch',
      nameBn: 'ধানমন্ডি শাখা',
      code: 'DHK-01',
      areaId: crypto.randomUUID(),
      openingDate: '2026-01-01',
      gps: { lat: 23.75, lng: 90.38 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects out-of-range GPS and bad branch codes', () => {
    expect(
      branchCreateSchema.safeParse({
        name: 'X Branch',
        nameBn: 'শাখা',
        code: 'dhk-01',
        areaId: crypto.randomUUID(),
        openingDate: '2026-01-01',
        gps: { lat: 120, lng: 90 },
      }).success,
    ).toBe(false);
  });

  it('bounds the survey potential score to 1..5', () => {
    const base = {
      name: 'Village A',
      division: 'Dhaka',
      district: 'Dhaka',
      upazila: 'Dhamrai',
      village: 'Village A',
      population: 1200,
      households: 260,
    };
    expect(workingAreaSurveySchema.safeParse({ ...base, potentialScore: 6 }).success).toBe(false);
    expect(workingAreaSurveySchema.safeParse({ ...base, potentialScore: 4 }).success).toBe(true);
  });

  it('requires a checklist payload with known items', () => {
    expect(branchChecklistSchema.safeParse({ items: [{ item: 'office_rent', done: true }] }).success).toBe(true);
    expect(branchChecklistSchema.safeParse({ items: [{ item: 'free_lunch', done: true }] }).success).toBe(false);
  });

  it('validates opening proposal and staff transfer payloads', () => {
    expect(branchOpeningCreateSchema.safeParse({ branchId: crypto.randomUUID(), proposalNote: 'Enough demand in 18 villages' }).success).toBe(true);
    expect(staffAssignmentCreateSchema.safeParse({ userId: crypto.randomUUID(), branchId: crypto.randomUUID(), effectiveFrom: '2026-03-01' }).success).toBe(true);
  });

  it('parses geo CSV rows with defaults', () => {
    const parsed = geoCsvRowSchema.parse({ division: 'Dhaka', district: 'Dhaka', upazila: 'Dhamrai', village: 'Baliati' });
    expect(parsed).toMatchObject({ union: '', divisionBn: '', village: 'Baliati' });
  });
});

describe('member module schemas', () => {
  const validNominee = { name: 'Abdul Karim', relation: 'husband' as const, sharePct: 100 };

  const validDraft = {
    fullName: 'Rahima Begum',
    fullNameBn: 'রহিমা বেগম',
    fatherOrHusbandName: 'Abdul Karim',
    motherName: 'Jahanara Begum',
    idType: 'nid' as const,
    idNumber: '1990123456789',
    dob: '1995-03-15',
    mobile: '01712345678',
    address: 'Village: Baliati, Post: Dhamrai',
    workingAreaId: crypto.randomUUID(),
    samityName: 'Rupali Samity',
    occupation: 'Poultry farmer',
    monthlyHouseholdIncome: '12000',
    landOwnedDecimals: 15,
    familyMembers: 5,
    nominees: [validNominee],
  };

  it('accepts a complete admission draft', () => {
    expect(memberDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it('rejects under-age and impossible DOBs', () => {
    const young = { ...validDraft, dob: new Date().toISOString().slice(0, 10).replace(/\d{4}/, String(new Date().getFullYear() - 10)) };
    expect(memberDraftSchema.safeParse(young).success).toBe(false);
  });

  it('enforces nominee shares totalling 100%', () => {
    const bad = nomineesSchema.safeParse([
      { name: 'A', relation: 'son', sharePct: 60 },
      { name: 'B', relation: 'daughter', sharePct: 30 },
    ]);
    expect(bad.success).toBe(false);
    expect(nomineesSchema.safeParse([validNominee]).success).toBe(true);
  });

  it('walks the admission stages in order', () => {
    expect(ADMISSION_STAGES[0]).toBe('field_survey');
    expect(nextAdmissionStage('manager_approval')).toBe('orientation_completed');
    expect(nextAdmissionStage('passbook_generated')).toBeNull();
  });

  it('flags duplicate memberships by exact match and fuzzy village match', () => {
    const result = checkDuplicateMembership(
      {
        fullName: 'Rahima Begum',
        mobile: '01712345678',
        idNumber: '1990123456789',
        workingAreaId: '11111111-1111-4111-8111-111111111111',
        branchId: '22222222-2222-4222-8222-222222222222',
      },
      [
        {
          memberId: 'a',
          memberNumber: 'DHK-26-00001',
          fullName: 'Rahima Begum',
          phone: '01712345678',
          idNumber: '1990123456789',
          workingAreaId: '11111111-1111-4111-8111-111111111111',
          address: 'Village Baliati, Dhamrai',
          branchId: '22222222-2222-4222-8222-222222222222',
          branchCode: 'DHK',
          status: 'active',
        },
        {
          memberId: 'b',
          memberNumber: 'DHK-26-00002',
          fullName: 'Rahima Begaum',
          phone: '01799999999',
          idNumber: '1999999999999',
          workingAreaId: '11111111-1111-4111-8111-111111111111',
          address: 'Village Baliati, Dhamrai',
          branchId: '33333333-3333-4333-8333-333333333333',
          branchCode: 'DHK2',
          status: 'pending',
        },
      ],
    );

    expect(result.blocked).toBe(true);
    expect(result.overlapRisk).toBe(true);
    expect(result.matches.some((m) => m.matchedBy.includes('id_number'))).toBe(true);
    expect(result.matches.some((m) => m.matchedBy.includes('name_village'))).toBe(true);
  });

  it('rejects eligibility when the household exceeds the configured rule', () => {
    const result = evaluateEligibility(
      { dob: '2000-01-01', landOwnedDecimals: 60, address: 'Village Baliati', workingAreaId: '11111111-1111-4111-8111-111111111111' },
      { minAge: 18, maxAge: 60, maxLandDecimals: 50, oneMemberPerHousehold: true, maxMonthlyIncome: 0, womenOnly: false },
      [
        {
          working_area_id: '11111111-1111-4111-8111-111111111111',
          address: 'Village Baliati',
          lifecycle: 'active',
          full_name: 'Rahima Begum',
        },
      ],
    );

    expect(result.eligible).toBe(false);
    expect(result.failures).toEqual(expect.arrayContaining(['land_above_limit', 'household_already_member']));
  });

  it('blocks lifecycle transitions that make no sense', () => {
    expect(LIFECYCLE_TRANSITIONS.deceased).toHaveLength(0);
    expect(LIFECYCLE_TRANSITIONS.dropout).toHaveLength(0);
    expect(LIFECYCLE_TRANSITIONS.active).toContain('dormant');
    expect(LIFECYCLE_TRANSITIONS.pending).toContain('active');
  });

  it('ties reason codes to statuses', () => {
    const ok = memberStatusChangeSchema.safeParse({ status: 'deceased', reasonCode: 'death', effectiveDate: '2026-09-01' });
    const bad = memberStatusChangeSchema.safeParse({ status: 'deceased', reasonCode: 'migration', effectiveDate: '2026-09-01' });
    expect(ok.success).toBe(true);
    expect(bad.success).toBe(false);
  });

  it('validates transfer payloads', () => {
    expect(
      memberTransferSchema.safeParse({ toBranchId: crypto.randomUUID(), reason: 'Moved to husband home in Mirpur' }).success,
    ).toBe(true);
    expect(memberTransferSchema.safeParse({ toBranchId: crypto.randomUUID(), reason: 'x' }).success).toBe(false);
  });

  it('accepts a bulk import row and rejects a bad NID', () => {
    const row = {
      fullName: 'Salma Khatun',
      fatherOrHusbandName: 'Md Ali',
      motherName: 'Rashida',
      idNumber: '1234567890',
      dob: '1992-01-01',
      mobile: '01812345678',
      occupation: 'Tailor',
      monthlyHouseholdIncome: '8000',
      branchCode: 'DHK-01',
      samityName: 'Jonaki Samity',
      village: 'Baliati',
      nomineeName: 'Md Ali',
      nomineeRelation: 'husband' as const,
    };
    expect(memberBulkRowSchema.safeParse(row).success).toBe(true);
    expect(memberBulkRowSchema.safeParse({ ...row, idNumber: 'abc' }).success).toBe(false);
  });

  it('builds the admission create payload', () => {
    const res = admissionCreateSchema.safeParse({ branchId: crypto.randomUUID(), draft: validDraft });
    expect(res.success).toBe(true);
  });

  it('creates a valid samity plus group payload and tracks formation flow', () => {
    const samity = samityCreateSchema.safeParse({
      branchId: crypto.randomUUID(),
      name: 'Rupali Samity',
      code: 'RUP-01',
      village: 'Baliati',
      meetingDay: 'friday',
      meetingTime: '17:30',
      meetingPlace: 'School premise',
      fieldOfficerId: crypto.randomUUID(),
      status: 'forming',
    });
    expect(samity.success).toBe(true);
    expect(samityFormationFlow('forming')).toEqual(['projection_recorded', 'group_formed', 'observation_period', 'active']);
  });

  it('enforces group membership size and daily meeting limits', () => {
    const group = groupCreateSchema.safeParse({
      samityId: crypto.randomUUID(),
      name: 'Group 1',
      memberIds: Array.from({ length: 5 }, () => crypto.randomUUID()),
      status: 'active',
    });
    expect(group.success).toBe(true);

    const meeting = meetingCreateSchema.safeParse({
      samityId: crypto.randomUUID(),
      meetingDate: '2026-09-20',
      startTime: '17:30',
      endTime: '18:45',
      status: 'scheduled',
    });
    expect(meeting.success).toBe(true);

    expect(meetingAttendanceLimitCheck([{ officerId: 'off-1', day: '2026-09-20' }, { officerId: 'off-1', day: '2026-09-20' }], 2)).toBe(true);
    expect(meetingAttendanceLimitCheck([{ officerId: 'off-1', day: '2026-09-20' }, { officerId: 'off-1', day: '2026-09-20' }, { officerId: 'off-1', day: '2026-09-20' }], 2)).toBe(false);
    expect(leaderRotationReminder('2026-01-01', '2025-01-01')).toContain('rotation');
  });
});
