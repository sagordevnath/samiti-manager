import { describe, expect, it } from 'vitest';
import {
  DOC_KINDS,
  VERIFY_CODE_RE,
  banglaCalendarDate,
  defaultDocTemplates,
  docTemplateSchema,
  docVariablesUsed,
  numberToWordsBn,
  renderDocTemplate,
  takaWords,
  toBanglaDigitsFlexible,
  toEnglishDigits,
  verifyCodePayload,
} from '../src/documents';
import { toBanglaDigits } from '../src/format';
import {
  BUDGET_ALERT_THRESHOLD,
  CASE_FLOW,
  budgetAlertLevel,
  budgetMonitor,
  buildDonorReport,
  buildDonorReportHtml,
  burnRate,
  canTransitionCase,
  donorUtilization,
  fundingSourceSchema,
  maskCase,
  nextCaseNo,
  nextFundingCode,
  repaymentSchedule,
  repaymentSummary,
  visitScore,
  overdueFollowUps,
  caseFileSchema,
  fieldVisitSchema,
  projectExpenseSchema,
  type VisitChecklistRow,
} from '../src/programs-ops';
import {
  MockSmsProvider,
  TEMPLATE_KINDS,
  TEMPLATE_KIND_AUDIENCE,
  assertWithinCaps,
  commRulesSchema,
  defaultTemplates,
  inSendWindow,
  isOptedOut,
  messageTemplateSchema,
  nextRetryAt,
  renderTemplate,
  smsParts,
  templateVariablesUsed,
} from '../src/communication';
import {
  DASHBOARD_ROLES,
  MRA_RETURN_SECTIONS,
  RATIO_KEYS,
  STANDARD_REPORTS,
  areaZoneDashboard,
  branchRanking,
  buildOfficerDashboard,
  buildBoardDashboard,
  collectionEfficiencyReport,
  computeRatios,
  disbursementRegisterReport,
  dropoutAnalysisReport,
  evalFormula,
  formulaIdentifiers,
  generateRegulatoryReturn,
  headOfficeDashboard,
  mraStarterTemplate,
  outstandingLoansReport,
  overdueAgingReport,
  pksfStarterTemplate,
  renderRegulatoryTextBn,
  savingsPositionReport,
  samityListReport,
  staffProductivityReport,
  validateTemplate,
  loanUtilizationReport,
  type MisSnapshot,
} from '../src/reports-mis';
import {
  BUILDER_DATASETS,
  CHART_TYPES,
  ESCALATION_LADDER,
  MIS_INDEX_DOCS,
  MIS_MATVIEWS,
  SCHEDULE_FREQUENCIES,
  applyFilter,
  buildReportRows,
  canRunSavedReport,
  clientProtectionIndicators,
  complaintDueAt,
  complaintActionSchema,
  complaintCreateSchema,
  deliveryEmailBodyBn,
  deliveryEmailSubjectBn,
  exportScheduleSchema,
  freezeCheck,
  isScheduleDue,
  monthFreezeSchema,
  monthOf,
  nextComplaintTicket,
  nextEscalationLevel,
  previousMonth,
  runBuilder,
  smtpFromEnv,
  toCsv,
  toExcelXml,
  toPrintHtml,
  validateSavedShared,
  type ComplaintRecord,
} from '../src/reports-mis-ops';
import {
  PROJECT_FLOW,
  PROJECT_ACTION_TO_STATUS,
  activitiesInRange,
  batchStats,
  buildCertificateTextBn,
  canTransitionProject,
  indicatorProgress,
  logframeEntrySchema,
  nextBeneficiaryCode,
  nextBatchCode,
  nextCertificateNo,
  projectSchema,
  projectTotalBudget,
  serviceRecordSchema,
  type ActivityRecord,
  type IndicatorValue,
  type LogframeEntry,
} from '../src/programs';
import {
  AUTO_TASK_DEFS,
  TargetMetrics,
  buildAutoTask,
  canDelegateTask,
  canTransitionTask,
  canVerifyTask,
  isTaskOverdue,
  reassignOpenTasks,
  splitWithinParent,
  targetAchievement,
  targetUpsertSchema,
  taskCreateSchema,
  taskTransitionsFrom,
} from '../src/work';
import {
  APPROVAL_SOURCES,
  buildApprovalInbox,
  buildCalendar,
  buildDailyDigest,
  buildKanban,
  buildSupervisionSubmission,
  canTransitionFinding,
  escalationFor,
  escalateFindings,
  escalateOpenTasks,
  pickRandomSample,
  responseDeadlineFor,
  waitingDaysSince,
} from '../src/work-audit';
import {
  benevolentMonthlyDeduction,
  buildClaimJournal,
  buildPremiumJournal,
  canTransitionClaim,
  canTransitionWelfare,
  claimCanAdvance,
  computeDividend,
  coveragePeriod,
  creditLifeCoverage,
  creditLifePremium,
  microCoverageFor,
  microEnrollSchema,
  missingDeathDocs,
  nextClaimNo,
  nextWelfareRequestNo,
  welfareCapCheck,
  welfareFundAvailable,
  welfareNextLevel,
} from '../src/insurance-welfare';
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  DEFAULT_EVENT_MAPPINGS,
  buildEventJournalLines,
  cashDifference,
  computeTrialBalance,
  glAccountSchema,
  pettyCashAllowed,
  voucherCreateSchema,
} from '../src/accounting';
import {
  AGM_FLOW,
  EXIT_FLOW,
  buildDividendJournal,
  buildDividendPaymentJournal,
  buildExitJournal,
  buildMinutesTextBn,
  buildNoticeTextBn,
  canTransitionAgm,
  canTransitionDividendStatus,
  canTransitionExit,
  claimRatio,
  computeExitNet,
  distributeDividend,
  electionWinner,
  periodWeightedShares,
  premiumVsPayout,
  quorumMet,
  resolutionPasses,
  splitSurplus,
} from '../src/coop-governance';
import {
  amountInWords,
  amountInWordsBn,
  amountInWordsEn,
  buildBudgetVsActual,
  buildBalanceSheet,
  buildFundStatement,
  buildIncomeExpenditure,
  buildLedger,
  buildReceiptsPayments,
  buildTransferLines,
  canReopenPeriod,
  checkVoucherPostingRules,
  periodHasVouchers,
  VOUCHER_PRINT_LABELS,
  VOUCHER_TYPE_LABELS,
  type Voucher,
} from '../src/accounting-ops';
import {
  applicantFinalScore,
  canGrantLeave,
  daysBetweenInclusive,
  deriveAttendanceStatus,
  isFieldStaff,
  leaveBalance,
  probationDue,
  probationEndDateFor,
  renderMovementOrder,
  renderOfferLetter,
} from '../src/hr';
import {
  computePayrollLine,
  monthlyTax,
  festivalBonusFor,
  payslipText,
  bankSheet,
  gratuityFor,
  scoreKpi,
  kpiGrade,
  appraisalRating,
  renderWarningLetterBn,
  renderWarningLetterEn,
} from '../src/hr-payroll';
import {
  ASSET_CLASSES,
  DELINQUENCY_BUCKETS,
  assetClassForDpd,
  bucketForDaysPastDue,
  computePar,
  onTimeRepaymentRate,
  provisionPercentFor,
  worklistLevelFor,
  type ClassifiedLoan,
} from '../src/delinquency.js';
import {
  attendanceFalling,
  countConsecutiveMissed,
  renderLegalNoticeBn,
  ROOT_CAUSES,
  type RootCause,
} from '../src/delinquency-recovery.js';
import { formatMoney, toAsciiDigits, toBanglaDigits } from '../src/format';
import { allocateCollectionPayment, rowTotalDue } from '../src/collection-engine';
import {
  checkCollectionDate,
  CollectionEntryMeta,
  computeClosureRebate,
  scanEntriesForFraud,
} from '../src/collection-settlement';
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
  MEMBER_LIFECYCLE,
  STATUS_REASON_CODES,
  canTransitionMemberStatus,
} from '../src/member-ops';
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

  it('pairs every status with valid reason codes only (req 6)', () => {
    expect(STATUS_REASON_CODES.deceased).toEqual(['death']);
    expect(STATUS_REASON_CODES.transferred).toEqual(['transfer_out']);
    expect(STATUS_REASON_CODES.dormant).toEqual(['inactivity']);
    expect(STATUS_REASON_CODES.dropout).not.toContain('death');
    for (const status of MEMBER_LIFECYCLE) {
      expect(STATUS_REASON_CODES[status].length).toBeGreaterThan(0);
    }
  });

  it('checks transitions through canTransitionMemberStatus (req 6)', () => {
    expect(canTransitionMemberStatus('active', 'dormant')).toBe(true);
    expect(canTransitionMemberStatus('active', 'pending')).toBe(false);
    expect(canTransitionMemberStatus('deceased', 'active')).toBe(false);
    expect(canTransitionMemberStatus('active', 'active')).toBe(false); // no-op rejected
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

describe('collection settlement & control', () => {
  const schedule = [
    { seq: 1, total: '525.00', interest: '100.00', paidAmount: '525.00' },
    { seq: 2, total: '525.00', interest: '100.00', paidAmount: '525.00' },
    { seq: 3, total: '525.00', interest: '100.00' },
    { seq: 4, total: '525.00', interest: '100.00' },
  ];

  it('computes closure rebate: unearned interest minus service deduction', () => {
    const q = computeClosureRebate({ rows: schedule, serviceDeductionPercent: 10 });
    expect(q.remainingInstallments).toBe(2);
    // outstanding = 1050, unearned = 200, deduction = 20, rebate = 180
    expect(q.unearnedInterest).toBe('200.00');
    expect(q.serviceDeduction).toBe('20.00');
    expect(q.rebate).toBe('180.00');
    expect(q.outstandingPrincipal).toBe('850.00');
    expect(q.closureAmount).toBe('870.00'); // principal 850 + service 20
  });

  it('treats partially paid rows as open in the rebate quote', () => {
    const withPartial = schedule.map((r) => (r.seq === 3 ? { ...r, paidAmount: '225.00' } : r));
    const q = computeClosureRebate({ rows: withPartial });
    expect(q.remainingInstallments).toBe(2); // seq 3 and 4 still open
    expect(q.unearnedInterest).toBe('200.00');
  });

  it('date rule blocks future dating and deep backdating', () => {
    expect(checkCollectionDate('2026-09-22', '2026-09-22')).toEqual({ allowed: true });
    expect(checkCollectionDate('2026-09-20', '2026-09-22')).toEqual({ allowed: true }); // within 2 days
    expect(checkCollectionDate('2026-09-19', '2026-09-22')).toEqual({
      allowed: false, reason: 'backdated', maxDays: 2,
    });
    expect(checkCollectionDate('2026-09-23', '2026-09-22')).toEqual({
      allowed: false, reason: 'future_dated', maxDays: 0,
    });
  });

  it('flags identical amounts across many members and GPS outliers', () => {
    const mk = (i: number, total: string, meta: CollectionEntryMeta | null) => ({
      entryId: `e${i}`, receiptNo: `R${i}`, officerId: 'o1', memberId: `m${i}`,
      totalCollected: total, meta, createdAt: '2026-09-22T10:00:00Z',
    });
    const entries = [
      mk(1, '500.00', { lat: 23.8, lng: 90.4 }),
      mk(2, '500.00', { lat: 23.8, lng: 90.4 }),
      mk(3, '500.00', { lat: 23.8, lng: 90.4 }),
      mk(4, '500.00', { lat: 23.8, lng: 90.4 }),
      mk(5, '500.00', { lat: 23.801, lng: 90.402 }),
      mk(6, '700.00', { lat: 24.0, lng: 90.9 }), // ~60km away
    ];
    const flags = scanEntriesForFraud({
      entries,
      peerTotalsByMember: {},
      meetingPoint: { lat: 23.8, lng: 90.4 },
    });
    const identical = flags.find((f) => f.rule === 'identical_amounts');
    expect(identical?.severity).toBe('high');
    const gps = flags.filter((f) => f.rule === 'outside_meeting_radius');
    expect(gps).toHaveLength(1);
    expect(Number(gps[0]?.detail.match(/Captured (\d+) m/)?.[1] ?? 0)).toBeGreaterThan(50_000);
  });

  it('keeps normal collections clean', () => {
    const entries = [1, 2, 3].map((i) => ({
      entryId: `e${i}`, receiptNo: `R${i}`, officerId: 'o1', memberId: `m${i}`,
      totalCollected: `${i * 100}.00`, meta: { lat: 23.8, lng: 90.4 }, createdAt: 'x',
    }));
    expect(
      scanEntriesForFraud({ entries, peerTotalsByMember: {}, meetingPoint: { lat: 23.8, lng: 90.4 } }),
    ).toEqual([]);
  });
});

describe('delinquency classification (shared engine)', () => {
  it('buckets days past per the editable settings', () => {
    expect(DELINQUENCY_BUCKETS.length).toBe(5);
    expect(bucketForDaysPastDue(0)).toBe('regular');
    expect(bucketForDaysPastDue(1)).toBe('d1_30');
    expect(bucketForDaysPastDue(30)).toBe('d1_30');
    expect(bucketForDaysPastDue(31)).toBe('d31_90');
    expect(bucketForDaysPastDue(90)).toBe('d31_90');
    expect(bucketForDaysPastDue(91)).toBe('d91_180');
    expect(bucketForDaysPastDue(180)).toBe('d91_180');
    expect(bucketForDaysPastDue(181)).toBe('d180_plus');
    // Editable bounds: raise the first bucket to 15 days.
    const s = { ...{ buckets: { d1_30: 15, d31_90: 60, d91_180: 120 }, provisioning: { standard: 0, substandard: 20, doubtful: 50, bad: 100 }, assetClassByDpd: { substandard: 16, doubtful: 61, bad: 121 }, escalateToBmDays: 3, escalateToAmDays: 15 } };
    expect(bucketForDaysPastDue(16, s)).toBe('d31_90');
    expect(bucketForDaysPastDue(15, s)).toBe('d1_30');
  });

  it('maps asset classes and provisioning percentages', () => {
    expect(ASSET_CLASSES).toEqual(['standard', 'substandard', 'doubtful', 'bad']);
    expect(assetClassForDpd(0)).toBe('standard');
    expect(assetClassForDpd(45)).toBe('substandard');
    expect(assetClassForDpd(120)).toBe('doubtful');
    expect(assetClassForDpd(200)).toBe('bad');
    expect(provisionPercentFor('standard')).toBe(0);
    expect(provisionPercentFor('substandard')).toBe(25);
    expect(provisionPercentFor('doubtful')).toBe(50);
    expect(provisionPercentFor('bad')).toBe(100);
    // Editable provisioning.
    expect(provisionPercentFor('substandard', { ...{ provisioning: { standard: 0, substandard: 10, doubtful: 40, bad: 90 } } } as never)).toBe(10);
  });

  it('escalates by days past due', () => {
    expect(worklistLevelFor(1)).toBe('field_officer');
    expect(worklistLevelFor(3)).toBe('field_officer');
    expect(worklistLevelFor(4)).toBe('branch_manager');
    expect(worklistLevelFor(15)).toBe('branch_manager');
    expect(worklistLevelFor(16)).toBe('area_manager');
  });

  it('computes on-time repayment rate only for installments already due', () => {
    const today = new Date().toISOString().slice(0, 10);
    const past = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
    const future = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
    const rows = [
      { dueDate: past(10), paidAt: `${past(10)}T10:00:00Z`, total: '100.00', paidAmount: '100.00' }, // on time
      { dueDate: past(5), paidAt: `${past(2)}T10:00:00Z`, total: '100.00', paidAmount: '100.00' }, // late
      { dueDate: past(2), paidAt: null, total: '100.00', paidAmount: '0.00' }, // unpaid
      { dueDate: future(3), paidAt: null, total: '100.00', paidAmount: '0.00' }, // not yet due
    ];
    const rate = onTimeRepaymentRate(rows);
    expect(rate).toBeCloseTo(1 / 3, 4);
  });

  it('computes PAR aggregates per scope', () => {
    const loan = (dpd: number, outstanding: string): ClassifiedLoan => ({
      applicationId: `a-${dpd}`, loanNumber: null, memberId: 'm1', memberName: 'x', memberCode: 'c',
      branchId: 'b1', samityId: null, officerId: null, productName: null, disbursedOn: '2026-01-01',
      outstanding, overduePrincipal: '0.00', overdueInterest: '0.00', overdueTotal: '0.00',
      daysPastDue: dpd, bucket: bucketForDaysPastDue(dpd), assetClass: assetClassForDpd(dpd),
      provisionPercent: 0, provisionAmount: '0.00', oldestUnpaidDueDate: null,
    });
    const loans = [loan(0, '1000'), loan(5, '500'), loan(45, '300'), loan(95, '200')];
    const par = computePar('branch', 'b1', 'Dhaka', loans);
    expect(par.outstandingTotal).toBe('2000.00');
    expect(par.atRisk).toBe('1000.00'); // 500 + 300 + 200
    expect(par.par1).toBeCloseTo(0.5, 4);
    expect(par.par30).toBeCloseTo(0.25, 4); // 300 + 200
    expect(par.par90).toBeCloseTo(0.1, 4); // 200
    expect(par.loansAtRisk).toBe(3);
  });
});

describe('delinquency recovery (shared engine)', () => {
  const past = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

  it('covers all seven root causes with Bangla labels', () => {
    expect(ROOT_CAUSES).toEqual([
      'business_failure', 'illness', 'flood_disaster', 'migration',
      'diversion_of_funds', 'staff_weakness', 'over_lending',
    ]);
  });

  it('counts consecutive missed installments', () => {
    const rows = [
      { seq: 1, dueDate: past(28), total: '100', paidAmount: '100' }, // paid
      { seq: 2, dueDate: past(21), total: '100' }, // missed
      { seq: 3, dueDate: past(14), total: '100' }, // missed
      { seq: 4, dueDate: past(7), total: '100' }, // missed → 3 consecutive
      { seq: 5, dueDate: past(-7), total: '100' }, // future
    ];
    expect(countConsecutiveMissed(rows, past(0))).toBe(3);
    // A break in the chain resets the streak.
    const broken = [
      { seq: 1, dueDate: past(21), total: '100' }, // missed
      { seq: 2, dueDate: past(14), total: '100', paidAmount: '100' }, // paid
      { seq: 3, dueDate: past(7), total: '100' }, // missed
    ];
    expect(countConsecutiveMissed(broken, past(0))).toBe(1);
  });

  it('flags falling samity attendance only past the drop threshold', () => {
    const steady = [0.9, 0.9, 0.9, 0.9];
    const falling = [0.95, 0.9, 0.7, 0.6];
    expect(attendanceFalling(steady).falling).toBe(false);
    expect(attendanceFalling(falling).falling).toBe(true);
    expect(attendanceFalling(falling).drop).toBeGreaterThan(0.1);
    // Too few meetings → no signal yet.
    expect(attendanceFalling([0.9, 0.5]).falling).toBe(false);
  });

  it('renders the Bangla legal notice with interpolated figures', () => {
    const body = renderLegalNoticeBn({
      orgName: 'সমিটি ডেমো সমবায় সমিতি',
      branchName: 'ধানমন্ডি শাখা',
      memberName: 'জাহানারা পারভীন',
      memberAddress: 'ধানমন্ডি, ঢাকা',
      loanNumber: 'LN-DHK-26-0001',
      overdueTotal: '1050.00',
      outstanding: '11000.00',
      issuedOn: '2026-09-23',
      replyWithinDays: 7,
    });
    expect(body).toContain('জাহানারা পারভীন');
    expect(body).toContain('৳1050.00');
    expect(body).toContain('7 দিনের মধ্যে');
    expect(body).toContain('আইনানুগ ব্যবস্থা');
  });
});

// ── Accounting module ─────────────────────────────────────────────────────────
describe('accounting — chart of accounts', () => {
  it('covers every code already used by module auto-postings', () => {
    const codes = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.code));
    for (const c of ['1010', '1015', '1020', '1030', '1200', '1300', '2100', '2200', '2300', '3100', '4100', '4200', '4220', '6100', '6200', '6210', '7100']) {
      expect(codes.has(c)).toBe(true);
    }
    expect(DEFAULT_CHART_OF_ACCOUNTS.length).toBeGreaterThanOrEqual(30);
  });

  it('rejects bad codes and unbalanced vouchers in Zod', () => {
    expect(glAccountSchema.safeParse({ code: '10', name: 'x', nameBn: 'y', type: 'asset', category: 'cash' }).success).toBe(false);
    const base = {
      branchId: '00000000-0000-4000-8000-0000000000b1',
      voucherType: 'journal',
      voucherDate: '2026-09-23',
      memo: 'Opening balance upload',
      lines: [
        { accountCode: '1010', debit: '100.00', credit: '0.00' },
        { accountCode: '3100', debit: '0.00', credit: '100.00' },
      ],
    };
    expect(voucherCreateSchema.safeParse(base).success).toBe(true);
    // Unbalanced:
    expect(voucherCreateSchema.safeParse({ ...base, lines: [...base.lines, { accountCode: '4500', debit: '0.00', credit: '50.00' }] }).success).toBe(false);
    // Both debit and credit on one line:
    expect(voucherCreateSchema.safeParse({ ...base, lines: [{ ...base.lines[0], credit: '10.00' }, base.lines[1]!] }).success).toBe(false);
  });
});

