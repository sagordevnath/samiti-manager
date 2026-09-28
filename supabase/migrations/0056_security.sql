-- 0056_security.sql — Security, audit & data-protection tables.
-- Generic audit trail (append-only, req 1), unmask log (req 2), security
-- config (password/TOTP/lockout/session/IP policies, req 3), login attempts
-- (brute-force lockout), device registry, and the data-protection set:
-- consents, retention rules, correction requests (req 5). RLS follows in
-- 0057. Mirrors packages/shared/src/security.ts.

create extension if not exists pgcrypto;

-- ── Req 1: generic append-only audit trail ──────────────────────────────────
-- One row per sensitive-table change, written ONLY by the trigger below.
create table if not exists audit_records (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  table_name     text not null,
  record_id      text not null,
  action         text not null check (action in ('insert','update','delete')),
  old_values     jsonb,
  new_values     jsonb,
  changed_fields text[] not null default '{}',
  user_id        text,
  user_name      text,
  ip             text,
  user_agent     text,
  at             timestamptz not null default now()
);
create index if not exists idx_audit_recent on audit_records (org_id, at desc);
create index if not exists idx_audit_table on audit_records (org_id, table_name, record_id);

-- Hard append-only guard: UPDATE/DELETE always raise (service role included;
-- rows can only age out via a retention purge job that deletes by age).
create or replace function audit_records_append_only() returns trigger as $$
begin
  raise exception 'audit_records is append-only (%) blocked', tg_op;
end;
$$ language plpgsql;

drop trigger if exists trg_audit_records_immutable on audit_records;
create trigger trg_audit_records_immutable
  before update or delete on audit_records
  for each row execute function audit_records_append_only();

-- Generic trigger factory: old→new diff into audit_records. Column sets and
-- branch_id/org_id are read from the row itself, so the same function serves
-- every sensitive table in the schema.
create or replace function audit_row_change() returns trigger as $$
declare
  rec      uuid;
  org      uuid;
  branch   uuid;
  old_row  jsonb;
  new_row  jsonb;
  changed  text[];
begin
  if tg_op = 'DELETE' then
    old_row := to_jsonb(old);
    new_row := null;
    rec := coalesce(old_row->>'id', old_row->>'uuid', '')::uuid;
    org := (old_row->>'org_id')::uuid;
  else
    old_row := case when tg_op = 'UPDATE' then to_jsonb(old) end;
    new_row := to_jsonb(new);
    rec := coalesce(new_row->>'id', new_row->>'uuid', '')::uuid;
    org := (new_row->>'org_id')::uuid;
    if tg_op = 'UPDATE' then
      select array_agg(key) into changed
      from jsonb_each(new_row) n
      join jsonb_each(old_row) o using (key)
      where n.value is distinct from o.value;
      if changed is null then
        return coalesce(new, old);  -- no-op update: nothing to log
      end if;
    end if;
  end if;
  insert into audit_records (org_id, table_name, record_id, action, old_values, new_values, changed_fields, user_id, user_name, ip, user_agent)
  values (
    org,
    tg_table_name,
    coalesce(rec::text, ''),
    lower(tg_op),
    old_row,
    new_row,
    coalesce(changed, '{}'),
    current_setting('request.user_id', true),
    current_setting('request.user_name', true),
    current_setting('request.ip', true),
    current_setting('request.user_agent', true)
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- Attach to the sensitive tables (re-runnable: drop/recreate per table).
do $$
declare t text;
begin
  foreach t in array array[
    'members','member_nominees','savings_accounts','savings_transactions',
    'loans','loan_applications','loan_disbursements',
    'collection_entries','cash_handovers','vouchers','voucher_lines',
    'payroll_lines','hr_staff','users_profile'
  ] loop
    execute format('drop trigger if exists trg_audit_%s on %I', t, t);
    execute format(
      'create trigger trg_audit_%s after insert or update or delete on %I
         for each row execute function audit_row_change()', t, t);
  end loop;
end;
$$;

-- ── Req 2: unmask log (every reveal of protected fields) ────────────────────
create table if not exists unmask_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  entity_table text not null,
  entity_id   text not null,
  field       text not null check (field in ('national_id','bank_account','phone')),
  user_id     text not null,
  user_name   text,
  role        text not null,
  ip          text,
  at          timestamptz not null default now()
);
create index if not exists idx_unmask_recent on unmask_log (org_id, at desc);

-- ── Req 3: security configuration (one row per org) ─────────────────────────
create table if not exists security_config (
  org_id              uuid primary key references organizations(id) on delete cascade,
  password_policy     jsonb not null,
  totp_config         jsonb not null,
  lockout_policy      jsonb not null,
  session_policy      jsonb not null,
  ip_allowlist        jsonb not null default '{"enabled":false,"cidrs":[]}'::jsonb,
  updated_by          text not null,
  updated_at          timestamptz not null default now()
);

-- ── Req 3: login attempts (brute-force lockout source) ──────────────────────
create table if not exists login_attempts (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid references organizations(id) on delete cascade,
  email   text not null,
  ok      boolean not null,
  ip      text,
  at      timestamptz not null default now()
);
create index if not exists idx_login_attempts_email on login_attempts (email, at desc);

-- ── Req 3: device registry ──────────────────────────────────────────────────
create table if not exists user_devices (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     text not null,
  label       text not null,
  user_agent  text,
  ip          text,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked     boolean not null default false
);
create index if not exists idx_devices_user on user_devices (org_id, user_id);

-- ── TOTP enrollment per user (secret stays server-side; QR shows otpauth URL) ──
create table if not exists user_totp (
  user_id     text primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  secret_b32  text not null,
  confirmed   boolean not null default false,
  last_code   text,
  enabled     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── Req 5: consent records (versioned, per member) ──────────────────────────
create table if not exists member_consents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  kind         text not null check (kind in ('data_processing','photo_use','sms_communication','biometric')),
  granted      boolean not null,
  text_version text not null default 'v1',
  method       text not null default 'written' check (method in ('written','verbal','digital')),
  witness_name text,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  recorded_by  text not null
);
create index if not exists idx_consents_member on member_consents (org_id, member_id);

-- ── Req 5: retention rules per record class ─────────────────────────────────
create table if not exists retention_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  class         text not null check (class in ('member_core','savings_transactions','loan_records','audit_logs','sms_deliveries','documents')),
  retain_months integer not null check (retain_months between 6 and 600),
  legal_hold    boolean not null default false,
  updated_by    text not null,
  updated_at    timestamptz not null default now(),
  unique (org_id, class)
);

-- ── Req 5: right-to-correction workflow ─────────────────────────────────────
create table if not exists member_corrections (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  member_id       uuid not null references members(id) on delete cascade,
  member_name     text not null,
  field           text not null,
  current_value   text not null,
  requested_value text not null,
  reason          text not null,
  status          text not null default 'submitted' check (status in ('submitted','in_review','approved','rejected','applied')),
  decided_by      text,
  decided_at      timestamptz,
  decision_note   text not null default '',
  applied_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_corrections_member on member_corrections (org_id, member_id);
