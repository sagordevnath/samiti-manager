/**
 * GENERATED FILE — shape mirrors `npx supabase gen types typescript`.
 * Regenerate against your live project:  npm run db:types -w @samity/api
 * (locally: npx supabase gen types typescript --local)
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'super_admin' | 'org_admin' | 'area_manager' | 'branch_manager' | 'account_officer' | 'member';
export type MemberStatus = 'active' | 'inactive' | 'closed';
export type BranchStatus = 'planned' | 'active' | 'closed';
export type OpeningStage = 'proposed' | 'director_approved' | 'checklist_done' | 'activated' | 'rejected';
export type MemberLifecycle = 'pending' | 'active' | 'dormant' | 'dropout' | 'transferred' | 'deceased';
export type AdmissionStage =
  | 'field_survey'
  | 'eligibility_screening'
  | 'household_verification'
  | 'manager_approval'
  | 'orientation_completed'
  | 'member_issued'
  | 'passbook_generated';
export type IdType = 'nid' | 'birth_registration';
export type TransferStage = 'proposed' | 'approved' | 'rejected' | 'completed';
export type LoanProductType =
  | 'general'
  | 'seasonal_agri'
  | 'microenterprise'
  | 'housing'
  | 'education'
  | 'emergency'
  | 'migration'
  | 'device'
  | 'climate';
export type InstallmentFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type InterestMethod = 'declining_balance' | 'flat';
export type LoanApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'officer_review'
  | 'bm_review'
  | 'am_review'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'closed';
export type LoanStage =
  | 'member_request'
  | 'officer_visit'
  | 'household_check'
  | 'guarantor'
  | 'bm_review'
  | 'am_review'
  | 'decision';
export type LoanStageAction = 'done' | 'approved' | 'rejected' | 'returned';

export interface Table {
  Row: {
    id: string;
    org_id: string;
    branch_id: string;
    samity_id: string | null;
    member_code: string | null;
    full_name: string;
    phone: string;
    national_id: string | null;
    status: MemberStatus;
    join_date: string;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
  };
  Insert: {
    id?: string;
    org_id: string;
    branch_id: string;
    samity_id?: string | null;
    member_code?: string | null;
    full_name: string;
    phone: string;
    national_id?: string | null;
    status?: MemberStatus;
    join_date?: string;
    lifecycle?: MemberLifecycle;
    full_name_bn?: string | null;
    father_or_husband_name?: string | null;
    mother_name?: string | null;
    id_type?: IdType;
    id_number_enc?: string | null;
    id_number_hash?: string | null;
    dob?: string | null;
    address?: string | null;
    working_area_id?: string | null;
    occupation?: string | null;
    monthly_household_income?: string | null;
    land_owned_decimals?: string | null;
    family_members?: number | null;
    photo_path?: string | null;
    signature_path?: string | null;
    passbook_no?: string | null;
    status_reason_code?: string | null;
    status_changed_at?: string | null;
    status_note?: string | null;
    created_by?: string | null;
    created_at?: string;
    updated_at?: string;
    deleted_at?: string | null;
  };
  Update: Partial<Table['Insert']>;
}

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          name_bn: string | null;
          code: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: { id?: string; name: string; name_bn?: string | null; code: string; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
      };
      branches: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          name_bn: string | null;
          code: string;
          district: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: { id?: string; org_id: string; name: string; name_bn?: string | null; code: string; district?: string | null; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['branches']['Insert']>;
      };
      samities: {
        Row: {
          id: string;
          org_id: string;
          branch_id: string;
          name: string;
          meeting_day: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: { id?: string; org_id: string; branch_id: string; name: string; meeting_day?: string; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['samities']['Insert']>;
      };
      users_profile: {
        Row: {
          id: string;
          org_id: string | null;
          branch_id: string | null;
          role: UserRole;
          full_name: string;
          phone: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: { id: string; org_id?: string | null; branch_id?: string | null; role?: UserRole; full_name: string; phone?: string | null; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['users_profile']['Insert']>;
      };
      members: Table;
      savings_accounts: {
        Row: {
          id: string;
          org_id: string;
          branch_id: string;
          member_id: string;
          product: string;
          balance: string; // numeric comes back as string
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: { id?: string; org_id: string; branch_id: string; member_id: string; product?: string; balance?: string; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['savings_accounts']['Insert']>;
      };
      loans: {
        Row: {
          id: string;
          org_id: string;
          branch_id: string;
          member_id: string;
          principal: string;
          interest_rate: string;
          installment_cnt: number;
          disbursed_at: string | null;
          status: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: { id?: string; org_id: string; branch_id: string; member_id: string; principal: string; interest_rate?: string; installment_cnt?: number; disbursed_at?: string | null; status?: string; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['loans']['Insert']>;
      };
      zones: {
        Row: {
          id: string;
          org_id: string;
          code: string;
          name: string;
          name_bn: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: { id?: string; org_id: string; code: string; name: string; name_bn?: string | null; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['zones']['Insert']>;
      };
      areas: {
        Row: {
          id: string;
          org_id: string;
          zone_id: string;
          code: string;
          name: string;
          name_bn: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: { id?: string; org_id: string; zone_id: string; code: string; name: string; name_bn?: string | null; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['areas']['Insert']>;
      };
      working_areas: {
        Row: {
          id: string;
          org_id: string;
          division: string;
          district: string;
          upazila: string;
          union: string | null;
          village: string;
          division_bn: string | null;
          district_bn: string | null;
          upazila_bn: string | null;
          union_bn: string | null;
          village_bn: string | null;
          population: number | null;
          households: number | null;
          market_days: string | null;
          competitor_mfis: number;
          potential_score: number;
          gps_lat: string | null;
          gps_lng: string | null;
          branch_id: string | null;
          surveyed_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          division: string;
          district: string;
          upazila: string;
          union?: string | null;
          village: string;
          division_bn?: string | null;
          district_bn?: string | null;
          upazila_bn?: string | null;
          union_bn?: string | null;
          village_bn?: string | null;
          population?: number | null;
          households?: number | null;
          market_days?: string | null;
          competitor_mfis?: number;
          potential_score?: number;
          gps_lat?: string | null;
          gps_lng?: string | null;
          branch_id?: string | null;
          surveyed_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['working_areas']['Insert']>;
      };
      branch_openings: {
        Row: {
          id: string;
          org_id: string;
          branch_id: string;
          stage: OpeningStage;
          proposal_note: string;
          proposed_by: string | null;
          proposed_at: string;
          director_by: string | null;
          director_at: string | null;
          director_note: string | null;
          checklist: Json;
          checklist_by: string | null;
          checklist_at: string | null;
          activated_by: string | null;
          activated_at: string | null;
          rejected_note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          branch_id: string;
          stage?: OpeningStage;
          proposal_note: string;
          proposed_by?: string | null;
          proposed_at?: string;
          director_by?: string | null;
          director_at?: string | null;
          director_note?: string | null;
          checklist?: Json;
          checklist_by?: string | null;
          checklist_at?: string | null;
          activated_by?: string | null;
          activated_at?: string | null;
          rejected_note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['branch_openings']['Insert']>;
      };
      staff_assignments: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          branch_id: string;
          role_at_branch: UserRole;
          effective_from: string;
          effective_to: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          branch_id: string;
          role_at_branch?: UserRole;
          effective_from: string;
          effective_to?: string | null;
          note?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['staff_assignments']['Insert']>;
      };
      eligibility_rules: {
        Row: {
          id: string;
          org_id: string;
          min_age: number;
          max_age: number;
          max_land_decimals: string;
          one_member_per_household: boolean;
          max_monthly_income: string;
          women_only: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          min_age?: number;
          max_age?: number;
          max_land_decimals?: string;
          one_member_per_household?: boolean;
          max_monthly_income?: string;
          women_only?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['eligibility_rules']['Insert']>;
      };
      member_nominees: {
        Row: {
          id: string;
          org_id: string;
          member_id: string;
          name: string;
          relation: string;
          share_pct: number;
          phone: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          member_id: string;
          name: string;
          relation: string;
          share_pct: number;
          phone?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['member_nominees']['Insert']>;
      };
      member_admissions: {
        Row: {
          id: string;
          org_id: string;
          branch_id: string;
          draft: Json;
          stage: AdmissionStage;
          stage_history: Json;
          member_number: string | null;
          passbook_no: string | null;
          member_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          branch_id: string;
          draft?: Json;
          stage?: AdmissionStage;
          stage_history?: Json;
          member_number?: string | null;
          passbook_no?: string | null;
          member_id?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['member_admissions']['Insert']>;
      };
      member_status_history: {
        Row: {
          id: string;
          org_id: string;
          member_id: string;
          status: MemberLifecycle;
          reason_code: string;
          note: string | null;
          changed_by: string | null;
          created_at: string;
        };
        Insert: { id?: string; org_id: string; member_id: string; status: MemberLifecycle; reason_code: string; note?: string | null; changed_by?: string | null };
      };
      member_transfers: {
        Row: {
          id: string;
          org_id: string;
          member_id: string;
          from_branch_id: string;
          to_branch_id: string;
          to_samity_name: string | null;
          reason: string;
          stage: TransferStage;
          proposed_by: string | null;
          proposed_at: string;
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          completed_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          member_id: string;
          from_branch_id: string;
          to_branch_id: string;
          to_samity_name?: string | null;
          reason: string;
          stage?: TransferStage;
          proposed_by?: string | null;
          proposed_at?: string;
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          completed_at?: string | null;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['member_transfers']['Insert']>;
      };
      member_notes: {
        Row: {
          id: string;
          org_id: string;
          member_id: string;
          note: string;
          created_by: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: { id?: string; org_id: string; member_id: string; note: string; created_by?: string | null };
        Update: Partial<Database['public']['Tables']['member_notes']['Insert']>;
      };
      member_attendance: {
        Row: {
          id: string;
          org_id: string;
          member_id: string;
          samity_name: string | null;
          meeting_date: string;
          present: boolean;
          recorded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          member_id: string;
          samity_name?: string | null;
          meeting_date: string;
          present?: boolean;
          recorded_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['member_attendance']['Insert']>;
      };
      member_insurance: {
        Row: {
          id: string;
          org_id: string;
          branch_id: string;
          member_id: string;
          product: string;
          premium: string;
          coverage: string;
          status: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          branch_id: string;
          member_id: string;
          product?: string;
          premium?: string;
          coverage?: string;
          status?: string;
          created_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['member_insurance']['Insert']>;
      };
      member_counters: {
        Row: { branch_id: string; year: number; last_seq: number };
        Insert: { branch_id: string; year: number; last_seq?: number };
        Update: Partial<Database['public']['Tables']['member_counters']['Insert']>;
      };
      member_key_versions: {
        Row: { org_id: string; key_version: number; rotated_at: string };
        Insert: { org_id: string; key_version?: number; rotated_at?: string };
        Update: Partial<Database['public']['Tables']['member_key_versions']['Insert']>;
      };
    };
    Views: Record<string, never>;
    Functions: {
        recompute_balance: {
          Args: { p_account_id: string };
          Returns: number;
        };
        run_reconciliation: {
          Args: { p_org_id: string };
          Returns: {
            account_id: string;
            account_number: string;
            stored_balance: number;
            ledger_balance: number;
            difference: number;
            entry_count: number;
            last_entry_at: string | null;
            status: string;
          }[];
        };
        post_savings_transaction: {
          Args: Record<string, never>;
          Returns: unknown;
        };
        enforce_loan_rate_cap: { Args: Record<string, never>; Returns: unknown };
        enforce_loan_amount_band: { Args: Record<string, never>; Returns: unknown };
        enforce_loan_status_transition: { Args: Record<string, never>; Returns: unknown };
        enforce_disbursement_completion: { Args: Record<string, never>; Returns: unknown };
        enforce_schedule_total: { Args: Record<string, never>; Returns: unknown };
        mark_application_disbursed: { Args: Record<string, never>; Returns: unknown };
        shift_due_date_for_holidays: {
          Args: { p_app_id: string; p_org_id: string };
          Returns: unknown;
        };
        authorize_loan_disbursement: {
          Args: {
            p_application_id: string;
            p_actor: string;
            p_schedule: unknown;
            p_journal: unknown;
            p_passbook: unknown;
            p_sms: unknown;
          };
          Returns: unknown;
        };
        cancel_loan_disbursement: {
          Args: { p_application_id: string; p_actor: string; p_reason: string };
          Returns: unknown;
        };
        officer_cash_expected: {
          Args: { p_org_id: string; p_officer_id: string; p_handover_date: string };
          Returns: number;
        };
      auth_org_id: { Args: Record<string, never>; Returns: string | null };
      auth_user_role: { Args: Record<string, never>; Returns: string };
      can_read_members: { Args: Record<string, never>; Returns: boolean };
      can_approve_members: { Args: Record<string, never>; Returns: boolean };
      issue_member_number: {
        Args: { p_branch_id: string; p_org_id: string };
        Returns: { member_number: string; passbook_no: string }[];
      };
    };
    Enums: {
      user_role: UserRole;
      member_status: MemberStatus;
      branch_status: BranchStatus;
      opening_stage: OpeningStage;
      member_lifecycle: MemberLifecycle;
      admission_stage: AdmissionStage;
      id_type: IdType;
      transfer_stage: TransferStage;
      loan_product_type: LoanProductType;
      installment_frequency: InstallmentFrequency;
      interest_method: InterestMethod;
      loan_application_status: LoanApplicationStatus;
      loan_stage: LoanStage;
      loan_stage_action: LoanStageAction;
      disbursement_mode: DisbursementMode;
      disbursement_status: DisbursementStatus;
    };
  };
}

export interface LoanPolicyRow {
  id: string;
  org_id: string;
  rate_cap_percent: number;
  bm_approval_limit_bdt: string;
  guarantors_required: number;
  max_active_loans_per_member: number;
  min_days_between_loans: number;
  updated_by: string | null;
  updated_at: string;
}

export interface LoanProductRow {
  id: string;
  org_id: string;
  code: string;
  name: string;
  name_bn: string | null;
  product_type: LoanProductType;
  min_amount: string;
  max_amount: string;
  term_months: number;
  installment_frequency: InstallmentFrequency;
  interest_method: InterestMethod;
  interest_rate: number;
  service_charge: number;
  processing_fee_rate: number;
  insurance_premium_rate: number;
  grace_period_installments: number;
  eligibility_note: string | null;
  required_documents: string[];
  guarantors_required: number;
  guarantor_min_relationship: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoanApplicationRow {
  id: string;
  org_id: string;
  branch_id: string;
  member_id: string;
  product_id: string;
  application_number: string;
  requested_amount: string;
  purpose: string;
  status: LoanApplicationStatus;
  term_months: number;
  guarantors: Array<{
    name: string;
    relation: 'spouse' | 'parent' | 'sibling' | 'same_group_member' | 'business_peer' | 'other';
    mobile: string;
    nidLast4: string;
    isMember: boolean;
    consentGiven: boolean;
  }>;
  decision_reason: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoanApplicationStepRow {
  id: string;
  org_id: string;
  application_id: string;
  stage: LoanStage;
  action: LoanStageAction;
  actor_role: string;
  actor_id: string | null;
  note: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface LoanApprovalMatrixRow {
  id: string;
  org_id: string;
  product_id: string | null;
  min_amount: string | null;
  max_amount: string | null;
  approver_roles: string[];
  solo_approval_limit: string | null;
  priority: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface LoanInstallmentRow {
  id: string;
  org_id: string;
  application_id: string;
  seq: number;
  due_date: string;
  principal: string;
  interest: string;
  paid_amount: string;
  paid_at: string | null;
  created_at: string;
}

export type DisbursementMode = 'cash_branch' | 'cash_center' | 'bank_transfer' | 'bkash' | 'nagad';
export type DisbursementStatus = 'pending' | 'prepared' | 'completed' | 'cancelled';
export type LoanDisbursementCheck =
  | 'savings_deposit_paid'
  | 'insurance_premium_collected'
  | 'fees_paid'
  | 'member_present'
  | 'guarantor_signature'
  | 'cash_available';

export interface LoanHolidayRow {
  id: string;
  org_id: string;
  date: string;
  name: string;
  name_bn: string | null;
  is_recurring: boolean;
  created_by: string | null;
  created_at: string;
}

export interface LoanDisbursementRow {
  id: string;
  org_id: string;
  branch_id: string;
  application_id: string;
  samity_id: string | null;
  status: DisbursementStatus;
  planned_date: string | null;
  checks: LoanDisbursementCheck[];
  mode: DisbursementMode | null;
  disbursement_date: string | null;
  mfs_reference: string | null;
  bank_reference: string | null;
  cash_received_by_name: string | null;
  actual_user_of_funds: string | null;
  actual_user_relation: string | null;
  note: string | null;
  prepared_by: string | null;
  prepared_at: string | null;
  loan_number: string | null;
  voucher_number: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  disbursed_by: string | null;
  disbursed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalEntryRow {
  id: string;
  org_id: string;
  branch_id: string | null;
  entry_date: string;
  source_type: 'loan_disbursement' | 'loan_disbursement_reversal' | 'savings' | 'share' | 'manual';
  source_id: string | null;
  memo: string;
  voided_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface JournalLineRow {
  id: string;
  entry_id: string;
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
}

export interface LoanPassbookEntryRow {
  id: string;
  org_id: string;
  application_id: string;
  member_id: string;
  loan_number: string;
  entry_date: string;
  description: string;
  debit: string;
  credit: string;
  balance_after: string;
  created_by: string | null;
  created_at: string;
}

export interface SmsOutboxRow {
  id: string;
  org_id: string;
  member_id: string | null;
  phone: string | null;
  template: string;
  body: string;
  status: 'queued' | 'sent' | 'failed';
  created_at: string;
  sent_at: string | null;
}

export interface UtilizationVisitRow {
  id: string;
  org_id: string;
  branch_id: string | null;
  application_id: string;
  member_id: string;
  scheduled_date: string;
  status: 'scheduled' | 'completed' | 'missed';
  visited_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface LoanRepaymentScheduleRow {
  id: string;
  org_id: string;
  application_id: string;
  seq: number;
  original_due_date: string;
  due_date: string;
  shifted: boolean;
  shift_reason: string | null;
  principal: string;
  interest: string;
  total: string;
  balance_after: string;
  paid_amount: string;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
}

export type UtilizationStatus = 'planned' | 'verified';

export type CollectionAllocationDb = {
  overdueApplied: Array<{ installmentId: string; seq: number; amount: string }>;
  currentApplied: { installmentId: string; seq: number; amount: string } | null;
  savingsApplied: string;
  advanceApplied: string;
  unapplied: string;
};

export interface CollectionEntryRow {
  id: string;
  org_id: string;
  branch_id: string;
  idempotency_key: string;
  member_id: string;
  application_id: string | null;
  meeting_date: string;
  loan_paid: string;
  savings_paid: string;
  extra_paid: string;
  allocation: CollectionAllocationDb;
  receipt_no: string;
  collected_by: string | null;
  captured_at: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type HandoverStatus = 'draft' | 'submitted' | 'confirmed' | 'rejected';

export interface CashHandoverRow {
  id: string;
  org_id: string;
  branch_id: string;
  officer_id: string;
  handover_date: string;
  expected_amount: string;
  counted_amount: string | null;
  received_amount: string | null;
  difference: string;
  difference_kind: 'none' | 'shortage' | 'excess';
  status: HandoverStatus;
  officer_note: string | null;
  accountant_note: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoanUtilizationPlanRow {
  id: string;
  org_id: string;
  application_id: string;
  items: Array<{ category: string; description: string; amount: string }>;
  status: UtilizationStatus;
  verification: {
    items: Array<{ category: string; verifiedAmount: string; note?: string }>;
    verifierNote: string | null;
  } | null;
  verified_by: string | null;
  verified_at: string | null;
  created_by: string | null;
  created_at: string;
}