describe('accounting — event-to-journal mappings', () => {
  it('builds money-in lines as Dr settlement / Cr counter', () => {
    const m = { settlementCode: '1010', counterCode: '2100' };
    const lines = buildEventJournalLines(m, 'savings_deposit', '500.00', (c) => `A${c}`);
    expect(lines[0]).toMatchObject({ accountCode: '1010', debit: '500.00' });
    expect(lines[1]).toMatchObject({ accountCode: '2100', credit: '500.00' });
  });

  it('builds money-out lines flipped and every default mapping is two distinct codes', () => {
    const lines = buildEventJournalLines({ settlementCode: '1010', counterCode: '6100' }, 'salary_payment', '12000.00', (c) => `A${c}`);
    expect(lines[0]).toMatchObject({ accountCode: '6100', debit: '12000.00' });
    expect(lines[1]).toMatchObject({ accountCode: '1010', credit: '12000.00' });
    for (const m of DEFAULT_EVENT_MAPPINGS) {
      expect(m.settlementCode).not.toBe(m.counterCode);
    }
  });
});

describe('accounting — cash book and petty cash', () => {
  it('computes shortage/excess from the physical count', () => {
    expect(cashDifference('575.00', '600.00')).toEqual({ difference: '-25.00', kind: 'shortage' });
    expect(cashDifference('610.00', '600.00')).toEqual({ difference: '10.00', kind: 'excess' });
    expect(cashDifference('600.00', '600.00')).toEqual({ difference: '0.00', kind: 'exact' });
  });

  it('blocks petty-cash spend over limit or over balance', () => {
    expect(pettyCashAllowed('5000.00', '2000.00', '1500.00')).toBe(true);
    expect(pettyCashAllowed('5000.00', '2000.00', '2500.00')).toBe(false);
    expect(pettyCashAllowed('1000.00', '2000.00', '1500.00')).toBe(false);
  });
});

describe('accounting — trial balance', () => {
  it('nets debit-natured and credit-natured accounts and balances', () => {
    const accounts = [
      { code: '1010', name: 'Cash', nameBn: 'নগদ', type: 'asset' as const },
      { code: '2100', name: 'Savings', nameBn: 'সঞ্চয়', type: 'liability' as const },
      { code: '4100', name: 'Interest', nameBn: 'সুদ', type: 'income' as const },
      { code: '6100', name: 'Salary', nameBn: 'বেতন', type: 'expense' as const },
    ];
    const lines = [
      { accountCode: '1010', debit: '1000.00', credit: '300.00' },
      { accountCode: '2100', debit: '0.00', credit: '500.00' },
      { accountCode: '4100', debit: '0.00', credit: '300.00' },
      { accountCode: '6100', debit: '100.00', credit: '0.00' },
      { accountCode: '9999', debit: '999.00', credit: '0.00' }, // unknown — ignored
    ];
    const tb = computeTrialBalance(accounts, lines);
    expect(tb.rows.find((r) => r.code === '1010')).toMatchObject({ balance: '700.00' });
    expect(tb.rows.find((r) => r.code === '2100')).toMatchObject({ balance: '500.00' });
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });
});

