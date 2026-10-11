/**
 * Live-path guard for the savings write endpoints.
 *
 * `savings.test.ts` exercises the in-memory demo router. This file mounts the
 * real Supabase-backed `savingsRouter` on a throwaway Express app with
 * `supabaseAdmin` replaced by a small fake, so the rules that only exist on the
 * live path are pinned:
 *
 *  - a ledger read addressed by account id is filtered by `org_id` — the
 *    service client bypasses RLS, so another organization's transactions must
 *    not leak;
 *  - posting a transaction to another organization's account is refused before
 *    the DB RPC is ever called, and a withdrawal above the product's
 *    manager-approval threshold cannot be posted by an account officer;
 *  - a share purchase is only recorded against a product that belongs to the
 *    caller's org and is actually a `share` product.
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

const ORG_A = '00000000-0000-4000-8000-0000000000aa';
const ORG_B = '00000000-0000-4000-8000-0000000000bb';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000501';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000502';
const MEMBER_ID = '00000000-0000-4000-8000-000000000503';

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  calls: [] as string[],
  rpcArgs: [] as Array<Record<string, unknown>>,
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

  // PostgREST column lists may embed FKs, e.g. `savings_products(a, b)`. The
  // fake carries the embed as a nested object on the row, so the projection
  // keeps the base name and drops the parenthesised column list.
  const project = (rows: Row[], columns: string): Row[] => {
    if (!columns || columns === '*') return rows;
    const keys = columns
      .split(',')
      .map((c) => c.trim().split('(')[0]!.replace(/!.*$/, '').replace(/\)+$/, ''))
      .filter(Boolean);
    return rows.map((row) => Object.fromEntries(keys.map((k) => [k, row[k]])));
  };

  function query(name: string) {
    let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
    const filters: Filter[] = [];
    const nullColumns: string[] = [];
    let patch: Row = {};
    let inserted: Row | Row[] | null = null;
    let columns = '*';
    let limit: number | null = null;

    const matches = () =>
      rowsOf(name).filter(
        (row) =>
          filters.every((f) => row[f.column] === f.value) &&
          nullColumns.every((c) => row[c] === null || row[c] === undefined),
      );

    async function complete() {
      db.calls.push(`${name}:${op}`);
      if (op === 'select') {
        const matched = matches();
        return { data: project(limit === null ? matched : matched.slice(0, limit), columns), error: null };
      }
      if (op === 'insert') {
        const incoming = Array.isArray(inserted) ? inserted : [inserted ?? {}];
        const rows = incoming.map((r) => ({ id: `gen-${db.nextId++}`, ...r }));
        rowsOf(name).push(...rows);
        return { data: rows, error: null };
      }
      if (op === 'delete') {
        const doomed = new Set(matches());
        db.tables[name] = rowsOf(name).filter((row) => !doomed.has(row));
        return { data: null, error: null };
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
      range: () => q,
      limit: (n: number) => {
        limit = n;
        return q;
      },
      update: (values: Row) => {
        op = 'update';
        patch = values;
        return q;
      },
      insert: (values: Row | Row[]) => {
        op = 'insert';
        inserted = values;
        return q;
      },
      delete: () => {
        op = 'delete';
        return q;
      },
      single: () => take(true),
      maybeSingle: () => take(false),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => complete().then(resolve, reject),
    });
    return q;
  }

  return {
    supabaseAdmin: {
      from: (table: string) => query(table),
      rpc: async (name: string, args: Record<string, unknown>) => {
        db.calls.push(`rpc:${name}`);
        db.rpcArgs.push(args);
        return { data: { id: `tx-${db.nextId++}`, ...args }, error: null };
      },
    },
  };
});

let app: Express;

beforeEach(async () => {
  db.tables = {
    savings_accounts: [],
    savings_transactions: [],
    savings_products: [],
    share_allotments: [],
    members: [],
  };
  db.calls = [];
  db.rpcArgs = [];
  db.nextId = 1;

  const { savingsRouter } = await import('./routes/savings.routes.js');
  const { errorHandler } = await import('./middleware/error.js');
  app = express();
  app.use(express.json());
  app.use('/api/v1/savings', savingsRouter);
  app.use(errorHandler);
});

async function token(claims: Record<string, unknown>): Promise<string> {
  const secret = new TextEncoder().encode('test-jwt-secret');
  return await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(secret);
}

const branchManager = () => token({ sub: '11111111-1111-4111-8111-111111111111', email: 'bm@x.test', role: 'branch_manager', org_id: ORG_A });
/** Field officer: savings:read + savings:write, but cannot approve a large withdrawal. */
const officer = () => token({ sub: '22222222-2222-4222-8222-222222222222', email: 'fo@x.test', role: 'account_officer', org_id: ORG_A });

const accountRow = (over: Row = {}): Row => ({
  id: ACCOUNT_ID,
  org_id: ORG_A,
  branch_id: '00000000-0000-4000-8000-0000000000b1',
  member_id: MEMBER_ID,
  product_id: PRODUCT_ID,
  account_number: 'SA-000000000001',
  status: 'active',
  balance: '5000.00',
  opening_date: '2026-01-01',
  nominee_id: null,
  savings_products: { withdrawal_limit: '0', requires_manager_approval_above: '0' },
  created_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  ...over,
});

const txRow = (over: Row = {}): Row => ({
  id: 'tx-1',
  org_id: ORG_A,
  account_id: ACCOUNT_ID,
  transaction_type: 'deposit',
  amount: '500.00',
  balance_after: '5500.00',
  reference: null,
  note: null,
  created_at: '2026-03-01T00:00:00.000Z',
  ...over,
});

