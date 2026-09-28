-- 0050_reports_mis_ops.sql — Reports/MIS ops (reqs 5–10).
-- Complaint & grievance register with escalation, saved report builder,
-- export schedules, month freeze (data freeze), nightly materialized views
-- and the documented index set.

-- ── 10) Complaint & grievance register ──────────────────────────────────────
create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ticket_no text not null,
  channel text not null check (channel in ('branch','hotline','field_visit','whistlebox','regulator')),
  category text not null check (category in ('product_transparency','overcharging','staff_behaviour','coercive_collection','privacy','delay','other')),
  status text not null default 'open' check (status in ('open','in_progress','escalated','resolved','rejected')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  subject text not null,
  details text not null default '',
  member_id uuid references members(id),
  member_name text not null,
  branch_id uuid references branches(id),
  reported_at date not null,
  -- SLA deadline: critical +1 day, else +3 days (mirrors complaintDueAt).
  due_at date not null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_note text not null default '',
  escalations jsonb not null default '[]'::jsonb, -- [{level, at, note}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, ticket_no)
);
-- Req 8 documented indexes (see MIS_INDEX_DOCS in shared).
create index if not exists idx_complaints_org_status_reported on complaints (org_id, status, reported_at desc);
create index if not exists idx_complaints_member on complaints (member_id);
create index if not exists idx_complaints_org_branch on complaints (org_id, branch_id);

-- Complaint state machine: open → in_progress/escalated/resolved/rejected;
-- escalated can escalate further (ladder); resolved & rejected are terminal
-- (mirrors canTransitionComplaint).
create or replace function fn_complaint_flow()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  allowed := case new.status
    when 'open'        then array['in_progress','escalated','resolved','rejected']
    when 'in_progress' then array['escalated','resolved','rejected']
    when 'escalated'   then array['in_progress','escalated','resolved','rejected']
    when 'resolved'    then array[]::text[]
    when 'rejected'    then array[]::text[]
  end;
  if old.status is distinct from new.status and not (new.status = any(allowed)) then
    raise exception 'INVALID_COMPLAINT_TRANSITION % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  if new.status = 'resolved' and old.status <> 'resolved' then
    new.resolved_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_complaint_flow on complaints;
create trigger trg_complaint_flow before update on complaints
  for each row execute function fn_complaint_flow();

-- ── 6) Saved reports (builder) ──────────────────────────────────────────────
create table if not exists saved_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  dataset text not null check (dataset in ('loans','savings','collections','complaints','members')),
  filters jsonb not null default '[]'::jsonb,   -- [{field, op, value}]
  group_by text not null,
  metric text not null default 'count' check (metric in ('count','sum','avg')),
  metric_field text,
  chart_type text not null default 'bar' check (chart_type in ('table','bar','line','pie')),
  shared_with_roles jsonb not null default '[]'::jsonb,
  owner_user_id text not null,
  owner_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 7) Export schedules (free-SMTP delivery) ────────────────────────────────
create table if not exists export_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('saved_report','standard_report')),
  report_id text not null,
  format text not null check (format in ('csv','excel','pdf')),
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  run_on integer not null default 1 check (run_on between 1 and 28),
  recipients jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_status text check (last_status in ('ok','error')),
  last_error text,
  created_by text not null,
  created_at timestamptz not null default now()
);

-- Delivery log (one row per send attempt).
create table if not exists export_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  schedule_id uuid not null references export_schedules(id) on delete cascade,
  sent_at timestamptz not null default now(),
  status text not null check (status in ('ok','error')),
  recipients jsonb not null default '[]'::jsonb,
  error text
);

-- ── 9) Data freeze (closed months immutable) ────────────────────────────────
create table if not exists month_freezes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  month text not null,                 -- YYYY-MM
  status text not null default 'hard' check (status in ('soft','hard')),
  frozen_by text not null,
  frozen_at timestamptz not null default now(),
  note text not null default '',
  unique (org_id, month)
);