// ── Accounting ops (requirements 6–10) ──────────────────────────────────────
describe('accounting ops', () => {
  const HO = { id: '00000000-0000-4000-8000-0000000000h1', code: 'HO', name: 'Head Office', isHo: true };
  const nameFor = (code: string) => `acc-${code}`;

  it('buildTransferLines balances for branch→HO and cancels at consolidation', () => {
    const lines = buildTransferLines({
      settlementCode: '1010',
      dueFromCode: '1400',
      dueToCode: '1400',
      kind: 'branch_to_ho',
      amount: '5000',
      nameFor,
    });
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBeCloseTo(cr, 2);
    expect(lines).toHaveLength(4);
  });

  it('buildTransferLines balances for ho→branch and inter-branch', () => {
    for (const kind of ['ho_to_branch', 'inter_branch'] as const) {
      const lines = buildTransferLines({ settlementCode: '1020', dueFromCode: '1400', dueToCode: '1400', kind, amount: '1200.50', nameFor });
      const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
      const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(dr).toBeCloseTo(cr, 2);
    }
  });

  it('blocks savings credited to expense debits', () => {
    const r = checkVoucherPostingRules({
      lines: [
        { accountCode: '6100', debit: '500.00', credit: '0.00' },
        { accountCode: '2100', debit: '0.00', credit: '500.00' },
      ],
      accountTypes: { '6100': 'expense', '2100': 'liability' },
    });
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe('savings_to_expense');
    expect(r.messageBn).toContain('সঞ্চয়');
  });

  it('blocks savings credited to fixed-asset debits', () => {
    const r = checkVoucherPostingRules({
      lines: [
        { accountCode: '1500', debit: '8000.00', credit: '0.00' },
        { accountCode: '2100', debit: '0.00', credit: '8000.00' },
      ],
      accountTypes: { '1500': 'asset', '2100': 'liability' },
    });
    expect(r.allowed).toBe(false);
    expect(r.violation).toBe('savings_to_fixed_asset');
  });

  it('allows normal deposit settlement (savings credited, cash debited)', () => {
    const r = checkVoucherPostingRules({
      lines: [
        { accountCode: '1010', debit: '500.00', credit: '0.00' },
        { accountCode: '2100', debit: '0.00', credit: '500.00' },
      ],
      accountTypes: { '1010': 'asset', '2100': 'liability' },
    });
    expect(r.allowed).toBe(true);
  });

  it('blocks mixed misuse where savings exceed permitted debits', () => {
    const r = checkVoucherPostingRules({
      lines: [
        { accountCode: '1010', debit: '300.00', credit: '0.00' },
        { accountCode: '6110', debit: '400.00', credit: '0.00' },
        { accountCode: '2100', debit: '0.00', credit: '500.00' },
        { accountCode: '6120', debit: '0.00', credit: '200.00' },
      ],
      accountTypes: { '1010': 'asset', '6110': 'expense', '2100': 'liability', '6120': 'expense' },
    });
    expect(r.allowed).toBe(false);
  });

  const mkVoucher = (date: string, lines: Array<{ accountCode: string; debit: string; credit: string }>, fundId: string | null = null): Voucher => ({
    id: `v-${date}-${lines[0]!.accountCode}`,
    voucherNumber: `JV-T-${date}`,
    branchId: 'b1',
    branchName: 'Dhaka',
    voucherType: 'journal',
    voucherDate: date,
    fundId,
    fundName: null,
    projectName: null,
    payeePayer: null,
    memo: 'test',
    status: 'approved',
    lines: lines.map((l) => ({ ...l, accountName: l.accountCode, fundId, projectName: null, partyName: null, note: null })),
    attachments: [],
    autoSource: null,
    preparedBy: null,
    checkedBy: null,
    checkedAt: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: `${date}T10:00:00Z`,
  });

  it('buildLedger keeps a running balance on the account nature', () => {
    const { rows, closing } = buildLedger(
      [
        { date: '2026-09-01', voucherNumber: 'JV-1', memo: 'a', debit: '500.00', credit: '0.00' },
        { date: '2026-09-05', voucherNumber: 'JV-2', memo: 'b', debit: '0.00', credit: '200.00' },
      ],
      true,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]!.balance).toBe('300.00');
    expect(closing).toBe('300.00');
  });

  it('buildReceiptsPayments computes opening/closing cash and skips pre-period', () => {
    const vouchers = [
      mkVoucher('2026-08-20', [
        { accountCode: '1010', debit: '1000.00', credit: '0.00' },
        { accountCode: '2100', debit: '0.00', credit: '1000.00' },
      ]),
      mkVoucher('2026-09-10', [
        { accountCode: '1010', debit: '500.00', credit: '0.00' },
        { accountCode: '4200', debit: '0.00', credit: '500.00' },
      ]),
      mkVoucher('2026-09-15', [
        { accountCode: '6130', debit: '200.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '200.00' },
      ]),
    ];
    const rpt = buildReceiptsPayments({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      vouchers,
      accountCategory: (c) => (c === '1010' ? 'cash' : c === '1020' ? 'bank' : 'control'),
    });
    expect(rpt.openingCash).toBe('1000.00');
    expect(rpt.totalIn).toBe('500.00');
    expect(rpt.totalOut).toBe('200.00');
    expect(rpt.closingCash).toBe('1300.00');
  });

  it('buildIncomeExpenditure nets income and expense for the surplus', () => {
    const vouchers = [
      mkVoucher('2026-09-10', [
        { accountCode: '1010', debit: '700.00', credit: '0.00' },
        { accountCode: '4100', debit: '0.00', credit: '700.00' },
      ]),
      mkVoucher('2026-09-11', [
        { accountCode: '6100', debit: '300.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '300.00' },
      ]),
    ];
    const rpt = buildIncomeExpenditure({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      vouchers,
      accountType: (c) => (c === '4100' ? 'income' : c.startsWith('6') ? 'expense' : 'asset'),
      accountName: (c) => ({ name: `EN ${c}`, nameBn: `BN ${c}` }),
    });
    expect(rpt.totalIncome).toBe('700.00');
    expect(rpt.totalExpenditure).toBe('300.00');
    expect(rpt.surplus).toBe('400.00');
  });

  it('buildBalanceSheet balances with retained surplus folded into funds', () => {
    const vouchers = [
      mkVoucher('2026-01-05', [
        { accountCode: '1010', debit: '5000.00', credit: '0.00' },
        { accountCode: '3200', debit: '0.00', credit: '5000.00' },
      ]),
      mkVoucher('2026-02-05', [
        { accountCode: '1200', debit: '4000.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '4000.00' },
      ]),
      mkVoucher('2026-03-05', [
        { accountCode: '1010', debit: '600.00', credit: '0.00' },
        { accountCode: '4100', debit: '0.00', credit: '600.00' },
      ]),
    ];
    const accounts = [
      { code: '1010', name: 'Cash', nameBn: 'নগদ', type: 'asset' as const },
      { code: '1200', name: 'Loans', nameBn: 'ঋণ', type: 'asset' as const },
      { code: '3200', name: 'General Fund', nameBn: 'সাধারণ তহবিল', type: 'fund' as const },
    ];
    const rpt = buildBalanceSheet({
      asOf: '2026-12-31',
      vouchers,
      accounts,
      accountType: (c) => (c === '1010' || c === '1200' ? 'asset' : c === '3200' ? 'fund' : c === '4100' ? 'income' : 'expense'),
    });
    expect(rpt.totalAssets).toBe('5600.00');
    expect(rpt.totalFunds).toBe('5600.00');
    expect(rpt.retainedSurplus).toBe('600.00');
    expect(rpt.balanced).toBe(true);
  });

  it('buildFundStatement only includes lines tagged to the fund', () => {
    const fundV = mkVoucher(
      '2026-09-05',
      [
        { accountCode: '1010', debit: '900.00', credit: '0.00' },
        { accountCode: '3200', debit: '0.00', credit: '900.00' },
      ],
      'fund-1',
    );
    const plain = mkVoucher('2026-09-06', [
      { accountCode: '1010', debit: '50.00', credit: '0.00' },
      { accountCode: '6130', debit: '0.00', credit: '50.00' },
    ]);
    const rpt = buildFundStatement({ fundId: 'fund-1', fundName: 'Education Fund', periodStart: '2026-09-01', periodEnd: '2026-09-30', vouchers: [fundV, plain] });
    expect(rpt.lines).toHaveLength(2);
    expect(rpt.totalDebit).toBe('900.00');
    expect(rpt.totalCredit).toBe('900.00');
    expect(rpt.closingBalance).toBe('0.00'); // the tagged lines offset: Dr 900 / Cr 900
  });

  it('buildBudgetVsActual computes variance per account', () => {
    const vouchers = [
      mkVoucher('2026-09-10', [
        { accountCode: '6100', debit: '1200.00', credit: '0.00' },
        { accountCode: '1010', debit: '0.00', credit: '1200.00' },
      ]),
    ];
    const rpt = buildBudgetVsActual({
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      budgets: [
        { accountCode: '6100', amount: '1000.00' },
        { accountCode: '6110', amount: '500.00' },
      ],
      vouchers,
      accountName: (c) => ({ name: `EN ${c}`, nameBn: `BN ${c}` }),
      accountType: (c) => (c.startsWith('6') ? 'expense' : 'asset'),
    });
    expect(rpt.lines[0]!.actual).toBe('1200.00');
    expect(rpt.lines[0]!.variance).toBe('-200.00');
    expect(rpt.lines[1]!.actual).toBe('0.00');
    expect(rpt.lines[1]!.variance).toBe('500.00');
    expect(rpt.totalBudgeted).toBe('1500.00');
    expect(rpt.totalActual).toBe('1200.00');
  });

  it('periodHasVouchers detects approved activity inside the window', () => {
    const vs = [
      mkVoucher('2026-09-15', [{ accountCode: '1010', debit: '1.00', credit: '0.00' }, { accountCode: '2100', debit: '0.00', credit: '1.00' }]),
      mkVoucher('2026-10-01', [{ accountCode: '1010', debit: '1.00', credit: '0.00' }, { accountCode: '2100', debit: '0.00', credit: '1.00' }]),
    ];
    expect(periodHasVouchers(vs, '2026-09-01', '2026-09-30')).toBe(true);
    expect(periodHasVouchers(vs, '2026-10-01', '2026-10-31')).toBe(true);
    expect(periodHasVouchers(vs, '2026-11-01', '2026-11-30')).toBe(false);
  });

  it('only Director-Finance-level roles reopen periods', () => {
    expect(canReopenPeriod('super_admin')).toBe(true);
    expect(canReopenPeriod('org_admin')).toBe(true);
    expect(canReopenPeriod('branch_manager')).toBe(false);
    expect(canReopenPeriod('account_officer')).toBe(false);
  });

  it('amountInWords renders bilingual footers', () => {
    expect(amountInWordsBn('1500')).toBe('এক হাজার পাঁচ শত টাকা');
    expect(amountInWordsBn('1250000')).toContain('লক্ষ');
    expect(amountInWordsEn(1500)).toBe('One Thousand Five Hundred Taka');
    expect(amountInWords('1500')).toBe('এক হাজার পাঁচ শত টাকা / One Thousand Five Hundred Taka');
    expect(VOUCHER_TYPE_LABELS.cash_receipt.bn).toBe('নগদ প্রাপ্তি ভাউচার');
    expect(VOUCHER_PRINT_LABELS.en.voucherNo).toBe('Voucher No');
  });
});


// ── HR module ───────────────────────────────────────────────────────────────
describe('HR — staff master', () => {
  it('flags field staff by designation', () => {
    expect(isFieldStaff({ designation: 'field_officer' })).toBe(true);
    expect(isFieldStaff({ designation: 'senior_field_officer' })).toBe(true);
    expect(isFieldStaff({ designation: 'branch_manager' })).toBe(false);
  });

  it('computes the 12-month probation end', () => {
    expect(probationEndDateFor('2026-01-15')).toBe('2027-01-14');
    expect(probationEndDateFor('2026-02-28')).toBe('2027-02-27');
    expect(probationEndDateFor('bad')).toBeNull();
  });

  it('surfaces probation due/overdue for the worklist', () => {
    const staff = { status: 'probation' as const, probationEndDate: '2026-09-20' };
    expect(probationDue(staff, '2026-09-20')).toBe('due');
    expect(probationDue(staff, '2026-09-25')).toBe('overdue');
    expect(probationDue(staff, '2026-09-01')).toBeNull();
    expect(probationDue({ status: 'confirmed' as const, probationEndDate: '2026-09-20' }, '2026-09-25')).toBeNull();
  });
});

describe('HR — recruitment', () => {
  it('averages interview scores', () => {
    expect(applicantFinalScore({ interviewScores: [] })).toBeNull();
    expect(
      applicantFinalScore({
        interviewScores: [
          { panelist: 'A', score: 7, note: null },
          { panelist: 'B', score: 8, note: null },
          { panelist: 'C', score: 9, note: null },
        ],
      }),
    ).toBe(8);
  });

  it('renders bilingual offer letters with key fields', () => {
    const letter = renderOfferLetter({
      orgName: 'Dhaka Samity',
      candidateName: 'Rahima Begum',
      designationBn: 'ফিল্ড অফিসার',
      designationEn: 'Field Officer',
      branchName: 'Dhaka Branch',
      joiningDate: '2026-10-01',
      monthlyGross: '18500.00',
      probationMonths: 12,
      issuedOn: '2026-09-23',
    });
    expect(letter).toContain('নিয়োগ পত্র');
    expect(letter).toContain('Rahima Begum');
    expect(letter).toContain('18500.00');
    expect(letter).toContain('Offer of Employment');
  });
});

describe('HR — attendance & leave', () => {
  it('derives present/late from the 09:10 shift cut-off', () => {
    const early = deriveAttendanceStatus({ mode: 'office', checkInAt: '2026-09-23T08:55:00Z' });
    expect(early.status).toBe('present');
    expect(early.distanceMeters).toBeNull();

    const late = deriveAttendanceStatus({ mode: 'office', checkInAt: '2026-09-23T09:35:00Z' });
    expect(late.status).toBe('late');
  });

  it('measures field distance and flags out-of-range check-ins', () => {
    const near = deriveAttendanceStatus({
      mode: 'field',
      checkInAt: '2026-09-23T03:00:00Z',
      branchPoint: { lat: 23.8103, lng: 90.4125 },
      checkInPoint: { lat: 23.8113, lng: 90.4130 },
    });
    expect(near.status).toBe('present');
    expect(near.outOfRange).toBe(false);
    expect(near.distanceMeters).toBeLessThan(300);

    const far = deriveAttendanceStatus({
      mode: 'field',
      checkInAt: '2026-09-23T03:00:00Z',
      branchPoint: { lat: 23.8103, lng: 90.4125 },
      checkInPoint: { lat: 23.9103, lng: 90.5125 },
    });
    expect(far.outOfRange).toBe(true);
  });

  it('counts inclusive leave days and balances', () => {
    expect(daysBetweenInclusive('2026-09-01', '2026-09-01')).toBe(1);
    expect(daysBetweenInclusive('2026-09-01', '2026-09-05')).toBe(5);
    const bal = leaveBalance('casual', 4);
    expect(bal).toEqual({ entitlement: 10, taken: 4, remaining: 6 });
  });

  it('grants leave only within balance after holiday adjustment', () => {
    expect(canGrantLeave({ leaveType: 'casual', days: 5, approvedDaysTaken: 4, holidaysBetween: 0 })).toBe(true);
    expect(canGrantLeave({ leaveType: 'casual', days: 7, approvedDaysTaken: 4, holidaysBetween: 0 })).toBe(false);
    expect(canGrantLeave({ leaveType: 'casual', days: 7, approvedDaysTaken: 4, holidaysBetween: 2 })).toBe(true);
  });
});

describe('HR — transfer & promotion orders', () => {
  const base = {
    kind: 'transfer' as const,
    staffName: 'Kamal Hossain',
    fromBranchName: 'Dhaka Branch',
    toBranchName: 'Mymensingh Sadar',
    fromDesignation: 'field_officer' as const,
    toDesignation: 'senior_field_officer' as const,
    fromDesignationBn: 'ফিল্ড অফিসার',
    toDesignationBn: 'সিনিয়র ফিল্ড অফিসার',
    effectiveDate: '2026-10-01',
    orderNumber: 'TRF-2026-0007',
    orgName: 'Dhaka Samity',
  };
  it('renders a bilingual transfer order', () => {
    const order = renderMovementOrder(base);
    expect(order).toContain('কর্মস্থল পরিবর্তন');
    expect(order).toContain('TRF-2026-0007');
    expect(order).toContain('Mymensingh Sadar');
    expect(order).toContain('ORDER: Transfer');
  });
  it('renders a bilingual promotion order', () => {
    const order = renderMovementOrder({ ...base, kind: 'promotion', orderNumber: 'PRM-2026-0004' });
    expect(order).toContain('পদোন্নতি');
    expect(order).toContain('ORDER: Promotion');
  });
});

describe('HR payroll: salary computation (req 5)', () => {
  const structure = { basic: '12000.00', houseRent: '3000.00', medical: '1000.00', conveyance: '800.00', fieldAllowance: '1200.00', pfEmployeeRate: '0.05' };

  it('computes gross, PF, progressive tax and net for full attendance', () => {
    const line = computePayrollLine({ staffId: 's1', staffCode: 'EMP-1', staffName: 'A', branchId: null, structure, workingDays: 26, presentDays: 26 });
    expect(line.gross).toBe('18000.00');
    expect(line.deductions.pf_employee).toBe('600.00'); // 5% of basic
    expect(line.deductions.tax).toBe('0.00'); // 17400 taxable is under the 25k exempt band
    expect(line.net).toBe('17400.00');
    expect(line.attendanceRatio).toBe('1.00');
  });

  it('prorates by attendance ratio for unpaid absence', () => {
    const line = computePayrollLine({ staffId: 's1', staffCode: 'EMP-1', staffName: 'A', branchId: null, structure, workingDays: 26, presentDays: 13 });
    expect(line.attendanceRatio).toBe('0.50');
    expect(line.gross).toBe('9000.00');
    expect(line.deductions.pf_employee).toBe('300.00');
  });

  it('counts paid leave as paid days', () => {
    const line = computePayrollLine({ staffId: 's1', staffCode: 'EMP-1', staffName: 'A', branchId: null, structure, workingDays: 26, presentDays: 20, paidLeaveDays: 6 });
    expect(line.attendanceRatio).toBe('1.00');
  });

  it('applies loan advance deduction', () => {
    const line = computePayrollLine({ staffId: 's1', staffCode: 'EMP-1', staffName: 'A', branchId: null, structure, workingDays: 26, presentDays: 26, loanAdvance: 1000 });
    expect(line.deductions.loan_advance).toBe('1000.00');
    expect(line.net).toBe('16400.00');
  });

  it('monthlyTax is progressive across slabs', () => {
    expect(monthlyTax(20000)).toBe(0);
    expect(monthlyTax(30000)).toBe(250); // (30000-25000) × 5%
    expect(monthlyTax(50000)).toBe(1750); // 15000×5% + 10000×10%
  });
});

describe('HR payroll: festival bonus (req 5)', () => {
  it('pays one basic for confirmed staff with 6+ months service', () => {
    expect(festivalBonusFor({ status: 'confirmed', joiningDate: '2024-01-01', basic: '12000.00' }, '2026-03-20')).toBe(12000);
  });

  it('prorates for staff under 6 months and excludes probationers', () => {
    // 3 months of service → half basic.
    const prorated = festivalBonusFor({ status: 'confirmed', joiningDate: '2025-12-20', basic: '12000.00' }, '2026-03-20');
    expect(prorated).toBeGreaterThan(0);
    expect(prorated).toBeLessThan(12000);
    expect(festivalBonusFor({ status: 'probation', joiningDate: '2020-01-01', basic: '12000.00' }, '2026-03-20')).toBe(0);
  });
});

describe('HR payroll: payslip & bank sheet (req 5)', () => {
  it('renders a Bangla payslip with all components', () => {
    const line = computePayrollLine({ staffId: 's1', staffCode: 'EMP-1', staffName: 'কমল', branchId: null, structure: { basic: '12000.00', houseRent: '3000.00', medical: '1000.00', conveyance: '800.00', fieldAllowance: '1200.00', pfEmployeeRate: '0.05' }, workingDays: 26, presentDays: 26 });
    const text = payslipText(line, '2026-09', 'সমিতি ম্যানেজার');
    expect(text).toContain('বেতন স্লিপ');
    expect(text).toContain('মূল বেতন: 12000.00');
    expect(text).toContain('নিট বেতন');
  });

  it('maps bank sheet rows and flags missing accounts', () => {
    const lines = [
      { id: '1', payrollId: 'p', staffId: 's1', staffCode: 'EMP-1', staffName: 'A', branchId: null, components: {} as never, gross: '10.00', deductions: {}, totalDeduction: '0.00', net: '10.00', workingDays: 26, presentDays: 26, attendanceRatio: '1.00' },
      { id: '2', payrollId: 'p', staffId: 's2', staffCode: 'EMP-2', staffName: 'B', branchId: null, components: {} as never, gross: '10.00', deductions: {}, totalDeduction: '0.00', net: '20.00', workingDays: 26, presentDays: 26, attendanceRatio: '1.00' },
    ];
    const rows = bankSheet(lines, new Map([['s1', { bankName: 'DBBL', bankMasked: '····1234' }]]));
    expect(rows[0]).toMatchObject({ accountMasked: '····1234', net: '10.00' });
    expect(rows[1].accountMasked).toBeNull();
  });
});

describe('HR gratuity (req 6)', () => {
  it('pays 15 days basic per completed year', () => {
    // 4 completed years → 4 × half basic monthly.
    expect(gratuityFor('2022-01-01', '2026-01-01', '12000.00')).toBe(24000);
  });

  it('pays nothing under one year', () => {
    expect(gratuityFor('2025-06-01', '2026-03-01', '12000.00')).toBe(0);
  });
});

describe('HR KPI scorecard (req 7)', () => {
  it('scores collection and attendance proportionally', () => {
    expect(scoreKpi('collection_rate', 0.98, 0.98)).toBe(100);
    expect(scoreKpi('meeting_attendance', 0.9, 0.9)).toBe(100);
    expect(scoreKpi('collection_rate', 0.49, 0.98)).toBe(50);
  });

  it('scores PAR inversely (lower is better)', () => {
    expect(scoreKpi('par', 0, 0.05)).toBe(100);
    expect(scoreKpi('par', 0.05, 0.05)).toBe(0);
    expect(scoreKpi('par', 0.025, 0.05)).toBe(50);
  });

  it('grades the mean', () => {
    const actuals = { collection_rate: 0.98, par: 0.02, new_members: 10, meeting_attendance: 0.95 };
    const scores = {
      collection_rate: scoreKpi('collection_rate', actuals.collection_rate, 0.98),
      par: scoreKpi('par', actuals.par, 0.05),
      new_members: scoreKpi('new_members', actuals.new_members, 8),
      meeting_attendance: scoreKpi('meeting_attendance', actuals.meeting_attendance, 0.9),
    };
    const total = (Object.values(scores).reduce((a, b) => a + b, 0)) / 4;
    expect(kpiGrade(total)).toBe('A');
  });
});

describe('HR appraisal (req 7)', () => {
  it('rates 1–10 criteria as 0–100', () => {
    expect(appraisalRating({ job_knowledge: 8, discipline: 9, teamwork: 7, client_service: 8, target_achievement: 8 })).toBe(80);
    expect(appraisalRating({ job_knowledge: 10, discipline: 10, teamwork: 10, client_service: 10, target_achievement: 10 })).toBe(100);
  });
});

describe('HR disciplinary letters (req 8)', () => {
  const base = {
    id: 'c1', orgId: 'o', staffId: 's', staffName: 'কমল হোসেন', severity: 'written_warning' as const,
    incidentDate: '2026-09-01', description: 'সভায় অনুপস্থিত', status: 'open' as const,
    explanation: null, outcome: null, raisedBy: 'hr', closedBy: null, closedAt: null, createdAt: '2026-09-01T00:00:00Z',
  };

  it('renders Bangla and English warning letters', () => {
    const bn = renderWarningLetterBn(base, 'সমিতি ম্যানেজার');
    expect(bn).toContain('সতর্কতা পত্র');
    expect(bn).toContain('লিখিত সতর্কতা');
    expect(bn).toContain('৭ দিনের মধ্যে');
    const en = renderWarningLetterEn(base, 'Samity Manager');
    expect(en).toContain('WARNING LETTER');
    expect(en).toContain('within 7 days');
  });

  it('includes the outcome once closed', () => {
    const bn = renderWarningLetterBn({ ...base, status: 'closed', outcome: 'সতর্ক করা হলো' }, 'x');
    expect(bn).toContain('সিদ্ধান্ত: সতর্ক করা হলো');
  });
});

describe('Work task engine', () => {
  const today = '2026-09-24';

  it('guards status transitions', () => {
    expect(canTransitionTask('todo', 'in_progress')).toBe(true);
    expect(canTransitionTask('todo', 'done')).toBe(false);
    expect(canTransitionTask('blocked', 'done')).toBe(false);
    expect(canTransitionTask('blocked', 'in_progress')).toBe(true);
    expect(canTransitionTask('in_progress', 'done')).toBe(true);
    expect(canTransitionTask('done', 'verified')).toBe(true);
    expect(canTransitionTask('done', 'in_progress')).toBe(true);
    expect(canTransitionTask('verified', 'done')).toBe(false);
    expect(taskTransitionsFrom('verified')).toHaveLength(0);
  });

  it('restricts verification to the assigner or admin', () => {
    const task = { assignerId: 'assigner-1' };
    expect(canVerifyTask(task, 'assigner-1', false)).toBe(true);
    expect(canVerifyTask(task, 'someone-else', false)).toBe(false);
    expect(canVerifyTask(task, 'anyone', true)).toBe(true);
  });

  it('flags overdue only for open tasks past due', () => {
    const t = { dueDate: '2026-09-01', status: 'in_progress' as const };
    expect(isTaskOverdue(t, today)).toBe(true);
    expect(isTaskOverdue({ dueDate: '2026-09-30', status: 'in_progress' }, today)).toBe(false);
    expect(isTaskOverdue({ dueDate: '2026-09-01', status: 'verified' }, today)).toBe(false);
  });

  it('builds auto tasks with dedupe keys and due offsets', () => {
    const orgId = '00000000-0000-4000-8000-00000000w0aa';
    const built = buildAutoTask(
      {
        source: 'overdue_followup',
        linkId: '00000000-0000-4000-8000-0000000000m1',
        linkLabel: 'নুসরাত বেগম',
        branchId: '00000000-0000-4000-8000-0000000000b1',
        assigneeId: '00000000-0000-4000-8000-0000000000f1',
        assigneeName: 'রফিক ইসলাম',
        eventDate: '2026-09-24',
      },
      orgId,
      { id: 'system', name: 'সিস্টেম' },
    );
    expect(built.autoKey).toBe('overdue_followup:00000000-0000-4000-8000-0000000000m1');
    expect(built.input.dueDate).toBe('2026-09-25');
    expect(built.input.priority).toBe('urgent');
    expect(built.input.title).toContain('নুসরাত বেগম');

    const visit = buildAutoTask(
      {
        source: 'utilization_visit',
        linkId: '00000000-0000-4000-8000-0000000000l1',
        linkLabel: 'L-0001',
        assigneeId: '00000000-0000-4000-8000-0000000000f1',
        assigneeName: 'রফিক',
        eventDate: '2026-09-24',
      },
      orgId,
      { id: 'system', name: 'সিস্টেম' },
    );
    expect(visit.input.dueDate).toBe('2026-09-27');
    expect(visit.input.link?.kind).toBe('loan');
  });

  it('validates the create schema', () => {
    const ok = taskCreateSchema.safeParse({
      type: 'manual',
      title: 'শাখা পরিদর্শন',
      assigneeId: '00000000-0000-4000-8000-0000000000f1',
      assigneeName: 'রফিক ইসলাম',
      dueDate: '2026-10-01',
    });
    expect(ok.success).toBe(true);
    const bad = taskCreateSchema.safeParse({ type: 'manual', title: 'x', assigneeId: 'nope', assigneeName: 'ab', dueDate: 'bad' });
    expect(bad.success).toBe(false);
  });
});

describe('Work targets cascade', () => {
  const area: TargetMetrics = { newMembers: 50, disbursement: '500000', collection: '450000', savings: '300000', parLimit: 5 };

  it('computes achievement per metric with PAR inverse', () => {
    const actual: TargetMetrics = { newMembers: 40, disbursement: '400000', collection: '450000', savings: '100000', parLimit: 2.5 };
    const rows = targetAchievement(area, actual);
    const by = Object.fromEntries(rows.map((r) => [r.metric, r]));
    expect(by.newMembers!.pct).toBe(80);
    expect(by.collection!.pct).toBe(100);
    expect(by.savings!.pct).toBe(33);
    expect(by.parLimit!.pct).toBe(100); // 2.5% ≤ 5% limit → met
    const overPar = targetAchievement(area, { ...actual, parLimit: 10 });
    expect(overPar.find((r) => r.metric === 'parLimit')!.pct).toBe(50);
  });

  it('rejects officer splits exceeding the branch parent', () => {
    const parent: TargetMetrics = { newMembers: 10, disbursement: '100000', collection: '90000', savings: '50000', parLimit: 5 };
    const child: TargetMetrics = { newMembers: 6, disbursement: '60000', collection: '50000', savings: '20000', parLimit: 5 };
    const sib1: TargetMetrics = { newMembers: 3, disbursement: '30000', collection: '30000', savings: '10000', parLimit: 5 };
    expect(splitWithinParent(child, parent, sib1)).toBe(true);
    expect(splitWithinParent(child, parent, { ...sib1, newMembers: 5 })).toBe(false);
    expect(splitWithinParent(child, parent, { ...sib1, collection: '45000' })).toBe(false);
    // PAR is a ceiling, not additive: two officers may each carry the same limit
    expect(splitWithinParent(child, parent, { ...sib1, parLimit: 5 })).toBe(true);
  });

  it('validates the target upsert schema', () => {
    const ok = targetUpsertSchema.safeParse({
      scope: 'officer',
      ownerStaffId: '00000000-0000-4000-8000-0000000000f1',
      ownerName: 'রফিক',
      period: '2026-09',
      metrics: { newMembers: 5, disbursement: '50000', collection: '45000', savings: '20000', parLimit: 4 },
    });
    expect(ok.success).toBe(true);
    const badPeriod = targetUpsertSchema.safeParse({ scope: 'officer', ownerName: 'রফিক', period: '2026/09', metrics: {} });
    expect(badPeriod.success).toBe(false);
  });

  it('scopes delegation to open tasks', () => {
    const tasks = [
      { assigneeId: 'f1', status: 'todo' as const },
      { assigneeId: 'f1', status: 'in_progress' as const },
      { assigneeId: 'f1', status: 'done' as const },
      { assigneeId: 'f2', status: 'blocked' as const },
    ];
    expect(reassignOpenTasks(tasks, 'f1')).toHaveLength(2);
    expect(canDelegateTask({ status: 'todo' })).toBe(true);
    expect(canDelegateTask({ status: 'done' })).toBe(false);
    expect(canDelegateTask({ status: 'verified' })).toBe(false);
  });
});

// ── Work audit (supervision, audit, inbox, escalation, calendar) ────────────
describe('Work audit module (req 5–9)', () => {
  it('builds a supervision submission with exceptions counted', () => {
    const sub = buildSupervisionSubmission(
      {
        branchId: '00000000-0000-4000-8000-0000000000b1',
        formType: 'cash_verification',
        linkId: null,
        linkLabel: '',
        lat: 23.8, lng: 90.4, distanceMeters: 120, photos: ['p1.jpg'],
        answers: { cav1: 'yes', cav2: 'no', cav3: 'na' }, note: 'ক্যাশ সীমা ছাড়িয়েছে',
      },
      { orgId: '00000000-0000-4000-8000-0000000000aa', submittedBy: 'f1', submittedByName: 'কমল' },
    );
    expect(sub.items).toHaveLength(3);
    expect(sub.items[0]?.answer).toBe('yes');
    expect(sub.exceptions).toBe(1);
    expect(sub.distanceMeters).toBe(120);
  });

  it('samples randomly without replacement', () => {
    const pool = Array.from({ length: 50 }, (_, i) => `L${i}`);
    const s1 = pickRandomSample(pool, 10);
    const s2 = pickRandomSample(pool, 10);
    expect(s1).toHaveLength(10);
    expect(new Set(s1).size).toBe(10);
    expect(pickRandomSample(['a'], 5)).toEqual(['a']);
    // Two draws are unlikely identical across 50C10, but avoid flaky assert on order.
    expect(s1.every((x) => pool.includes(x))).toBe(true);
    expect(s2.every((x) => pool.includes(x))).toBe(true);
  });

  it('assigns response deadlines by severity and gates finding transitions', () => {
    expect(responseDeadlineFor('critical', '2026-09-24T10:00:00Z')).toBe('2026-10-01');
    expect(responseDeadlineFor('low', '2026-09-24T10:00:00Z')).toBe('2026-10-24');
    expect(canTransitionFinding('open', 'responded')).toBe(true);
    expect(canTransitionFinding('responded', 'closed')).toBe(true);
    expect(canTransitionFinding('open', 'closed')).toBe(true);
    expect(canTransitionFinding('closed', 'open')).toBe(false);
  });

  it('escalates tasks and findings by aging tiers', () => {
    const t = escalationFor(2);
    expect(t.tier).toBeNull();
    expect(escalationFor(4).tier?.role).toBe('branch_manager');
    expect(escalationFor(9).tier?.role).toBe('area_manager');
    expect(escalationFor(20).tier?.role).toBe('org_admin');

    const rows = escalateOpenTasks(
      [
        { id: 'a', dueDate: '2026-09-15', status: 'todo' as const },
        { id: 'b', dueDate: '2026-09-22', status: 'in_progress' as const },
        { id: 'c', dueDate: '2026-09-15', status: 'done' as const },
        { id: 'd', dueDate: '2026-12-01', status: 'todo' as const },
      ],
      '2026-09-24',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.daysOverdue).toBe(9);
    expect(rows[0]?.decision.roleLabelBn).toBe('এরিয়া ব্যবস্থাপক');

    const f = escalateFindings(
      [
        { id: 'f1', severity: 'high', status: 'open', deadline: '2026-09-20' },
        { id: 'f2', severity: 'low', status: 'closed', deadline: '2026-09-01' },
      ],
      '2026-09-24',
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.id).toBe('f1');
  });

  it('builds calendar, kanban and the daily digest', () => {
    const tasks = [
      { id: 't1', dueDate: '2026-09-24', status: 'todo' as const, type: 'meeting_due' as const, priority: 'urgent' as const, title: 'সমিতি সভা' },
      { id: 't2', dueDate: '2026-09-24', status: 'in_progress' as const, type: 'manual' as const, priority: 'normal' as const, title: 'রিপোর্ট' },
      { id: 't3', dueDate: '2026-09-20', status: 'todo' as const, type: 'manual' as const, priority: 'high' as const, title: 'বকেয়া' },
    ] as never[];
    const cal = buildCalendar(tasks, [{ id: 'a1', plannedDate: '2026-09-24' }], [{ id: 's1', submittedAt: '2026-09-24T04:00:00Z' }], '2026-09');
    expect(cal).toHaveLength(30);
    expect(cal[23]?.taskIds).toContain('t1');
    expect(cal[23]?.auditDates).toContain('a1');
    expect(cal[23]?.supervisionCount).toBe(1);

    const kanban = buildKanban(tasks as never);
    expect(kanban.map((c) => c.status)).toEqual(['todo', 'in_progress', 'blocked', 'done', 'verified']);
    expect(kanban[0]?.tasks).toHaveLength(2);

    const digest = buildDailyDigest('branch_manager', '2026-09-24', {
      tasks: tasks as never,
      audits: [{ id: 'a1', title: 'ঢাকা শাখা অডিট', branchName: 'ঢাকা শাখা', plannedDate: '2026-09-24' }],
      submissionsToday: 3,
      findings: [{ id: 'f1', title: 'নগদ ঘাটতি', severity: 'high', status: 'open', deadline: '2026-09-20' }],
    });
    expect(digest.dueToday).toHaveLength(2);
    expect(digest.dueToday[0]?.priority).toBe('urgent');
    expect(digest.overdue).toHaveLength(1);
    expect(digest.auditsToday).toHaveLength(1);
    expect(digest.summaryBn).toContain('বকেয়া কাজ 1টি');
  });

  it('assembles the approval inbox with escalation flags', () => {
    const inbox = buildApprovalInbox([
      { items: [
        { kind: 'loan_application', kindLabelBn: 'ঋণের আবেদন', refId: 'l1', title: 'ঋণ ৫০,০০০', subtitle: 'ঢাকা', linkTo: '/loans/l1', requestedAt: '2026-09-18T04:00:00Z', requesterName: 'কমল', amount: '50000', waitingDays: 6, escalated: true },
        { kind: 'leave_request', kindLabelBn: 'ছুটির আবেদন', refId: 'v1', title: 'ছুটি', subtitle: 'নুসরাত', linkTo: '/hr', requestedAt: '2026-09-24T04:00:00Z', requesterName: 'নুসরাত', amount: null, waitingDays: 0, escalated: false },
      ] },
      { items: [
        { kind: 'payroll_run', kindLabelBn: 'পেরোল', refId: 'p1', title: 'সেপ্টেম্বর পেরোল', subtitle: 'ঢাকা', linkTo: '/hr', requestedAt: '2026-09-23T04:00:00Z', requesterName: 'হিসাব', amount: '58900', waitingDays: 1, escalated: false },
      ] },
    ]);
    expect(inbox[0]?.refId).toBe('l1'); // most waited first
    expect(inbox).toHaveLength(3);
    expect(waitingDaysSince('2026-09-18T04:00:00Z', '2026-09-24')).toBe(6);
    expect(APPROVAL_SOURCES['loan_application']?.escalateAfterDays).toBe(3);
  });
});

// ── Insurance, welfare & dividend ───────────────────────────────────────────
describe('Insurance & welfare module', () => {
  it('computes credit life premium with floor and coverage cap', () => {
    expect(creditLifePremium('50000', 1.0, 100)).toBe('500.00');
    expect(creditLifePremium('3000', 1.0, 100)).toBe('100.00'); // floor
    expect(creditLifeCoverage('600000', 500000)).toBe('500000.00');
    expect(creditLifeCoverage('120000', 500000)).toBe('120000.00');
  });

  it('gates death claims on required documents', () => {
    const bare = { kind: 'death' as const, status: 'submitted' as const, documents: [{ id: 'death_certificate', labelBn: 'মৃত্যুসনদ', path: 'p/1' }] };
    const missing = missingDeathDocs(bare);
    expect(missing).toHaveLength(2);
    expect(claimCanAdvance(bare).ok).toBe(false);
    const complete = { ...bare, documents: [
      { id: 'death_certificate', labelBn: 'মৃত্যুসনদ', path: 'p/1' },
      { id: 'nominee_nid', labelBn: 'নমিনির এনআইডি', path: 'p/2' },
      { id: 'nominee_proof', labelBn: 'নমিনি প্রমাণ', path: 'p/3' },
    ] };
    expect(claimCanAdvance(complete).ok).toBe(true);
    // Non-death claims need no docs
    expect(claimCanAdvance({ kind: 'health', status: 'submitted', documents: [] }).ok).toBe(true);
  });

  it('enforces the claim review ladder and builds settlement journals', () => {
    expect(canTransitionClaim('submitted', 'bm_review')).toBe(true);
    expect(canTransitionClaim('bm_review', 'am_review')).toBe(true);
    expect(canTransitionClaim('am_review', 'ho_review')).toBe(true);
    expect(canTransitionClaim('ho_review', 'approved')).toBe(true);
    expect(canTransitionClaim('approved', 'paid')).toBe(true);
    expect(canTransitionClaim('submitted', 'ho_review')).toBe(false);
    expect(canTransitionClaim('rejected', 'approved')).toBe(false);

    const waiver = buildClaimJournal({ claimNo: 'CL-2026-0001', settlementMode: 'waiver', amount: '45000' });
    expect(waiver.lines[0]?.accountCode).toBe('5300');
    expect(waiver.lines[1]?.accountCode).toBe('1200');
    const payout = buildClaimJournal({ claimNo: 'CL-2026-0002', settlementMode: 'payout', amount: '45000' });
    expect(payout.lines[1]?.accountCode).toBe('1010');
    // Balanced
    for (const j of [waiver, payout]) {
      const dr = j.lines.reduce((s, l) => s + Number(l.debit), 0);
      const cr = j.lines.reduce((s, l) => s + Number(l.credit), 0);
      expect(dr).toBe(cr);
    }
    const prem = buildPremiumJournal('500');
    expect(prem.lines[0]?.debit).toBe('500.00');
    expect(prem.lines[1]?.credit).toBe('500.00');
  });

  it('prices micro coverage per unit and validates products', () => {
    const enr = { units: 2, coverageLimit: '40000.00' };
    expect(microCoverageFor(enr, '35000')).toBe('35000.00');
    expect(microCoverageFor(enr, '45000')).toBe('40000.00');
    const parsed = microEnrollSchema.safeParse({
      productId: '00000000-0000-4000-8000-0000000000b1',
      memberId: '00000000-0000-4000-8000-0000000001a1',
      memberName: 'রহিমা বেগম', units: 2, startDate: '2026-09-24',
    });
    expect(parsed.success).toBe(true);
  });

  it('routes welfare requests by amount with caps', () => {
    // grant of 2000: BM approves directly
    expect(welfareNextLevel('bm_review', '2000').next).toBe('approved');
    // grant of 6000: goes to AM
    expect(welfareNextLevel('bm_review', '6000').next).toBe('am_review');
    // caps
    expect(welfareCapCheck('grant', '6000').ok).toBe(false);
    expect(welfareCapCheck('grant', '5000').ok).toBe(true);
    expect(welfareCapCheck('interest_free_loan', '25000').ok).toBe(false);
    expect(welfareCapCheck('interest_free_loan', '20000').ok).toBe(true);
    // flow
    expect(canTransitionWelfare('submitted', 'bm_review')).toBe(true);
    expect(canTransitionWelfare('bm_review', 'approved')).toBe(true);
    expect(canTransitionWelfare('approved', 'disbursed')).toBe(true);
    expect(canTransitionWelfare('rejected', 'approved')).toBe(false);
    // fund balance
    expect(welfareFundAvailable('100000', '20000', '50000')).toBe(true);
    expect(welfareFundAvailable('60000', '20000', '50000')).toBe(false);
  });

  it('splits dividend by share ratio and staff benevolent deduction', () => {
    const res = computeDividend({ surplus: '100000', payoutPct: 70, totalShares: 100 }, [
      { memberId: 'm1', memberName: 'রহিমা', shares: 60 },
      { memberId: 'm2', memberName: 'সালমা', shares: 40 },
    ]);
    expect(res.pool).toBe('70000.00');
    expect(res.reserve).toBe('30000.00');
    expect(res.perHolder[0]?.amount).toBe('42000.00');
    expect(res.perHolder[1]?.amount).toBe('28000.00');
    expect(benevolentMonthlyDeduction(12, '50.00')).toBe('600.00');
  });

  it('numbers claims and welfare requests and computes coverage periods', () => {
    expect(nextClaimNo(7)).toBe('CL-2026-0007');
    expect(nextWelfareRequestNo(3, 'member')).toMatch(/^WF-\d{4}-0003$/);
    expect(nextWelfareRequestNo(3, 'staff')).toMatch(/^SB-\d{4}-0003$/);
    const period = coveragePeriod('2026-01-01', 12);
    expect(period.endDate).toBe('2027-01-01');
    expect(period.days).toBe(365);
  });
});

// ── Cooperative governance: dividend, AGM, exit, reports (req 5–8) ──────────
describe('Cooperative governance (req 5–8)', () => {
  const HOLDERS = [
    { memberId: 'm1', memberName: 'রহিমা বেগম', shares: 10, monthsHeld: 12 },
    { memberId: 'm2', memberName: 'সালমা খাতুন', shares: 6, monthsHeld: 6 },
  ];

  it('splits the annual surplus into statutory reserve and pool', () => {
    const s = splitSurplus('200000', 25);
    expect(s.reserveAmount).toBe('50000.00');
    expect(s.distributablePool).toBe('150000.00');
    expect(s.retainedAfterReserve).toBe('150000.00');
    // Default reserve is 25%
    expect(splitSurplus('100000').reserveAmount).toBe('25000.00');
  });

  it('weights shares by holding period', () => {
    expect(periodWeightedShares({ shares: 10, monthsHeld: 12 })).toBe(10);
    expect(periodWeightedShares({ shares: 6, monthsHeld: 6 })).toBe(3);
    expect(periodWeightedShares({ shares: 5, monthsHeld: 0 })).toBe(0);
    // Months beyond 12 are clamped
    expect(periodWeightedShares({ shares: 4, monthsHeld: 24 })).toBe(4);
  });

  it('distributes the dividend pool by period-weighted shares', () => {
    const d = distributeDividend({ surplus: '200000', reservePct: 25, ratePct: 10, holders: HOLDERS });
    expect(d.pool).toBe('150000.00');
    expect(d.reserveAmount).toBe('50000.00');
    // Weights: 10 and 3 → total 13; m1 = 150000×10/13
    expect(d.totalWeighted).toBe(13);
    expect(d.perMember[0]?.amount).toBe('115384.62');
    expect(d.perMember[1]?.amount).toBe('34615.38');
    // Weights are percent of pool
    expect(d.perMember[0]?.weightPct).toBeCloseTo(76.92, 1);
  });

  it('guards the dividend status machine and journals', () => {
    expect(canTransitionDividendStatus('computed', 'agm_approved')).toBe(true);
    expect(canTransitionDividendStatus('agm_approved', 'posted')).toBe(true);
    expect(canTransitionDividendStatus('posted', 'paid')).toBe(true);
    expect(canTransitionDividendStatus('computed', 'posted')).toBe(false);
    expect(canTransitionDividendStatus('paid', 'computed')).toBe(false);

    const j = buildDividendJournal({ surplus: '200000', reservePct: 25 });
    expect(j.lines).toHaveLength(3);
    expect(j.lines[1]?.credit).toBe('50000.00');
    expect(j.lines[2]?.credit).toBe('150000.00');
    const dr = j.lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = j.lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBe(cr);

    const pay = buildDividendPaymentJournal({ memberName: 'রহিমা', amount: '5000', destination: 'savings' });
    expect(pay.lines[1]?.accountCode).toBe('2100'); // savings account credit
    const payCash = buildDividendPaymentJournal({ memberName: 'রহিমা', amount: '5000', destination: 'cash' });
    expect(payCash.lines[1]?.accountCode).toBe('1010');
  });

  it('checks AGM quorum, resolutions and election winners', () => {
    expect(quorumMet([{ memberId: 'a', memberName: 'A', shares: 1, present: true, proxyFor: null }], 1)).toBe(true);
    expect(quorumMet([{ memberId: 'a', memberName: 'A', shares: 1, present: false, proxyFor: null }], 1)).toBe(false);

    expect(resolutionPasses('ordinary', 51, 49, 0)).toBe(true);
    expect(resolutionPasses('ordinary', 49, 51, 0)).toBe(false);
    // Special resolution needs 2/3 of valid votes
    expect(resolutionPasses('special', 67, 33, 10)).toBe(true);
    expect(resolutionPasses('special', 60, 40, 0)).toBe(false);

    expect(electionWinner([{ name: 'করিম', votes: 40 }, { name: 'লতিফ', votes: 35 }]).winner).toBe('করিম');
    const tie = electionWinner([{ name: 'করিম', votes: 40 }, { name: 'লতিফ', votes: 40 }]);
    expect(tie.winner).toBeNull();
    expect(tie.tie).toBe(true);

    expect(canTransitionAgm('draft', 'notice_issued')).toBe(true);
    expect(canTransitionAgm('notice_issued', 'held')).toBe(true);
    expect(canTransitionAgm('held', 'minutes_approved')).toBe(true);
    expect(canTransitionAgm('draft', 'held')).toBe(false);
    expect(canTransitionAgm('minutes_approved', 'draft')).toBe(false);
  });

  it('builds the Bangla notice and minutes', () => {
    const notice = buildNoticeTextBn({
      orgNameBn: 'উত্তর সমবায় সমিতি',
      fiscalYear: '2025-26',
      meetingDate: '2026-10-15',
      venue: 'শাখা মিলনায়তন',
      noticeDays: 14,
      agenda: ['গত বছরের কার্যবিবরণী', 'লভ্যাংশ হার নির্ধারণ'],
    });
    expect(notice).toContain('বার্ষিক সাধারণ সভা');
    expect(notice).toContain('১৪ দিনের নোটিশ');

    const minutes = buildMinutesTextBn({
      orgNameBn: 'উত্তর সমবায় সমিতি',
      fiscalYear: '2025-26',
      meetingDate: '2026-10-15',
      venue: 'শাখা মিলনায়তন',
      attendance: HOLDERS.map((h) => ({ memberId: h.memberId, memberName: h.memberName, shares: h.shares, present: true, proxyFor: null })),
      quorumRequired: 2,
      resolutions: [{ id: 'r1', agendaItem: '1', title: 'লভ্যাংশ ১০%', kind: 'ordinary', result: 'passed', inFavor: 30, against: 5, abstain: 2, note: '' }],
      elections: [{ id: 'e1', postBn: 'সভাপতি', method: 'secret_ballot', candidates: [{ name: 'করিম', votes: 30 }, { name: 'লতিফ', votes: 20 }], winnerName: 'করিম', note: '' }],
    });
    expect(minutes).toContain('কার্যবিবরণী');
    expect(minutes).toContain('কোরাম পূর্ণ');
    expect(minutes).toContain('গৃহীত');
    expect(minutes).toContain('করিম নির্বাচিত');
  });

  it('computes the member exit settlement and final voucher', () => {
    const net = computeExitNet({
      savingsBalance: '20000',
      shareValue: '15000',
      dividendDue: '3000',
      welfareBalance: '500',
      duesOutstanding: '8500',
    });
    expect(net.netPayable).toBe('30000.00');
    expect(net.lines).toHaveLength(5);
    expect(net.lines[4]?.amount).toBe('-8500.00');

    // Negative net floors to zero
    const over = computeExitNet({
      savingsBalance: '0',
      shareValue: '0',
      dividendDue: '0',
      welfareBalance: '0',
      duesOutstanding: '5000',
    });
    expect(over.netPayable).toBe('0.00');

    expect(canTransitionExit('requested', 'computed')).toBe(true);
    expect(canTransitionExit('requested', 'settled')).toBe(false);
    expect(canTransitionExit('approved', 'settled')).toBe(true);
    expect(canTransitionExit('rejected', 'approved')).toBe(false);

    const j = buildExitJournal({
      exitNo: 'EX-2026-0001',
      savingsBalance: '20000',
      shareValue: '15000',
      dividendDue: '3000',
      welfareBalance: '500',
      duesOutstanding: '8500',
      netPayable: '30000',
    });
    expect(j.lines).toHaveLength(6);
    expect(j.lines[0]?.accountCode).toBe('2100');
    expect(j.lines[1]?.accountCode).toBe('3100');
    expect(j.lines[4]?.credit).toBe('8500.00');
    const dr = j.lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = j.lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBe(cr);
    expect(j.memo).toContain('EX-2026-0001');
  });

  it('computes claim ratio, premium vs payout and fund flows', () => {
    const r = claimRatio({ premiums: '100000', claimsPaid: '30000', claimsWaived: '10000' });
    expect(r.pct).toBe(40);
    expect(r.incidents).toBe('40000.00');
    expect(claimRatio({ premiums: '0', claimsPaid: '0', claimsWaived: '0' }).pct).toBe(0);

    const rows = premiumVsPayout([
      { period: '2025', premiums: '100000', payouts: '40000' },
      { period: '2026', premiums: '150000', payouts: '45000' },
    ]);
    expect(rows[0]?.ratioPct).toBe(40);
    expect(rows[1]?.net).toBe('105000.00');

    expect(EXIT_FLOW.requested).toContain('computed');
    expect(AGM_FLOW.draft).toContain('notice_issued');
  });
});

describe('Programs & projects (NGO development)', () => {
  const entries: LogframeEntry[] = [
    { id: 'ind-1', orgId: 'org', projectId: 'p1', level: 'indicator', statement: 'শিক্ষার্থী ভর্তি', parentLabel: null, indicatorCode: 'IND-1', baseline: '0', targetValue: '200', unit: 'জন', meansOfVerification: 'ভর্তি রেজিস্টার', createdAt: '2026-01-01' },
    { id: 'ind-2', orgId: 'org', projectId: 'p1', level: 'output', statement: 'প্রশিক্ষণ কেন্দ্র স্থাপিত', parentLabel: null, indicatorCode: null, baseline: '0', targetValue: '0', unit: null, meansOfVerification: 'ছবি', createdAt: '2026-01-01' },
  ];
  const values: IndicatorValue[] = [
    { id: 'v1', orgId: 'org', entryId: 'ind-1', periodStart: '2026-01-01', periodEnd: '2026-03-31', value: '120', evidence: [{ id: 'e1', labelBn: 'তালিকা', path: 'ev/1.pdf' }], note: '', enteredAt: '2026-04-01' },
    { id: 'v2', orgId: 'org', entryId: 'ind-1', periodStart: '2026-04-01', periodEnd: '2026-06-30', value: '60', evidence: [], note: '', enteredAt: '2026-07-01' },
  ];

  it('computes indicator progress with capped percentage and evidence count', () => {
    const rows = indicatorProgress(entries, values);
    expect(rows[0]!.achieved).toBe('180.00');
    expect(rows[0]!.progressPct).toBe(90); // 180/200, capped at 100
    expect(rows[0]!.evidenceCount).toBe(1);
    expect(rows[1]!.progressPct).toBe(0); // non-indicator output row
  });

  it('caps progress at 100 when achievement exceeds target', () => {
    const over: IndicatorValue[] = [{ ...values[0]!, value: '250' }];
    const rows = indicatorProgress(entries, over);
    expect(rows[0]!.progressPct).toBe(100);
  });

  it('computes batch stats: attendance, pre/post gain and certificates', () => {
    const stats = batchStats({
      batch: { id: 'b1', sessions: 4 },
      attendance: [
        { batchId: 'b1', beneficiaryId: 'x', sessionNo: 1, present: true },
        { batchId: 'b1', beneficiaryId: 'x', sessionNo: 2, present: true },
        { batchId: 'b1', beneficiaryId: 'x', sessionNo: 3, present: false },
        { batchId: 'b1', beneficiaryId: 'x', sessionNo: 4, present: true },
        { batchId: 'b1', beneficiaryId: 'y', sessionNo: 1, present: true },
        { batchId: 'b1', beneficiaryId: 'y', sessionNo: 2, present: true },
        { batchId: 'b1', beneficiaryId: 'y', sessionNo: 3, present: true },
        { batchId: 'b1', beneficiaryId: 'y', sessionNo: 4, present: true },
      ],
      scores: [
        { batchId: 'b1', beneficiaryId: 'x', pre: 40, post: 70 },
        { batchId: 'b1', beneficiaryId: 'y', pre: 60, post: 90 },
      ],
      certificates: [{ batchId: 'b1' }],
    });
    expect(stats.attendees).toBe(2);
    expect(stats.avgAttendancePct).toBe(87.5); // 7/8 marks
    expect(stats.avgPre).toBe(50);
    expect(stats.avgPost).toBe(80);
    expect(stats.avgGainPct).toBe(60);
    expect(stats.certificates).toBe(1);
  });

  it('slices the activity calendar by date range and sorts it', () => {
    const acts: ActivityRecord[] = [
      { id: 'a1', orgId: 'o', projectId: 'p', titleBn: 'ক', kind: 'health_camp', plannedDate: '2026-10-05', venue: '', targetParticipants: 0, status: 'planned', note: '', createdAt: '' },
      { id: 'a2', orgId: 'o', projectId: 'p', titleBn: 'খ', kind: 'training', plannedDate: '2026-09-28', venue: '', targetParticipants: 0, status: 'planned', note: '', createdAt: '' },
      { id: 'a3', orgId: 'o', projectId: 'p', titleBn: 'গ', kind: 'kit_distribution', plannedDate: '2026-10-01', venue: '', targetParticipants: 0, status: 'planned', note: '', createdAt: '' },
    ];
    const slice = activitiesInRange(acts, '2026-09-30', '2026-10-05');
    expect(slice.map((a) => a.id)).toEqual(['a3', 'a1']);
  });

  it('formats the bilingual certificate body with Bangla digits', () => {
    const text = buildCertificateTextBn({
      orgNameBn: 'স্যামিটি ম্যানেজার সমবায় সমিতি',
      orgNameEn: 'Samity Manager Cooperative Society',
      beneficiaryName: 'রহিমা বেগম',
      beneficiaryCode: 'BEN-0001',
      batchTitle: 'হাঁস-মুরগি পালন',
      project: 'PRJ-2026-001',
      trainerName: 'ড. আক্তার হোসেন',
      hours: 24,
      startDate: '2026-09-01',
      endDate: '2026-09-20',
      certNo: 'CERT-2026-0001',
      issuedAt: '2026-09-25',
    });
    expect(text).toContain('২৪ ঘণ্টার');
    expect(text).toContain('সার্টিফিকেট নং: CERT-2026-0001');
  });

  it('generates sequential codes and validates the project schema', () => {
    expect(nextBeneficiaryCode(7)).toBe('BEN-0007');
    expect(nextBatchCode(3)).toMatch(/^TRN-\d{4}-003$/);
    expect(nextCertificateNo(12)).toMatch(/^CERT-\d{4}-0012$/);

    const parsed = projectSchema.safeParse({
      code: 'PRJ-2026-001', nameBn: 'শিক্ষা প্রকল্প', nameEn: 'Education Project',
      donor: 'BRAC', grantAgreementNo: 'GA-88', fundCode: 'RF-EDU-01',
      sector: 'education', startDate: '2026-01-01', endDate: '2026-12-31',
      targetAreas: ['গাজীপুর'], targetBeneficiaries: 500, managerName: 'ম্যানেজার',
      budget: [{ lineItem: 'প্রশিক্ষণ', amount: '100000', note: '' }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(projectTotalBudget(parsed.data.budget)).toBe('100000.00');
  });

  it('exposes the project lifecycle and action map', () => {
    expect(canTransitionProject('proposed', 'active')).toBe(true);
    expect(canTransitionProject('active', 'proposed')).toBe(false);
    expect(canTransitionProject('closed', 'active')).toBe(false);
    expect(PROJECT_ACTION_TO_STATUS.resume).toBe('active');
  });
});

// ── Programs ops (reqs 5–9) ─────────────────────────────────────────────────

describe('Budget monitoring (req 5)', () => {
  const budget = [
    { lineItem: 'প্রশিক্ষণ', amount: '100000' },
    { lineItem: 'কিট', amount: '50000' },
  ];
  const project = { id: 'p1', budget };

  it('tracks expense vs budget line and raises the 80% alert', () => {
    expect(BUDGET_ALERT_THRESHOLD).toBe(80);
    expect(budgetAlertLevel(79.9)).toBe('ok');
    expect(budgetAlertLevel(80)).toBe('warning');
    expect(budgetAlertLevel(95)).toBe('critical');

    const m = budgetMonitor(project, [
      { budgetLine: 'প্রশিক্ষণ', amount: '85000' },
      { budgetLine: 'কিট', amount: '10000' },
      { budgetLine: 'অন্য', amount: '500' },
    ]);
    const trn = m.lines.find((l) => l.lineItem === 'প্রশিক্ষণ')!;
    expect(trn.spent).toBe('85000.00');
    expect(trn.utilizationPct).toBe(85);
    expect(trn.alert).toBe('warning');
    expect(m.budgetTotal).toBe('150000.00');
    expect(m.spentTotal).toBe('95500.00');
    expect(m.unbudgetedSpent).toBe('500.00');
    expect(m.hasAlert).toBe(true);
  });

  it('computes the burn rate against elapsed project time', () => {
    const p = { startDate: '2026-01-01', endDate: '2026-12-31', budget };
    // ~25% elapsed, 40% burned → overspent (+15.1 variance).
    const mid = burnRate(p, [{ amount: '60000', expenseDate: '2026-03-01' }], '2026-04-01');
    expect(mid.status).toBe('overspent');
    expect(mid.burnPct).toBe(40);
    expect(mid.expectedPct).toBe(24.9);
    // 50% elapsed, 20% burned → underspent (−29.9 variance).
    const late = burnRate(p, [{ amount: '30000', expenseDate: '2026-06-30' }], '2026-07-01');
    expect(late.status).toBe('underspent');
  });

  it('rolls utilization up per donor', () => {
    const rows = donorUtilization(
      [
        { id: 'p1', code: 'PRJ-1', donor: 'BRAC', budget },
        { id: 'p2', code: 'PRJ-2', donor: 'JCF', budget: [{ lineItem: 'ক্যাম্প', amount: '40000' }] },
      ],
      [
        { projectId: 'p1', amount: '80000' },
        { projectId: 'p2', amount: '10000' },
      ],
    );
    const brac = rows.find((r) => r.donor === 'BRAC')!;
    expect(brac.utilizationPct).toBe(53.3);
    expect(brac.alert).toBe('ok');
    const jcf = rows.find((r) => r.donor === 'JCF')!;
    expect(jcf.utilizationPct).toBe(25);
  });

  it('validates the expense schema', () => {
    const ok = projectExpenseSchema.safeParse({ projectId: '00000000-0000-4000-8000-000000000001', expenseDate: '2026-09-01', budgetLine: 'প্রশিক্ষণ', amount: '5000', recordedBy: 'ম্যানেজার' });
    expect(ok.success).toBe(true);
    const bad = projectExpenseSchema.safeParse({ projectId: 'x', expenseDate: 'bad', budgetLine: 'a', amount: '-1', recordedBy: 'x' });
    expect(bad.success).toBe(false);
  });
});

describe('Field visits (req 6)', () => {
  const checklist: VisitChecklistRow[] = [
    { item: 'সভা নিয়মিত হচ্ছে', passed: true, note: '' },
    { item: 'কিট সঠিকভাবে বিতরণ', passed: true, note: '' },
    { item: 'ঝুঁকিপূর্ণ শিশু শনাক্ত', passed: false, note: 'অভাব' },
    { item: 'চতুর্থ আইটেম', passed: true, note: '' },
  ];

  it('scores checklist compliance', () => {
    expect(visitScore(checklist)).toBe(75);
    expect(visitScore([])).toBe(0);
  });

  it('lists overdue follow-ups', () => {
    const visit = { followUps: [
      { action: 'কিট সরবরাহ', owner: 'অফিসার', dueDate: '2026-09-01', done: false },
      { action: 'সমাধান', owner: 'ম্যানেজার', dueDate: '2026-12-01', done: false },
      { action: 'সম্পন্ন', owner: 'অফিসার', dueDate: '2026-08-01', done: true },
    ] };
    expect(overdueFollowUps(visit, '2026-09-15')).toHaveLength(1);
  });

  it('validates the visit schema (photos, checklist, follow-ups)', () => {
    const ok = fieldVisitSchema.safeParse({
      projectId: '00000000-0000-4000-8000-000000000001', visitDate: '2026-09-20', officerId: 'u1', officerName: 'রফিক ইসলাম',
      checklist: [{ item: 'সভা হয়েছে', passed: true, note: '' }],
      photos: [{ id: 'ph1', labelBn: 'সভার ছবি', path: 'photos/ph1.jpg' }],
      followUps: [{ action: 'কিট পাঠান', owner: 'ম্যানেজার', dueDate: '2026-10-01', done: false }],
    });
    expect(ok.success).toBe(true);
    const noChecklist = fieldVisitSchema.safeParse({ projectId: '00000000-0000-4000-8000-000000000001', visitDate: '2026-09-20', officerId: 'u1', officerName: 'রফিক ইসলাম', checklist: [] });
    expect(noChecklist.success).toBe(false);
  });
});

describe('Donor report (req 7)', () => {
  const project = {
    id: 'p1', orgId: 'o', code: 'PRJ-2026-001', nameBn: 'শিক্ষা সহায়তা প্রকল্প', nameEn: 'Education Support Project',
    donor: 'BRAC Foundation', grantAgreementNo: 'GA-2026-88', fundCode: 'RF-EDU-01', sector: 'education' as const,
    startDate: '2026-01-01', endDate: '2026-12-31', targetAreas: ['গাজীপুর'], targetBeneficiaries: 500, managerName: 'ম্যানেজার',
    budget: [
      { lineItem: 'প্রশিক্ষণ', amount: '300000', note: '' },
      { lineItem: 'কিট', amount: '100000', note: '' },
    ],
    status: 'active' as const, createdAt: '', updatedAt: '',
  };
  const logframe: LogframeEntry[] = [
    { id: 'e1', orgId: 'o', projectId: 'p1', level: 'indicator', statement: 'প্রশিক্ষণপ্রাপ্ত', parentLabel: null, indicatorCode: 'IND-1', baseline: '0', targetValue: '300', unit: 'জন', meansOfVerification: 'তালিকা', createdAt: '' },
    { id: 'e2', orgId: 'o', projectId: 'p1', level: 'output', statement: 'আউটপুট', parentLabel: null, indicatorCode: null, baseline: '0', targetValue: '0', unit: null, meansOfVerification: 'রেকর্ড', createdAt: '' },
  ];
  const values: IndicatorValue[] = [
    { id: 'v1', orgId: 'o', entryId: 'e1', periodStart: '2026-01-01', periodEnd: '2026-03-31', value: '120.00', evidence: [{ id: 'x', labelBn: 'তালিকা', path: 'e/1.pdf' }], note: '', enteredAt: '' },
    { id: 'v2', orgId: 'o', entryId: 'e1', periodStart: '2026-04-01', periodEnd: '2026-06-30', value: '60.00', evidence: [], note: '', enteredAt: '' },
  ];

  it('builds a quarterly narrative with indicator and financial tables', () => {
    const visitChecklist: VisitChecklistRow[] = [
      { item: 'সভা নিয়মিত', passed: true, note: '' },
      { item: 'কিট বিতরণ সঠিক', passed: true, note: '' },
      { item: 'ঝুঁকি শনাক্ত', passed: false, note: '' },
      { item: 'চতুর্থ', passed: true, note: '' },
    ];
    const report = buildDonorReport({
      project,
      logframe,
      indicatorValues: values,
      expenses: [
        { projectId: 'p1', budgetLine: 'প্রশিক্ষণ', amount: '50000', expenseDate: '2026-04-05' },
        { projectId: 'p1', budgetLine: 'প্রশিক্ষণ', amount: '40000', expenseDate: '2026-02-10' },
        { projectId: 'p1', budgetLine: 'কিট', amount: '10000', expenseDate: '2026-04-20' },
      ],
      servicesCount: 45,
      activitiesDone: 6,
      beneficiariesEnrolled: 120,
      visits: [{ projectId: 'p1', checklist: visitChecklist }],
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
    });
    expect(report.indicators).toHaveLength(1);
    // Only the Q2 measurement overlaps the reporting period (120 was Q1).
    expect(report.indicators[0]!.achieved).toBe('60.00');
    expect(report.indicators[0]!.progressPct).toBe(20);
    expect(report.financialSummary.spentPeriod).toBe('60000.00');
    expect(report.financialSummary.spentCumulative).toBe('100000.00');
    expect(report.financialSummary.utilizationPct).toBe(25);
    expect(report.delivery.visits).toBe(1);
    expect(report.delivery.visitScorePct).toBe(75);
    expect(report.narrativeBn.join(' ')).toContain('দাতা: BRAC Foundation');
  });

  it('exports Word-compatible HTML and keeps case data out', () => {
    const report = buildDonorReport({
      project, logframe, indicatorValues: values,
      expenses: [], servicesCount: 0, activitiesDone: 0, beneficiariesEnrolled: 0, visits: [],
      periodStart: '2026-04-01', periodEnd: '2026-06-30',
    });
    const html = buildDonorReportHtml(report, 'স্যামিটি ম্যানেজার সমবায় সমিতি', 'Samity Manager Cooperative Society');
    expect(html).toContain('দাতা প্রতিবেদন / Donor Report');
    expect(html).toContain('সূচক তালিকা / Indicator table');
    expect(html).toContain('<!DOCTYPE html>'); // Word-openable standalone document
    expect(html).toContain('<table');
    // Cases never appear on donor reports.
    expect(html).not.toContain('CASE-');
    expect(html).not.toContain('case');
  });
});

describe('Case management (req 8)', () => {
  it('guards the case state machine', () => {
    expect(canTransitionCase('open', 'in_progress')).toBe(true);
    expect(canTransitionCase('open', 'closed')).toBe(true);
    expect(canTransitionCase('in_progress', 'referred')).toBe(true);
    expect(canTransitionCase('referred', 'in_progress')).toBe(false);
    expect(canTransitionCase('closed', 'open')).toBe(false);
    expect(CASE_FLOW.closed).toHaveLength(0);
  });

  it('masks identity and restricted fields for non-case-workers', () => {
    const full = {
      id: 'c1', orgId: 'o', caseNo: 'CASE-0001', type: 'gbv_survivor' as const, severity: 'critical' as const,
      status: 'open' as const, beneficiaryId: 'b1', beneficiaryName: 'সংবেদনশীল নাম', restrictedDetails: 'গোপন বিবরণ',
      consentGiven: true, openedAt: '2026-09-01', assignedWorkerId: 'w1', assignedWorkerName: 'কেস ওয়ার্কার', closedAt: null,
      createdAt: '', updatedAt: '',
    };
    const masked = maskCase(full);
    expect(masked.beneficiaryName).toBeNull();
    expect(masked.restrictedDetails).toBeNull();
    expect(masked.caseNo).toBe('CASE-0001');
    expect(nextCaseNo(9)).toBe('CASE-0009');
  });

  it('validates the case schema', () => {
    const ok = caseFileSchema.safeParse({ type: 'child_protection', severity: 'high', beneficiaryId: null, beneficiaryName: 'শিশুর নাম', restrictedDetails: 'বিস্তারিত বিবরণ', consentGiven: true, assignedWorkerId: 'w1', assignedWorkerName: 'কেস ওয়ার্কার' });
    expect(ok.success).toBe(true);
  });
});

describe('Funding tracker (req 9)', () => {
  it('generates sequential codes and validates the schema', () => {
    expect(nextFundingCode(4)).toBe('FND-0004');
    const ok = fundingSourceSchema.safeParse({ sourceName: 'PKSF ঋণ', kind: 'pksf', principal: '5000000', interestRatePct: '6', tenureMonths: 24, disbursementDate: '2026-01-15', repaymentStart: '2026-04-01', purposeProjectId: null, lenderContact: '' });
    expect(ok.success).toBe(true);
    const bad = fundingSourceSchema.safeParse({ sourceName: 'x', kind: 'grant', principal: '0', interestRatePct: '0', tenureMonths: 12, disbursementDate: '2026-01-15', repaymentStart: '2026-04-01' });
    expect(bad.success).toBe(false);
  });

  it('builds a zero-interest grant schedule (principal only)', () => {
    const rows = repaymentSchedule({ principal: '1200', interestRatePct: '0', tenureMonths: 12, repaymentStart: '2026-01-01' });
    expect(rows).toHaveLength(12);
    expect(rows[0]!.total).toBe('100.00');
    expect(rows[11]!.balance).toBe('0.00');
  });

  it('builds a flat schedule with equal interest rows', () => {
    const rows = repaymentSchedule({ principal: '1200', interestRatePct: '12', tenureMonths: 12, repaymentStart: '2026-01-01', method: 'flat' });
    expect(rows[0]!.principal).toBe('100.00');
    expect(rows[0]!.interest).toBe('12.00');
    expect(rows[11]!.interest).toBe('12.00');
    const sum = repaymentSummary(rows);
    expect(sum.totalInterest).toBe('144.00');
    expect(sum.totalPayable).toBe('1344.00');
  });

  it('builds a declining-balance EMI where interest shrinks and final balance clears', () => {
    const rows = repaymentSchedule({ principal: '100000', interestRatePct: '12', tenureMonths: 12, repaymentStart: '2026-01-01', method: 'declining' });
    expect(Number(rows[0]!.interest)).toBeGreaterThan(Number(rows[11]!.interest));
    expect(rows[11]!.balance).toBe('0.00');
    const sum = repaymentSummary(rows);
    // EMI on 100000 @1%/mo, 12mo ≈ 8884.88 → total interest ≈ 6618.55
    expect(Number(sum.totalPayable)).toBeGreaterThan(100000);
    expect(Number(sum.totalPayable)).toBeLessThan(107000);
    expect(sum.installmentCount).toBe(12);
  });
});

// ── Reports, MIS & compliance ───────────────────────────────────────────────

describe('MIS snapshot & dashboards (req 1)', () => {
  const snap: MisSnapshot = {
    asOf: '2026-09-25',
    orgId: 'o1',
    orgNameBn: 'স্যামিটি ডেমো সমবায় সমিতি',
    branches: [
      { id: 'b1', name: 'ধানমন্ডি শাখা', areaName: 'Dhaka Central Area', zoneName: 'Dhaka Zone', members: 412, centers: 18 },
      { id: 'b2', name: 'ময়মনসিংহ শাখা', areaName: 'Mymensingh Sadar Area', zoneName: 'Mymensingh Zone', members: 356, centers: 15 },
    ],
    members: [
      { id: 'm1', code: 'MEM-1', name: 'রহিমা বেগম', branchId: 'b1', samityName: 'গাজীপুর সমিতি', joinedAt: '2024-01-01', active: true, droppedOutAt: null, dropoutReason: null },
      { id: 'm2', code: 'MEM-2', name: 'সালমা খাতুন', branchId: 'b1', samityName: 'গাজীপুর সমিতি', joinedAt: '2024-02-01', active: true, droppedOutAt: null, dropoutReason: null },
      { id: 'm3', code: 'MEM-3', name: 'কমল হোসেন', branchId: 'b2', samityName: 'মিরকাদিম সমিতি', joinedAt: '2024-03-01', active: true, droppedOutAt: null, dropoutReason: null },
    ],
    loans: [
      { applicationId: 'l1', loanNumber: 'LN-1', memberId: 'm1', memberName: 'রহিমা বেগম', memberCode: 'MEM-1', branchId: 'b1', samityId: null, officerId: 'f1', productName: 'গোল্ড', disbursedOn: '2026-02-01', outstanding: '10000.00', overduePrincipal: '0.00', overdueInterest: '0.00', overdueTotal: '0.00', daysPastDue: 0, bucket: 'regular', assetClass: 'standard', provisionPercent: 0, provisionAmount: '0.00', oldestUnpaidDueDate: null },
      { applicationId: 'l2', loanNumber: 'LN-2', memberId: 'm2', memberName: 'সালমা খাতুন', memberCode: 'MEM-2', branchId: 'b1', samityId: null, officerId: 'f1', productName: 'গোল্ড', disbursedOn: '2026-03-01', outstanding: '8000.00', overduePrincipal: '500.00', overdueInterest: '100.00', overdueTotal: '600.00', daysPastDue: 45, bucket: 'd31_90', assetClass: 'substandard', provisionPercent: 25, provisionAmount: '2000.00', oldestUnpaidDueDate: '2026-08-01' },
      { applicationId: 'l3', loanNumber: 'LN-3', memberId: 'm3', memberName: 'কমল হোসেন', memberCode: 'MEM-3', branchId: 'b2', samityId: null, officerId: 'f2', productName: 'ক্ষুদ্র', disbursedOn: '2026-04-01', outstanding: '5000.00', overduePrincipal: '0.00', overdueInterest: '0.00', overdueTotal: '0.00', daysPastDue: 0, bucket: 'regular', assetClass: 'standard', provisionPercent: 0, provisionAmount: '0.00', oldestUnpaidDueDate: null },
    ],
    loanStats: { disbursedPeriod: '5000.00', disbursedYtd: '23000.00', collectedPeriod: '4000.00', collectedYtd: '18000.00', writtenOff: '500.00', dueInstallments: 90, paidInstallments: 85 },
    savings: { accounts: 3, totalBalance: '60000.00', byType: [{ type: 'compulsory', accounts: 2, balance: '40000.00' }], memberIdsWithSavings: new Set(['m1', 'm2', 'm3']) },
    utilization: [{ loanNumber: 'LN-1', memberName: 'রহিমা', visitedAt: '2026-09-10', finding: 'fully_utilized' as const, findingsNote: 'গরু কিনেছেন' }],
    staff: [
      { officerId: 'f1', officerName: 'রফিক ইসলাম', branchId: 'b1', borrowers: 2, dueAmount: '9000.00', collectedAmount: '8100.00', samities: 2 },
      { officerId: 'f2', officerName: 'নাসরিন', branchId: 'b2', borrowers: 1, dueAmount: '5000.00', collectedAmount: '5000.00', samities: 1 },
    ],
  };

  it('exposes the five dashboard roles and the standard report kinds', () => {
    expect(DASHBOARD_ROLES).toHaveLength(5);
    expect(STANDARD_REPORTS).toHaveLength(11);
    expect(RATIO_KEYS).toHaveLength(6);
    expect(MRA_RETURN_SECTIONS.length).toBeGreaterThanOrEqual(5);
  });

  it('builds the field-officer dashboard with today sheet + targets', () => {
    const d = buildOfficerDashboard(snap, 'রফিক ইসলাম', 'f1', [
      { samityName: 'গাজীপুর সমিতি', meetingDate: '2026-09-25', dueInstallments: 30, collectedInstallments: 27, dueAmount: '9000.00', collectedAmount: '8100.00', savingsDue: '1200.00', savingsCollected: '1200.00' },
    ], [
      { metric: 'collection', labelBn: 'আদায়', target: 100, actual: 90, achievementPct: 90 },
    ]);
    expect(d.role).toBe('field_officer');
    expect(d.summary.collectionPct).toBe(90);
    expect(d.todaySheet[0]!.samityName).toBe('গাজীপুর সমিতি');
    expect(d.targets[0]!.achievementPct).toBe(90);
  });

  it('ranks branches by collection, PAR and membership', () => {
    const ranking = branchRanking(snap);
    expect(ranking).toHaveLength(2);
    expect(ranking[0]!.rank).toBe(1);
    // b2 has 100% efficiency and no PAR → should outrank b1 (90% eff, some PAR).
    expect(ranking[0]!.branchName).toBe('ময়মনসিংহ শাখা');
    expect(ranking[0]!.par30Pct).toBe(0);
  });

  it('builds area/zone, head-office and board dashboards', () => {
    const az = areaZoneDashboard(snap, 'Dhaka Central Area', 'Dhaka Zone');
    expect(az.role).toBe('area_zone');
    expect(az.branches).toHaveLength(2);
    expect(az.totals.members).toBe(768);

    const ratios = computeRatios({
      operatingIncome: '150000', operatingExpense: '90000', financialExpense: '20000',
      interestFeesIncome: '120000', avgPortfolio: '600000', totalOperatingCost: '100000',
      borrowers: 250, fieldOfficers: 5, totalSavings: '60000', avgOutstandingLoans: '580000', writtenOff: '500',
    });
    const ho = headOfficeDashboard(snap, ratios, { members: 740, outstanding: '20000.00', savings: '55000.00' });
    expect(ho.role).toBe('head_office');
    expect(ho.portfolio.borrowers).toBe(3);
    expect(ho.portfolio.outstanding).toBe('23000.00');
    expect(ho.ratios.oss.value).toBeCloseTo(150000 / 110000, 3);
    expect(ho.growth.memberGrowthPct).toBeCloseTo(Number((((768 - 740) / 740) * 100).toFixed(2)), 5);

    const board = buildBoardDashboard(snap, ratios, ho);
    expect(board.role).toBe('board');
    expect(board.summary.length).toBeGreaterThanOrEqual(4);
    expect(board.summary.every((k) => k.labelBn.length > 0)).toBe(true);
  });
});

describe('Standard reports (req 2)', () => {
  const snap: MisSnapshot = {
    asOf: '2026-09-25',
    orgId: 'o1',
    orgNameBn: 'স্যামিটি ডেমো',
    branches: [
      { id: 'b1', name: 'ধানমন্ডি শাখা', areaName: 'A', zoneName: 'Z', members: 2, centers: 2 },
      { id: 'b2', name: 'ময়মনসিংহ শাখা', areaName: 'A', zoneName: 'Z', members: 1, centers: 1 },
    ],
    members: [
      { id: 'm1', code: 'MEM-1', name: 'রহিমা বেগম', branchId: 'b1', samityName: 'গাজীপুর', joinedAt: '2024-01-01', active: true, droppedOutAt: null, dropoutReason: null },
      { id: 'm2', code: 'MEM-2', name: 'সালমা খাতুন', branchId: 'b1', samityName: 'গাজীপুর', joinedAt: '2024-02-01', active: false, droppedOutAt: '2026-05-10', dropoutReason: 'migration' },
      { id: 'm3', code: 'MEM-3', name: 'কমল হোসেন', branchId: 'b2', samityName: 'মিরকাদিম', joinedAt: '2024-03-01', active: true, droppedOutAt: null, dropoutReason: null },
    ],
    loans: [
      { applicationId: 'l1', loanNumber: 'LN-1', memberId: 'm1', memberName: 'রহিমা বেগম', memberCode: 'MEM-1', branchId: 'b1', samityId: null, officerId: 'f1', productName: 'গোল্ড', disbursedOn: '2026-08-15', outstanding: '10000.00', overduePrincipal: '0', overdueInterest: '0', overdueTotal: '0.00', daysPastDue: 0, bucket: 'regular', assetClass: 'standard', provisionPercent: 0, provisionAmount: '0.00', oldestUnpaidDueDate: null },
      { applicationId: 'l2', loanNumber: 'LN-2', memberId: 'm2', memberName: 'সালমা খাতুন', memberCode: 'MEM-2', branchId: 'b1', samityId: null, officerId: 'f1', productName: 'গোল্ড', disbursedOn: '2026-03-01', outstanding: '8000.00', overduePrincipal: '500', overdueInterest: '100', overdueTotal: '600.00', daysPastDue: 45, bucket: 'd31_90', assetClass: 'substandard', provisionPercent: 25, provisionAmount: '2000.00', oldestUnpaidDueDate: '2026-08-01' },
    ],
    loanStats: { disbursedPeriod: '10000.00', disbursedYtd: '18000.00', collectedPeriod: '4000.00', collectedYtd: '18000.00', writtenOff: '500.00', dueInstallments: 10, paidInstallments: 9 },
    savings: { accounts: 3, totalBalance: '60000.00', byType: [], memberIdsWithSavings: new Set(['m1', 'm2', 'm3']) },
    utilization: [{ loanNumber: 'LN-1', memberName: 'রহিমা', visitedAt: '2026-09-01', finding: 'fully_utilized' as const, findingsNote: 'গরু' }],
    staff: [{ officerId: 'f1', officerName: 'রফিক', branchId: 'b1', borrowers: 2, dueAmount: '9000.00', collectedAmount: '8100.00', samities: 2 }],
  };

  it('builds the disbursement register for the period', () => {
    const rep = disbursementRegisterReport(snap, '2026-08-01', '2026-08-31');
    expect(rep.meta.kind).toBe('disbursement_register');
    expect(rep.rows).toHaveLength(1); // only LN-1 (Aug)
    expect(rep.totals['outstanding']).toBe('10000.00');
  });

  it('computes collection efficiency per officer and branch', () => {
    const rep = collectionEfficiencyReport(snap, '2026-09-01', '2026-09-30');
    const officer = rep.rows.find((x) => x.scope === 'officer')!;
    expect(officer.efficiency).toBe('90.0');
    const branch = rep.rows.find((x) => x.scope === 'branch')!;
    expect(branch.efficiency).toBe('90.0');
    expect(rep.totals['collected']).toBe('16200.00');
  });

  it('lists outstanding loans and totals overdue', () => {
    const rep = outstandingLoansReport(snap);
    expect(rep.rows).toHaveLength(2);
    expect(rep.totals['outstanding']).toBe('18000.00');
    expect(rep.totals['overdueTotal']).toBe('600.00');
    const b1 = outstandingLoansReport(snap, 'b1');
    expect(b1.rows).toHaveLength(2);
  });

  it('builds the overdue aging grid by bucket', () => {
    const rep = overdueAgingReport(snap);
    const b1 = rep.rows.find((x) => x.branchName === 'ধানমন্ডি শাখা')!;
    expect(b1['d31_90']).toBe('600.00');
    expect(b1['d1_30']).toBe('0.00');
    expect(b1['total']).toBe('600.00');
    expect(rep.totals['total']).toBe('600.00');
  });

  it('shows the savings position per branch', () => {
    const rep = savingsPositionReport(snap);
    expect(rep.rows).toHaveLength(2);
    expect(rep.totals['balance']).toBe('60000.00');
  });

  it('lists samities with member counts', () => {
    const rep = samityListReport(snap);
    const row = rep.rows.find((x) => x.samityName === 'গাজীপুর')!;
    expect(row.members).toBe(2);
    expect(row.active).toBe(1);
  });

  it('analyzes dropouts by reason with branch rate', () => {
    const rep = dropoutAnalysisReport(snap, '2026-01-01', '2026-12-31');
    const row = rep.rows.find((x) => x.reason === 'স্থানান্তর')!;
    expect(row.count).toBe(1);
    expect(row.dropoutPct).toBe('50.0'); // 1 of 2 b1 members
  });

  it('scores staff productivity', () => {
    const rep = staffProductivityReport(snap, '2026-09-01', '2026-09-30');
    expect(rep.rows[0]!.efficiency).toBe('90.0');
    expect(rep.rows[0]!.borrowers).toBe(2);
  });

  it('reports loan utilization findings', () => {
    const rep = loanUtilizationReport(snap, '2026-08-01', '2026-09-30');
    expect(rep.rows[0]!.finding).toBe('সম্পূর্ণ ব্যবহৃত');
    const empty = loanUtilizationReport(snap, '2020-01-01', '2020-01-31');
    expect(empty.rows).toHaveLength(0);
  });
});

describe('Financial ratios (req 3)', () => {
  it('computes OSS as operating income over operating+financial expense', () => {
    const r = computeRatios({
      operatingIncome: '165000', operatingExpense: '100000', financialExpense: '10000',
      interestFeesIncome: '120000', avgPortfolio: '600000', totalOperatingCost: '100000',
      borrowers: 250, fieldOfficers: 5, totalSavings: '60000', avgOutstandingLoans: '500000', writtenOff: '10000',
    });
    expect(r.oss.value).toBeCloseTo(1.5, 3);
    expect(r.oss.formatted).toBe('150.0%');
    expect(r.portfolio_yield.value).toBe(20);
    expect(r.cost_per_borrower.value).toBe(400);
    expect(r.borrowers_per_officer.value).toBe(50);
    expect(r.savings_to_loan.value).toBeCloseTo(0.12, 3);
    expect(r.write_off_ratio.value).toBeCloseTo(1.67, 2);
  });

  it('returns zero-safe ratios when denominators are zero', () => {
    const r = computeRatios({
      operatingIncome: '0', operatingExpense: '0', financialExpense: '0',
      interestFeesIncome: '0', avgPortfolio: '0', totalOperatingCost: '0',
      borrowers: 0, fieldOfficers: 0, totalSavings: '0', avgOutstandingLoans: '0', writtenOff: '0',
    });
    expect(r.oss.value).toBe(0);
    expect(r.borrowers_per_officer.value).toBe(0);
    expect(r.write_off_ratio.value).toBe(0);
  });
});

describe('Regulatory templates & formula engine (req 4)', () => {
  it('evaluates safe arithmetic formulas with identifiers', () => {
    const vals = { outstanding: 23000, total_savings: 60000, n: 4 };
    expect(evalFormula('=outstanding', vals)).toBe(23000);
    expect(evalFormula('=total_savings/outstanding', vals)).toBeCloseTo(60000 / 23000, 6);
    expect(evalFormula('=(n + 1) * 2 - n', vals)).toBe(6);
    expect(evalFormula('=-outstanding + 1000', vals)).toBe(-22000);
    expect(evalFormula('=missing_id', vals)).toBeNull();
    expect(evalFormula('=outstanding +', vals)).toBeNull(); // trailing operator
    expect(evalFormula('=Math.round(1.5)', vals)).toBeNull(); // function calls rejected
    expect(formulaIdentifiers('=a*b-(c+2)')).toEqual(['a', 'b', 'c']);
  });

  it('validates templates and flags missing identifiers', () => {
    const t = mraStarterTemplate();
    const res = validateTemplate(t, { total_savings: 1, own_funds: 1, outstanding: 1, oss: 1, par30: 1, borrowers: 1 });
    expect(res.ok).toBe(true);
    const bad = validateTemplate({ ...t, rows: [{ code: 'X', labelBn: 'ভাঙা', formula: '=1 +', kind: 'value', unit: 'bdt', bold: false }] });
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toContain('X');
    const noEq = validateTemplate({ ...t, rows: [{ code: 'Y', labelBn: 'সমীকরণ নেই', formula: 'outstanding', kind: 'value', unit: 'bdt', bold: false }] });
    expect(noEq.ok).toBe(false);
  });

  it('generates a filled MRA return and marks verification', () => {
    const t = mraStarterTemplate();
    const g = generateRegulatoryReturn(
      { ...t, id: 'tpl-1', orgId: 'o1', createdAt: '', updatedAt: '' },
      { total_savings: 60000, own_funds: 250000, outstanding: 23000, oss: 1.4, par30: 2.5, borrowers: 250 },
      '2026-07-01',
      '2026-09-30',
    );
    expect(g.needsVerification).toBe(true);
    expect(g.missingValues).toHaveLength(0);
    const m3 = g.rows.find((r) => r.code === 'M3')!;
    expect(m3.value).toBe('23000.00');
    const m6 = g.rows.find((r) => r.code === 'M6')!;
    expect(m6.value).toBe('250');
    const text = renderRegulatoryTextBn(g, 'স্যামিটি ডেমো সমবায় সমিতি');
    expect(text).toContain('সর্বশেষ দপ্তর/সার্কুলারের সাথে যাচাই প্রয়োজন');
  });

  it('surfaces missing snapshot values instead of failing', () => {
    const t = pksfStarterTemplate();
    const g = generateRegulatoryReturn(
      { ...t, id: 'tpl-2', orgId: 'o1', createdAt: '', updatedAt: '' },
      { outstanding: 23000 }, // total_savings, borrowers missing
      '2026-07-01',
      '2026-09-30',
    );
    expect(g.missingValues.sort()).toEqual(['borrowers', 'total_savings']);
    const p2 = g.rows.find((r) => r.code === 'P2')!;
    expect(p2.value).toBeNull();
  });

  it('builds the PKSF starter with a savings-to-loan ratio row', () => {
    const t = pksfStarterTemplate();
    const g = generateRegulatoryReturn(
      { ...t, id: 'tpl-3', orgId: 'o1', createdAt: '', updatedAt: '' },
      { outstanding: 23000, total_savings: 60000, borrowers: 250 },
      '2026-07-01',
      '2026-09-30',
    );
    const p4 = g.rows.find((r) => r.code === 'P4')!;
    expect(p4.value).toBe('2.609');
    expect(g.regulator).toBe('PKSF');
  });
});

// ── Reports/MIS ops (reqs 5–10) ────────────────────────────────────────────

describe('Client protection & complaints (req 5, 10)', () => {
  const mk = (over: Partial<ComplaintRecord>): ComplaintRecord => ({
    id: 'c', orgId: 'o', ticketNo: 'CMP-0001', channel: 'branch', category: 'overcharging',
    status: 'open', severity: 'medium', subject: 's', details: '', memberId: null, memberName: 'x',
    branchId: 'b1', reportedAt: '2026-09-01', dueAt: '2026-09-04', acknowledgedAt: null, resolvedAt: null,
    resolutionNote: '', escalations: [], createdAt: '', updatedAt: '', ...over,
  });

  it('issues sequential tickets and computes the SLA deadline', () => {
    expect(nextComplaintTicket(7)).toBe('CMP-0007');
    expect(complaintDueAt('2026-09-01', 'medium')).toBe('2026-09-04');
    expect(complaintDueAt('2026-09-01', 'critical')).toBe('2026-09-02');
  });

  it('escalates up the ladder, critical skipping branch level', () => {
    expect(ESCALATION_LADDER).toEqual(['branch_manager', 'area_manager', 'head_office', 'board']);
    expect(nextEscalationLevel({ escalations: [], severity: 'medium' })).toBe('branch_manager');
    expect(nextEscalationLevel({ escalations: [], severity: 'critical' })).toBe('area_manager');
    expect(nextEscalationLevel({ escalations: [{ level: 'area_manager', at: '', note: '' }], severity: 'critical' })).toBe('head_office');
    expect(nextEscalationLevel({ escalations: [{ level: 'board', at: '', note: '' }, { level: 'board', at: '', note: '' }], severity: 'low' })).toBe('board');
  });

  it('guards the complaint state machine and action schema', () => {
    expect(canTransitionComplaintLocal('open', 'in_progress')).toBe(true);
    expect(canTransitionComplaintLocal('open', 'resolved')).toBe(true);
    expect(canTransitionComplaintLocal('resolved', 'open')).toBe(false);
    expect(canTransitionComplaintLocal('rejected', 'escalated')).toBe(false);
    const ok = complaintActionSchema.safeParse({ action: 'resolve', note: 'সমাধান' });
    expect(ok.success).toBe(true);
    const bad = complaintActionSchema.safeParse({ action: 'delete' });
    expect(bad.success).toBe(false);
  });

  it('rolls up client-protection indicators incl. overlap and stress', () => {
    const complaints = [
      mk({ id: '1', memberId: 'm1', status: 'resolved', reportedAt: '2026-09-01', dueAt: '2026-09-04', resolvedAt: '2026-09-03T00:00:00Z' }),
      mk({ id: '2', memberId: 'm1', status: 'open', category: 'coercive_collection' }), // overlap with 1
      mk({ id: '3', memberId: 'm2', status: 'open', category: 'overcharging' }), // m2 is overdue → stress
      mk({ id: '4', memberId: null, status: 'escalated', branchId: 'b2' }),
      mk({ id: '5', memberId: 'm3', status: 'resolved', reportedAt: '2026-09-02', dueAt: '2026-09-05', resolvedAt: '2026-09-10T00:00:00Z', category: 'delay' }), // late vs SLA
    ];
    const ind = clientProtectionIndicators(complaints, {
      borrowers: 500,
      branches: [{ id: 'b1', name: 'ধানমন্ডি' }, { id: 'b2', name: 'ময়মনসিংহ' }],
      overdueMemberIds: new Set(['m2']),
    });
    expect(ind.complaintsTotal).toBe(5);
    expect(ind.complaintsOpen).toBe(3);
    expect(ind.overlapCases).toBe(1); // m1 twice
    expect(ind.repaymentStressCases).toBe(1); // m2
    expect(ind.slaCompliancePct).toBe(50); // 1 of 2 resolved within SLA
    expect(ind.resolutionDaysAvg).toBe(5); // (2+8)/2
    expect(ind.complaintsPer1000Borrowers).toBe(10);
    expect(ind.byCategory.length).toBeGreaterThan(0);
    const b2 = ind.byBranch.find((b) => b.branchName === 'ময়মনসিংহ')!;
    expect(b2.escalated).toBe(1);
  });

  it('validates the complaint create schema', () => {
    const ok = complaintCreateSchema.safeParse({ channel: 'hotline', category: 'privacy', subject: 'তথ্য ফাঁস', memberName: 'রহিমা বেগম', reportedAt: '2026-09-20' });
    expect(ok.success).toBe(true);
    const bad = complaintCreateSchema.safeParse({ channel: 'sms', category: 'privacy', subject: 'x', memberName: 'y', reportedAt: 'bad' });
    expect(bad.success).toBe(false);
  });
});

describe('Report builder (req 6)', () => {
  const data = {
    loans: [
      { branchName: 'ধানমন্ডি', assetClass: 'standard', outstanding: 10000, overdueTotal: 0, daysPastDue: 0, productName: 'গোল্ড' },
      { branchName: 'ধানমন্ডি', assetClass: 'substandard', outstanding: 8000, overdueTotal: 600, daysPastDue: 45, productName: 'গোল্ড' },
      { branchName: 'ময়মনসিংহ', assetClass: 'standard', outstanding: 5000, overdueTotal: 0, daysPastDue: 0, productName: 'ক্ষুদ্র' },
    ],
    savings: [], collections: [], complaints: [], members: [],
  };

  it('exposes the datasets, chart types and field catalogue', () => {
    expect(BUILDER_DATASETS).toHaveLength(5);
    expect(CHART_TYPES).toEqual(['table', 'bar', 'line', 'pie']);
    expect(runBuilderFieldCount('loans')).toBeGreaterThanOrEqual(5);
  });

  it('groups and aggregates with sum/avg/count', () => {
    const sum = runBuilder(data, 'loans', { name: 'x', dataset: 'loans', filters: [], groupBy: 'branchName', metric: 'sum', metricField: 'outstanding', chartType: 'bar', sharedWithRoles: [] });
    expect(sum.rows.find((r) => r.group === 'ধানমন্ডি')!.metric).toBe(18000);
    const avg = runBuilder(data, 'loans', { name: 'x', dataset: 'loans', filters: [], groupBy: 'branchName', metric: 'avg', metricField: 'outstanding', chartType: 'pie', sharedWithRoles: [] });
    expect(avg.rows.find((r) => r.group === 'ধানমন্ডি')!.metric).toBe(9000);
    const cnt = runBuilder(data, 'loans', { name: 'x', dataset: 'loans', filters: [], groupBy: 'assetClass', metric: 'count', metricField: null, chartType: 'table', sharedWithRoles: [] });
    expect(cnt.rows.find((r) => r.group === 'standard')!.count).toBe(2);
  });

  it('applies filters with all operators', () => {
    expect(applyFilter(45, 'gte', '30')).toBe(true);
    expect(applyFilter(45, 'lt', '30')).toBe(false);
    expect(applyFilter('standard', 'eq', 'standard')).toBe(true);
    expect(applyFilter('substandard', 'contains', 'standard')).toBe(true);
    expect(applyFilter(null, 'eq', '')).toBe(true);
    const filtered = runBuilder(data, 'loans', { name: 'x', dataset: 'loans', filters: [{ field: 'daysPastDue', op: 'gt', value: '0' }], groupBy: 'branchName', metric: 'count', metricField: null, chartType: 'bar', sharedWithRoles: [] });
    expect(filtered.scanned).toBe(1);
  });

  it('shares saved reports by role and validates the schema', () => {
    const r = { ownerUserId: 'u1', sharedWithRoles: ['branch_manager'] };
    expect(canRunSavedReport(r, { userId: 'u1', role: 'account_officer' })).toBe(true);
    expect(canRunSavedReport(r, { userId: 'u2', role: 'branch_manager' })).toBe(true);
    expect(canRunSavedReport(r, { userId: 'u2', role: 'account_officer' })).toBe(false);
    expect(canRunSavedReport(r, { userId: 'u2', role: 'super_admin' })).toBe(true);
    const ok = validateSavedSharedLocal({ name: 'শাখা বকেয়া', dataset: 'loans', filters: [], groupBy: 'branchName', metric: 'sum', metricField: 'outstanding', chartType: 'bar', sharedWithRoles: ['branch_manager'] });
    expect(ok.success).toBe(true);
  });
});

describe('Exports & schedule (req 7)', () => {
  const cols = [{ key: 'name', labelBn: 'নাম' }, { key: 'amt', labelBn: 'টাকা' }];
  const rows = [{ name: 'রহিমা, বেগম', amt: '1200.50' }, { name: 'কমল', amt: 500 }];

  it('builds BOM-prefixed CSV with quoting', () => {
    const csv = toCsv(cols, rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"রহিমা, বেগম"');
    expect(csv.split('\n')[1]).toBe('"রহিমা, বেগম",1200.50');
  });

  it('builds an Excel XML workbook with typed cells', () => {
    const xml = toExcelXml('রিপোর্ট', cols, rows);
    expect(xml).toContain('urn:schemas-microsoft-com:office:spreadsheet');
    expect(xml).toContain('ss:Type="Number"');
    expect(xml).toContain('Nirmala UI');
    expect(xml).toContain('রহিমা');
  });

  it('builds print HTML with a Bangla font stack', () => {
    const html = toPrintHtml('বকেয়া তালিকা', cols, rows, 'স্যামিটি ডেমো');
    expect(html).toContain('Noto Sans Bengali');
    expect(html).toContain('@page');
    expect(html).toContain('বকেয়া তালিকা');
  });

  it('computes schedule due dates for daily/weekly/monthly', () => {
    expect(SCHEDULE_FREQUENCIES).toEqual(['daily', 'weekly', 'monthly']);
    const base = { enabled: true, lastRunAt: null };
    expect(isScheduleDue({ ...base, frequency: 'daily', runOn: 1 }, '2026-09-25')).toBe(true);
    expect(isScheduleDue({ ...base, frequency: 'weekly', runOn: 5 }, '2026-09-25')).toBe(true); // Friday
    expect(isScheduleDue({ ...base, frequency: 'weekly', runOn: 1 }, '2026-09-25')).toBe(false);
    expect(isScheduleDue({ ...base, frequency: 'monthly', runOn: 25 }, '2026-09-25')).toBe(true);
    expect(isScheduleDue({ ...base, frequency: 'monthly', runOn: 25 }, '2026-09-24')).toBe(false);
    expect(isScheduleDue({ ...base, frequency: 'daily', runOn: 1, lastRunAt: '2026-09-25T01:00:00Z' }, '2026-09-25')).toBe(false);
    expect(isScheduleDue({ ...base, frequency: 'daily', runOn: 1, enabled: false }, '2026-09-25')).toBe(false);
  });

  it('validates the schedule schema and builds Bangla email content', () => {
    const ok = exportScheduleSchema.safeParse({ name: 'সাপ্তাহিক বকেয়া', kind: 'standard_report', reportId: 'overdue_aging', format: 'excel', frequency: 'weekly', runOn: 1, recipients: ['bm@x.org'] });
    expect(ok.success).toBe(true);
    const bad = exportScheduleSchema.safeParse({ name: 'x', kind: 'standard_report', reportId: 'r', format: 'csv', frequency: 'daily', runOn: 1, recipients: ['not-an-email'] });
    expect(bad.success).toBe(false);
    expect(deliveryEmailSubjectBn('বকেয়া', '2026-09-01', '2026-09-30')).toContain('বকেয়া');
    expect(deliveryEmailBodyBn('বকেয়া', 12, 'স্যামিটি ডেমো')).toContain('১২');
  });

  it('reads SMTP config from env and reports when missing', () => {
    expect(smtpFromEnv({})).toBeNull();
    const cfg = smtpFromEnv({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587', SMTP_USER: 'a@b.c', SMTP_PASS: 'secret' });
    expect(cfg).not.toBeNull();
    expect(cfg!.secure).toBe(false);
    expect(cfg!.from).toBe('a@b.c');
    const tls = smtpFromEnv({ SMTP_HOST: 'h', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p' });
    expect(tls!.secure).toBe(true);
  });
});

describe('Matviews, indexes & freeze (req 8, 9)', () => {
  it('documents the materialized views and index catalogue', () => {
    expect(MIS_MATVIEWS.length).toBeGreaterThanOrEqual(4);
    expect(MIS_INDEX_DOCS.length).toBeGreaterThanOrEqual(6);
    expect(MIS_INDEX_DOCS.some((i) => i.table === 'complaints')).toBe(true);
  });

  it('freezes months and blocks writes in hard mode', () => {
    expect(monthOf('2026-09-25')).toBe('2026-09');
    expect(previousMonth('2026-09')).toBe('2026-08');
    expect(previousMonth('2026-01')).toBe('2025-12');
    const freezes = [{ month: '2026-08', status: 'hard' as const }, { month: '2026-07', status: 'soft' as const }];
    expect(freezeCheck(freezes, '2026-08-20')).toEqual({ frozen: true, mode: 'hard', month: '2026-08' });
    expect(freezeCheck(freezes, '2026-07-05')).toEqual({ frozen: true, mode: 'soft', month: '2026-07' });
    expect(freezeCheck(freezes, '2026-09-25').frozen).toBe(false);
    const ok = monthFreezeSchema.safeParse({ month: '2026-08', note: '' });
    expect(ok.success).toBe(true);
    const bad = monthFreezeSchema.safeParse({ month: '2026-8' });
    expect(bad.success).toBe(false);
  });
});

// Local wrappers to keep the import list focused.
import { canTransitionComplaint as canTransitionComplaintLocal } from '../src/reports-mis-ops';
import { DATASET_FIELDS as DF } from '../src/reports-mis-ops';
function runBuilderFieldCount(d: 'loans' | 'savings' | 'collections' | 'complaints' | 'members'): number {
  return DF[d].fields.length;
}
function canTransitionComplaintLocal(a: 'open' | 'in_progress' | 'escalated' | 'resolved' | 'rejected', b: 'open' | 'in_progress' | 'escalated' | 'resolved' | 'rejected'): boolean {
  if (a === b) return false;
  if (a === 'resolved' || a === 'rejected') return false;
  return ['in_progress', 'escalated', 'resolved', 'rejected'].includes(b);
}
function validateSavedSharedLocal(v: { name: string; dataset: 'loans' | 'savings' | 'collections' | 'complaints' | 'members'; filters: { field: string; op: string; value: string }[]; groupBy: string; metric: 'count' | 'sum' | 'avg'; metricField: string | null; chartType: string; sharedWithRoles: string[] }) {
  return savedReportSchemaLocal.safeParse(v);
}
import { savedReportSchema as savedReportSchemaLocal } from '../src/reports-mis-ops';

describe('Communication engine (comms reqs 1–3)', () => {
  it('segments SMS by unicode rules and prices parts', () => {
    expect(smsParts('Hello world, this is a plain ASCII message that stays well under one part.')).toBe(1);
    expect(smsParts('x'.repeat(161))).toBe(2);
    const bn = 'আ'.repeat(70);
    expect(smsParts(bn)).toBe(1);
    expect(smsParts('আ'.repeat(71))).toBe(2);
    const mock = new MockSmsProvider(0.5);
    expect(mock.channel).toBe('sms');
  });

  it('renders bn/en templates with variables and flags unknown/missing tokens', () => {
    const used = templateVariablesUsed('Hi {{memberName}}, pay ৳{{amount}} by {{dueDate}} {{weird}}');
    expect(used.known.sort()).toEqual(['amount', 'dueDate', 'memberName'].sort());
    expect(used.unknown).toEqual(['weird']);
    const tpl = defaultTemplates('org-1', 'admin', '2026-01-01T00:00:00Z').find((t) => t.id === 'tpl-inst-rem-bn')!;
    expect(tpl.kind).toBe('installment_reminder');
    expect(tpl.body).toContain('{{memberName}}');
    const rendered = renderTemplate(tpl.body, { memberName: 'রহিমা', orgName: 'সমিতি', loanCode: 'LN-1', installmentNo: '3', amount: '১২০০', dueDate: '১০/১০' });
    expect(rendered.missing).toEqual([]);
    expect(rendered.text).toContain('রহিমা');
    expect(rendered.text).not.toContain('{{');
    const partial = renderTemplate(tpl.body, { memberName: 'রহিমা' });
    expect(partial.missing.length).toBeGreaterThan(0);
    const kinds = defaultTemplates('o', 'u', '2026-01-01T00:00:00Z');
    expect(kinds.filter((t) => t.locale === 'bn')).toHaveLength(TEMPLATE_KINDS.length);
    expect(kinds.filter((t) => t.locale === 'en')).toHaveLength(TEMPLATE_KINDS.length);
    expect(TEMPLATE_KIND_AUDIENCE['approval_request']).toBe('staff');
  });

  it('enforces send windows, opt-outs, retries and cost caps', () => {
    expect(inSendWindow('10:00', { sendWindowStart: '09:00', sendWindowEnd: '20:00' })).toBe(true);
    expect(inSendWindow('23:30', { sendWindowStart: '09:00', sendWindowEnd: '20:00' })).toBe(false);
    expect(inSendWindow('02:00', { sendWindowStart: '22:00', sendWindowEnd: '06:00' })).toBe(true); // overnight window
    expect(isOptedOut('sms', { email: false, sms: true })).toBe(true);
    expect(isOptedOut('sms', undefined)).toBe(false);
    expect(isOptedOut('in_app', { email: true, sms: true })).toBe(false);
    expect(nextRetryAt('2026-09-25T10:00:00Z', 1, { maxRetries: 3, retryBackoffMinutes: 15 })).toBe('2026-09-25T10:15:00.000Z');
    expect(nextRetryAt('2026-09-25T10:00:00Z', 4, { maxRetries: 3, retryBackoffMinutes: 15 })).toBeNull();
    expect(assertWithinCaps({ dailyCost: 499, monthlyCost: 100 }, 0.35, { dailyCostCap: 500, monthlyCostCap: 5000 })).toEqual({ ok: true });
    expect(assertWithinCaps({ dailyCost: 499.9, monthlyCost: 100 }, 0.35, { dailyCostCap: 500, monthlyCostCap: 5000 })).toEqual({ ok: false, reason: 'daily_cap' });
    expect(assertWithinCaps({ dailyCost: 10, monthlyCost: 4999.9 }, 0.35, { dailyCostCap: 500, monthlyCostCap: 5000 })).toEqual({ ok: false, reason: 'monthly_cap' });
    const parsed = commRulesSchema.parse({});
    expect(parsed.sendWindowStart).toBe('09:00');
    expect(parsed.maxRetries).toBe(3);
  });

  it('validates template payloads', () => {
    const ok = messageTemplateSchema.safeParse({ kind: 'receipt', name: 'রশিদ', locale: 'bn', channel: 'sms', body: 'রশিদ {{receiptNo}}' });
    expect(ok.success).toBe(true);
    const bad = messageTemplateSchema.safeParse({ kind: 'receipt', name: 'x', locale: 'bn', channel: 'sms', body: '' });
    expect(bad.success).toBe(false);
    const badLocale = messageTemplateSchema.safeParse({ kind: 'receipt', name: 'রশিদ', locale: 'fr', channel: 'sms', body: 'abc' });
    expect(badLocale.success).toBe(false);
  });
});

describe('Documents engine (reqs 4–8)', () => {
  it('converts digits both ways and spells amounts in Bangla words', () => {
    expect(toBanglaDigitsFlexible(1234.5)).toBe('১২৩৪.৫');
    expect(toBanglaDigits('RCP-2026-0001')).toBe('RCP-২০২৬-০০০১');
    expect(toEnglishDigits('১২৩৪.৫')).toBe('1234.5');
    expect(numberToWordsBn(0)).toBe('শূন্য টাকা');
    expect(numberToWordsBn(1500)).toBe('এক হাজার পাঁচ শত টাকা');
    expect(numberToWordsBn('25000')).toBe('পঁচিশ হাজার টাকা');
    expect(numberToWordsBn(1250000)).toContain('লক্ষ');
    expect(numberToWordsBn(30000000)).toContain('কোটি');
    expect(numberToWordsBn('1500.25')).toBe('এক হাজার পাঁচ শত টাকা পঁচিশ পয়সা');
    expect(numberToWordsBn(-42)).toContain('ঋণাত্মক');
    // Bangla-digit input is accepted too.
    expect(numberToWordsBn('১৫০০')).toBe('এক হাজার পাঁচ শত টাকা');
    expect(takaWords('99.99')).toContain('নিরানব্বই পয়সা');
  });

  it('maps Gregorian dates onto the Bangla calendar (Pohela Boishakh = 14 April)', () => {
    const poheila = banglaCalendarDate('2026-04-14');
    expect(poheila.day).toBe(1);
    expect(poheila.month).toBe(1);
    expect(poheila.year).toBe(1433);
    expect(poheila.text).toBe('১ বৈশাখ ১৪৩৩');
    // 31-day Boishakh (14 Apr–14 May) → 15 May is Joishtho 1.
    expect(banglaCalendarDate('2026-05-15')).toMatchObject({ day: 1, month: 2 });
    // 31-day months 1–6: 15 June = Asharh 1 (not Jyaistha 32).
    expect(banglaCalendarDate('2026-06-15')).toMatchObject({ day: 1, month: 3 });
    // Year boundary: 13 April is last of Choitro, 14 April flips the year.
    expect(banglaCalendarDate('2026-04-13').month).toBe(12);
    expect(banglaCalendarDate('2026-01-01').year).toBe(1432);
    // Leap-year absorb: Falgun stretches to 31 days, Choitro starts 16 Mar.
    const leapFalgun = banglaCalendarDate('2024-03-15');
    expect(leapFalgun.month).toBe(11);
    expect(leapFalgun.day).toBe(31);
    expect(banglaCalendarDate('2024-03-16')).toMatchObject({ day: 1, month: 12 });
    // Non-leap years keep Falgun at 30 (ends 15 Mar).
    expect(banglaCalendarDate('2026-03-16')).toMatchObject({ day: 1, month: 12 });
  });

  it('validates doc templates and renders with variables', () => {
    const ok = docTemplateSchema.safeParse({ kind: 'receipt', register: 'cholito', body: '<p>রশিদ {{receiptNo}}</p>' });
    expect(ok.success).toBe(true);
    const bad = docTemplateSchema.safeParse({ kind: 'receipt', register: 'cholito', body: 'x' });
    expect(bad.success).toBe(false);
    const badRegister = docTemplateSchema.safeParse({ kind: 'receipt', register: 'pure', body: '<p>রশিদ {{receiptNo}}</p>' });
    expect(badRegister.success).toBe(false);
    const used = docVariablesUsed('<p>{{memberName}} {{receiptNo}} {{nope}}</p>');
    expect(used.known.sort()).toEqual(['memberName', 'receiptNo'].sort());
    expect(used.unknown).toEqual(['nope']);
    const rendered = renderDocTemplate('৳{{paidAmount}} — {{memberName}}', { paidAmount: '৫০০' });
    expect(rendered.text).toContain('৫০০');
    expect(rendered.missing).toEqual(['memberName']);
  });

  it('seeds 22 templates (11 kinds × 2 registers) and verifies QR payload shape', () => {
    const all = defaultDocTemplates('org-1', 'admin', '2026-01-01T00:00:00Z');
    expect(all).toHaveLength(DOC_KINDS.length * 2);
    for (const kind of DOC_KINDS) {
      expect(all.find((t) => t.kind === kind && t.register === 'cholito')).toBeTruthy();
      expect(all.find((t) => t.kind === kind && t.register === 'sadhu')).toBeTruthy();
    }
    expect(all.find((t) => t.id === 'doc-legal-sadhu')!.body).toContain('আইনগত নোটিশ');
    // Sadhu variants actually read differently from cholito ones.
    const membership = all.filter((t) => t.kind === 'membership_form');
    expect(membership[0]!.body).not.toBe(membership[1]!.body);
    const code = 'VRF-K7PQ2M9XRT';
    expect(VERIFY_CODE_RE.test(code)).toBe(true);
    expect(VERIFY_CODE_RE.test('VRF-IO0O12AAAA')).toBe(false);
    expect(verifyCodePayload('https://x.example/', code)).toBe('https://x.example/verify/VRF-K7PQ2M9XRT');
  });
});

import {
  AUDIT_ACTIONS,
  AUDIT_SENSITIVE_TABLES,
  CORRECTION_FLOW,
  DEFAULT_IP_ALLOWLIST,
  DEFAULT_LOCKOUT_POLICY,
  DEFAULT_PASSWORD_POLICY,
  DEFAULT_RETENTION_RULES,
  FINANCE_ROLES,
  PROTECTED_FIELDS,
  RLS_TEST_MATRIX,
  UNMASK_ALLOWED_ROLES,
  auditFilterSchema,
  auditRecordMatches,
  base32Decode,
  base32Encode,
  canTransitionCorrection,
  canUnmaskField,
  evaluatePassword,
  financeIpGateApplies,
  ipInAllowlist,
  lockoutDecision,
  maskValue,
  otpauthUrl,
  retentionRuleSchema,
  totpRequiredForRole,
} from '../src/security';

describe('security engine', () => {
  it('req 1: audit record + filters', () => {
    const base = {
      id: 'a1',
      orgId: 'o',
      tableName: 'vouchers',
      recordId: '00000000-0000-4000-8000-0000000000v1',
      action: 'update' as const,
      oldValues: { total: '100' },
      newValues: { total: '150' },
      changedFields: ['total'],
      userId: 'u1',
      userName: 'অ্যাডমিন',
      ip: '203.0.113.9',
      userAgent: 'vitest',
      at: '2026-09-20T10:00:00.000Z',
    };
    expect(AUDIT_ACTIONS).toEqual(['insert', 'update', 'delete']);
    expect(AUDIT_SENSITIVE_TABLES).toContain('members');
    expect(AUDIT_SENSITIVE_TABLES).toContain('vouchers');
    expect(auditRecordMatches(base, auditFilterSchema.parse({}))).toBe(true);
    expect(auditRecordMatches(base, auditFilterSchema.parse({ tableName: 'members' }))).toBe(false);
    expect(auditRecordMatches(base, auditFilterSchema.parse({ action: 'delete' }))).toBe(false);
    expect(auditRecordMatches(base, auditFilterSchema.parse({ recordId: 'v1' }))).toBe(true);
    expect(auditRecordMatches(base, auditFilterSchema.parse({ q: 'অ্যাডমিন' }))).toBe(true);
    expect(auditRecordMatches(base, auditFilterSchema.parse({ q: 'না মিলে' }))).toBe(false);
    expect(auditRecordMatches(base, auditFilterSchema.parse({ from: '2026-09-21' }))).toBe(false);
    expect(auditRecordMatches(base, auditFilterSchema.parse({ to: '2026-09-20' }))).toBe(true);
    expect(auditRecordMatches(base, auditFilterSchema.parse({ userId: 'U1' }))).toBe(true);
  });

  it('req 2: masking rules by role and field', () => {
    expect(PROTECTED_FIELDS).toEqual(['national_id', 'bank_account', 'phone']);
    expect(maskValue('national_id', '1990123456789')).toBe('••••••6789');
    expect(maskValue('bank_account', 'BRK-0099-88776655')).toBe('••••••6655');
    expect(maskValue('phone', '01712345678')).toBe('01712••••78');
    expect(maskValue('phone', '123')).toBe('••••••');
    // account_officer may reveal phones but not bank accounts.
    expect(canUnmaskField('account_officer', 'phone')).toBe(true);
    expect(canUnmaskField('account_officer', 'bank_account')).toBe(false);
    expect(canUnmaskField('member', 'national_id')).toBe(false);
    expect(canUnmaskField('branch_manager', 'national_id')).toBe(true);
    for (const f of PROTECTED_FIELDS) {
      expect(UNMASK_ALLOWED_ROLES[f]).not.toContain('member');
      expect(UNMASK_ALLOWED_ROLES[f]).toContain('super_admin');
    }
  });

  it('req 3: password policy evaluation', () => {
    const good = evaluatePassword('Str0ng!Pass9', DEFAULT_PASSWORD_POLICY, { email: 'admin@samity.test' });
    expect(good.ok).toBe(true);
    expect(good.problems).toEqual([]);
    const weak = evaluatePassword('abc', DEFAULT_PASSWORD_POLICY, {});
    expect(weak.ok).toBe(false);
    expect(weak.problems.length).toBeGreaterThanOrEqual(4);
    const personal = evaluatePassword('MyAdmin@123', DEFAULT_PASSWORD_POLICY, { email: 'admin@samity.test', name: 'রহিমা' });
    expect(personal.ok).toBe(false);
    expect(personal.problems.some((p) => p.includes('ইমেইল'))).toBe(true);
    const digitsOnly = evaluatePassword('1234567890', DEFAULT_PASSWORD_POLICY, {});
    expect(digitsOnly.ok).toBe(false);
  });

  it('req 3: TOTP helpers (base32 + otpauth URL + role targeting)', () => {
    expect(base32Encode(Uint8Array.from([0x46]))).toBe('IY');
    expect(base32Encode(Uint8Array.from([0x46, 0x6f]))).toBe('IZXQ');
    const rnd = new Uint8Array(20).map((_, i) => (i * 37 + 11) % 256);
    expect(base32Decode(base32Encode(rnd))).toEqual(rnd);
    expect(() => base32Decode('ABC1')).toThrow(/invalid base32/);
    const url = otpauthUrl('admin@samity.test', 'MFRGGZDF', 'Samity Manager');
    expect(url).toContain('otpauth://totp/Samity%20Manager%3Aadmin%40samity.test?');
    expect(url).toContain('secret=MFRGGZDF');
    expect(totpRequiredForRole({ enabled: true, requiredRoles: ['super_admin'], stepSeconds: 30, window: 1, digits: 6, issuer: 'x' }, 'super_admin')).toBe(true);
    expect(totpRequiredForRole({ enabled: true, requiredRoles: ['super_admin'], stepSeconds: 30, window: 1, digits: 6, issuer: 'x' }, 'account_officer')).toBe(false);
    expect(totpRequiredForRole({ enabled: false, requiredRoles: ['super_admin'], stepSeconds: 30, window: 1, digits: 6, issuer: 'x' }, 'super_admin')).toBe(false);
  });

  it('req 3: brute-force lockout decision', () => {
    const now = new Date('2026-09-20T12:00:00Z');
    const mk = (minAgo: number, ok = false) => ({ email: 'x@y.z', ok, ip: null, at: new Date(now.getTime() - minAgo * 60_000).toISOString() });
    const low = lockoutDecision([mk(1), mk(2), mk(3), mk(4)], 'x@y.z', DEFAULT_LOCKOUT_POLICY, now);
    expect(low.locked).toBe(false);
    expect(low.failedCount).toBe(4);
    const locked = lockoutDecision([mk(1), mk(2), mk(3), mk(4), mk(5)], 'X@Y.Z', DEFAULT_LOCKOUT_POLICY, now);
    expect(locked.locked).toBe(true);
    expect(locked.remainingMs).toBeGreaterThan(0);
    // Old failures outside the window do not count.
    const stale = lockoutDecision([mk(60), mk(61), mk(62), mk(63), mk(64)], 'x@y.z', DEFAULT_LOCKOUT_POLICY, now);
    expect(stale.locked).toBe(false);
    // Successes do not count toward the lockout.
    const withOk = lockoutDecision([mk(1), mk(2, true), mk(3), mk(4), mk(5)], 'x@y.z', DEFAULT_LOCKOUT_POLICY, now);
    expect(withOk.failedCount).toBe(4);
  });

  it('req 3: IP allow-list CIDR matching + finance gate', () => {
    const off = { enabled: false, cidrs: [] };
    expect(ipInAllowlist('8.8.8.8', off)).toBe(true);
    const list = { enabled: true, cidrs: ['103.12.34.0/24', '203.0.113.9'] };
    expect(ipInAllowlist('103.12.34.99', list)).toBe(true);
    expect(ipInAllowlist('103.12.35.99', list)).toBe(false);
    expect(ipInAllowlist('203.0.113.9', list)).toBe(true);
    expect(ipInAllowlist(null, list)).toBe(false);
    expect(ipInAllowlist('not-an-ip', list)).toBe(false);
    expect(ipInAllowlist('256.1.1.1', list)).toBe(false);
    expect(DEFAULT_IP_ALLOWLIST.enabled).toBe(false);
    expect(financeIpGateApplies('branch_manager', 'POST', list)).toBe(true);
    expect(financeIpGateApplies('branch_manager', 'GET', list)).toBe(false);
    expect(financeIpGateApplies('account_officer', 'POST', list)).toBe(false);
    expect(FINANCE_ROLES).toContain('branch_manager');
  });

  it('req 5: correction workflow transitions', () => {
    expect(canTransitionCorrection('submitted', 'in_review')).toBe(true);
    expect(canTransitionCorrection('submitted', 'approved')).toBe(false);
    expect(canTransitionCorrection('in_review', 'approved')).toBe(true);
    expect(canTransitionCorrection('in_review', 'rejected')).toBe(true);
    expect(canTransitionCorrection('approved', 'applied')).toBe(true);
    expect(canTransitionCorrection('rejected', 'in_review')).toBe(false);
    expect(canTransitionCorrection('applied', 'anything' as never)).toBe(false);
    expect(Object.keys(CORRECTION_FLOW)).toHaveLength(5);
  });

  it('req 5: retention rule schema + defaults', () => {
    for (const r of DEFAULT_RETENTION_RULES) {
      expect(retentionRuleSchema.safeParse(r).success).toBe(true);
    }
    expect(retentionRuleSchema.safeParse({ class: 'member_core', retainMonths: 1 }).success).toBe(false);
    expect(DEFAULT_RETENTION_RULES.map((r) => r.class)).toContain('audit_logs');
  });

  it('req 4: RLS matrix covers branch-scoped sensitive tables', () => {
    expect(RLS_TEST_MATRIX.length).toBeGreaterThanOrEqual(12);
    for (const row of RLS_TEST_MATRIX) {
      expect(row.branchColumn).toBe('branch_id');
      expect(['deny_cross_branch_select', 'deny_cross_branch_write']).toContain(row.expect);
      expect(AUDIT_SENSITIVE_TABLES).toContain(row.table as never);
    }
    const tables = new Set(RLS_TEST_MATRIX.map((r) => r.table));
    expect(tables.has('members')).toBe(true);
    expect(tables.has('savings_transactions')).toBe(true);
    expect(tables.has('vouchers')).toBe(true);
  });
});
