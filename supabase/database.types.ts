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
    };
  };
}
