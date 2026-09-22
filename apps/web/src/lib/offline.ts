/**
 * ── Offline layer for the collection sheets (requirement 2) ─────────────────
 * Today's sheets are cached in IndexedDB; entries captured offline are queued
 * in an outbox with client-generated idempotency keys (uuid v4) so a retry
 * can never post twice. When online, the outbox flushes to
 * POST /collection/sync, which replies per-item: posted | duplicate | failed.
 * `duplicate` ⇒ remove from the queue (already stored server-side);
 * `failed` ⇒ keep queued for the next attempt (e.g. member unknown yet).
 */
import type { CollectionSheet } from '@samity/shared';
import { api } from './api';

const DB_NAME = 'samity-offline';
const DB_VERSION = 1;
const SHEETS = 'sheets'; // key: `${branchId}::${meetingDate}`
const OUTBOX = 'outbox'; // key: idempotencyKey

export interface OutboxEntry {
  idempotencyKey: string;
  memberId: string;
  meetingDate: string;
  loanPaid: string;
  savingsPaid: string;
  extraPaid: string;
  note?: string;
  capturedAt: string;
  /** Local display state before sync confirms. */
  status: 'queued' | 'posted' | 'failed';
  error?: string;
  receiptNo?: string;
  memberName?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SHEETS)) db.createObjectStore(SHEETS);
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'idempotencyKey' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// ── Sheet cache ─────────────────────────────────────────────────────────────
export async function cacheSheet(branchId: string, meetingDate: string, sheet: CollectionSheet): Promise<void> {
  await withStore(SHEETS, 'readwrite', (s) => s.put(sheet, `${branchId}::${meetingDate}`));
}

export async function readCachedSheet(branchId: string, meetingDate: string): Promise<CollectionSheet | null> {
  const v = await withStore<CollectionSheet | undefined>(SHEETS, 'readonly', (s) => s.get(`${branchId}::${meetingDate}`));
  return v ?? null;
}

export async function cachedSheetKeys(): Promise<string[]> {
  const keys = await withStore<IDBValidKey[]>(SHEETS, 'readonly', (s) => s.getAllKeys());
  return keys.map(String);
}

// ── Outbox ──────────────────────────────────────────────────────────────────
export async function queueEntry(entry: OutboxEntry): Promise<void> {
  await withStore(OUTBOX, 'readwrite', (s) => s.put(entry));
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const all = await withStore<OutboxEntry[]>(OUTBOX, 'readonly', (s) => s.getAll());
  return all.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export async function getOutboxEntry(idempotencyKey: string): Promise<OutboxEntry | null> {
  const v = await withStore<OutboxEntry | undefined>(OUTBOX, 'readonly', (s) => s.get(idempotencyKey));
  return v ?? null;
}

export async function updateOutboxEntry(entry: OutboxEntry): Promise<void> {
  await withStore(OUTBOX, 'readwrite', (s) => s.put(entry));
}

export async function dropOutboxEntry(idempotencyKey: string): Promise<void> {
  await withStore(OUTBOX, 'readwrite', (s) => s.delete(idempotencyKey));
}

export async function clearPostedOutbox(): Promise<void> {
  const all = await listOutbox();
  await Promise.all(all.filter((e) => e.status === 'posted').map((e) => dropOutboxEntry(e.idempotencyKey)));
}

// ── Sync engine ─────────────────────────────────────────────────────────────
export interface SyncOutcome {
  posted: number;
  duplicates: number;
  failed: number;
}

/** Flush the outbox (only `queued` items) to /collection/sync. */
export async function syncOutbox(): Promise<SyncOutcome> {
  const queued = (await listOutbox()).filter((e) => e.status === 'queued');
  if (queued.length === 0) return { posted: 0, duplicates: 0, failed: 0 };

  const outcome: SyncOutcome = { posted: 0, duplicates: 0, failed: 0 };
  // Small batches keep requests light on low-end connections.
  for (let i = 0; i < queued.length; i += 50) {
    const batch = queued.slice(i, i + 50);
    try {
      const res = await api.post<{
        results: Array<{ idempotencyKey: string; status: 'posted' | 'duplicate' | 'failed'; receiptNo?: string; error?: string }>;
        posted: number;
        duplicates: number;
        failed: number;
      }>('/collection/sync', {
        entries: batch.map((e) => ({
          idempotencyKey: e.idempotencyKey,
          memberId: e.memberId,
          meetingDate: e.meetingDate,
          loanPaid: e.loanPaid,
          savingsPaid: e.savingsPaid,
          extraPaid: e.extraPaid,
          note: e.note,
          capturedAt: e.capturedAt,
        })),
      });
      for (const r of res.results) {
        const local = batch.find((b) => b.idempotencyKey === r.idempotencyKey);
        if (!local) continue;
        if (r.status === 'failed') {
          local.status = 'failed';
          local.error = r.error;
          await updateOutboxEntry(local);
        } else {
          // posted & duplicate both mean the server holds the entry exactly once.
          local.status = 'posted';
          local.receiptNo = r.receiptNo;
          await updateOutboxEntry(local);
        }
      }
      outcome.posted += res.posted;
      outcome.duplicates += res.duplicates;
      outcome.failed += res.failed;
    } catch {
      // Network error: keep everything queued for the next flush.
      outcome.failed += batch.length;
    }
  }
  return outcome;
}
