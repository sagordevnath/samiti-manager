/**
 * Live-path guards for the two collection endpoints where ORDER is the
 * correctness argument, not just the outcome.
 *
 * `collection.test.ts` exercises the in-memory demo router. This file mounts
 * the real Supabase-backed `collectionRouter` on a throwaway Express app with
 * `supabaseAdmin` replaced by a small fake, so the sequence of statements a
 * handler issues can be asserted:
 *
 *  - an entry reversal must land the `collection_reversals` row BEFORE the
 *    entry is soft-deleted — that insert is what fires the 0058 trigger that
 *    un-applies the repayment schedule and reverses the savings leg inside one
 *    transaction, and the double-reversal guard has to be read first;
 *  - a handover is only confirmable from `submitted`, and confirming without an
 *    explicit received amount falls back to what the officer counted.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import type { Express } from 'express';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_ID = '00000000-0000-4000-8000-0000000000b1';
const ENTRY_ID = '00000000-0000-4000-8000-000000000201';
const HANDOVER_ID = '00000000-0000-4000-8000-000000000202';

type Row = Record<string, unknown>;

/** Mutable fake database + an ordered log of every statement the handler ran. */
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  calls: [] as string[],
  nextId: 1,
}));

vi.mock('./lib/supabase.js', () => {
  interface Filter {
    column: string;
    value: unknown;
  }

  const rowsOf = (name: string): Row[] => {
    db.tables[name] ??= [];
    return db.tables[name]!;
  };

  const project = (rows: Row[], columns: string): Row[] => {
    if (!columns || columns === '*') return rows;
    const keys = columns.split(',').map((c) => c.trim()).filter(Boolean);
    return rows.map((row) => Object.fromEntries(keys.map((k) => [k, row[k]])));
  };

  function query(name: string) {
    let op: 'select' | 'update' | 'insert' = 'select';
    const filters: Filter[] = [];
    const nullColumns: string[] = [];
    let patch: Row = {};
    let inserted: Row | null = null;
    let columns = '*';

    const matches = () =>
      rowsOf(name).filter(
        (row) =>
          filters.every((f) => row[f.column] === f.value) &&
          nullColumns.every((c) => row[c] === null || row[c] === undefined),
      );

    async function complete() {
      db.calls.push(`${name}:${op}`);
      if (op === 'select') return { data: project(matches(), columns), error: null };
      if (op === 'insert') {
        const row = { id: `gen-${db.nextId++}`, ...inserted };
        rowsOf(name).push(row);
        return { data: [row], error: null };
      }
      const matched = matches();
      for (const row of matched) Object.assign(row, patch);
      return { data: columns === '*' && matched.length ? matched : project(matched, columns), error: null };
    }

    const take = async (exactlyOne: boolean) => {
      const result = await complete();
      const rows = (result.data ?? []) as Row[];
      if (exactlyOne && rows.length !== 1) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
      }
      if (exactlyOne) return { data: rows[0], error: null };
      return { data: rows[0] ?? null, error: null };
    };

    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: (cols?: string) => {
        columns = cols ?? '*';
        return q;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ column, value });
        return q;
      },
      is: (column: string, value: unknown) => {
        if (value === null) nullColumns.push(column);
        else filters.push({ column, value });
        return q;
      },
      in: () => q,
      or: () => q,
      order: () => q,
      limit: () => q,
      update: (values: Row) => {
        op = 'update';
        patch = values;
        return q;
      },
      insert: (values: Row) => {
        op = 'insert';
        inserted = values;
        return q;
      },
      delete: () => {
        op = 'update';
        return q;
      },
      single: () => take(true),
      maybeSingle: () => take(false),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => complete().then(resolve, reject),
    });
    return q;
  }

  return { supabaseAdmin: { from: (table: string) => query(table) } };
});

let app: Express;

beforeEach(async () => {
  db.tables = { collection_entries: [], collection_reversals: [], cash_handovers: [] };
  db.calls = [];
  db.nextId = 1;

  const { collectionRouter } = await import('./routes/collection.routes.js');
  const { errorHandler } = await import('./middleware/error.js');
  app = express();
  app.use(express.json());
  app.use('/api/v1/collection', collectionRouter);
  app.use(errorHandler);
});

async function token(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode('test-jwt-secret');
  return await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
}

