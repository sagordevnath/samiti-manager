-- 0044_programs.sql — Programs & projects (NGO development sector).
-- Project register, logframe + indicator values, beneficiary registry,
-- enrollments, service delivery, activity planner, training batches with
-- attendance, test scores and certificates. Money is numeric(14,2) text.

-- ── 1) Project register ─────────────────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid references branches(id),
  code text not null,
  name_bn text not null,
  name_en text not null,
  donor text not null,
  grant_agreement_no text not null,
  -- Restricted fund code; voucher lines tagged with it feed Module 10 fund statements.
  fund_code text not null,
  sector text not null check (sector in ('education','health','skills_training','agriculture','wash','child_protection','awareness')),
  start_date date not null,
  end_date date not null,
  target_areas jsonb not null default '[]'::jsonb,
  target_beneficiaries integer not null default 0 check (target_beneficiaries >= 0),
  manager_name text not null,
  status text not null default 'proposed' check (status in ('proposed','active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists project_budget_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  line_item text not null,
  amount numeric(14,2) not null check (amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_budget_lines_project on project_budget_lines (org_id, project_id);

-- ── 2) Logframe ─────────────────────────────────────────────────────────────
create table if not exists logframe_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  level text not null check (level in ('goal','objective','output','indicator')),
  statement text not null,
  parent_label text,
  indicator_code text,
  baseline text not null default '0',
  target_value text not null default '0',
  unit text,
  means_of_verification text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_logframe_project on logframe_entries (org_id, project_id);

create table if not exists indicator_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entry_id uuid not null references logframe_entries(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  value text not null,
  evidence jsonb not null default '[]'::jsonb,
  note text not null default '',
  entered_at timestamptz not null default now()
);
create index if not exists idx_indicator_values_entry on indicator_values (org_id, entry_id);

-- ── 3) Beneficiaries, enrollments, services ─────────────────────────────────
create table if not exists beneficiaries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid references branches(id),
  code text not null,
  member_id uuid references members(id),
  name_bn text not null,
  guardian_bn text not null default '',
  phone text not null default '',
  age integer not null default 0 check (age between 0 and 120),
  gender text not null default 'female' check (gender in ('male','female','other')),
  village text not null default '',
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists program_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  enrolled_at date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (beneficiary_id, project_id)
);

create table if not exists program_services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id),
  beneficiary_id uuid not null references beneficiaries(id),
  kind text not null check (kind in ('training','health_camp','school_enrollment','kit_distribution','awareness_session')),
  service_date date not null,
  details text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_services_beneficiary on program_services (org_id, beneficiary_id);
create index if not exists idx_services_project on program_services (org_id, project_id);

-- ── 4) Activities, batches, attendance, scores, certificates ────────────────
create table if not exists program_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title_bn text not null,
  kind text not null check (kind in ('training','health_camp','school_enrollment','kit_distribution','awareness_session')),
  planned_date date not null,
  venue text not null default '',
  target_participants integer not null default 0,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_activities_project_date on program_activities (org_id, project_id, planned_date);

create table if not exists training_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id),
  code text not null,
  title_bn text not null,
  trainer_name text not null,
  trainer_org_bn text not null default '',
  start_date date not null,
  end_date date not null,
  hours integer not null default 6 check (hours between 1 and 400),
  sessions integer not null default 1 check (sessions between 1 and 60),
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists training_attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  batch_id uuid not null references training_batches(id) on delete cascade,
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  session_no integer not null check (session_no between 1 and 60),
  present boolean not null default true,
  created_at timestamptz not null default now(),
  unique (batch_id, beneficiary_id, session_no)
);

create table if not exists training_test_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  batch_id uuid not null references training_batches(id) on delete cascade,
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  pre numeric(5,2) not null check (pre between 0 and 100),
  post numeric(5,2) not null check (post between 0 and 100),
  created_at timestamptz not null default now(),
  unique (batch_id, beneficiary_id)
);

create table if not exists training_certificates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  cert_no text not null,
  batch_id uuid not null references training_batches(id) on delete cascade,
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  issued_at timestamptz not null default now(),
  unique (org_id, cert_no)
);

-- ── Sequence helpers ─────────────────────────────────────────────────────────
create or replace function next_project_seq(p_org_id uuid, p_prefix text)
returns integer language sql as $$
  select count(*)::int + 1 from projects
  where org_id = p_org_id and code like p_prefix || '-%';
$$;

create or replace function next_beneficiary_seq(p_org_id uuid)
returns integer language sql as $$
  select count(*)::int + 1 from beneficiaries where org_id = p_org_id;
$$;

-- ── Project status state machine (trigger-enforced) ─────────────────────────
create or replace function fn_project_flow()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  allowed := case new.status
    when 'proposed' then array['active','closed']
    when 'active'   then array['suspended','closed']
    when 'suspended' then array['active','closed']
    when 'closed'   then array[]::text[]
  end;
  if old.status is distinct from new.status and not (new.status = any(allowed)) then
    raise exception 'INVALID_PROJECT_TRANSITION % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_project_flow on projects;
create trigger trg_project_flow before update on projects
  for each row execute function fn_project_flow();

-- ── Activity status state machine ────────────────────────────────────────────
create or replace function fn_activity_flow()
returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status then
    if old.status = 'planned' and new.status not in ('done','cancelled') then
      raise exception 'INVALID_ACTIVITY_TRANSITION planned -> %', new.status
        using errcode = 'check_violation';
    elsif old.status in ('done','cancelled') then
      raise exception 'INVALID_ACTIVITY_TRANSITION % is terminal', old.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activity_flow on program_activities;
create trigger trg_activity_flow before update on program_activities
  for each row execute function fn_activity_flow();

-- ── Certificates require attendance + passing post-test ─────────────────────
create or replace function fn_certificate_guard()
returns trigger language plpgsql as $$
declare
  v_marks integer;
  v_present integer;
  v_post numeric;
  v_pre numeric;
begin
  select count(*), coalesce(sum(case when present then 1 else 0 end), 0)
    into v_marks, v_present
  from training_attendance
  where batch_id = new.batch_id and beneficiary_id = new.beneficiary_id;

  if v_marks = 0 or v_present < ceil(v_marks * 0.6) then
    raise exception 'CERTIFICATE_REQUIRES_ATTENDANCE (>=60%)'
      using errcode = 'check_violation';
  end if;

  select pre, post into v_pre, v_post
  from training_test_scores
  where batch_id = new.batch_id and beneficiary_id = new.beneficiary_id;

  if v_post is null or v_post < 40 then
    raise exception 'CERTIFICATE_REQUIRES_POST_TEST_MIN_40'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_certificate_guard on training_certificates;
create trigger trg_certificate_guard before insert on training_certificates
  for each row execute function fn_certificate_guard();

-- Duplicate certificate guard
create or replace function fn_certificate_unique_ben()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from training_certificates
    where org_id = new.org_id and batch_id = new.batch_id and beneficiary_id = new.beneficiary_id
  ) then
    raise exception 'CERTIFICATE_ALREADY_ISSUED'
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_certificate_unique_ben on training_certificates;
create trigger trg_certificate_unique_ben before insert on training_certificates
  for each row execute function fn_certificate_unique_ben();