-- ── 8) Materialized views (nightly refresh, req 8) ──────────────────────────
-- Branch portfolio: outstanding, loans, PAR30 per branch per day.
create materialized view if not exists mv_branch_portfolio_daily as
select
  l.org_id,
  l.branch_id,
  current_date::date                                  as as_of,
  count(*)::int                                       as loans_total,
  coalesce(sum(l.outstanding), 0)::numeric(18,2)      as outstanding_total,
  coalesce(sum(case when l.days_past_due > 0 then l.outstanding else 0 end), 0)::numeric(18,2) as at_risk,
  coalesce(sum(case when l.days_past_due >= 30 then l.outstanding else 0 end), 0)::numeric(18,2) as par30_value,
  count(*) filter (where l.days_past_due > 0)::int    as loans_at_risk
from loans_classified l
group by l.org_id, l.branch_id;

-- Officer productivity: borrowers, demand vs collection per officer.
create materialized view if not exists mv_officer_productivity_monthly as
select
  org_id,
  officer_id,
  officer_name,
  branch_id,
  date_trunc('month', current_date)::date             as period,
  count(distinct member_id)::int                      as borrowers,
  count(distinct samity_id)::int                      as samities,
  sum(outstanding)::numeric(18,2)                     as outstanding_total,
  sum(overdue_total)::numeric(18,2)                   as overdue_total
from loans_classified
group by org_id, officer_id, officer_name, branch_id;

-- Savings position per branch/product.
create materialized view if not exists mv_savings_position_daily as
select
  org_id,
  branch_id,
  product_id,
  current_date::date                                  as as_of,
  count(*)::int                                       as accounts,
  coalesce(sum(balance), 0)::numeric(18,2)            as total_balance
from savings_accounts
where status <> 'closed'
group by org_id, branch_id, product_id;

-- Complaint SLA per branch.
create materialized view if not exists mv_complaint_sla_daily as
select
  org_id,
  branch_id,
  current_date::date                                  as as_of,
  count(*)::int                                       as complaints_total,
  count(*) filter (where status in ('open','in_progress','escalated'))::int as complaints_open,
  count(*) filter (where status = 'escalated')::int   as escalated,
  coalesce(avg(case when resolved_at is not null
    then extract(epoch from (resolved_at - reported_at::timestamptz)) / 86400 end), 0)::numeric(10,1) as resolution_days_avg,
  count(*) filter (where resolved_at is not null and resolved_at::date <= due_at)::int as resolved_within_sla
from complaints
group by org_id, branch_id;

-- Unique index makes CONCURRENTLY refreshes possible.
create unique index if not exists ux_mv_branch_portfolio on mv_branch_portfolio_daily (org_id, branch_id, as_of);
create unique index if not exists ux_mv_officer_productivity on mv_officer_productivity_monthly (org_id, officer_id, period);
create unique index if not exists ux_mv_savings_position on mv_savings_position_daily (org_id, branch_id, product_id, as_of);
create unique index if not exists ux_mv_complaint_sla on mv_complaint_sla_daily (org_id, branch_id, as_of);

-- Nightly refresh helper (call from pg_cron / app cron after classification).
create or replace function refresh_mis_matviews()
returns void language plpgsql as $$
begin
  refresh materialized view concurrently mv_branch_portfolio_daily;
  refresh materialized view concurrently mv_officer_productivity_monthly;
  refresh materialized view concurrently mv_savings_position_daily;
  refresh materialized view concurrently mv_complaint_sla_daily;
end;
$$;

-- ── Seq helper ──────────────────────────────────────────────────────────────
create or replace function next_complaint_seq(p_org_id uuid)
returns integer language sql as $$
  select count(*)::int + 1 from complaints where org_id = p_org_id;
$$;

-- NOTE: mv_* views reference loans_classified / savings_accounts shapes from
-- the demo schema; adjust column names to the live schema when applying to a
-- real project (the shared MIS_INDEX_DOCS catalogue documents intent).
