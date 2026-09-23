-- 0024_delinquency_management.sql — Delinquency Management & Recovery.
-- Editable classification/provisioning settings, nightly classification runs,
-- escalating worklist cases, and follow-up records with reminder tasks.

-- ── 1) Editable settings (one row per org) ──────────────────────────────────
create table if not exists delinquency_settings (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id),
  bucket_bounds       jsonb not null default '{"d1_30":30,"d31_90":90,"d91_180":180}',
  provisioning_pct    jsonb not null default '{"standard":0,"substandard":25,"doubtful":50,"bad":100}',
  asset_class_by_dpd  jsonb not null default '{"substandard":31,"doubtful":91,"bad":181}',
  escalate_to_bm_days int not null default 3 check (escalate_to_bm_days between 1 and 180),
  escalate_to_am_days int not null default 15 check (escalate_to_am_days between 1 and 365),
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint delinquency_settings_org_key unique (org_id)
);

-- ── 1) Nightly classification run + per-loan snapshot ───────────────────────
create table if not exists delinquency_runs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  run_date    date not null,
  settings    jsonb not null,
  loans_total int not null default 0,
  loans_risk  int not null default 0,
  outstanding_total numeric(14,2) not null default 0,
  at_risk_total     numeric(14,2) not null default 0,
  provision_total   numeric(14,2) not null default 0,
  created_at  timestamptz not null default now(),
  constraint delinquency_runs_org_date_key unique (org_id, run_date)
);

create table if not exists loan_classifications (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id),
  run_id             uuid not null references delinquency_runs(id) on delete cascade,
  run_date           date not null,
  application_id     uuid not null references loan_applications(id),
  branch_id          uuid references branches(id),
  samity_id          uuid,
  officer_id         uuid,
  member_id          uuid not null,
  outstanding        numeric(14,2) not null default 0,
  overdue_principal  numeric(14,2) not null default 0,
  overdue_interest   numeric(14,2) not null default 0,
  days_past_due      int not null default 0,
  bucket             text not null check (bucket in ('regular','d1_30','d31_90','d91_180','d180_plus')),
  asset_class        text not null check (asset_class in ('standard','substandard','doubtful','bad')),
  provision_percent  numeric(5,2) not null default 0,
  provision_amount   numeric(14,2) not null default 0,
  oldest_unpaid_due  date,
  constraint loan_classifications_run_loan_key unique (run_id, application_id)
);
create index if not exists loan_classifications_run_idx on loan_classifications(run_id);
create index if not exists loan_classifications_dpd_idx on loan_classifications(org_id, days_past_due desc);

-- ── 3) Worklist cases (persist escalation state; refreshed nightly) ─────────
create table if not exists delinquency_cases (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  application_id uuid not null references loan_applications(id),
  branch_id      uuid references branches(id),
  samity_id      uuid,
  officer_id     uuid,
  days_past_due  int not null,
  bucket         text not null,
  overdue_total  numeric(14,2) not null default 0,
  outstanding    numeric(14,2) not null default 0,
  assigned_level text not null default 'field_officer' check (assigned_level in ('field_officer','branch_manager','area_manager')),
  assigned_to    uuid,
  status         text not null default 'open' check (status in ('open','cleared','written_off')),
  opened_at      date not null default current_date,
  cleared_at     date,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint delinquency_cases_open_loan_key unique (application_id, status)
);

-- ── 4) Follow-up records + reminder tasks ───────────────────────────────────
create table if not exists delinquency_follow_ups (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  case_id         uuid not null references delinquency_cases(id) on delete cascade,
  type            text not null check (type in ('visit','phone_call','group_meeting','letter','legal_notice')),
  outcome         text not null check (outcome in ('promise_to_pay','partial_paid','refused','not_found','rescheduled','escalated')),
  promise_date    date,
  promise_amount  numeric(14,2),
  note            text,
  next_visit_date date,
  created_by      uuid,
  created_at      timestamptz not null default now()
);

