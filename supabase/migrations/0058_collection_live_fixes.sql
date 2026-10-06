-- 0058_collection_live_fixes.sql — Runtime fixes for the collection module.
-- Found during the live-API finalization audit: the 0022 triggers referenced
-- columns/tables that do not exist as written, which would make entry
-- reversal and write-off approval fail at runtime. All statements are
-- idempotent so bootstrap and re-runs stay safe.

-- ── a) collection_entries.meta (capture GPS + savingsAccountId reference) ───
-- The reversal trigger reads meta->>'savingsAccountId'; the API writes it.
alter table collection_entries add column if not exists meta jsonb;

-- ── b) journal_entries.source_type: allow collection + write-off entries ────
-- 0018 shipped the CHECK with only disbursement/savings/share/manual values,
-- so the collection journal and the write-off journal could never be posted.
alter table journal_entries drop constraint if exists journal_entries_source_type_check;
alter table journal_entries add constraint journal_entries_source_type_check
  check (source_type in (
    'loan_disbursement', 'loan_disbursement_reversal', 'savings', 'share',
    'manual', 'collection', 'loan_write_off'
  ));

-- ── c) loan_application_status: written_off lifecycle value ─────────────────
alter type loan_application_status add value if not exists 'written_off' after 'closed';

-- ── d) Corrected reversal trigger ────────────────────────────────────────────
-- Fixes vs 0022: the savings ledger column is transaction_type (0010), a
-- balance_after is mandatory (0010), and the live disbursement flow stores
-- installments in loan_repayment_schedule (0016) — un-apply there (and keep
-- the legacy loan_installments update for older data).
create or replace function fn_reverse_collection_entry() returns trigger
language plpgsql as $$
declare
  r collection_entries%rowtype;
  v_savings numeric(14,2);
  v_account uuid;
  v_balance numeric(14,2);
begin
  select * into r from collection_entries where id = new.entry_id;
  if r.id is null then
    raise exception 'entry % not found', new.entry_id;
  end if;

  -- Restore unpaid portions on touched schedule rows (live table).
  update loan_repayment_schedule s
     set paid_amount = greatest(s.paid_amount - (x.amt), 0),
         paid_at     = null
    from (
      select (elem->>'seq')::int as seq, (elem->>'amount')::numeric(14,2) as amt
        from jsonb_array_elements(coalesce(new.unapplied->'overdue','[]'::jsonb)) elem
      union all
      select (new.unapplied->'current'->>'seq')::int, (new.unapplied->'current'->>'amount')::numeric(14,2)
        where new.unapplied->'current' ? 'seq'
    ) x
   where s.application_id = r.application_id and s.seq = x.seq;

  -- Legacy table (harmless 0-row update when only the schedule is populated).
  update loan_installments li
     set paid_amount = greatest(li.paid_amount - (x.amt), 0),
         paid_at     = null
    from (
      select (elem->>'seq')::int as seq, (elem->>'amount')::numeric(14,2) as amt
        from jsonb_array_elements(coalesce(new.unapplied->'overdue','[]'::jsonb)) elem
      union all
      select (new.unapplied->'current'->>'seq')::int, (new.unapplied->'current'->>'amount')::numeric(14,2)
        where new.unapplied->'current' ? 'seq'
    ) x
   where li.application_id = r.application_id and li.seq = x.seq;

  -- Remove the savings deposit leg (ledger-reversal convention).
  v_savings := coalesce((new.unapplied->>'savings')::numeric(14,2), 0);
  v_account := (r.meta->>'savingsAccountId')::uuid;
  if v_savings > 0 and v_account is not null then
    select balance into v_balance from savings_accounts where id = v_account;
    update savings_accounts set balance = greatest(balance - v_savings, 0) where id = v_account;
    insert into savings_transactions (org_id, account_id, transaction_type, amount, balance_after, reference, note, created_by)
    values (r.org_id, v_account, 'withdrawal', v_savings, greatest(coalesce(v_balance, 0) - v_savings, 0),
            'reversal:' || new.id::text, 'ভুল এন্ট্রি বাতিল / Wrong-entry reversal', new.reversed_by);
  end if;
  return new;
end $$;

-- ── e) Corrected write-off trigger ───────────────────────────────────────────
-- Fixes vs 0022: read outstanding from loan_repayment_schedule (the live
-- table), write journal_lines WITH the NOT NULL account_name, and mark the
-- schedule rows paid (not just the legacy loan_installments).
create or replace function fn_apply_write_off() returns trigger
language plpgsql as $$
declare
  v_total numeric(14,2);
  v_entry_id uuid;
begin
  if new.status = 'approved' and old.status in ('pending','recommended') then
    select coalesce(sum(total - paid_amount), 0) into v_total
      from loan_repayment_schedule where application_id = new.application_id;
    if v_total <> new.outstanding_amount then
      update loan_write_offs set outstanding_amount = v_total where id = new.id;
    end if;
    update loan_repayment_schedule set paid_amount = total, paid_at = current_date
     where application_id = new.application_id and paid_amount < total;
    update loan_installments set paid_amount = total, paid_at = current_date
     where application_id = new.application_id and paid_amount < total;
    update loan_applications set status = 'written_off', updated_at = now() where id = new.application_id;

    -- Journal: debit write-off expense / credit loan portfolio (Module 10).
    insert into journal_entries (org_id, branch_id, entry_date, source_type, source_id, memo, created_by)
    values (new.org_id, new.branch_id, current_date, 'loan_write_off', new.application_id,
            'ঋণ অপরিশোধিত অংশ অপসারণ / Loan write-off ' || coalesce(new.decision_note, ''), new.decided_by)
    returning id into v_entry_id;
    insert into journal_lines (entry_id, account_code, account_name, debit, credit)
    values
      (v_entry_id, '6200', 'Loan Write-off Expense', v_total, 0),
      (v_entry_id, '1200', 'Loan Portfolio', 0, v_total);
  end if;
  return new;
end $$;
