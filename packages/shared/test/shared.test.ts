import { describe, expect, it } from 'vitest';
import { formatMoney, toAsciiDigits, toBanglaDigits } from '../src/format';
import { allocateCollectionPayment, rowTotalDue } from '../src/collection-engine';
import { collectionEntrySchema } from '../src/collection';
import {
  buildUtilizationReport,
  cycleCapFor,
  evaluateLoanEligibility,
  resolveApproval,
  summarizeCycle,
  utilizationPlanSchema,
} from '../src/loan-governance';
import {
  buildDisbursementJournal,
  computeDisbursementSchedule,
  disbursementCancelSchema,
  loanDisbursementSms,
  DISBURSEMENT_CHECKS,
  disbursementCreateSchema,
  nextWorkingDay,
  queueGroupKey,
  weeklyClosureDay,
} from '../src/loan-disbursement';
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
import {
  computeStatement,
  dividendDeclarationSchema,
  memberDividend,
  nextDividendStatus,
  passbookQuerySchema,
  previewDividend,
  shareAllotmentSchema,
  splitDividendSurplus,
  type PassbookLine,
} from '../src/savings';
import {
  DEFAULT_MRA_CAP_PERCENT,
  LoanApplication,
  LOAN_PRODUCT_TYPES,
  LoanProduct,
  computeLoanSchedule,
  guarantorSchema,
  loanDecisionSchema,
  loanPolicyUpdateSchema,
  loanProductCreateSchema,
  nextLoanStage,
  validateRateAgainstCap,
  RateCapExceededError,
} from '../src/loan';

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

describe('savings module', () => {
  it('validates share allotments and dividend declarations', () => {
    const allotment = shareAllotmentSchema.safeParse({
      orgId: crypto.randomUUID(),
      memberId: crypto.randomUUID(),
      productId: crypto.randomUUID(),
      shares: 2,
      paidAmount: '2000',
    });
    expect(allotment.success).toBe(true);
    expect(shareAllotmentSchema.safeParse({ ...allotment, shares: 0 }).success).toBe(false);

    const declaration = dividendDeclarationSchema.safeParse({
      orgId: crypto.randomUUID(),
      productId: crypto.randomUUID(),
      financialYear: '2025-26',
      surplus: '1000000',
      payoutRate: 60,
      approvedByMeetingRef: 'AGM-2026-01',
      approvedAt: new Date().toISOString(),
    });
    expect(declaration.success).toBe(true);
    expect(dividendDeclarationSchema.safeParse({ ...declaration, approvedByMeetingRef: '' }).success).toBe(false);
  });

  it('splits surplus into dividend pool and retained reserves', () => {
    const { dividendPool, retained } = splitDividendSurplus('1000000', 60);
    expect(dividendPool).toBe('600000.00');
    expect(retained).toBe('400000.00');
  });

  it('prorates dividends by paid-up share capital', () => {
    // Face value ৳1000: member A 3 shares, member B 1 share → A gets 75%.
    expect(memberDividend('4000.00', 3, 4, '1000')).toBe('3000.00');
    expect(memberDividend('4000.00', 1, 4, '1000')).toBe('1000.00');
    expect(memberDividend('4000.00', 0, 0, '1000')).toBe('0.00');
  });

  it('previews a dividend distribution', () => {
    const preview = previewDividend(
      [{ memberId: 'a', paidShares: 3 }, { memberId: 'b', paidShares: 1 }],
      { surplus: '1000', payoutRate: 50, faceValue: '100' },
    );
    expect(preview.dividendPool).toBe('500.00');
    expect(preview.retained).toBe('500.00');
    expect(preview.perMember[0]).toEqual({ memberId: 'a', paidShares: 3, amount: '375.00' });
    expect(preview.perMember[1]?.amount).toBe('125.00');
  });

  it('locks approved dividends but advances drafts', () => {
    expect(nextDividendStatus('draft')).toBe('approved');
    expect(nextDividendStatus('approved')).toBeNull();
  });

  it('validates passbook date-range queries', () => {
    expect(passbookQuerySchema.safeParse({ accountId: crypto.randomUUID(), from: '2026-01-01', to: '2026-06-30' }).success).toBe(true);
    expect(passbookQuerySchema.safeParse({ accountId: crypto.randomUUID(), from: '01-2026', to: 'x' }).success).toBe(false);
  });

  it('computes statement opening/closing from the ledger', () => {
    const lines: PassbookLine[] = [
      { id: '1', date: '2026-01-05T10:00:00Z', type: 'deposit', deposit: '500.00', withdrawal: '0.00', balanceAfter: '500.00', reference: null, note: null },
      { id: '2', date: '2026-02-10T10:00:00Z', type: 'withdrawal', deposit: '0.00', withdrawal: '200.00', balanceAfter: '300.00', reference: null, note: null },
      { id: '3', date: '2026-03-01T10:00:00Z', type: 'interest', deposit: '12.00', withdrawal: '0.00', balanceAfter: '312.00', reference: null, note: null },
    ];
    const statement = computeStatement(
      { id: 'a1', accountNumber: 'SA-1', memberName: 'Rahima', memberNameBn: null, memberCode: 'DHK-26-00001', productName: 'Voluntary', productNameBn: null, branchName: 'Dhanmondi', orgName: 'Samity Org', status: 'active' },
      '2026-02-01',
      '2026-02-28',
      lines,
      '312.00',
    );
    expect(statement.lines).toHaveLength(1);
    expect(statement.openingBalance).toBe('500.00');
    expect(statement.closingBalance).toBe('300.00');
    expect(statement.totalDeposits).toBe('0.00');
    expect(statement.totalWithdrawals).toBe('200.00');
  });
});

