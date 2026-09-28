/**
 * GENERATED FILE — accounting module tables (migration 0028).
 * Shapes mirror supabase/migrations/0028_accounting.sql columns.
 */

export type GlAccountType = 'asset' | 'liability' | 'fund' | 'income' | 'expense';
export type GlAccountCategory = 'control' | 'cash' | 'bank' | 'income' | 'expense' | 'party' | 'member' | 'memo';
export type VoucherType = 'cash_receipt' | 'cash_payment' | 'bank_payment' | 'journal' | 'contra';
export type VoucherStatus = 'draft' | 'checked' | 'approved';
export type CashBookStatus = 'open' | 'closed';
export type CashDifferenceKind = 'shortage' | 'excess' | 'exact';
export type BankRecStatus = 'pending' | 'cleared';
export type PettyMovementKind = 'top_up' | 'spend';

export interface GlAccountRow {
  id: string;
  org_id: string;
  code: string;
  name: string;
  name_bn: string;
  type: GlAccountType;
  category: GlAccountCategory;
  parent_code: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface VoucherRow {
  id: string;
  org_id: string;
  branch_id: string;
  voucher_number: string;
  voucher_type: VoucherType;
  voucher_date: string;
  fund_id: string | null;
  project_name: string | null;
  payee_payer: string | null;
  memo: string;
  status: VoucherStatus;
  auto_source: string | null;
  total_debit: string;
  total_credit: string;
  prepared_by: string | null;
  checked_by: string | null;
  checked_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface VoucherLineRow {
  id: string;
  org_id: string;
  voucher_id: string;
  line_no: number;
  account_code: string;
  fund_id: string | null;
  project_name: string | null;
  party_name: string | null;
  note: string | null;
  debit: string;
  credit: string;
}

export interface VoucherAttachmentRow {
  id: string;
  org_id: string;
  voucher_id: string;
  name: string;
  storage_path: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface JournalPostingRow {
  id: string;
  org_id: string;
  voucher_id: string | null;
  event: string;
  ref_id: string | null;
  amount: string;
  settlement_code: string;
  counter_code: string;
  direction: 'in' | 'out';
  branch_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EventJournalMappingRow {
  id: string;
  org_id: string;
  event: string;
  settlement_code: string;
  counter_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CashBookDayRow {
  id: string;
  org_id: string;
  branch_id: string;
  book_date: string;
  status: CashBookStatus;
  opening_balance: string;
  total_cash_in: string;
  total_cash_out: string;
  expected_closing: string;
  counted_cash: string | null;
  difference: string | null;
  difference_kind: CashDifferenceKind | null;
  closing_balance: string | null;
  locked: boolean;
  manager_sign_name: string | null;
  accountant_sign_name: string | null;
  closed_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashBookLineRow {
  id: string;
  org_id: string;
  cash_book_day_id: string;
  voucher_number: string;
  voucher_type: string;
  memo: string;
  cash_in: string;
  cash_out: string;
  created_at: string;
}

export interface BankReconciliationRow {
  id: string;
  org_id: string;
  branch_id: string;
  bank_code: string;
  period_start: string;
  period_end: string;
  book_balance: string;
  statement_balance: string;
  status: BankRecStatus;
  prepared_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankStatementLineRow {
  id: string;
  org_id: string;
  reconciliation_id: string;
  value_date: string;
  narration: string;
  amount: string;
  cleared: boolean;
  matched_voucher_number: string | null;
  created_at: string;
}

export interface PettyCashAccountRow {
  id: string;
  org_id: string;
  branch_id: string;
  balance: string;
  limit_amount: string;
  created_at: string;
  updated_at: string;
}

export interface PettyCashMovementRow {
  id: string;
  org_id: string;
  branch_id: string;
  at: string;
  kind: PettyMovementKind;
  amount: string;
  expense_code: string | null;
  spent_on: string | null;
  note: string | null;
  balance_after: string;
  created_by: string | null;
  created_at: string;
}

// ── 0030: accounting ops (requirements 6–10) ──
export type FundRequisitionKind = 'branch_to_ho' | 'ho_to_branch' | 'inter_branch';
export type FundRequisitionStatus = 'requested' | 'approved' | 'rejected' | 'disbursed' | 'received';

export interface FundRequisitionRow {
  id: string;
  org_id: string;
  kind: FundRequisitionKind;
  from_node_id: string;
  to_node_id: string;
  amount: string;
  purpose: string;
  status: FundRequisitionStatus;
  settlement_code: string;
  requested_by: string;
  decided_by: string | null;
  decided_at: string | null;
  out_voucher_id: string | null;
  in_voucher_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GlBudgetRow {
  id: string;
  org_id: string;
  branch_id: string | null;
  account_code: string;
  period_start: string;
  period_end: string;
  amount: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type PeriodCloseKind = 'monthly' | 'annual';

export interface PeriodCloseRow {
  id: string;
  org_id: string;
  kind: PeriodCloseKind;
  period_start: string;
  period_end: string;
  closed_by: string;
  closed_at: string;
  snapshot_json: Record<string, unknown>;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ── 0032: HR (staff, recruitment, attendance/leave, movements) ──
export interface HrStaffRow {
  id: string;
  org_id: string;
  employee_code: string;
  name: string;
  name_bn: string;
  designation: string;
  grade: string;
  branch_id: string | null;
  joining_date: string;
  probation_end_date: string | null;
  confirmation_date: string | null;
  status: string;
  mobile: string;
  email: string | null;
  nid_enc: string | null;
  nid_masked: string | null;
  bank_account_enc: string | null;
  bank_name: string | null;
  bank_masked: string | null;
  monthly_gross: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  documents: Array<{ name: string; path: string; sizeBytes: number }>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface HrStaffPostingRow {
  id: string;
  org_id: string;
  staff_id: string;
  branch_id: string | null;
  designation: string;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
  created_at: string;
}

export interface HrStaffEducationRow {
  id: string;
  org_id: string;
  staff_id: string;
  level: string;
  institution: string;
  passing_year: number;
  result: string;
  created_at: string;
}

export interface HrVacancyRow {
  id: string;
  org_id: string;
  branch_id: string;
  designation: string;
  headcount: number;
  reason: string;
  status: string;
  requested_by: string;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface HrApplicantRow {
  id: string;
  org_id: string;
  vacancy_id: string;
  name: string;
  mobile: string;
  education_level: string;
  experience_years: number;
  status: string;
  interview_scores: Array<{ panelist: string; score: number; note: string | null }>;
  offered_salary: string | null;
  created_at: string;
  updated_at: string;
}

export interface HrAttendanceRow {
  id: string;
  org_id: string;
  staff_id: string;
  work_date: string;
  status: string;
  check_in_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  selfie_path: string | null;
  distance_meters: number | null;
  mode: 'field' | 'office';
  note: string | null;
  created_at: string;
}

export interface HrLeaveRequestRow {
  id: string;
  org_id: string;
  staff_id: string;
  leave_type: 'casual' | 'sick' | 'annual' | 'maternity';
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface HrHolidayRow {
  id: string;
  org_id: string;
  date: string;
  name: string;
  name_bn: string;
  created_at: string;
}

export interface HrMovementRow {
  id: string;
  org_id: string;
  kind: 'transfer' | 'promotion';
  staff_id: string;
  from_branch_id: string | null;
  to_branch_id: string | null;
  from_designation: string;
  to_designation: string;
  to_grade: string | null;
  new_monthly_gross: string | null;
  effective_date: string;
  reason: string;
  status: 'proposed' | 'approved' | 'rejected' | 'effective';
  proposed_by: string;
  approved_by: string | null;
  approved_at: string | null;
  order_number: string | null;
  created_at: string;
  updated_at: string;
}

/* ── 0034: HR payroll, PF, performance, discipline ── */

export interface SalaryStructureRow {
  id: string;
  org_id: string;
  grade: string;
  basic: string;
  house_rent: string;
  medical: string;
  conveyance: string;
  field_allowance: string;
  pf_employee_rate: string;
  pf_employer_rate: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PayrollRunRow {
  id: string;
  org_id: string;
  period: string;
  status: 'draft' | 'approved' | 'paid';
  total_gross: string;
  total_deduction: string;
  total_net: string;
  bonus_total: string;
  prepared_by: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollLineRow {
  id: string;
  org_id: string;
  payroll_id: string;
  staff_id: string;
  components: Record<string, string>;
  deductions: Record<string, string>;
  gross: string;
  total_deduction: string;
  net: string;
  bonus: string;
  working_days: number;
  present_days: number;
  attendance_ratio: string;
  created_at: string;
}

export interface PfLedgerRow {
  id: string;
  org_id: string;
  staff_id: string;
  period: string | null;
  type: 'contribution' | 'interest' | 'withdrawal' | 'transfer_out';
  employee_amount: string;
  employer_amount: string;
  balance_after: string;
  note: string | null;
  created_at: string;
}

export interface GratuitySettlementRow {
  id: string;
  org_id: string;
  staff_id: string;
  joining_date: string;
  leaving_date: string;
  last_basic: string;
  years: number;
  amount: string;
  paid_at: string | null;
  created_at: string;
}

export interface KpiScorecardRow {
  id: string;
  org_id: string;
  staff_id: string;
  period: string;
  actuals: Record<string, number>;
  scores: Record<string, number>;
  total_score: string;
  grade: 'A' | 'B' | 'C' | 'D';
  created_at: string;
}

export interface StaffAppraisalRow {
  id: string;
  org_id: string;
  staff_id: string;
  year: string;
  scores: Record<string, number>;
  comments: string;
  rating: string;
  status: 'draft' | 'submitted' | 'reviewed';
  reviewer_id: string | null;
  reviewer_note: string | null;
  created_at: string;
}

export interface DisciplinaryCaseRow {
  id: string;
  org_id: string;
  staff_id: string;
  severity: 'verbal_warning' | 'written_warning' | 'show_cause' | 'suspension' | 'termination';
  incident_date: string;
  description: string;
  status: 'open' | 'explained' | 'closed';
  explanation: string | null;
  outcome: string | null;
  raised_by: string;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkTaskRow {
  id: string;
  org_id: string;
  branch_id: string | null;
  type: 'overdue_followup' | 'utilization_visit' | 'meeting_due' | 'kyc_pending' | 'report_submission' | 'cash_count' | 'manual';
  title: string;
  description: string;
  assignee_id: string;
  assignee_name: string;
  assigner_id: string;
  assigner_name: string;
  due_date: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  link_kind: 'member' | 'loan' | 'samity' | 'branch' | 'other';
  link_id: string | null;
  link_label: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'verified';
  comments: Array<{ id: string; authorId: string; authorName: string; text: string; createdAt: string }>;
  attachments: string[];
  auto_key: string | null;
  completed_at: string | null;
  verified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TaskDelegationRow {
  id: string;
  org_id: string;
  task_id: string | null;
  from_staff_id: string;
  to_staff_id: string;
  reason: 'leave' | 'transfer' | 'workload' | 'other';
  note: string;
  created_by: string | null;
  created_at: string;
}

export interface WorkTargetRow {
  id: string;
  org_id: string;
  scope: 'area' | 'branch' | 'officer';
  owner_branch_id: string | null;
  owner_staff_id: string | null;
  owner_name: string;
  parent_id: string | null;
  period: string;
  new_members: number;
  disbursement: string;
  collection: string;
  savings: string;
  par_limit: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SupervisionSubmissionRow {
  id: string;
  org_id: string;
  branch_id: string;
  form_type: 'center_visit' | 'branch_inspection' | 'passbook_verification' | 'cash_verification' | 'loan_utilization';
  link_id: string | null;
  link_label: string;
  submitted_by: string;
  submitted_name: string;
  submitted_at: string;
  lat: number | null;
  lng: number | null;
  distance_meters: number | null;
  photos: string[];
  items: Array<{ id: string; questionBn: string; answer: 'yes' | 'no' | 'na' | null; note: string }>;
  exceptions: number;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AuditPlanRow {
  id: string;
  org_id: string;
  branch_id: string;
  branch_name: string;
  title: string;
  planned_date: string;
  lead_auditor_id: string;
  lead_auditor_name: string;
  status: 'planned' | 'in_progress' | 'draft_report' | 'closed';
  loan_sample: string[];
  member_sample: string[];
  sample_size: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AuditFindingRow {
  id: string;
  org_id: string;
  audit_id: string;
  ref: string;
  title: string;
  detail: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'responded' | 'in_followup' | 'closed';
  response: string;
  responded_at: string | null;
  deadline: string | null;
  follow_ups: Array<{ id: string; at: string; note: string; byName: string }>;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkEscalationRow {
  id: string;
  org_id: string;
  entity_type: 'task' | 'finding';
  entity_id: string;
  days_overdue: number;
  tier_role: 'branch_manager' | 'area_manager' | 'org_admin';
  escalated_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkDigestRow {
  id: string;
  org_id: string;
  role: string;
  digest_date: string;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreditLifePolicyRow {
  id: string;
  org_id: string;
  branch_id: string;
  application_id: string;
  loan_number: string;
  member_id: string;
  member_name: string;
  premium_rate_pct: number;
  premium_amount: string;
  principal: string;
  coverage_amount: string;
  start_date: string;
  end_date: string;
  nominee_name: string;
  nominee_relation: string;
  nominee_phone: string | null;
  status: 'active' | 'claimed' | 'expired';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InsuranceClaimRow {
  id: string;
  org_id: string;
  branch_id: string;
  policy_id: string;
  claim_no: string;
  kind: 'death' | 'cattle' | 'crop' | 'health';
  member_id: string;
  member_name: string;
  event_date: string;
  reported_date: string;
  cause: string;
  documents: Array<{ id: string; labelBn: string; path: string }>;
  assessment_note: string;
  claimed_amount: string;
  approved_amount: string | null;
  settlement_mode: 'payout' | 'waiver' | null;
  status: 'submitted' | 'bm_review' | 'am_review' | 'ho_review' | 'approved' | 'paid' | 'rejected';
  decision_note: string;
  decided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MicroInsuranceProductRow {
  id: string;
  org_id: string;
  kind: 'cattle' | 'crop' | 'health';
  name_bn: string;
  annual_premium: string;
  coverage_limit: string;
  units: number;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MicroEnrollmentRow {
  id: string;
  org_id: string;
  branch_id: string;
  product_id: string;
  kind: 'cattle' | 'crop' | 'health';
  member_id: string;
  member_name: string;
  units: number;
  subject_ref: string;
  annual_premium: string;
  coverage_limit: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'claimed' | 'expired';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WelfareFundRulesRow {
  id: string;
  org_id: string;
  monthly_contribution: string;
  staff_contribution: string;
  grant_cap_bdt: string;
  loan_cap_bdt: string;
  loan_term_months: number;
  bm_approval_up_to: string;
  am_approval_up_to: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WelfareRequestRow {
  id: string;
  org_id: string;
  branch_id: string;
  fund: 'member' | 'staff';
  request_no: string;
  requester_id: string;
  requester_name: string;
  kind: 'illness' | 'funeral' | 'flood' | 'disaster' | 'education';
  type: 'grant' | 'interest_free_loan';
  amount: string;
  reason: string;
  photos: string[];
  status: 'submitted' | 'bm_review' | 'am_review' | 'approved' | 'rejected' | 'disbursed';
  decision_note: string;
  decided_at: string | null;
  disbursed_at: string | null;
  repayment_months: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WelfareLedgerRow {
  id: string;
  org_id: string;
  branch_id: string | null;
  fund: 'member_welfare' | 'staff_benevolent' | 'insurance';
  entry_type: 'contribution' | 'premium' | 'grant' | 'loan_disbursed' | 'loan_repaid' | 'claim_paid' | 'claim_waiver' | 'adjustment';
  ref_type: string | null;
  ref_id: string | null;
  amount: string;
  memo: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** ── Cooperative governance (migration 0042) ─────────────────────────────── */

export type DividendDistributionStatusRow = 'computed' | 'agm_approved' | 'posted' | 'paid';

export interface DividendDistributionRow {
  id: string;
  org_id: string;
  fiscal_year: string;
  surplus: string;
  reserve_pct: string;
  reserve_amount: string;
  rate_pct: string;
  pool_amount: string;
  total_weighted: string;
  agm_meeting_id: string | null;
  status: DividendDistributionStatusRow;
  declared_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DividendLineRow {
  id: string;
  org_id: string;
  distribution_id: string;
  member_id: string;
  member_name: string;
  shares: number;
  months_held: number;
  weighted_shares: string;
  weight_pct: string;
  amount: string;
  destination: 'savings' | 'cash';
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AgmStatusRow = 'draft' | 'notice_issued' | 'held' | 'minutes_approved';

export interface AgmRecordRow {
  id: string;
  org_id: string;
  fiscal_year: string;
  meeting_date: string;
  venue: string;
  notice_date: string | null;
  notice_days: number;
  agenda: unknown;
  attendance: unknown;
  quorum_required: number;
  resolutions: unknown;
  elections: unknown;
  minutes_bn: string;
  approved_by: string | null;
  status: AgmStatusRow;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ExitStatusRow = 'requested' | 'computed' | 'approved' | 'settled' | 'rejected';

export interface MemberExitRow {
  id: string;
  org_id: string;
  branch_id: string;
  member_id: string;
  member_name: string;
  request_date: string;
  exit_no: string;
  savings_balance: string;
  share_value: string;
  dividend_due: string;
  welfare_balance: string;
  dues_outstanding: string;
  net_payable: string;
  lines: unknown;
  status: ExitStatusRow;
  decision_note: string;
  settled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** ── Programs & projects (migration 0044) ────────────────────────────────── */
export type ProjectStatusRow = 'proposed' | 'active' | 'suspended' | 'closed';
export type ProgramSectorRow =
  | 'education'
  | 'health'
  | 'skills_training'
  | 'agriculture'
  | 'wash'
  | 'child_protection'
  | 'awareness';
export type LogframeLevelRow = 'goal' | 'objective' | 'output' | 'indicator';
export type ServiceKindRow = 'training' | 'health_camp' | 'school_enrollment' | 'kit_distribution' | 'awareness_session';
export type ActivityStatusRow = 'planned' | 'done' | 'cancelled';
export type GenderRow = 'male' | 'female' | 'other';

export interface ProjectRow {
  id: string;
  org_id: string;
  branch_id: string | null;
  code: string;
  name_bn: string;
  name_en: string;
  donor: string;
  grant_agreement_no: string;
  fund_code: string;
  sector: ProgramSectorRow;
  start_date: string;
  end_date: string;
  target_areas: unknown;
  target_beneficiaries: number;
  manager_name: string;
  status: ProjectStatusRow;
  created_at: string;
  updated_at: string;
}

export interface ProjectBudgetLineRow {
  id: string;
  org_id: string;
  project_id: string;
  line_item: string;
  amount: string;
  note: string;
  created_at: string;
}

export interface LogframeEntryRow {
  id: string;
  org_id: string;
  project_id: string;
  level: LogframeLevelRow;
  statement: string;
  parent_label: string | null;
  indicator_code: string | null;
  baseline: string;
  target_value: string;
  unit: string | null;
  means_of_verification: string;
  created_at: string;
}

export interface IndicatorValueRow {
  id: string;
  org_id: string;
  entry_id: string;
  period_start: string;
  period_end: string;
  value: string;
  evidence: unknown;
  note: string;
  entered_at: string;
}

export interface BeneficiaryRow {
  id: string;
  org_id: string;
  branch_id: string | null;
  code: string;
  member_id: string | null;
  name_bn: string;
  guardian_bn: string;
  phone: string;
  age: number;
  gender: GenderRow;
  village: string;
  created_at: string;
}

export interface ProgramEnrollmentRow {
  id: string;
  org_id: string;
  beneficiary_id: string;
  project_id: string;
  enrolled_at: string;
  note: string;
  created_at: string;
}

export interface ProgramServiceRow {
  id: string;
  org_id: string;
  project_id: string;
  beneficiary_id: string;
  kind: ServiceKindRow;
  service_date: string;
  details: string;
  created_at: string;
}

export interface ProgramActivityRow {
  id: string;
  org_id: string;
  project_id: string;
  title_bn: string;
  kind: ServiceKindRow;
  planned_date: string;
  venue: string;
  target_participants: number;
  status: ActivityStatusRow;
  note: string;
  created_at: string;
}

export interface TrainingBatchRow {
  id: string;
  org_id: string;
  project_id: string;
  code: string;
  title_bn: string;
  trainer_name: string;
  trainer_org_bn: string;
  start_date: string;
  end_date: string;
  hours: number;
  sessions: number;
  created_at: string;
}

export interface TrainingAttendanceRow {
  id: string;
  org_id: string;
  batch_id: string;
  beneficiary_id: string;
  session_no: number;
  present: boolean;
  created_at: string;
}

export interface TrainingTestScoreRow {
  id: string;
  org_id: string;
  batch_id: string;
  beneficiary_id: string;
  pre: string;
  post: string;
  created_at: string;
}

export interface TrainingCertificateRow {
  id: string;
  org_id: string;
  cert_no: string;
  batch_id: string;
  beneficiary_id: string;
  issued_at: string;
}

/** ── Programs ops (migration 0046) ──────────────────────────────────── */
export type CaseTypeRow = 'child_protection' | 'gbv_survivor' | 'child_marriage' | 'trafficking' | 'other_sensitive';
export type CaseStatusRow = 'open' | 'in_progress' | 'referred' | 'closed';
export type CaseSeverityRow = 'low' | 'medium' | 'high' | 'critical';
export type CaseAccessActionRow = 'create' | 'view' | 'view_restricted' | 'update' | 'close';
export type FundingKindRow = 'grant' | 'pksf' | 'bank' | 'mfi_wholesale' | 'internal_fund';
export type FundingStatusRow = 'active' | 'repaid' | 'defaulted';

export interface ProjectExpenseRow {
  id: string;
  org_id: string;
  project_id: string;
  expense_date: string;
  budget_line: string;
  amount: string;
  voucher_no: string;
  description: string;
  recorded_by: string;
  created_at: string;
}

export interface FieldVisitRow {
  id: string;
  org_id: string;
  project_id: string;
  visit_date: string;
  officer_id: string;
  officer_name: string;
  village: string;
  beneficiaries_met: number;
  checklist: unknown;
  photos: unknown;
  findings: string;
  follow_ups: unknown;
  created_at: string;
}

export interface DonorReportRow {
  id: string;
  org_id: string;
  project_id: string;
  period_start: string;
  period_end: string;
  payload: unknown;
  generated_by: string;
  created_at: string;
}

export interface CaseRow {
  id: string;
  org_id: string;
  case_no: string;
  type: CaseTypeRow;
  severity: CaseSeverityRow;
  status: CaseStatusRow;
  beneficiary_id: string | null;
  beneficiary_name: string;
  /** Restricted: only case workers read this column. */
  restricted_details: string;
  consent_given: boolean;
  opened_at: string;
  assigned_worker_id: string;
  assigned_worker_name: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseAccessLogRowType {
  id: string;
  org_id: string;
  case_id: string;
  user_id: string;
  user_name: string;
  action: CaseAccessActionRow;
  at: string;
}

export interface FundingSourceRow {
  id: string;
  org_id: string;
  code: string;
  source_name: string;
  kind: FundingKindRow;
  principal: string;
  interest_rate_pct: string;
  tenure_months: number;
  disbursement_date: string;
  repayment_start: string;
  purpose_project_id: string | null;
  lender_contact: string;
  status: FundingStatusRow;
  created_at: string;
}

export interface FundingRepaymentRow {
  id: string;
  org_id: string;
  source_id: string;
  installment_no: number;
  due_date: string;
  principal: string;
  interest: string;
  total: string;
  balance: string;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
}

/** ── Reports, MIS & compliance (migration 0048) ─────────────────────── */
export type MisDashboardRoleRow = 'field_officer' | 'branch_manager' | 'area_zone' | 'head_office' | 'board';
export type ReportRegulatorRow = 'MRA' | 'PKSF' | 'OTHER';

export interface ReportTemplateRowType {
  id: string;
  org_id: string;
  name: string;
  regulator: ReportRegulatorRow;
  section: string;
  circular_ref: string;
  needs_verification: boolean;
  verified_at: string | null;
  verified_by: string | null;
  rows: unknown;
  created_at: string;
  updated_at: string;
}

export interface RegulatoryReturnRow {
  id: string;
  org_id: string;
  template_id: string;
  period_start: string;
  period_end: string;
  payload: unknown;
  missing_values: unknown;
  generated_by: string;
  submitted_at: string | null;
  created_at: string;
}

export interface MisSnapshotRowType {
  id: string;
  org_id: string;
  as_of: string;
  role: MisDashboardRoleRow;
  scope_id: string | null;
  payload: unknown;
  created_at: string;
}

export interface MisFormulaValueRow {
  id: string;
  org_id: string;
  as_of: string;
  key: string;
  value: string;
  source: string;
  created_at: string;
}

export interface StaffProductivityMonthlyRow {
  id: string;
  org_id: string;
  branch_id: string | null;
  officer_id: string;
  officer_name: string;
  period: string;
  samities: number;
  borrowers: number;
  due_amount: string;
  collected_amount: string;
  created_at: string;
}

export interface ReportAuditLogRow {
  id: string;
  org_id: string;
  kind: string;
  params: unknown;
  requested_by: string;
  created_at: string;
}

/** ── MIS ops (migration 0050) ───────────────────────────────────────── */
export type ComplaintChannelRow = 'branch' | 'hotline' | 'field_visit' | 'whistlebox' | 'regulator';
export type ComplaintCategoryRow = 'product_transparency' | 'overcharging' | 'staff_behaviour' | 'coercive_collection' | 'privacy' | 'delay' | 'other';
export type ComplaintStatusRow = 'open' | 'in_progress' | 'escalated' | 'resolved' | 'rejected';
export type ComplaintSeverityRow = 'low' | 'medium' | 'high' | 'critical';

export interface ComplaintRecordRow {
  id: string;
  org_id: string;
  ticket_no: string;
  channel: ComplaintChannelRow;
  category: ComplaintCategoryRow;
  status: ComplaintStatusRow;
  severity: ComplaintSeverityRow;
  subject: string;
  details: string;
  member_id: string | null;
  member_name: string;
  branch_id: string | null;
  reported_at: string;
  due_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_note: string;
  escalations: unknown;
  created_at: string;
  updated_at: string;
}

export interface SavedReportRow {
  id: string;
  org_id: string;
  name: string;
  dataset: 'loans' | 'savings' | 'collections' | 'complaints' | 'members';
  filters: unknown;
  group_by: string;
  metric: 'count' | 'sum' | 'avg';
  metric_field: string | null;
  chart_type: 'table' | 'bar' | 'line' | 'pie';
  shared_with_roles: unknown;
  owner_user_id: string;
  owner_name: string;
  created_at: string;
  updated_at: string;
}

export interface ExportScheduleRow {
  id: string;
  org_id: string;
  name: string;
  kind: 'saved_report' | 'standard_report';
  report_id: string;
  format: 'csv' | 'excel' | 'pdf';
  frequency: 'daily' | 'weekly' | 'monthly';
  run_on: number;
  recipients: unknown;
  enabled: boolean;
  last_run_at: string | null;
  last_status: 'ok' | 'error' | null;
  last_error: string | null;
  created_by: string;
  created_at: string;
}

export interface ExportDeliveryRow {
  id: string;
  org_id: string;
  schedule_id: string;
  sent_at: string;
  status: 'ok' | 'error';
  recipients: unknown;
  error: string | null;
}

export interface MonthFreezeRow {
  id: string;
  org_id: string;
  month: string;
  status: 'soft' | 'hard';
  frozen_by: string;
  frozen_at: string;
  note: string;
}

export interface MessageTemplateRow {
  id: string;
  org_id: string;
  kind: 'installment_reminder' | 'disbursement_confirmation' | 'receipt' | 'meeting_notice' | 'overdue_notice' | 'greeting' | 'approval_request';
  name: string;
  locale: 'bn' | 'en';
  channel: 'in_app' | 'email' | 'sms';
  subject: string;
  body: string;
  enabled: boolean;
  updated_by: string;
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  body: string;
  kind: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

export interface MessageDeliveryRow {
  id: string;
  org_id: string;
  channel: 'in_app' | 'email' | 'sms';
  provider: string;
  recipient_name: string;
  recipient: string;
  kind: string;
  template_id: string | null;
  locale: 'bn' | 'en';
  subject: string;
  body: string;
  status: 'queued' | 'sent' | 'failed' | 'opted_out' | 'outside_window' | 'cap_blocked' | 'retrying';
  attempts: number;
  cost: string;
  error: string | null;
  sent_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

export interface CommOptOutRow {
  org_id: string;
  recipient: string;
  email: boolean;
  sms: boolean;
  note: string;
  updated_at: string;
}

export interface CommRulesRow {
  org_id: string;
  send_window_start: string;
  send_window_end: string;
  max_retries: number;
  retry_backoff_minutes: number;
  daily_cost_cap: string;
  monthly_cost_cap: string;
  cost_per_sms_part: string;
  updated_at: string;
}

export interface CommSpendRow {
  org_id: string;
  day: string;
  month: string;
  daily_cost: string;
  monthly_cost: string;
}

export interface DocTemplateRow {
  id: string;
  org_id: string;
  kind: string;
  register: string;
  orientation: string;
  body: string;
  enabled: boolean;
  version: number;
  updated_by: string;
  updated_at: string;
}

export interface DocTemplateVersionRow {
  id: string;
  org_id: string;
  template_id: string;
  version: number;
  body: string;
  orientation: string;
  updated_by: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  org_id: string;
  kind: string;
  register: string;
  doc_no: string;
  verify_code: string;
  title_snippet: string;
  template_id: string | null;
  template_version: number | null;
  reference_id: string | null;
  payload: Record<string, unknown>;
  issued_by: string;
  issued_at: string;
  status: string;
  html: string;
}

export interface BulkJobRow {
  id: string;
  org_id: string;
  kind: string;
  scope: string;
  scope_id: string;
  scope_name: string;
  params: Record<string, unknown>;
  status: string;
  total: number;
  processed: number;
  failed: number;
  created_by: string;
  created_at: string;
  finished_at: string | null;
}

export interface BulkJobItemRow {
  id: string;
  org_id: string;
  job_id: string;
  target_id: string;
  target_name: string;
  status: string;
  ref_id: string | null;
  error: string | null;
}

/**
 * GENERATED FILE — security module tables (migrations 0056/0057).
 * Shapes mirror supabase/migrations/0056_security.sql columns.
 */

export interface AuditRecordRow {
  id: string;
  org_id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  changed_fields: string[];
  user_id: string | null;
  user_name: string | null;
  ip: string | null;
  user_agent: string | null;
  at: string;
}

export interface UnmaskLogRow {
  id: string;
  org_id: string;
  entity_table: string;
  entity_id: string;
  field: string;
  user_id: string;
  user_name: string | null;
  role: string;
  ip: string | null;
  at: string;
}

export interface SecurityConfigRow {
  org_id: string;
  password_policy: Record<string, unknown>;
  totp_config: Record<string, unknown>;
  lockout_policy: Record<string, unknown>;
  session_policy: Record<string, unknown>;
  ip_allowlist: Record<string, unknown>;
  updated_by: string;
  updated_at: string;
}

export interface LoginAttemptRow {
  id: string;
  org_id: string | null;
  email: string;
  ok: boolean;
  ip: string | null;
  at: string;
}

export interface UserDeviceRow {
  id: string;
  org_id: string;
  user_id: string;
  label: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  revoked: boolean;
}

export interface UserTotpRow {
  user_id: string;
  org_id: string;
  secret_b32: string;
  confirmed: boolean;
  last_code: string | null;
  enabled: boolean;
  created_at: string;
}

export interface MemberConsentRow {
  id: string;
  org_id: string;
  member_id: string;
  kind: string;
  granted: boolean;
  text_version: string;
  method: string;
  witness_name: string | null;
  granted_at: string;
  revoked_at: string | null;
  recorded_by: string;
}

export interface RetentionRuleRow {
  id: string;
  org_id: string;
  class: string;
  retain_months: number;
  legal_hold: boolean;
  updated_by: string;
  updated_at: string;
}

export interface MemberCorrectionRow {
  id: string;
  org_id: string;
  member_id: string;
  member_name: string;
  field: string;
  current_value: string;
  requested_value: string;
  reason: string;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}
