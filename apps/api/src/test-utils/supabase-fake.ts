/**
 * ── Shared mocked-Supabase engine for live-router tests ─────────────────────
 * The live routers run against `supabaseAdmin` (service-role PostgREST). The
 * live-router test files replace that module with this small fake so a handler
 * can be driven end-to-end over HTTP, its statements observed, and its writes
 * asserted — none of which the demo/store tests can do.
 *
 * State lives in the calling test file (via `vi.hoisted`) so the module mock
 * and the assertions share one object:
 *
 *   const db = vi.hoisted(() => ({ tables: {}, calls: [], nextId: 1, rpcArgs: [] }));
 *   vi.mock('./lib/supabase.js', async () => {
 *     const { supabaseFake } = await import('./test-utils/supabase-fake.js');
 *     return supabaseFake(db);
 *   });
 *
 * Rows are plain objects; `tables` is keyed by table name. `calls` records
 * every statement as `${table}:${op}` (`:count` for head-count reads) in
 * execution order, which is how the ordering-sensitive tests pin behaviour.
 */

export type FakeRow = Record<string, unknown>;

export interface SupabaseFakeState {
  tables: Record<string, FakeRow[]>;
  calls: string[];
  nextId: number;
  rpcArgs: Array<Record<string, unknown>>;
  /** Optional per-test RPC responder; defaults to a "not mocked" error. */
  rpcResult?: (name: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown };
}

interface Filter {
  column: string;
  value: unknown;
}

interface InFilter {
  column: string;
  values: unknown[];
}

/** Rows for a table, created lazily so inserts need no seeding. */
function rowsOf(state: SupabaseFakeState, name: string): FakeRow[] {
  state.tables[name] ??= [];
  return state.tables[name]!;
}

/**
 * Pick the requested columns ('' / '*' means the whole row). PostgREST column
 * lists may embed FKs (`branches(code, name)`); the fake carries the embed as a
 * nested object on the row, so the projection keeps the base name and drops
 * the parenthesised column list.
 */
function project(rows: FakeRow[], columns: string): FakeRow[] {
  if (!columns || columns === '*') return rows;
  const keys = columns
    .split(',')
    .map((c) => c.trim().split('(')[0]!.replace(/!.*$/, '').replace(/\)+$/, ''))
    .filter(Boolean);
  return rows.map((row) => Object.fromEntries(keys.map((k) => [k, row[k]])));
}

export function supabaseFake(state: SupabaseFakeState) {
  function query(name: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
    let selectRequested = false;
    let columns = '*';
    let head = false;
    let limit: number | null = null;
    let patch: FakeRow = {};
    let inserted: FakeRow | FakeRow[] | null = null;
    let upsertConflict = 'id';
    const filters: Filter[] = [];
    const inFilters: InFilter[] = [];
    const neqFilters: Filter[] = [];
    const nullColumns: string[] = [];

    const matches = (row: FakeRow): boolean =>
      filters.every((f) => row[f.column] === f.value) &&
      inFilters.every((f) => f.values.includes(row[f.column])) &&
      neqFilters.every((f) => row[f.column] !== f.value) &&
      nullColumns.every((c) => row[c] === null || row[c] === undefined);

    const matched = () => rowsOf(state, name).filter(matches);

    async function complete(): Promise<{ data: unknown; error: unknown; count?: number }> {
      state.calls.push(`${name}:${op}${head ? ':count' : ''}`);
      if (op === 'select') {
        const rows = matched();
        const limited = limit === null ? rows : rows.slice(0, limit);
        if (head) return { data: null, count: rows.length, error: null };
        return { data: project(limited, columns), error: null, count: rows.length };
      }
      if (op === 'insert' || op === 'upsert') {
        const incoming = Array.isArray(inserted) ? inserted : [inserted ?? {}];
        const written: FakeRow[] = [];
        for (const raw of incoming) {
          const conflictCols = upsertConflict.split(',').map((c) => c.trim());
          const existing =
            op === 'upsert'
              ? rowsOf(state, name).find((row) => conflictCols.every((c) => row[c] === raw[c] && raw[c] !== undefined))
              : undefined;
          if (existing) {
            Object.assign(existing, raw);
            written.push(existing);
          } else {
            const row = { id: `gen-${state.nextId++}`, ...raw };
            rowsOf(state, name).push(row);
            written.push(row);
          }
        }
        return { data: selectRequested || op === 'insert' ? project(written, columns) : null, error: null };
      }
      const doomed = matched();
      if (op === 'delete') {
        const doomedSet = new Set(doomed);
        state.tables[name] = rowsOf(state, name).filter((row) => !doomedSet.has(row));
        return { data: selectRequested ? project(doomed, columns) : null, error: null };
      }
      for (const row of doomed) Object.assign(row, patch);
      return { data: selectRequested ? project(doomed, columns) : null, error: null };
    }

    const take = async (exactlyOne: boolean) => {
      const result = await complete();
      const rows = (result.data ?? []) as FakeRow[];
      if (exactlyOne && rows.length !== 1) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
      }
      if (exactlyOne) return { data: rows[0] ?? null, error: null, count: result.count };
      return { data: rows[0] ?? null, error: null, count: result.count };
    };

    const q: Record<string, unknown> = {};
    Object.assign(q, {
      select: (cols?: string, opts?: { count?: string; head?: boolean }) => {
        selectRequested = true;
        columns = cols ?? '*';
        head = Boolean(opts?.head);
        return q;
      },
      insert: (values: FakeRow | FakeRow[]) => {
        op = 'insert';
        inserted = values;
        return q;
      },
      upsert: (values: FakeRow | FakeRow[], opts?: { onConflict?: string }) => {
        op = 'upsert';
        inserted = values;
        upsertConflict = opts?.onConflict ?? 'id';
        return q;
      },
      update: (values: FakeRow) => {
        op = 'update';
        patch = values;
        return q;
      },
      delete: () => {
        op = 'delete';
        return q;
      },
      eq: (column: string, value: unknown) => {
        filters.push({ column, value });
        return q;
      },
      neq: (column: string, value: unknown) => {
        neqFilters.push({ column, value });
        return q;
      },
      is: (column: string, value: unknown) => {
        if (value === null) nullColumns.push(column);
        else filters.push({ column, value });
        return q;
      },
      in: (column: string, values: unknown[]) => {
        inFilters.push({ column, values });
        return q;
      },
      not: () => q,
      or: () => q,
      and: () => q,
      match: (obj: FakeRow) => {
        for (const [column, value] of Object.entries(obj)) filters.push({ column, value });
        return q;
      },
      filter: () => q,
      gt: () => q,
      gte: () => q,
      lt: () => q,
      lte: () => q,
      like: () => q,
      ilike: () => q,
      contains: () => q,
      overlaps: () => q,
      order: () => q,
      limit: (n: number) => {
        limit = n;
        return q;
      },
      range: () => q,
      returns: () => q,
      single: () => take(true),
      maybeSingle: () => take(false),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => complete().then(resolve, reject),
      catch: (reject: (e: unknown) => unknown) => complete().catch(reject),
      finally: (fn: () => void) => complete().finally(fn),
    });
    return q;
  }

  return {
    supabaseAdmin: {
      from: (table: string) => query(table),
      rpc: async (name: string, args: Record<string, unknown>) => {
        state.calls.push(`rpc:${name}`);
        state.rpcArgs.push(args);
        return state.rpcResult?.(name, args) ?? { data: null, error: { message: `unexpected rpc: ${name}` } };
      },
    },
  };
}