const branchManager = () =>
  token({ sub: '11111111-1111-4111-8111-111111111111', email: 'bm@x.test', role: 'branch_manager', org_id: ORG_ID, branch_id: BRANCH_ID });
// Field officers collect money but may not reverse an entry or confirm a handover.
const officer = () =>
  token({ sub: '22222222-2222-4222-8222-222222222222', email: 'fo@x.test', role: 'account_officer', org_id: ORG_ID, branch_id: BRANCH_ID });

const entryRow = (over: Row = {}): Row => ({
  id: ENTRY_ID,
  org_id: ORG_ID,
  branch_id: BRANCH_ID,
  idempotency_key: 'k-1',
  member_id: '00000000-0000-4000-8000-000000000301',
  application_id: null,
  meeting_date: '2026-03-01',
  loan_paid: '2000.00',
  savings_paid: '200.00',
  extra_paid: '0.00',
  allocation: {
    overdueApplied: [{ seq: 4, amount: '1500.00' }],
    currentApplied: { seq: 5, amount: '500.00' },
    savingsApplied: '200.00',
    advanceApplied: '0.00',
    order: 'overdue_first',
  },
  receipt_no: 'RCP-DHK-000123',
  collected_by: '22222222-2222-4222-8222-222222222222',
  captured_at: '2026-03-01T06:00:00.000Z',
  note: null,
  meta: null,
  created_at: '2026-03-01T06:00:00.000Z',
  deleted_at: null,
  ...over,
});

const handoverRow = (over: Row = {}): Row => ({
  id: HANDOVER_ID,
  org_id: ORG_ID,
  branch_id: BRANCH_ID,
  officer_id: '22222222-2222-4222-8222-222222222222',
  handover_date: '2026-03-01',
  expected_amount: '50000.00',
  counted_amount: '49800.00',
  received_amount: null,
  difference: '-200.00',
  difference_kind: 'shortage',
  status: 'submitted',
  officer_note: null,
  accountant_note: null,
  confirmed_by: null,
  confirmed_at: null,
  created_at: '2026-03-01T12:00:00.000Z',
  updated_at: '2026-03-01T12:00:00.000Z',
  ...over,
});

describe('POST /api/v1/collection/entries/:id/reverse (live router)', () => {
  it('403s for a field officer without loan:write and never reads the entry', async () => {
    db.tables['collection_entries'] = [entryRow()];
    const res = await request(app)
      .post(`/api/v1/collection/entries/${ENTRY_ID}/reverse`)
      .set('Authorization', `Bearer ${await officer()}`)
      .send({ reason: 'ভুল সদস্যের ঘরে জমা হয়েছিল' });

    expect(res.status).toBe(403);
    expect(db.calls).toEqual([]);
  });

  it('rejects a too-short reason before touching the database', async () => {
    db.tables['collection_entries'] = [entryRow()];
    const res = await request(app)
      .post(`/api/v1/collection/entries/${ENTRY_ID}/reverse`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ reason: 'ভুল' });

    expect(res.status).toBe(400);
    expect(db.calls).toEqual([]);
  });

  it('409s on an already-reversed entry and leaves it live', async () => {
    db.tables['collection_entries'] = [entryRow()];
    db.tables['collection_reversals'] = [{ id: 'rev-1', entry_id: ENTRY_ID }];

    const res = await request(app)
      .post(`/api/v1/collection/entries/${ENTRY_ID}/reverse`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ reason: 'ভুল সদস্যের ঘরে জমা হয়েছিল' });

    expect(res.status).toBe(409);
    // The duplicate check runs BEFORE anything is written.
    expect(db.calls).toEqual(['collection_entries:select', 'collection_reversals:select']);
    expect(db.tables['collection_reversals']).toHaveLength(1);
    expect(db.tables['collection_entries']![0]!['deleted_at']).toBeNull();
  });

  it('inserts the reversal BEFORE retiring the entry, echoing what was un-applied', async () => {
    db.tables['collection_entries'] = [entryRow()];
    const res = await request(app)
      .post(`/api/v1/collection/entries/${ENTRY_ID}/reverse`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ reason: 'ভুল সদস্যের ঘরে জমা হয়েছিল' });

    expect(res.status).toBe(201);
    // Load-bearing order: the reversal row must exist first — its insert is
    // what drives the 0058 trigger that un-applies the schedule.
    expect(db.calls).toEqual([
      'collection_entries:select',
      'collection_reversals:select',
      'collection_reversals:insert',
      'collection_entries:update',
    ]);
    expect(db.tables['collection_entries']![0]!['deleted_at']).toBeTruthy();
    expect(res.body.entryId).toBe(ENTRY_ID);
    expect(res.body.receiptNo).toBe('RCP-DHK-000123');
    // The schedule legs the reversal must undo travel back with the response.
    expect(res.body.unapplied).toEqual({
      overdue: [{ seq: 4, amount: '1500.00' }],
      current: { seq: 5, amount: '500.00' },
      savings: '200.00',
      advance: '0.00',
    });
  });

  it('404s for an unknown (or already deleted) entry', async () => {
    const res = await request(app)
      .post(`/api/v1/collection/entries/${ENTRY_ID}/reverse`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ reason: 'ভুল সদস্যের ঘরে জমা হয়েছিল' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['collection_entries:select']);
  });
});

