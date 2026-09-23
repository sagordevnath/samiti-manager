-- 0026_delinquency_recovery.sql — Recovery extensions (requirements 5–9).
-- Root-cause tags, recovery actions (waivers, savings adjustments, legal
-- notices, write-off proposals with approval chain + later recovery),
-- provision proposals, early-warning signals, and run history for trends.

-- ── 5) Root-cause tags ──────────────────────────────────────────────────────
create table if not exists delinquency_root_causes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  application_id uuid not null references loan_applications(id),
  cause        text not null check (cause in ('business_failure','illness','flood_disaster','migration','diversion_of_funds','staff_weakness','over_lending')),
  note         text,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists delinquency_root_causes_loan_idx on delinquency_root_causes(application_id);

-- ── 6) Partial waivers (BM recommends → AM approves) ────────────────────────
create table if not exists loan_waivers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  application_id uuid not null references loan_applications(id),
  basis          text not null check (basis in ('overdue_interest','total_overdue')),
  percent        numeric(5,2) not null check (percent between 1 and 100),
  waived_amount  numeric(14,2) not null default 0,
  reason         text not null,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by   uuid,
  requested_at   timestamptz not null default now(),
  decided_by     uuid,
  decided_at     timestamptz,
  decision_note  text
);

-- ── 6) Savings adjustments (loan offset from member savings) ────────────────
create table if not exists loan_savings_adjustments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  application_id   uuid not null references loan_applications(id),
  savings_account_id uuid not null,
  amount           numeric(14,2) not null check (amount > 0),
  journal_entry_id uuid,
  note             text,
  created_by       uuid,
  created_at       timestamptz not null default now()
);

-- ── 6) Legal notices ────────────────────────────────────────────────────────
create table if not exists loan_legal_notices (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  application_id   uuid not null references loan_applications(id),
  reply_within_days int not null check (reply_within_days between 3 and 60),
  overdue_total    numeric(14,2) not null default 0,
  outstanding      numeric(14,2) not null default 0,
  body_bn          text not null,
  issued_by        uuid,
  issued_at        timestamptz not null default now()
);

-- ── 6) Write-off proposals (AM recommends → Director Operations approves)
--      with later recovery postings ──────────────────────────────────────────
create table if not exists loan_write_off_proposals (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id),
  application_id     uuid not null references loan_applications(id),
  outstanding_amount numeric(14,2) not null default 0,
  reason             text not null,
  legal_action_taken text,
  status             text not null default 'pending' check (status in ('pending','recommended','approved','rejected')),
  requested_by       uuid,
  requested_at       timestamptz not null default now(),
  recommended_by     uuid,
  recommended_at     timestamptz,
  decided_by         uuid,
  decided_at         timestamptz,
  decision_note      text
);

create table if not exists loan_write_off_recoveries (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  proposal_id  uuid not null references loan_write_off_proposals(id) on delete cascade,
  amount       numeric(14,2) not null check (amount > 0),
  note         text,
  journal_entry_id uuid,
  received_by  uuid,
  received_at  timestamptz not null default now()
);

-- ── 7) Loan-loss provision proposals (Dr expense / Cr reserve on approval) ──
create table if not exists loan_loss_provision_proposals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  run_date         date not null,
  by_class         jsonb not null,
  provision_total  numeric(14,2) not null default 0,
  prior_total      numeric(14,2) not null default 0,
  provision_expense numeric(14,2) not null default 0,
  status           text not null default 'pending_approval' check (status in ('pending_approval','posted')),
  note             text,
  requested_by     uuid,
  requested_at     timestamptz not null default now(),
  posted_at        timestamptz,
  journal_entry_id uuid
);

-- ── 8) Early-warning signals ────────────────────────────────────────────────
create table if not exists early_warning_signals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  kind         text not null check (kind in ('member_missed_two','samity_attendance_falling','officer_par_rising')),
  severity     text not null check (severity in ('low','medium','high')),
  ref_id       uuid not null,
  branch_id    uuid,
  detail       text not null,
  detail_bn    text not null,
  metric       numeric(14,4) not null default 0,
  prior_metric numeric(14,4),
  detected_at  timestamptz not null default now(),
  acknowledged boolean not null default false,
  acknowledged_by uuid,
  acknowledged_at timestamptz
);
create index if not exists early_warning_open_idx on early_warning_signals(org_id, acknowledged, kind);

-- ── Scan bookkeeping: prevent duplicate signals between runs ────────────────
create table if not exists early_warning_scans (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id),
  scan_date  date not null,
  signals    int not null default 0,
  created_at timestamptz not null default now(),
  constraint early_warning_scans_org_date_key unique (org_id, scan_date)
);
