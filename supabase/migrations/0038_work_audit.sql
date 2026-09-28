-- 0038_work_audit.sql — Supervision forms, internal audit, findings, escalations.
-- Standard convention: id uuid, org_id, branch_id where relevant, created_by,
-- created_at, updated_at, deleted_at (soft delete). Money numeric(14,2) BDT;
-- dates UTC; displayed Asia/Dhaka.

-- ── 5) Supervision submissions (mobile: photos + GPS) ───────────────────────
create table if not exists supervision_submissions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  form_type       text not null check (form_type in
    ('center_visit','branch_inspection','passbook_verification','cash_verification','loan_utilization')),
  link_id         uuid,
  link_label      text not null default '',
  submitted_by    uuid not null,
  submitted_name  text not null default '',
  submitted_at    timestamptz not null default now(),
  lat             double precision,
  lng             double precision,
  distance_meters double precision,
  photos          text[] not null default '{}',
  items           jsonb not null default '[]'::jsonb,
  exceptions      integer not null default 0,
  note            text not null default '',
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_supervision_branch_date on supervision_submissions (org_id, branch_id, submitted_at);

-- Exceptions must match the answered rows (defense in depth for the register).
create or replace function fn_supervision_exceptions() returns trigger as $$
declare
  no_count integer;
begin
  select count(*) into no_count
  from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) it
  where it->>'answer' = 'no';
  new.exceptions := no_count;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_supervision_exceptions on supervision_submissions;
create trigger trg_supervision_exceptions
  before insert or update on supervision_submissions
  for each row execute function fn_supervision_exceptions();

-- ── 6) Internal audit: plans and findings ───────────────────────────────────
create table if not exists audit_plans (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  branch_id        uuid not null references branches(id),
  branch_name      text not null default '',
  title            text not null,
  planned_date     date not null,
  lead_auditor_id  uuid not null,
  lead_auditor_name text not null default '',
  status           text not null default 'planned' check (status in ('planned','in_progress','draft_report','closed')),
  loan_sample      uuid[] not null default '{}',
  member_sample    uuid[] not null default '{}',
  sample_size      integer not null default 10 check (sample_size between 1 and 200),
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists idx_audit_plans_branch on audit_plans (org_id, branch_id, planned_date);

create table if not exists audit_findings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  audit_id      uuid not null references audit_plans(id) on delete cascade,
  ref           text not null default '',
  title         text not null,
  detail        text not null default '',
  severity      text not null check (severity in ('low','medium','high','critical')),
  status        text not null default 'open' check (status in ('open','responded','in_followup','closed')),
  response      text not null default '',
  responded_at  timestamptz,
  deadline      date,
  follow_ups    jsonb not null default '[]'::jsonb,
  closed_at     timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_findings_audit on audit_findings (org_id, audit_id, status);

-- Severity SLA: deadline defaults to response_days(severity) after creation.
create or replace function fn_finding_sla() returns trigger as $$
declare
  sla_days integer;
begin
  if new.deadline is null then
    sla_days := case new.severity
      when 'critical' then 7 when 'high' then 14 when 'medium' then 21 else 30 end;
    new.deadline := (current_date + sla_days);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_finding_sla on audit_findings;
create trigger trg_finding_sla
  before insert on audit_findings
  for each row execute function fn_finding_sla();

-- Closed findings keep closed_at in sync and never reopen (shared rule).
create or replace function fn_finding_closed_guard() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'closed' and new.status <> 'closed' then
      raise exception 'বন্ধ ফাইন্ডিং আর খোলা যাবে না / A closed finding cannot reopen';
    end if;
    if new.status = 'closed' and old.status <> 'closed' then
      new.closed_at := now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_finding_closed_guard on audit_findings;
create trigger trg_finding_closed_guard
  before update on audit_findings
  for each row execute function fn_finding_closed_guard();

-- ── 8) Escalation ledger (what escalated, when, to whom) ────────────────────
create table if not exists work_escalations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  entity_type    text not null check (entity_type in ('task','finding')),
  entity_id      uuid not null,
  days_overdue   integer not null check (days_overdue >= 0),
  tier_role      text not null check (tier_role in ('branch_manager','area_manager','org_admin')),
  escalated_at   timestamptz not null default now(),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (entity_type, entity_id, tier_role)
);

-- ── 9) Daily digests (rendered per role; audit trail of what was sent) ──────
create table if not exists work_digests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  role         text not null,
  digest_date  date not null,
  payload      jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (org_id, role, digest_date)
);
