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
