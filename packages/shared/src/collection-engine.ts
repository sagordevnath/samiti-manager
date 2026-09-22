/**
 * ── Payment allocation engine (pure) ─────────────────────────────────────────
 * One implementation shared by the API (authoritative), the collection sheet
 * UI (live feedback) and the DB trigger (defense in depth). Buckets are paid
 * strictly in the configured order; a bucket is fully paid before the next
 * one opens, so the engine always terminates. Never mutates inputs.
 */
import type { AllocationOrder, CollectionAllocation, CollectionSheetRow } from './collection.js';

/** Stable numeric helper: parse BDT money strings with two decimals. */
const num = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const money = (n: number): string => n.toFixed(2);

interface Bucket {
  kind: 'overdue' | 'current' | 'savings' | 'advance';
  installmentId?: string;
  seq?: number;
  remaining: number;
}

/**
 * Allocate `paid` across the row's buckets in `order`.
 * The excess always lands in advance, so `unapplied` is 0.00 for any
 * non-negative payment.
 */
export function allocateCollectionPayment(
  row: Pick<CollectionSheetRow, 'loan' | 'savingsDue' | 'advanceBalance'>,
  paid: { loanPaid: number; savingsPaid: number; extraPaid: number },
  order: AllocationOrder,
): CollectionAllocation {
  const total = Math.max(paid.loanPaid + paid.savingsPaid + paid.extraPaid, 0);

  const buckets: Bucket[] = [];
  for (const o of row.loan?.overdue ?? []) {
    buckets.push({ kind: 'overdue', installmentId: o.installmentId, seq: o.seq, remaining: num(o.amount) });
  }
  if (row.loan?.current) {
    buckets.push({
      kind: 'current',
      installmentId: row.loan.current.installmentId,
      seq: row.loan.current.seq,
      remaining: num(row.loan.current.amount),
    });
  }
  buckets.push({ kind: 'savings', remaining: num(row.savingsDue?.amount ?? '0') });
  buckets.push({ kind: 'advance', remaining: Number.POSITIVE_INFINITY });

  const ordered: Bucket[] =
    order === 'savings_first'
      ? [...buckets.filter((b) => b.kind === 'savings' && b.remaining > 0), ...buckets.filter((b) => b.kind !== 'savings')]
      : order === 'overdue_first'
        ? buckets
        : // proportional: handled below
          buckets;

  const overdueApplied: Array<{ installmentId: string; seq: number; amount: string }> = [];
  let currentApplied: CollectionAllocation['currentApplied'] = null;
  let savingsApplied = 0;
  let advanceApplied = 0;
  let remaining = total;

  const applyTo = (b: Bucket, amount: number) => {
    if (amount <= 0) return;
    b.remaining -= amount;
    if (b.kind === 'overdue') overdueApplied.push({ installmentId: b.installmentId!, seq: b.seq!, amount: money(amount) });
    else if (b.kind === 'current') currentApplied = { installmentId: b.installmentId!, seq: b.seq!, amount: money(amount) };
    else if (b.kind === 'savings') savingsApplied += amount;
    else advanceApplied += amount;
  };

  if (order === 'proportional') {
    // Pro-rata across the *capped* buckets, remainder to advance.
    const capped = buckets.filter((b) => b.kind !== 'advance' && b.remaining > 0);
    const totalOpen = capped.reduce((s, b) => s + b.remaining, 0);
    if (totalOpen <= 0) {
      applyTo(buckets[buckets.length - 1]!, total);
    } else {
      let allocated = 0;
      for (const [i, b] of capped.entries()) {
        const ideal = i === capped.length - 1 ? remaining - allocated : (remaining * b.remaining) / totalOpen;
        const amount = Math.min(ideal, remaining - allocated, b.remaining);
        applyTo(b, amount);
        allocated += amount;
      }
      if (remaining - allocated > 1e-9) applyTo(buckets[buckets.length - 1]!, remaining - allocated);
    }
  } else {
    for (const b of ordered) {
      if (remaining <= 1e-9) break;
      if (b.remaining <= 0) continue;
      const amount = Math.min(b.remaining, remaining);
      applyTo(b, amount);
      remaining -= amount;
    }
    if (remaining > 1e-9) applyTo(buckets[buckets.length - 1]!, remaining);
  }

  return {
    overdueApplied: overdueApplied.filter((o) => num(o.amount) > 0),
    currentApplied:
      currentApplied !== null && num((currentApplied as { amount: string }).amount) > 0 ? currentApplied : null,
    savingsApplied: money(savingsApplied),
    advanceApplied: money(advanceApplied),
    unapplied: '0.00',
  };
}

/** Total due on a row (overdue + current + savings; advance is credit, excluded). */
export function rowTotalDue(row: Pick<CollectionSheetRow, 'loan' | 'savingsDue'>): string {
  const overdue = (row.loan?.overdue ?? []).reduce((s, o) => s + num(o.amount), 0);
  const current = num(row.loan?.current?.amount ?? '0');
  const savings = num(row.savingsDue?.amount ?? '0');
  return money(overdue + current + savings);
}
