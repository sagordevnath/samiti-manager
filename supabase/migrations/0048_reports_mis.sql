-- 0048_reports_mis.sql — Reports, MIS & compliance (reqs 1–4).
-- Report templates (configurable designer), generated regulatory returns and
-- dashboard/report snapshots. Snapshot values come from the operational
-- modules at query time; these tables persist the designer's templates, the
-- generated submissions and dashboard layout preferences.

-- ── Report designer templates (req 4) ───────────────────────────────────────
create table if not exists report_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  regulator text not null check (regulator in ('MRA','PKSF','OTHER')),
  section text not null default '',
  circular_ref text not null default '',
  -- Marked true until verified against the latest official circular.
  needs_verification boolean not null default true,
  verified_at timestamptz,
  verified_by text,
  rows jsonb not null default '[]'::jsonb,  -- TemplateRow[]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Generated returns (submissions ledger) ──────────────────────────────────
create table if not exists regulatory_returns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  template_id uuid not null references report_templates(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  payload jsonb not null,             -- GeneratedRegulatoryReturn
  missing_values jsonb not null default '[]'::jsonb,
  generated_by text not null,
  submitted_at timestamptz,           -- set when actually filed with the regulator
  created_at timestamptz not null default now(),
  unique (org_id, template_id, period_start, period_end)
);

-- ── Snapshot cache for dashboards/reports (refreshed on demand) ─────────────
create table if not exists mis_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  as_of date not null,
  role text not null check (role in ('field_officer','branch_manager','area_zone','head_office','board')),
  scope_id text,                      -- officer/branch/area id when scoped
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (org_id, as_of, role, scope_id)
);
create index if not exists idx_mis_snapshots_org_date on mis_snapshots (org_id, as_of desc);

-- ── Formula-value registry: named values templates may reference ────────────
-- Populated by a scheduled rollup job (or computed on the fly in demo mode).
create table if not exists mis_formula_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  as_of date not null,
  key text not null,
  value numeric(18,4) not null,
  source text not null default 'rollup',  -- rollup | manual | ratio
  created_at timestamptz not null default now(),
  unique (org_id, as_of, key)
);

-- ── Staff productivity rollup (per officer, per month) ──────────────────────
create table if not exists staff_productivity_monthly (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid references branches(id),
  officer_id text not null,
  officer_name text not null,
  period text not null,               -- YYYY-MM
  samities integer not null default 0,
  borrowers integer not null default 0,
  due_amount numeric(14,2) not null default 0,
  collected_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, officer_id, period)
);

-- ── Report generation audit (who pulled what, when) ─────────────────────────
create table if not exists report_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null,                 -- standard report kind or 'regulatory_return'
  params jsonb not null default '{}'::jsonb,
  requested_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_report_audit_org on report_audit_log (org_id, created_at desc);
