-- 0018_disbursement_governance.sql — requirements 5–10 of the disbursement
-- spec: two-step control columns, the Module-10 journal backbone, loan
-- numbers, passbook entries, the SMS outbox, auto utilization visits, and
-- same-day rollback. The authorize/cancel RPCs each run as ONE transaction.

-- ── Two-step control + rollback columns (requirement 6, 10) ────────────────
alter type disbursement_status add value if not exists 'prepared' after 'pending';
alter type disbursement_status add value if not exists 'cancelled' after 'completed';

alter table loan_disbursements
  add column if not exists prepared_by     uuid references auth.users (id) on delete set null,
  add column if not exists prepared_at     timestamptz,
  add column if not exists loan_number     text,
  add column if not exists voucher_number  text,
  add column if not exists cancelled_at    timestamptz,
  add column if not exists cancelled_by    uuid references auth.users (id) on delete set null,
  add column if not exists cancel_reason   text;

create unique index if not exists loan_disbursements_loan_number_idx on loan_disbursements (loan_number) where loan_number is not null;

-- A completed disbursement must have a loan number and a preparer.
drop trigger if exists loan_disbursement_authorization_guard on loan_disbursements;
create or replace function enforce_disbursement_authorization() returns trigger as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    if new.prepared_by is null or new.prepared_at is null then
      raise exception 'Two-step control violated: an accountant must prepare before authorization';
    end if;
    if coalesce(new.loan_number, '') = '' then
      raise exception 'A completed disbursement requires a loan number';
    end if;
  end if;
  if new.status = 'cancelled' and coalesce(new.cancel_reason, '') = '' then
    raise exception 'Cancelling a disbursement requires a reason';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_disbursement_authorization_guard before update on loan_disbursements
for each row execute function enforce_disbursement_authorization();

-- ── Loan number sequence per branch (requirement 8) ─────────────────────────
create table if not exists branch_loan_seq (
  branch_id uuid primary key references branches (id) on delete cascade,
  org_id    uuid not null references organizations (id) on delete cascade,
  seq       integer not null default 0
);

-- ── Module 10 backbone: the general journal (requirement 5) ─────────────────
create table if not exists journal_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  branch_id   uuid references branches (id) on delete set null,
  entry_date  date not null,
  source_type text not null check (source_type in ('loan_disbursement','loan_disbursement_reversal','savings','share','manual')),
  source_id   uuid,
  memo        text not null,
  voided_at   timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists journal_lines (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references journal_entries (id) on delete cascade,
  account_code text not null,
  account_name text not null,
  debit        numeric(14, 2) not null default 0 check (debit >= 0),
  credit       numeric(14, 2) not null default 0 check (credit >= 0)
);

create index journal_entries_source_idx on journal_entries (source_type, source_id);

-- Every entry must balance: sum(debit) = sum(credit).
create or replace function enforce_journal_balanced() returns trigger as $$
declare
  v_debit numeric(14, 2);
  v_credit numeric(14, 2);
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_debit, v_credit
  from journal_lines where entry_id = coalesce(new.entry_id, old.entry_id);
  if abs(v_debit - v_credit) > 0.005 then
    raise exception 'Journal entry is not balanced: debits %, credits %', v_debit, v_credit;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create constraint trigger journal_balanced after insert or update on journal_lines
deferrable initially deferred for each row execute function enforce_journal_balanced();

-- ── Loan passbook entries (requirement 8) ───────────────────────────────────
create table if not exists loan_passbook_entries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  application_id uuid not null references loan_applications (id) on delete cascade,
  member_id     uuid not null,
  loan_number   text not null,
  entry_date    date not null,
  description   text not null,
  debit         numeric(14, 2) not null default 0 check (debit >= 0),
  credit        numeric(14, 2) not null default 0 check (credit >= 0),
  balance_after numeric(14, 2) not null default 0,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ── SMS outbox (requirement 8; delivery is a later integration) ─────────────
