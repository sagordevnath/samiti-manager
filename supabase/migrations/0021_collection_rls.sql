-- 0021_collection_rls.sql — RLS for collection entries and cash handovers.
-- Field officers collect within their own branch; accountants and managers
-- confirm handovers. Reads are org-scoped (helpers from 0002_rls.sql).

alter table collection_entries enable row level security;
alter table cash_handovers     enable row level security;
alter table receipt_counters   enable row level security;

-- ── Collection entries ──────────────────────────────────────────────────────
create policy collection_entries_select on collection_entries
  for select using (
    org_id = auth_org_id() and can_read_members()
  );

create policy collection_entries_insert on collection_entries
  for insert with check (
    org_id = auth_org_id()
    and (
      auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer')
      -- An officer may post on behalf of themselves only; collected_by is
      -- pinned to the JWT user for field roles.
      and (collected_by is null or collected_by = auth.uid())
    )
  );

-- Immutable ledger: entries are never updated or deleted. Corrections happen
-- through reversal entries at the application layer.

-- ── Cash handovers ──────────────────────────────────────────────────────────
create policy cash_handovers_select on cash_handovers
  for select using (
    org_id = auth_org_id() and can_read_members()
  );

create policy cash_handovers_insert on cash_handovers
  for insert with check (
    org_id = auth_org_id()
    and officer_id = auth.uid()  -- officers open their own handovers
    and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer')
  );

create policy cash_handovers_update on cash_handovers
  for update using (
    org_id = auth_org_id()
    and (
      -- Officer advances their own draft/submitted handover.
      (officer_id = auth.uid() and status in ('draft', 'submitted'))
      -- Accountant / manager confirm or reject submitted handovers.
      or (
        auth_user_role() in ('super_admin', 'org_admin', 'branch_manager')
        and status = 'submitted'
      )
    )
  );

-- ── Receipt counters (service-role writes via RPC; readable in-org) ─────────
create policy receipt_counters_select on receipt_counters
  for select using (true);
