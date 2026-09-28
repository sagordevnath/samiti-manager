-- 0036_work.sql — Work Distribution, Supervision & Internal Audit.
-- Tasks (with comments as jsonb), auto-source dedupe, monthly target cascade
-- (area → branch → officer) and delegation history. Convention: id uuid,
-- org_id, created_by, created_at, updated_at, deleted_at (soft delete).

-- ── 1) Tasks ────────────────────────────────────────────────────────────────
create table if not exists work_tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  branch_id      uuid references branches(id),
  type           text not null check (type in ('overdue_followup','utilization_visit','meeting_due','kyc_pending','report_submission','cash_count','manual')),
  title          text not null check (length(btrim(title)) between 3 and 160),
  description    text not null default '',
  assignee_id    uuid not null,
  assignee_name  text not null,
  assigner_id    uuid not null,
  assigner_name  text not null,
  due_date       date not null,
  priority       text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  link_kind      text not null default 'other' check (link_kind in ('member','loan','samity','branch','other')),
  link_id        uuid,
  link_label     text not null default '',
  status         text not null default 'todo' check (status in ('todo','in_progress','blocked','done','verified')),
  comments       jsonb not null default '[]'::jsonb,
  attachments    text[] not null default '{}',
  auto_key       text,
  completed_at   timestamptz,
  verified_at    timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index if not exists idx_work_tasks_assignee on work_tasks(org_id, assignee_id, status);
create index if not exists idx_work_tasks_branch   on work_tasks(org_id, branch_id, status);
create index if not exists idx_work_tasks_due      on work_tasks(org_id, due_date) where status not in ('done','verified');
-- One open auto task per source+link event:
create unique index if not exists uq_work_tasks_auto_open
  on work_tasks(org_id, auto_key) where auto_key is not null and status not in ('done','verified');

-- Status flow guard: todo → in_progress/blocked → done → verified, reopen
-- from done, nothing leaves verified.
create or replace function fn_work_task_transition_guard()
returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if old.status = 'todo' and new.status in ('in_progress','blocked') then return new; end if;
  if old.status = 'in_progress' and new.status in ('done','blocked') then return new; end if;
  if old.status = 'blocked' and new.status = 'in_progress' then return new; end if;
  if old.status = 'done' and new.status in ('verified','in_progress') then return new; end if;
  raise exception 'Invalid task status transition % -> %', old.status, new.status using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_work_task_transition on work_tasks;
create trigger trg_work_task_transition
  before update of status on work_tasks
  for each row execute function fn_work_task_transition_guard();

-- ── 2) Delegation history ───────────────────────────────────────────────────
create table if not exists task_delegations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  task_id       uuid references work_tasks(id) on delete cascade,
  from_staff_id uuid not null,
  to_staff_id   uuid not null,
  reason        text not null default 'workload' check (reason in ('leave','transfer','workload','other')),
  note          text not null default '',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_task_delegations_from on task_delegations(org_id, from_staff_id, created_at);

-- ── 3) Monthly targets (area → branch → officer cascade) ───────────────────
create table if not exists work_targets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  scope          text not null check (scope in ('area','branch','officer')),
  owner_branch_id uuid references branches(id),
  owner_staff_id uuid,
  owner_name     text not null,
  parent_id      uuid references work_targets(id),
  period         text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  new_members    integer not null default 0 check (new_members >= 0),
  disbursement   numeric(14,2) not null default 0 check (disbursement >= 0),
  collection     numeric(14,2) not null default 0 check (collection >= 0),
  savings        numeric(14,2) not null default 0 check (savings >= 0),
  par_limit      numeric(5,1) not null default 0 check (par_limit between 0 and 100),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (org_id, scope, coalesce(owner_branch_id::text,'-'), coalesce(owner_staff_id::text,'-'), period)
);

create index if not exists idx_work_targets_period on work_targets(org_id, period, scope);

-- Officer splits must not exceed the parent branch target (money + counts;
-- PAR is a ceiling, not additive).
create or replace function fn_target_split_guard()
returns trigger language plpgsql as $$
declare
  parent record;
  sibling_sum record;
begin
  if new.scope <> 'officer' or new.parent_id is null then return new; end if;
  select * into parent from work_targets
    where id = new.parent_id and org_id = new.org_id and scope = 'branch';
  if not found then
    raise exception 'Parent branch target not found' using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(new_members),0) as new_members,
         coalesce(sum(disbursement),0) as disbursement,
         coalesce(sum(collection),0) as collection,
         coalesce(sum(savings),0) as savings
    into sibling_sum
    from work_targets
    where org_id = new.org_id and parent_id = new.parent_id and scope = 'officer'
      and id <> new.id and deleted_at is null;

  if (coalesce(sibling_sum.new_members,0) + new.new_members) > parent.new_members
     or (coalesce(sibling_sum.disbursement,0) + new.disbursement) > parent.disbursement + 0.001
     or (coalesce(sibling_sum.collection,0) + new.collection) > parent.collection + 0.001
     or (coalesce(sibling_sum.savings,0) + new.savings) > parent.savings + 0.001 then
    raise exception 'Officer splits exceed the branch target' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_target_split on work_targets;
create trigger trg_target_split
  before insert or update of new_members, disbursement, collection, savings on work_targets
  for each row execute function fn_target_split_guard();