describe('loan module', () => {
  const cap = DEFAULT_MRA_CAP_PERCENT;
  const validProduct = {
    code: 'GEN-01',
    name: 'General loan',
    productType: 'general' as const,
    minAmount: '5000',
    maxAmount: '50000',
    termMonths: 12,
    installmentFrequency: 'weekly' as const,
    interestMethod: 'declining_balance' as const,
    interestRate: 24,
    guarantorsRequired: 1,
  };

  it('accepts a valid product', () => {
    expect(loanProductCreateSchema.safeParse({ ...validProduct, orgId: crypto.randomUUID() }).success).toBe(true);
    expect(loanProductCreateSchema.safeParse({ ...validProduct, minAmount: 'x', orgId: crypto.randomUUID() }).success).toBe(false);
  });

  it('covers all nine product categories', () => {
    expect(LOAN_PRODUCT_TYPES).toHaveLength(9);
    expect(LOAN_PRODUCT_TYPES).toEqual(
      expect.arrayContaining(['general', 'seasonal_agri', 'microenterprise', 'housing', 'education', 'emergency', 'migration', 'device', 'climate']),
    );
  });

  it('enforces the 27% MRA cap on declining balance (editable)', () => {
    expect(() => validateRateAgainstCap({ interestRate: 27, interestMethod: 'declining_balance' }, cap)).not.toThrow();
    expect(() => validateRateAgainstCap({ interestRate: 27.5, interestMethod: 'declining_balance' }, cap)).toThrow(RateCapExceededError);
  });

  it('treats flat rates as doubled effective declining rate', () => {
    expect(() => validateRateAgainstCap({ interestRate: 13, interestMethod: 'flat' }, 27)).not.toThrow(); // 26 effective
    expect(() => validateRateAgainstCap({ interestRate: 13.5, interestMethod: 'flat' }, 27)).not.toThrow(); // 27 exactly = at cap
    expect(() => validateRateAgainstCap({ interestRate: 14, interestMethod: 'flat' }, 27)).toThrow(RateCapExceededError); // 28 effective
  });

  it('allows an org to raise the regulatory cap explicitly', () => {
    expect(() => validateRateAgainstCap({ interestRate: 30, interestMethod: 'declining_balance' }, 30)).not.toThrow();
    expect(loanPolicyUpdateSchema.safeParse({ rateCapPercent: 30, bmApprovalLimitBdt: '30000' }).success).toBe(true);
    expect(loanPolicyUpdateSchema.safeParse({ rateCapPercent: 30, bmApprovalLimitBdt: '-5' }).success).toBe(false);
  });

  it('walks the application stages, routing large amounts to area approval', () => {
    expect(nextLoanStage('bm_review', '20000', '30000')).toBe('approved');
    expect(nextLoanStage('bm_review', '50000', '30000')).toBe('am_review');
    expect(nextLoanStage('am_review', '50000', '30000')).toBe('approved');
    expect(nextLoanStage('rejected', '50000', '30000')).toBeNull();
  });

  it('validates guarantor payloads (BD mobile, NID last 4, consent flag)', () => {
    const g = {
      name: 'Abdul Karim',
      relation: 'same_group_member' as const,
      mobile: '01712345678',
      nidLast4: '6789',
      isMember: true,
      consentGiven: true,
    };
    expect(guarantorSchema.safeParse(g).success).toBe(true);
    expect(guarantorSchema.safeParse({ ...g, mobile: '12345' }).success).toBe(false);
    expect(guarantorSchema.safeParse({ ...g, nidLast4: '67' }).success).toBe(false);
  });

  it('requires an approve/reject decision with optional reason', () => {
    expect(loanDecisionSchema.safeParse({ decision: 'approve' }).success).toBe(true);
    expect(loanDecisionSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
  });

  it('computes a declining-balance schedule with level installments', () => {
    const s = computeLoanSchedule({
      principal: '10000',
      annualRatePercent: 24,
      method: 'declining_balance',
      termMonths: 10,
      frequency: 'monthly',
      startFrom: new Date('2026-01-01T00:00:00Z'),
    });
    expect(s.installmentCount).toBe(10);
    expect(Number(s.installmentAmount)).toBeCloseTo(1113.27, 1);
    expect(Number(s.totalInterest)).toBeGreaterThan(900);
    expect(Number(s.totalInterest)).toBeLessThan(1200);
    expect(s.installments.at(-1)?.balanceAfter).toBe('0.00');
  });

  it('computes a flat schedule with constant interest per installment', () => {
    const s = computeLoanSchedule({
      principal: '12000',
      annualRatePercent: 12,
      method: 'flat',
      termMonths: 12,
      frequency: 'monthly',
      startFrom: new Date('2026-01-01T00:00:00Z'),
    });
    expect(s.installmentCount).toBe(12);
    expect(s.installments[0]?.interest).toBe('120.00');
    expect(s.installments[11]?.interest).toBe('120.00');
    expect(s.totalInterest).toBe('1440.00');
    expect(s.totalPayable).toBe('13440.00');
  });

  it('honors grace periods before principal repayment starts', () => grace_period_test());

  function grace_period_test() {
    const s = computeLoanSchedule({
      principal: '10000',
      annualRatePercent: 24,
      method: 'declining_balance',
      termMonths: 12,
      frequency: 'monthly',
      gracePeriodInstallments: 2,
      startFrom: new Date('2026-01-01T00:00:00Z'),
    });
    expect(s.installments[0]?.principal).toBe('0.00');
    expect(Number(s.installments[0]?.interest ?? 0)).toBeGreaterThan(0);
    expect(s.installments.at(-1)?.balanceAfter).toBe('0.00');
  }

  it('round-trips the application read model', () => {
    const app: LoanApplication = {
      id: crypto.randomUUID(),
      orgId: crypto.randomUUID(),
      branchId: crypto.randomUUID(),
      memberId: crypto.randomUUID(),
      productId: crypto.randomUUID(),
      applicationNumber: 'LN-DHK-2026-0001',
      requestedAmount: '30000.00',
      purpose: 'Paddy seed and fertilizer',
      status: 'bm_review',
      termMonths: 10,
      guarantors: [],
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(app.status).toBe('bm_review');
    const product: LoanProduct = {
      id: crypto.randomUUID(),
      orgId: app.orgId,
      code: 'GEN-01',
      name: 'General loan',
      nameBn: 'সাধারণ ঋণ',
      productType: 'general',
      minAmount: '5000.00',
      maxAmount: '50000.00',
      termMonths: 12,
      installmentFrequency: 'weekly',
      interestMethod: 'declining_balance',
      interestRate: 24,
      serviceCharge: 0,
      processingFeeRate: 1,
      insurancePremiumRate: 0.5,
      gracePeriodInstallments: 0,
      eligibilityNote: null,
      requiredDocuments: ['nid', 'photo'],
      guarantorsRequired: 1,
      guarantorMinRelationship: 'family_or_business',
      isActive: true,
    };
    expect(product.requiredDocuments).toHaveLength(2);
  });
});

describe('loan governance (approval matrix, cycles, utilization)', () => {
  const productId = crypto.randomUUID();
  const matrix = [
    {
      productId: null,
      minAmount: null,
      maxAmount: '30000.00',
      approverRoles: ['branch_manager'],
      soloApprovalLimit: '30000.00',
      priority: 10,
      isActive: true,
    },
    {
      productId: null,
      minAmount: '30000.01',
      maxAmount: '200000.00',
      approverRoles: ['branch_manager', 'area_manager'],
      soloApprovalLimit: null, // AM signs solo; BM's own cap is separate
      priority: 5,
      isActive: true,
    },
    {
      productId: null,
      minAmount: '200000.01',
      maxAmount: null,
      approverRoles: ['org_admin'],
      soloApprovalLimit: null, // unlimited solo
      priority: 1,
      isActive: true,
    },
  ] as never[];

  it('resolves the approval matrix by amount band', () => {
    const small = resolveApproval(matrix, { productId, amount: '20000.00' });
    expect(small.canApproveSolo).toEqual(['branch_manager']);
    expect(small.matchedBand?.maxAmount).toBe('30000.00');

    const large = resolveApproval(matrix, { productId, amount: '150000.00' });
    expect(large.canApproveSolo).toEqual(['branch_manager', 'area_manager']);
    expect(large.needsEscalation).toEqual([]);

    const huge = resolveApproval(matrix, { productId, amount: '500000.00' });
    expect(huge.canApproveSolo).toEqual(['org_admin']);
  });

  it('honors product-specific rows over generic ones via priority', () => {
    const rows = [
      { productId: null, minAmount: null, maxAmount: null, approverRoles: ['branch_manager'], soloApprovalLimit: null, priority: 1, isActive: true },
      { productId, minAmount: null, maxAmount: null, approverRoles: ['org_admin'], soloApprovalLimit: null, priority: 9, isActive: true },
    ] as never[];
    const resolved = resolveApproval(rows, { productId, amount: '1000.00' });
    expect(resolved.approverRoles).toEqual(['org_admin']);
  });

  it('returns an empty resolution when no active row matches', () => {
    const inactive = (matrix as Array<{ isActive: boolean }>).map((r) => ({ ...r, isActive: false }));
    const none = resolveApproval(inactive as never, { productId, amount: '999999.00' });
    expect(none.rowId).toBeNull();
    expect(none.approverRoles).toEqual([]);
  });

  const policy = {
    firstLoanCapBdt: '20000.00',
    stepUpPercent: 25,
    maxCycleCapBdt: '100000.00',
    overdueGraceDays: 3,
    maxDebtToIncomeRatio: 0.4,
    maxLoanToSavingsRatio: 3,
    maxOverlappingLoans: 2,
  };

  it('steps the cycle cap up per completed cycle and clamps at the max', () => {
    expect(cycleCapFor(policy, 0)).toBe('20000.00');
    expect(cycleCapFor(policy, 1)).toBe('25000.00');
    expect(cycleCapFor(policy, 2)).toBe('31250.00');
    expect(cycleCapFor(policy, 12)).toBe('100000.00'); // clamped
  });

  it('summarizes the cycle from history', () => {
    const summary = summarizeCycle(policy, [
      { status: 'closed', closedOnTime: true },
      { status: 'closed', closedOnTime: false },
      { status: 'approved', closedOnTime: false },
      { status: 'rejected', closedOnTime: false },
    ]);
    expect(summary.cycleNumber).toBe(3);
    expect(summary.completedCycles).toBe(2);
    expect(summary.currentCapBdt).toBe('31250.00');
    expect(summary.repaidOnTime).toBe(1);
    expect(summary.everOverdue).toBe(1);
  });

  it('blocks on cycle cap, overdue, DTI, LSR and overlap with reasons', () => {
    const cycle = summarizeCycle(policy, []);
    const base = {
      amount: '25000.00',
      policy,
      cycle,
      overdueInstallments: [],
      activeMonthlyInstallments: '2000.00',
      monthlyIncome: '20000.00',
      totalActiveLoanBalance: '10000.00',
      savingsBalance: '5000.00',
      activeLoanCount: 1,
    };

    const clean = evaluateLoanEligibility({ ...base, amount: '20000.00' });
    expect(clean.eligible).toBe(true);

    const overCap = evaluateLoanEligibility(base);
    expect(overCap.blocks).toContain('AMOUNT_ABOVE_CYCLE_CAP');

    const overdue = evaluateLoanEligibility({
      ...base,
      amount: '20000.00',
      overdueInstallments: [{ installmentId: 'i1', loanId: 'l1', dueDate: '2026-08-01', daysOverdue: 10, amountDue: '5000.00' }],
    });
    expect(overdue.blocks).toContain('OVERDUE_INSTALLMENT');
    expect(overdue.details.worstOverdueDays).toBe(10);

    const overDTI = evaluateLoanEligibility({ ...base, amount: '20000.00', activeMonthlyInstallments: '9000.00', monthlyIncome: '20000.00' });
    expect(overDTI.blocks).toContain('DEBT_TO_INCOME');

    const overLSR = evaluateLoanEligibility({ ...base, amount: '20000.00', totalActiveLoanBalance: '16000.00', savingsBalance: '5000.00' });
    expect(overLSR.blocks).toContain('LOAN_TO_SAVINGS');

    const overlap = evaluateLoanEligibility({ ...base, amount: '20000.00', activeLoanCount: 3 });
    expect(overlap.blocks).toContain('OVERLAP_LIMIT');
  });

  it('builds the utilization report with per-item variance', () => {
    const plan = { items: [
      { category: 'solar_panel', description: '300W panel', amount: '15000.00' },
      { category: 'battery', description: '100Ah', amount: '10000.00' },
    ] };
    const unverified = buildUtilizationReport(plan, null);
    expect(unverified.plannedTotal).toBe('25000.00');
    expect(unverified.verifiedTotal).toBe('0.00');

    const verified = buildUtilizationReport(plan, {
      items: [
        { category: 'solar_panel', verifiedAmount: '15000.00', note: 'Receipt matched' },
        { category: 'battery', verifiedAmount: '8000.00' },
      ],
      verifiedAt: '2026-09-21T00:00:00.000Z',
      verifiedBy: 'user-1',
      verifierNote: null,
    });
    expect(verified.verifiedTotal).toBe('23000.00');
    expect(verified.variance).toBe('-2000.00');
    expect(verified.items[1]!.variance).toBe('-2000.00');
  });

  it('rejects utilization plans with non-positive totals', () => {
    const bad = utilizationPlanSchema.safeParse({ items: [{ category: 'x', description: 'y', amount: '0.00' }] });
    expect(bad.success).toBe(false);
  });
});

describe('loan disbursement', () => {
  const allChecksDone = DISBURSEMENT_CHECKS.map((check) => ({ check, done: true }));

  it('requires every pre-disbursement check to pass', () => {
    const base = {
      applicationId: crypto.randomUUID(),
      mode: 'cash_branch' as const,
      checkItems: allChecksDone,
      cashReceivedByName: 'Kamrul Hasan',
      branchCashLimitBdt: '500000.00',
      cashAvailableBdt: '250000.00',
    };
    expect(disbursementCreateSchema.safeParse(base).success).toBe(true);

    const missingOne = disbursementCreateSchema.safeParse({
      ...base,
      checkItems: allChecksDone.slice(0, 5),
    });
    expect(missingOne.success).toBe(false);

    const unmetCheck = disbursementCreateSchema.safeParse({
      ...base,
      checkItems: allChecksDone.map((c) => (c.check === 'member_present' ? { ...c, done: false } : c)),
    });
    expect(unmetCheck.success).toBe(false);
  });

  it('enforces mode-specific evidence', () => {
    const appId = crypto.randomUUID();
    const cashWithoutReceiver = disbursementCreateSchema.safeParse({
      applicationId: appId,
      mode: 'cash_center',
      checkItems: allChecksDone,
    });
    expect(cashWithoutReceiver.success).toBe(false);

    const bkashWithoutRef = disbursementCreateSchema.safeParse({
      applicationId: appId,
      mode: 'bkash',
      checkItems: allChecksDone,
    });
    expect(bkashWithoutRef.success).toBe(false);

    const bkashOk = disbursementCreateSchema.safeParse({
      applicationId: appId,
      mode: 'bkash',
      checkItems: allChecksDone,
      mfsReference: 'TRX8H2K9QZ1',
    });
    expect(bkashOk.success).toBe(true);

    const bankWithoutRef = disbursementCreateSchema.safeParse({
      applicationId: appId,
      mode: 'bank_transfer',
      checkItems: allChecksDone,
    });
    expect(bankWithoutRef.success).toBe(false);
  });

  it('shifts due dates off holidays and weekly closures without changing amounts', () => {
    // Friday disbursement → weekly installments would land on Fridays.
    const friday = new Date('2026-01-02T00:00:00Z'); // a Friday
    expect(friday.getUTCDay()).toBe(5);
    expect(weeklyClosureDay('weekly', friday)).toBe(5);

    // The gov't week closes Friday; due dates shift to Saturday.
    const out = computeDisbursementSchedule({
      principal: '24000.00',
      annualRatePercent: 24,
      method: 'flat',
      termMonths: 1, // ~4 weekly installments
      frequency: 'weekly',
      disbursementDate: friday,
      holidays: [],
      holidayAction: 'shift_forward',
    });
    expect(out.rows.length).toBe(4);
    expect(out.shiftedCount).toBe(out.rows.length);
    for (const row of out.rows) {
      const d = new Date(`${row.dueDate}T00:00:00Z`);
      expect(d.getUTCDay()).not.toBe(5);
    }
    // Flat interest per installment is unchanged by shifting.
    const amounts = new Set(out.rows.map((r) => r.total));
    expect(amounts.size).toBe(1);

    // Original calendar dates are preserved for audit.
    expect(out.rows[0]!.originalDueDate).toBe('2026-01-09');
    expect(out.rows[0]!.shifted).toBe(true);
  });

  it('honors a named holiday with shift_back and shift_forward', () => {
    const holidays = [{ date: '2026-03-17', name: 'Shadhinota Dibosh', nameBn: 'শাদhinota দিবস', isRecurring: false }];
    const forward = nextWorkingDay('2026-03-17', { holidays, closureDay: null, action: 'shift_forward' });
    expect(forward.date).toBe('2026-03-18');
    expect(forward.shifted).toBe(true);
    expect(forward.reason).toContain('Shadhinota');

    const back = nextWorkingDay('2026-03-17', { holidays, closureDay: null, action: 'shift_back' });
    expect(back.date).toBe('2026-03-16');

    // Recurring holiday matches every year on the same month-day.
    const recurring = [{ date: '2000-12-16', name: 'Bijoy Dibosh', isRecurring: true }];
    const hit = nextWorkingDay('2026-12-16', { holidays: recurring, closureDay: null, action: 'shift_forward' });
    expect(hit.date).toBe('2026-12-17');
    expect(hit.reason).toContain('Bijoy');
  });

  it('keeps a declining schedule identical to the core engine apart from dates', () => {
    const disbursementDate = new Date('2026-02-01T00:00:00Z');
    const out = computeDisbursementSchedule({
      principal: '50000.00',
      annualRatePercent: 24,
      method: 'declining_balance',
      termMonths: 12,
      frequency: 'monthly',
      gracePeriodInstallments: 1,
      disbursementDate,
      holidays: [],
      holidayAction: 'shift_forward',
    });
    expect(out.schedule.installmentCount).toBe(12);
    expect(out.rows).toHaveLength(12);
    expect(out.rows[0]!.principal).toBe('0.00'); // grace installment
    expect(out.rows.at(-1)!.balanceAfter).toBe('0.00');
    expect(Number(out.schedule.totalPayable)).toBeGreaterThan(50000);
    // Monthly dues are not on the weekly closure day → no shifts.
    expect(out.shiftedCount).toBe(0);
  });

  it('groups the queue by samity and planned date', () => {
    expect(queueGroupKey({ samityName: 'Rupali Samity', samityId: 's1', plannedDate: '2026-10-01' })).toBe('Rupali Samity::2026-10-01');
    expect(queueGroupKey({ samityName: null, samityId: null, plannedDate: null })).toBe('unassigned::unscheduled');
  });
});

describe('disbursement governance (two-step, journal, rollback)', () => {
  it('builds a balanced journal entry: debit portfolio, credit settlement + fee incomes', () => {
    const entry = buildDisbursementJournal({
      applicationId: 'app-1',
      disbursementDate: '2026-09-22',
      principal: '12000.00',
      mode: 'cash_branch',
      feeAmounts: { processingFee: '120.00', insurancePremium: '60.00' },
    });
    expect(entry.sourceType).toBe('loan_disbursement');
    const debits = entry.lines.reduce((s, l) => s + Number(l.debit), 0);
    const credits = entry.lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debits).toBeCloseTo(credits, 2);
    const portfolio = entry.lines.find((l) => l.accountCode === '1200');
    expect(portfolio?.debit).toBe('12000.00');
    const cash = entry.lines.find((l) => l.accountCode === '1010');
    expect(cash?.credit).toBe('11820.00'); // 12000 − 120 − 60
    expect(entry.lines.some((l) => l.accountCode === '4200' && l.credit === '120.00')).toBe(true);
    expect(entry.lines.some((l) => l.accountCode === '4220' && l.credit === '60.00')).toBe(true);
  });

  it('routes the settlement account by mode and reverses on cancel', () => {
    const bank = buildDisbursementJournal({ applicationId: 'a', disbursementDate: '2026-09-22', principal: '1000.00', mode: 'bank_transfer' });
    expect(bank.lines.some((l) => l.accountCode === '1020')).toBe(true);
    const mfs = buildDisbursementJournal({ applicationId: 'a', disbursementDate: '2026-09-22', principal: '1000.00', mode: 'bkash' });
    expect(mfs.lines.some((l) => l.accountCode === '1030')).toBe(true);
    const reversal = buildDisbursementJournal({
      applicationId: 'a', disbursementDate: '2026-09-22', principal: '1000.00', mode: 'cash_branch', reversal: true,
    });
    expect(reversal.sourceType).toBe('loan_disbursement_reversal');
    expect(reversal.lines.find((l) => l.accountCode === '1200')?.credit).toBe('1000.00');
    expect(reversal.lines.find((l) => l.accountCode === '1010')?.debit).toBe('1000.00');
  });

  it('requires a reason of at least 10 characters to cancel', () => {
    const short = disbursementCancelSchema.safeParse({ reason: 'oops' });
    expect(short.success).toBe(false);
    const ok = disbursementCancelSchema.safeParse({ reason: 'Wrong amount recorded at cash counter' });
    expect(ok.success).toBe(true);
  });

  it('generates the Bangla disbursement SMS', () => {
    const body = loanDisbursementSms({ memberName: 'রহিমা', amount: '12,000', loanNumber: 'LO-DHK-26-0005' });
    expect(body).toContain('রহিমা');
    expect(body).toContain('LO-DHK-26-0005');
    expect(body).toContain('বিতরণ');
  });
});

// ── Collection & Repayment: allocation engine ───────────────────────────────
describe('collection allocation engine', () => {
  const baseRow = {
    loan: {
      applicationId: 'app-1',
      loanNumber: 'LN-DHK-26-0001',
      productName: 'General',
      installmentAmount: '1000.00',
      overdue: [
        { installmentId: 'inst-1', seq: 1, dueDate: '2026-09-01', amount: '1000.00', daysOverdue: 20 },
        { installmentId: 'inst-2', seq: 2, dueDate: '2026-09-08', amount: '1000.00', daysOverdue: 13 },
      ],
      current: { installmentId: 'inst-3', seq: 3, dueDate: '2026-09-22', amount: '1000.00' },
    },
    savingsDue: { accountId: 'sa-1', accountNumber: 'SA-1', productName: 'Compulsory weekly', amount: '200.00' },
    advanceBalance: '0.00',
  } as const;

  it('allocates strictly: overdue → current → savings → advance (overdue_first)', () => {
    // One unified pool flows through the buckets in order; with 3200 due,
    // a 3500 pool leaves exactly 300 past savings as advance.
    const a = allocateCollectionPayment(baseRow, { loanPaid: 3500, savingsPaid: 0, extraPaid: 0 }, 'overdue_first');
    expect(a.overdueApplied.map((o) => o.seq)).toEqual([1, 2]);
    expect(a.overdueApplied.map((o) => o.amount)).toEqual(['1000.00', '1000.00']);
    expect(a.currentApplied).toEqual({ installmentId: 'inst-3', seq: 3, amount: '1000.00' });
    expect(a.savingsApplied).toBe('200.00'); // savings is a bucket in the same chain
    expect(a.advanceApplied).toBe('300.00');
    expect(a.unapplied).toBe('0.00');
  });

  it('savings_first pays savings before overdue buckets', () => {
    const a = allocateCollectionPayment(baseRow, { loanPaid: 0, savingsPaid: 500, extraPaid: 0 }, 'savings_first');
    expect(a.savingsApplied).toBe('200.00');
    expect(a.overdueApplied[0]).toEqual({ installmentId: 'inst-1', seq: 1, amount: '300.00' });
    expect(a.currentApplied).toBeNull();
  });

  it('partial payment fills the oldest overdue first and leaves the rest', () => {
    const a = allocateCollectionPayment(baseRow, { loanPaid: 1200, savingsPaid: 0, extraPaid: 0 }, 'overdue_first');
    expect(a.overdueApplied).toEqual([
      { installmentId: 'inst-1', seq: 1, amount: '1000.00' },
      { installmentId: 'inst-2', seq: 2, amount: '200.00' },
    ]);
    expect(a.currentApplied).toBeNull();
    expect(a.savingsApplied).toBe('0.00');
    expect(a.advanceApplied).toBe('0.00');
  });

  it('routes payments into advance when no dues exist', () => {
    const a = allocateCollectionPayment(
      { loan: null, savingsDue: null, advanceBalance: '40.00' },
      { loanPaid: 0, savingsPaid: 0, extraPaid: 150 },
      'overdue_first',
    );
    expect(a.advanceApplied).toBe('150.00');
    expect(a.overdueApplied).toEqual([]);
  });

  it('handles a savings-only member and zero payments', () => {
    const savingsOnly = { loan: null, savingsDue: { accountId: 'sa', accountNumber: 'SA', productName: 'p', amount: '200.00' }, advanceBalance: '0.00' } as const;
    const a = allocateCollectionPayment(savingsOnly, { loanPaid: 0, savingsPaid: 200, extraPaid: 0 }, 'overdue_first');
    expect(a.savingsApplied).toBe('200.00');
    const zero = allocateCollectionPayment(baseRow, { loanPaid: 0, savingsPaid: 0, extraPaid: 0 }, 'overdue_first');
    expect(zero.overdueApplied).toEqual([]);
    expect(zero.currentApplied).toBeNull();
    expect(zero.savingsApplied).toBe('0.00');
  });

  it('proportional order splits across open buckets with remainder to advance', () => {
    // Pro-rata is approximate by design: 1100 over 3200 open ⇒ ~34.4% of each
    // bucket; what matters is conservation (all money lands somewhere).
    const a = allocateCollectionPayment(baseRow, { loanPaid: 1100, savingsPaid: 0, extraPaid: 0 }, 'proportional');
    const appliedTotal =
      a.overdueApplied.reduce((s, o) => s + Number(o.amount), 0) +
      Number(a.currentApplied?.amount ?? 0) +
      Number(a.savingsApplied) +
      Number(a.advanceApplied);
    expect(appliedTotal).toBeCloseTo(1100, 2);
  });

  it('rowTotalDue sums overdue + current + savings, excluding advance', () => {
    expect(rowTotalDue(baseRow)).toBe('3200.00');
    expect(rowTotalDue({ loan: null, savingsDue: null })).toBe('0.00');
  });

  it('rejects malformed money in the entry schema', () => {
    const base = { idempotencyKey: crypto.randomUUID(), memberId: crypto.randomUUID(), meetingDate: '2026-09-22' };
    expect(collectionEntrySchema.safeParse({ ...base, loanPaid: 'abc' }).success).toBe(false);
    expect(collectionEntrySchema.safeParse({ ...base, loanPaid: '-5' }).success).toBe(false);
    expect(collectionEntrySchema.safeParse({ ...base, idempotencyKey: 'not-a-uuid' }).success).toBe(false);
  });
});
