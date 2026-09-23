-- 0032_hr.sql — HR module for a field-heavy workforce.
-- Staff master with encrypted NID/bank (ciphertext columns; masked columns
-- for display), recruitment lite, GPS+selfie attendance, leave with balances,
-- holiday calendar, and transfer/promotion orders.

-- ── 1) Staff master ─────────────────────────────────────────────────────────
create table if not exists hr_staff (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id),
  employee_code     varchar(20) not null,
  name              text not null,
  name_bn           text not null,
  designation       text not null,
  grade             varchar(4) not null,
  branch_id         uuid references branches(id),
  joining_date      date not null,
  probation_end_date date,
  confirmation_date date,
  status            text not null default 'probation' check (status in ('probation','confirmed','suspended','resigned','terminated','retired')),
  mobile            varchar(15) not null,
  email             text,
  nid_enc           text,
  nid_masked        varchar(4),
  bank_account_enc  text,
  bank_name         text,
  bank_masked       varchar(6),
  monthly_gross     numeric(14,2) not null default 0 check (monthly_gross >= 0),
  emergency_contact_name  text,
  emergency_contact_phone text,
  documents         jsonb not null default '[]'::jsonb,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (org_id, employee_code)
);

create table if not exists hr_staff_postings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  staff_id       uuid not null references hr_staff(id) on delete cascade,
  branch_id      uuid references branches(id),
  designation    text not null,
  effective_from date not null,
  effective_to   date,
  note           text,
  created_at     timestamptz not null default now()
);

create table if not exists hr_staff_education (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  staff_id      uuid not null references hr_staff(id) on delete cascade,
  level         text not null,
  institution   text not null,
  passing_year  int not null,
  result        varchar(20) not null,
  created_at    timestamptz not null default now()
);

-- ── 2) Recruitment lite ─────────────────────────────────────────────────────
create table if not exists hr_vacancies (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  branch_id     uuid not null references branches(id),
  designation   text not null,
  headcount     int not null check (headcount between 1 and 20),
  reason        text not null,
  status        text not null default 'requested' check (status in ('requested','approved','rejected','closed')),
  requested_by  uuid not null,
  decided_by    uuid,
  decided_at    timestamptz,
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table if not exists hr_applicants (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  vacancy_id       uuid not null references hr_vacancies(id),
  name             text not null,
  mobile           varchar(15) not null,
  education_level  text not null,
  experience_years int not null default 0,
  status           text not null default 'applied' check (status in ('applied','shortlisted','interviewed','offered','joined','rejected')),
  interview_scores jsonb not null default '[]'::jsonb,
  offered_salary   numeric(14,2),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 3) Attendance & leave ───────────────────────────────────────────────────
create table if not exists hr_attendance (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  staff_id        uuid not null references hr_staff(id),
  work_date       date not null,
  status          text not null check (status in ('present','late','absent','leave','holiday')),
  check_in_at     timestamptz,
  check_in_lat    double precision,
  check_in_lng    double precision,
  selfie_path     text,
  distance_meters int,
  mode            text not null check (mode in ('field','office')),
  note            text,
  created_at      timestamptz not null default now(),
  unique (org_id, staff_id, work_date)
);

create table if not exists hr_leave_requests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  staff_id    uuid not null references hr_staff(id),
  leave_type  text not null check (leave_type in ('casual','sick','annual','maternity')),
  start_date  date not null,
  end_date    date not null,
  days        int not null check (days > 0),
  reason      text not null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by  uuid,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists hr_holidays (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id),
  date     date not null,
  name     text not null,
  name_bn  text not null,
  created_at timestamptz not null default now(),
  unique (org_id, date)
);

-- ── 4) Transfer & promotion orders ──────────────────────────────────────────
create table if not exists hr_movements (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id),
  kind              text not null check (kind in ('transfer','promotion')),
  staff_id          uuid not null references hr_staff(id),
  from_branch_id    uuid references branches(id),
  to_branch_id      uuid references branches(id),
  from_designation  text not null,
  to_designation    text not null,
  to_grade          varchar(4),
  new_monthly_gross numeric(14,2),
  effective_date    date not null,
  reason            text not null,
  status            text not null default 'proposed' check (status in ('proposed','approved','rejected','effective')),
  proposed_by       uuid not null,
  approved_by       uuid,
  approved_at       timestamptz,
  order_number      varchar(20),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_hr_staff_branch on hr_staff(branch_id) where deleted_at is null;
create index if not exists idx_hr_attendance_date on hr_attendance(work_date);
create index if not exists idx_hr_leave_status on hr_leave_requests(status) where status = 'pending';
