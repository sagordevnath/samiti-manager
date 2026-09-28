-- 0054_documents.sql — Document module (reqs 4–8).
-- Doc templates with cholito/sadhu register variants and version history,
-- generated documents with QR verification codes, and bulk jobs for
-- samity/branch-wide actions. Mirrors packages/shared/src/documents.ts.

-- ── Req 4/5: doc templates (11 kinds × cholito|sadhu) with versions ─────────
create table if not exists doc_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null check (kind in ('membership_form','loan_application','loan_agreement','guarantor_declaration','receipt','passbook_page','meeting_minutes','notice','appointment_letter','transfer_letter','legal_notice')),
  register    text not null default 'cholito' check (register in ('cholito','sadhu')),
  orientation text not null default 'portrait' check (orientation in ('portrait','landscape')),
  body        text not null,
  enabled     boolean not null default true,
  version     integer not null default 1,
  updated_by  text not null,
  updated_at  timestamptz not null default now(),
  unique (org_id, kind, register)
);

-- Immutable snapshots taken on every save (req 5 version history).
create table if not exists doc_template_versions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  template_id uuid not null references doc_templates(id) on delete cascade,
  version     integer not null,
  body        text not null,
  orientation text not null default 'portrait',
  updated_by  text not null,
  updated_at  timestamptz not null default now(),
  unique (template_id, version)
);
create index if not exists idx_doc_versions_template on doc_template_versions (template_id, version desc);

-- ── Req 4/7: generated documents + opaque verification codes ────────────────
-- html holds the print-HTML (embedded Bengali font stack); verify_code is the
-- ONLY lookup key the public page accepts and exposes no personal data.
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  kind         text not null check (kind in ('membership_form','loan_application','loan_agreement','guarantor_declaration','receipt','passbook_page','meeting_minutes','notice','appointment_letter','transfer_letter','legal_notice')),
  register     text not null default 'cholito' check (register in ('cholito','sadhu')),
  doc_no       text not null,
  verify_code  text not null unique,
  title_snippet text not null default '',
  template_id  uuid references doc_templates(id) on delete set null,
  template_version integer,
  reference_id uuid,
  payload      jsonb not null default '{}'::jsonb,
  issued_by    text not null,
  issued_at    timestamptz not null default now(),
  status       text not null default 'active' check (status in ('active','revoked')),
  html         text not null,
  unique (org_id, doc_no)
);
create index if not exists idx_documents_verify on documents (verify_code);
create index if not exists idx_documents_recent on documents (org_id, issued_at desc);

-- ── Req 8: bulk jobs over a samity or branch ────────────────────────────────
create table if not exists bulk_jobs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null check (kind in ('documents_batch','sms_batch','notification_batch','status_flip')),
  scope       text not null check (scope in ('samity','branch')),
  scope_id    text not null,
  scope_name  text not null,
  params      jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending','running','done','failed')),
  total       integer not null default 0,
  processed   integer not null default 0,
  failed      integer not null default 0,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_bulk_jobs_recent on bulk_jobs (org_id, created_at desc);

create table if not exists bulk_job_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  job_id      uuid not null references bulk_jobs(id) on delete cascade,
  target_id   text not null,
  target_name text not null,
  status      text not null default 'pending' check (status in ('pending','done','failed')),
  ref_id      uuid,
  error       text
);
create index if not exists idx_bulk_items_job on bulk_job_items (job_id, status);