create table if not exists delinquency_tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  follow_up_id   uuid references delinquency_follow_ups(id) on delete cascade,
  application_id uuid references loan_applications(id),
  member_id      uuid,
  title          text not null,
  title_bn       text not null,
  due_date       date not null,
  assigned_to    uuid,
  status         text not null default 'open' check (status in ('open','done')),
  done_at        timestamptz,
  source         text not null default 'delinquency' check (source in ('delinquency','manual')),
  created_at     timestamptz not null default now()
);
create index if not exists delinquency_tasks_open_idx on delinquency_tasks(org_id, status, due_date);

-- ── Trigger: promise-to-pay / next-visit auto-creates a reminder task ───────
create or replace function fn_delinquency_follow_up_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan text;
  v_member uuid;
  v_due date;
begin
  v_due := coalesce(new.next_visit_date, new.promise_date);
  if v_due is null then
    return new;
  end if;
  select rec.loan_number, rec.member_id
    into v_loan, v_member
  from delinquency_cases c
  join loan_applications la on la.id = c.application_id
  left join loan_disbursements rec on rec.application_id = la.id and rec.cancelled_at is null
  where c.id = new.case_id;

  insert into delinquency_tasks (org_id, follow_up_id, application_id, member_id, title, title_bn, due_date)
  values (
    new.org_id,
    new.id,
    (select application_id from delinquency_cases where id = new.case_id),
    v_member,
    coalesce('Follow-up: ' || v_loan, 'Follow-up'),
    coalesce('ফলো-আপ: ' || v_loan, 'ফলো-আপ'),
    v_due
  );
  return new;
end;
$$;

drop trigger if exists trg_delinquency_follow_up_task on delinquency_follow_ups;
create trigger trg_delinquency_follow_up_task
after insert on delinquency_follow_ups
for each row execute function fn_delinquency_follow_up_task();

-- ── 2) PAR rollup helper: aggregate a classification run by any scope ───────
create or replace function fn_par_by_scope(p_run_id uuid, p_scope text)
returns table (scope_id uuid, scope_name text, outstanding_total numeric, at_risk numeric,
               par1 numeric, par30 numeric, par90 numeric, loans_total bigint, loans_at_risk bigint)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      c.application_id,
      case p_scope
        when 'branch' then c.branch_id
        when 'officer' then c.officer_id
        when 'samity' then c.samity_id
        else c.org_id::uuid
      end as node_id,
      c.outstanding,
      (c.days_past_due > 0)  as at_risk_flag,
      (c.days_past_due >= 30) as at30_flag,
      (c.days_past_due >= 90) as at90_flag
    from loan_classifications c
    where c.run_id = p_run_id
  ),
  agg as (
    select node_id,
           sum(outstanding) as outstanding_total,
           sum(case when at_risk_flag then outstanding else 0 end) as at_risk,
           sum(case when at30_flag then outstanding else 0 end) as at30,
           sum(case when at90_flag then outstanding else 0 end) as at90,
           count(*) as loans_total,
           count(*) filter (where at_risk_flag) as loans_at_risk
    from base group by node_id
  )
  select node_id,
         coalesce(b.name, a.name, z.name, o.name, 'Organization'),
         agg.outstanding_total, agg.at_risk,
         case when agg.outstanding_total > 0 then agg.at_risk / agg.outstanding_total else 0 end,
         case when agg.outstanding_total > 0 then agg.at30 / agg.outstanding_total else 0 end,
         case when agg.outstanding_total > 0 then agg.at90 / agg.outstanding_total else 0 end,
         agg.loans_total, agg.loans_at_risk
  from agg
  left join branches b on p_scope = 'branch' and b.id = agg.node_id
  left join working_areas a on p_scope = 'samity' and a.id = agg.node_id
  left join areas z on p_scope = 'area' and z.id = agg.node_id
  left join organizations o on p_scope in ('org','zone') and o.id = agg.node_id;
$$;