describe('POST /api/v1/collection/handovers/:id/confirm (live router)', () => {
  it('403s for an account officer — only a Branch Manager may confirm', async () => {
    db.tables['cash_handovers'] = [handoverRow()];
    const res = await request(app)
      .post(`/api/v1/collection/handovers/${HANDOVER_ID}/confirm`)
      .set('Authorization', `Bearer ${await officer()}`)
      .send({ decision: 'confirm' });

    expect(res.status).toBe(403);
    expect(db.calls).toEqual([]);
  });

  it('409s while the handover is still a draft', async () => {
    db.tables['cash_handovers'] = [handoverRow({ status: 'draft', counted_amount: null })];
    const res = await request(app)
      .post(`/api/v1/collection/handovers/${HANDOVER_ID}/confirm`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ decision: 'confirm' });

    expect(res.status).toBe(409);
    expect(db.calls).toEqual(['cash_handovers:select']);
    expect(db.tables['cash_handovers']![0]!['status']).toBe('draft');
  });

  it('confirms a submitted handover and falls back to the counted amount', async () => {
    db.tables['cash_handovers'] = [handoverRow()];
    const res = await request(app)
      .post(`/api/v1/collection/handovers/${HANDOVER_ID}/confirm`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ decision: 'confirm', accountantNote: 'নগদ পাওয়া গেছে' });

    expect(res.status).toBe(200);
    expect(db.calls).toEqual(['cash_handovers:select', 'cash_handovers:update']);
    const row = db.tables['cash_handovers']![0]!;
    expect(row['status']).toBe('confirmed');
    expect(row['received_amount']).toBe('49800.00');
    expect(row['confirmed_by']).toBe('11111111-1111-4111-8111-111111111111');
    expect(row['confirmed_at']).toBeTruthy();
    expect(res.body.status).toBe('confirmed');
    expect(res.body.receivedAmount).toBe('49800.00');
  });

  it('a counted-down received amount overrides the officer’s figure', async () => {
    db.tables['cash_handovers'] = [handoverRow()];
    const res = await request(app)
      .post(`/api/v1/collection/handovers/${HANDOVER_ID}/confirm`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ decision: 'confirm', receivedAmount: '49000.00' });

    expect(res.status).toBe(200);
    expect(db.tables['cash_handovers']![0]!['received_amount']).toBe('49000.00');
    expect(res.body.receivedAmount).toBe('49000.00');
  });

  it('rejecting clears the received amount and records the decision', async () => {
    db.tables['cash_handovers'] = [handoverRow()];
    const res = await request(app)
      .post(`/api/v1/collection/handovers/${HANDOVER_ID}/confirm`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ decision: 'reject', accountantNote: 'গণনায় গরমিল' });

    expect(res.status).toBe(200);
    const row = db.tables['cash_handovers']![0]!;
    expect(row['status']).toBe('rejected');
    expect(row['received_amount']).toBeNull();
    expect(row['accountant_note']).toBe('গণনায় গরমিল');
  });
});

/** Director of Operations: the only non-super role that may decide a write-off. */
const orgAdmin = () =>
  token({ sub: '33333333-3333-4333-8333-333333333333', email: 'do@x.test', role: 'org_admin', org_id: ORG_ID });