create table if not exists sms_outbox (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations (id) on delete cascade,
  member_id  uuid,
  phone      text,
  template   text not null,
  body       text not null check (length(body) between 5 and 480),
  status     text not null default 'queued' check (status in ('queued','sent','failed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

-- ── Auto utilization visit (requirement 9) ──────────────────────────────────
create table if not exists utilization_visits (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  branch_id      uuid references branches (id) on delete set null,
  application_id uuid not null references loan_applications (id) on delete cascade,
  member_id      uuid not null,
  scheduled_date date not null,
  status         text not null default 'scheduled' check (status in ('scheduled','completed','missed')),
  visited_at     date,
  notes          text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (application_id)
);

-- ── 6) Authorization RPC — everything below runs in ONE transaction ─────────
create or replace function authorize_loan_disbursement(
  p_application_id uuid,
  p_actor          uuid,
  p_schedule       jsonb,  -- [{seq, original_due_date, due_date, shifted, shift_reason, principal, interest, total, balance_after}]
  p_journal        jsonb,  -- {entry_date, memo, lines:[{account_code, account_name, debit, credit}]}
  p_passbook       jsonb,  -- {entry_date, description, debit, credit, balance_after}
  p_sms            jsonb   -- {member_id, phone, template, body}
) returns json as $$
declare
  v_rec        loan_disbursements%rowtype;
  v_app        loan_applications%rowtype;
  v_branch     branches%rowtype;
  v_limit      numeric(14, 2);
  v_out_today  numeric(14, 2);
  v_seq        integer;
  v_loan_no    text;
  v_entry_id   uuid;
  v_line       jsonb;
  v_row        jsonb;
  v_balance    numeric(14, 2);
begin
  -- Lock the disbursement row for the duration of the transaction.
  select * into v_rec from loan_disbursements
    where application_id = p_application_id for update;
  if not found then
    raise exception 'NOT_FOUND: Loan application not found';
  end if;
  if v_rec.status = 'completed' then
    raise exception 'CONFLICT: This loan has already been disbursed';
  end if;
  if v_rec.status <> 'prepared' then
    raise exception 'CONFLICT: Two-step control violated — an accountant must prepare the disbursement first (status: %)', v_rec.status;
  end if;

  select * into v_app from loan_applications where id = p_application_id;
  select * into v_branch from branches where id = v_rec.branch_id;

  -- Cash limit (requirement 6): block over the limit at authorization.
  if v_rec.mode in ('cash_branch', 'cash_center') then
    select coalesce(cash_limit, 0) into v_limit from branch_cash_limits where branch_id = v_rec.branch_id;
    select coalesce(sum(a.requested_amount), 0) into v_out_today
      from loan_disbursements d
      join loan_applications a on a.id = d.application_id
     where d.branch_id = v_rec.branch_id
       and d.status = 'completed'
       and d.mode in ('cash_branch', 'cash_center')
       and d.disbursement_date = v_rec.disbursement_date
       and d.application_id <> p_application_id;
    if v_out_today + v_app.requested_amount > coalesce(v_limit, 0) then
      raise exception 'CASH_LIMIT: Branch cash limit exceeded (% out today + % requested > % limit)', v_out_today, v_app.requested_amount, v_limit;
    end if;
  end if;

  -- Loan number (requirement 8): LN-<branchCode>-<YY>-<seq>.
  insert into branch_loan_seq (branch_id, org_id, seq) values (v_rec.branch_id, v_rec.org_id, 1)
    on conflict (branch_id) do update set seq = branch_loan_seq.seq + 1
    returning seq into v_seq;
  v_loan_no := 'LO-' || coalesce(v_branch.code, 'BR') || '-' || to_char(now(), 'YY') || '-' || lpad(v_seq::text, 4, '0');

  update loan_disbursements set
    status        = 'completed',
    loan_number   = v_loan_no,
    voucher_number = 'VCH-' || v_loan_no,
    disbursed_by  = p_actor,
    disbursed_at  = now(),
    updated_at    = now()
  where application_id = p_application_id
  returning * into v_rec;

  -- Stored schedule rows (requirement 4).
  delete from loan_repayment_schedule where application_id = p_application_id;
  for v_row in select * from jsonb_array_elements(p_schedule) loop
    insert into loan_repayment_schedule (
      org_id, application_id, seq, original_due_date, due_date, shifted, shift_reason,
      principal, interest, total, balance_after, created_by
    ) values (
      v_rec.org_id, p_application_id, (v_row->>'seq')::int,
      (v_row->>'originalDueDate')::date, (v_row->>'dueDate')::date,
      coalesce((v_row->>'shifted')::boolean, false), v_row->>'shiftReason',
      (v_row->>'principal')::numeric, (v_row->>'interest')::numeric,
      (v_row->>'total')::numeric, (v_row->>'balanceAfter')::numeric, p_actor
    );
  end loop;

  -- Journal entry + balanced lines (requirement 5).
  insert into journal_entries (org_id, branch_id, entry_date, source_type, source_id, memo, created_by)
  values (v_rec.org_id, v_rec.branch_id, (p_journal->>'entryDate')::date, 'loan_disbursement',
          p_application_id, p_journal->>'memo', p_actor)
  returning id into v_entry_id;
  for v_line in select * from jsonb_array_elements(p_journal->'lines') loop
    insert into journal_lines (entry_id, account_code, account_name, debit, credit)
    values (v_entry_id, v_line->>'accountCode', v_line->>'accountName',
            (v_line->>'debit')::numeric, (v_line->>'credit')::numeric);
  end loop;

  -- Passbook entry (requirement 8).
  insert into loan_passbook_entries (org_id, application_id, member_id, loan_number, entry_date, description, debit, credit, balance_after, created_by)
  values (v_rec.org_id, p_application_id, v_app.member_id, v_loan_no,
          (p_passbook->>'entryDate')::date, p_passbook->>'description',
          (p_passbook->>'debit')::numeric, (p_passbook->>'credit')::numeric,
          (p_passbook->>'balanceAfter')::numeric, p_actor);

  -- SMS to the member (requirement 8).
  if p_sms is not null and coalesce(p_sms->>'body', '') <> '' then
    insert into sms_outbox (org_id, member_id, phone, template, body, created_by)
    values (v_rec.org_id, (p_sms->>'memberId')::uuid, p_sms->>'phone', coalesce(p_sms->>'template', 'loan_disbursed'), p_sms->>'body', p_actor);
  end if;

  -- Utilization visit 15 days out (requirement 9).
  insert into utilization_visits (org_id, branch_id, application_id, member_id, scheduled_date, created_by)
  values (v_rec.org_id, v_rec.branch_id, p_application_id, v_app.member_id,
          v_rec.disbursement_date + 15, p_actor)
  on conflict (application_id) do nothing;

  -- Flip the application.
  update loan_applications set status = 'disbursed', updated_at = now()
    where id = p_application_id and status = 'approved';

  return to_json(v_rec);
end;
$$ language plpgsql;

-- ── 10) Rollback RPC — same-day cancel with reversal, ONE transaction ───────
create or replace function cancel_loan_disbursement(
  p_application_id uuid,
  p_actor          uuid,
  p_reason         text
) returns json as $$
declare
  v_rec       loan_disbursements%rowtype;
  v_app       loan_applications%rowtype;
  v_entry     journal_entries%rowtype;
  v_line      journal_lines%rowtype;
  v_entry_id  uuid;
  v_balance   numeric(14, 2);
begin
  if length(coalesce(p_reason, '')) < 10 then
    raise exception 'VALIDATION: A reason of at least 10 characters is required';
  end if;
  select * into v_rec from loan_disbursements where application_id = p_application_id for update;
  if not found then
    raise exception 'NOT_FOUND: Loan application not found';
  end if;
  if v_rec.status <> 'completed' then
    raise exception 'CONFLICT: Only a completed disbursement can be cancelled (status: %)', v_rec.status;
  end if;
  if v_rec.disbursement_date <> current_date then
    raise exception 'CONFLICT: A disbursement can only be cancelled on the same day (disbursed %)', v_rec.disbursement_date;
  end if;

  select * into v_app from loan_applications where id = p_application_id;

  -- Void the original entry and post the reversal.
  update journal_entries set voided_at = now()
    where source_type = 'loan_disbursement' and source_id = p_application_id and voided_at is null
    returning * into v_entry;
  if found then
    insert into journal_entries (org_id, branch_id, entry_date, source_type, source_id, memo, created_by)
    values (v_rec.org_id, v_rec.branch_id, current_date, 'loan_disbursement_reversal', p_application_id,
            'Reversal: ' || p_reason, p_actor)
    returning id into v_entry_id;
    for v_line in select * from journal_lines where entry_id = v_entry.id loop
      insert into journal_lines (entry_id, account_code, account_name, debit, credit)
      values (v_entry_id, v_line.account_code, v_line.account_name, v_line.credit, v_line.debit);
    end loop;
  end if;

  -- Passbook reversal entry.
  select coalesce(sum(credit - debit), 0) into v_balance from loan_passbook_entries where application_id = p_application_id;
  insert into loan_passbook_entries (org_id, application_id, member_id, loan_number, entry_date, description, debit, credit, balance_after, created_by)
  values (v_rec.org_id, p_application_id, v_app.member_id, coalesce(v_rec.loan_number, ''), current_date,
          'বাতিল / Disbursement cancelled: ' || p_reason, v_app.requested_amount, 0, v_balance - v_app.requested_amount, p_actor);

  -- Drop the schedule (regenerated on re-authorization) and the scheduled visit.
  delete from loan_repayment_schedule where application_id = p_application_id;
  delete from utilization_visits where application_id = p_application_id;

  -- Mark cancelled and revert the application to approved.
  update loan_disbursements set
    status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor, cancel_reason = p_reason, updated_at = now()
  where application_id = p_application_id
  returning * into v_rec;

  update loan_applications set status = 'approved', updated_at = now()
    where id = p_application_id and status = 'disbursed';

  -- Notify the member of the cancellation.
  insert into sms_outbox (org_id, member_id, template, body, created_by)
  values (v_rec.org_id, v_app.member_id, 'loan_cancelled',
          format('প্রিয় সদস্য, আপনার ঋণ %s বাতিল করা হয়েছে।', coalesce(v_rec.loan_number, v_rec.application_number)), p_actor);

  return to_json(v_rec);
end;
$$ language plpgsql;