describe('GET /api/v1/savings/accounts/:id/transactions (live router)', () => {
  it('returns the account’s ledger for the caller’s org', async () => {
    db.tables['savings_transactions'] = [txRow(), txRow({ id: 'tx-2', transaction_type: 'withdrawal' })];
    const res = await request(app)
      .get(`/api/v1/savings/accounts/${ACCOUNT_ID}/transactions`)
      .set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(db.calls).toEqual(['savings_transactions:select']);
  });

  it('filters out another organization’s ledger rows for the same account id', async () => {
    db.tables['savings_transactions'] = [txRow(), txRow({ id: 'tx-x', org_id: ORG_B })];
    const res = await request(app)
      .get(`/api/v1/savings/accounts/${ACCOUNT_ID}/transactions`)
      .set('Authorization', `Bearer ${await branchManager()}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].org_id).toBe(ORG_A);
  });
});

describe('POST /api/v1/savings/transactions (live router)', () => {
  it('404s for an unknown account', async () => {
    const res = await request(app)
      .post('/api/v1/savings/transactions')
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ accountId: ACCOUNT_ID, type: 'deposit', amount: '500.00' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['savings_accounts:select']);
  });

  it('403s for another organization’s account and never posts to the ledger', async () => {
    db.tables['savings_accounts'] = [accountRow({ org_id: ORG_B })];
    const res = await request(app)
      .post('/api/v1/savings/transactions')
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ accountId: ACCOUNT_ID, type: 'deposit', amount: '500.00' });

    expect(res.status).toBe(403);
    expect(db.calls).toEqual(['savings_accounts:select']);
    expect(db.rpcArgs).toHaveLength(0);
  });

  it('posts a deposit through the DB RPC and echoes the transaction', async () => {
    db.tables['savings_accounts'] = [accountRow()];
    const res = await request(app)
      .post('/api/v1/savings/transactions')
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ accountId: ACCOUNT_ID, type: 'deposit', amount: '500.00', note: 'সমিতি চাঁদা' });

    expect(res.status).toBe(201);
    expect(db.calls).toEqual(['savings_accounts:select', 'rpc:post_savings_transaction']);
    expect(db.rpcArgs[0]).toMatchObject({
      p_account_id: ACCOUNT_ID,
      p_transaction_type: 'deposit',
      p_amount: '500.00',
      p_created_by: '11111111-1111-4111-8111-111111111111',
    });
    expect(res.body.transaction.id).toBeTruthy();
  });

  it('refuses a withdrawal above the approval threshold when the caller cannot approve', async () => {
    db.tables['savings_accounts'] = [
      accountRow({ savings_products: { withdrawal_limit: '0', requires_manager_approval_above: '1000.00' } }),
    ];
    const res = await request(app)
      .post('/api/v1/savings/transactions')
      .set('Authorization', `Bearer ${await officer()}`)
      .send({ accountId: ACCOUNT_ID, type: 'withdrawal', amount: '5000.00' });

    expect(res.status).toBe(403);
    expect(db.calls).toEqual(['savings_accounts:select']);
    expect(db.rpcArgs).toHaveLength(0);
  });

  it('lets a branch manager post the same large withdrawal', async () => {
    db.tables['savings_accounts'] = [
      accountRow({ savings_products: { withdrawal_limit: '0', requires_manager_approval_above: '1000.00' } }),
    ];
    const res = await request(app)
      .post('/api/v1/savings/transactions')
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ accountId: ACCOUNT_ID, type: 'withdrawal', amount: '5000.00' });

    expect(res.status).toBe(201);
    expect(db.rpcArgs[0]?.['p_approved_by']).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('400s on a reversal without a reason and approval reference', async () => {
    db.tables['savings_accounts'] = [accountRow()];
    const res = await request(app)
      .post('/api/v1/savings/transactions')
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ accountId: ACCOUNT_ID, type: 'adjustment', amount: '100.00', reversalOf: 'tx-1' });

    expect(res.status).toBe(400);
    expect(db.rpcArgs).toHaveLength(0);
  });
});

describe('POST /api/v1/savings/shares (live router)', () => {
  it('404s when the product is not a share product of the caller’s org and writes nothing', async () => {
    db.tables['savings_products'] = [{ id: PRODUCT_ID, org_id: ORG_B, product_type: 'share', deleted_at: null }];
    const res = await request(app)
      .post('/api/v1/savings/shares')
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ memberId: MEMBER_ID, productId: PRODUCT_ID, shares: 50, paidAmount: '250.00' });

    expect(res.status).toBe(404);
    expect(db.calls).toEqual(['savings_products:select']);
    expect(db.tables['share_allotments']).toHaveLength(0);
  });

  it('records the allotment and computes the paid-up shares from the amount', async () => {
    db.tables['savings_products'] = [{ id: PRODUCT_ID, org_id: ORG_A, product_type: 'share', deleted_at: null }];
    const res = await request(app)
      .post('/api/v1/savings/shares')
      .set('Authorization', `Bearer ${await branchManager()}`)
      .send({ memberId: MEMBER_ID, productId: PRODUCT_ID, shares: 50, paidAmount: '250.00' });

    expect(res.status).toBe(201);
    const row = db.tables['share_allotments']![0]!;
    expect(row['org_id']).toBe(ORG_A);
    expect(row['member_id']).toBe(MEMBER_ID);
    expect(row['shares']).toBe(50);
    expect(row['face_value']).toBe('10.00');
    expect(row['paid_amount']).toBe('250.00');
    expect(row['paid_shares']).toBe(25);
    expect(res.body.allotment.id).toBeTruthy();
  });
});
