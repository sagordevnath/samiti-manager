-- 0052_communication.sql — Communication & document module (reqs 1–3).
-- Notification center (in-app), bilingual templates, delivery log with
-- retries, opt-out preferences, send-window + cost-cap rules and spend counters.
-- Mirrors packages/shared/src/communication.ts.

create table if not exists message_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null check (kind in ('installment_reminder','disbursement_confirmation','receipt','meeting_notice','overdue_notice','greeting','approval_request')),
  name        text not null,
  locale      text not null default 'bn' check (locale in ('bn','en')),
  channel     text not null check (channel in ('in_app','email','sms')),
  subject     text not null default '',
  body        text not null,
  enabled     boolean not null default true,
  updated_by  text not null,
  updated_at  timestamptz not null default now(),
  unique (org_id, kind, locale, channel)
);

-- In-app notification center. Realtime: supabase_realtime publication (0053).
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     text not null,
  title       text not null,
  body        text not null default '',
  kind        text not null default 'custom',
  link        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications (org_id, user_id, read, created_at desc);

-- Unified delivery log across channels (email/sms + audit of in-app).
create table if not exists message_deliveries (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  channel        text not null check (channel in ('in_app','email','sms')),
  provider       text not null,
  recipient_name text not null default '',
  recipient      text not null,
  kind           text not null default 'custom',
  template_id    uuid references message_templates(id) on delete set null,
  locale         text not null default 'bn' check (locale in ('bn','en')),
  subject        text not null default '',
  body           text not null,
  status         text not null check (status in ('queued','sent','failed','opted_out','outside_window','cap_blocked','retrying')),
  attempts       integer not null default 0,
  cost           numeric(10,2) not null default 0,
  error          text,
  sent_at        timestamptz,
  next_retry_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_deliveries_recent on message_deliveries (org_id, created_at desc);
create index if not exists idx_deliveries_retry on message_deliveries (org_id, status, next_retry_at);

-- Per-recipient opt-out preferences (req 3).
create table if not exists comm_opt_outs (
  org_id      uuid not null references organizations(id) on delete cascade,
  recipient   text not null,
  email       boolean not null default false,
  sms         boolean not null default false,
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (org_id, recipient)
);

-- One rules row per org (send window, retry, caps).
create table if not exists comm_rules (
  org_id               uuid primary key references organizations(id) on delete cascade,
  send_window_start    text not null default '09:00',
  send_window_end      text not null default '20:00',
  max_retries          integer not null default 3,
  retry_backoff_minutes integer not null default 15,
  daily_cost_cap       numeric(12,2) not null default 500,
  monthly_cost_cap     numeric(12,2) not null default 5000,
  cost_per_sms_part    numeric(8,2) not null default 0.35,
  updated_at           timestamptz not null default now()
);

-- Rolling spend counters for the caps (req 3).
create table if not exists comm_spend (
  org_id       uuid not null references organizations(id) on delete cascade,
  day          date not null,
  month        text not null,
  daily_cost   numeric(12,2) not null default 0,
  monthly_cost numeric(12,2) not null default 0,
  primary key (org_id, day)
);