const OTHER_ORG = '00000000-0000-4000-8000-0000000000cc';

/**
 * The service client bypasses RLS, so every one of these id-addressed writes
 * must carry `org_id` in code — otherwise an officer of one organization could
 * retire another's handover, reverse its entry, decide its write-off or clear
 * its fraud flag by guessing a uuid.
 */
describe('collection writes are tenant-scoped (live router)', () => {
  it('POST /handovers/:id/submit 404s cross-org and leaves it a draft', async () => {
    db.tables['cash_handovers'] = [handoverRow({ org_id: OTHER_ORG, status: 'draft' })];
    const res = await request(app)
      .post(`/api/v1/collection/handovers/${HANDOVER_ID}/submit`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ countedAmount: '1000.00' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['cash_handovers:select']);
    expect(db.tables['cash_handovers']![0]!['status']).toBe('draft');
  });

  it('POST /handovers/:id/confirm 404s cross-org and stays submitted', async () => {
    db.tables['cash_handovers'] = [handoverRow({ org_id: OTHER_ORG })];
    const res = await request(app)
      .post(`/api/v1/collection/handovers/${HANDOVER_ID}/confirm`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ decision: 'confirm' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['cash_handovers:select']);
    expect(db.tables['cash_handovers']![0]!['status']).toBe('submitted');
  });

  it('POST /entries/:id/reverse 404s cross-org and never inserts a reversal', async () => {
    db.tables['collection_entries'] = [entryRow({ org_id: OTHER_ORG })];
    const res = await request(app)
      .post(`/api/v1/collection/entries/${ENTRY_ID}/reverse`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ reason: 'ভুল সদস্যের ঘরে জমা হয়েছিল' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['collection_entries:select']);
    expect(db.tables['collection_reversals']).toHaveLength(0);
    expect(db.tables['collection_entries']![0]!['deleted_at']).toBeNull();
  });

  it('POST /settlement/write-offs/:id/decision 404s cross-org and leaves it requested', async () => {
    db.tables['loan_write_offs'] = [{ id: HANDOVER_ID, org_id: OTHER_ORG, status: 'requested' }];
    const res = await request(app)
      .post(`/api/v1/collection/settlement/write-offs/${HANDOVER_ID}/decision`)
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ decision: 'approved' });

    expect(res.status).toBe(404);
    expect(db.tables['loan_write_offs']![0]!['status']).toBe('requested');
  });

  it('POST /fraud-flags/:id/review 404s cross-org and leaves it unreviewed', async () => {
    db.tables['collection_fraud_flags'] = [{ id: HANDOVER_ID, org_id: OTHER_ORG, reviewed: false }];
    const res = await request(app)
      .post(`/api/v1/collection/fraud-flags/${HANDOVER_ID}/review`)
      .set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(404);
    expect(db.tables['collection_fraud_flags']![0]!['reviewed']).toBe(false);
  });

  it('POST /settlement/write-offs 404s when the loan belongs to another org and files nothing', async () => {
    db.tables['loan_applications'] = [{ id: ENTRY_ID, org_id: OTHER_ORG, branch_id: BRANCH_ID }];
    const res = await request(app)
      .post('/api/v1/collection/settlement/write-offs')
      .set('Authorization', `Bearer ${await orgAdmin()}`)
      .send({ applicationId: ENTRY_ID, reason: 'untraceable', note: 'সদস্যকে খুঁজে পাওয়া যায়নি' });

    expect(res.status).toBe(404);
    // The application read is what carries the tenant predicate; no schedule
    // read and no write-off row may follow it.
    expect(db.calls).toEqual(['loan_applications:select']);
    expect(db.tables['loan_write_offs'] ?? []).toHaveLength(0);
  });

  it('POST /settlement/reschedules/:id/decision 404s cross-org and stays pending', async () => {
    db.tables['loan_reschedules'] = [{ id: HANDOVER_ID, org_id: OTHER_ORG, status: 'pending', shift_installments: 1 }];
    const res = await request(app)
      .post(`/api/v1/collection/settlement/reschedules/${HANDOVER_ID}/decision`)
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ decision: 'approved' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['loan_reschedules:select']);
    expect(db.tables['loan_reschedules']![0]!['status']).toBe('pending');
  });
});
