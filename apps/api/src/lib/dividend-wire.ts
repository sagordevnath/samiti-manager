/**
 * ── Dividend preview wire shape ─────────────────────────────────────────────
 * `previewDividend` (shared) computes pool/retained/per-member amounts from
 * bare member ids. The Shares page renders member names plus a "total paid
 * shares" and "unclaimed reserve" figure, so the API response is normalized
 * here — once, for both the demo and the live router, so preview and production
 * modes can never drift apart.
 */
import { previewDividend } from '@samity/shared';

export interface DividendPreviewWire {
  totalPaidShares: number;
  dividendPool: string;
  /** Unallocated surplus kept in reserve (labelled অদাবীকৃত সঞ্চিত in the UI). */
  unclaimedReserve: string;
  /** Alias kept so older clients that read `retained` keep working. */
  retained: string;
  perMember: Array<{ memberId: string; memberName: string; paidShares: number; amount: string }>;
}

export function dividendPreviewWire(
  preview: { dividendPool: string; retained: string; perMember: Array<{ memberId: string; paidShares: number; amount: string }> },
  nameOf: (memberId: string) => string,
): DividendPreviewWire {
  return {
    totalPaidShares: preview.perMember.reduce((s, m) => s + m.paidShares, 0),
    dividendPool: preview.dividendPool,
    unclaimedReserve: preview.retained,
    retained: preview.retained,
    perMember: preview.perMember.map((m) => ({ ...m, memberName: nameOf(m.memberId) })),
  };
}

/** Convenience wrapper when the caller already has the member roll-up. */
export function dividendPreviewFromMembers(
  perMember: Array<{ memberId: string; memberName: string; paidShares: number }>,
  surplus: string,
  payoutRate: number,
  faceValue: string,
): DividendPreviewWire {
  return dividendPreviewWire(
    previewDividend(perMember, { surplus, payoutRate, faceValue }),
    (id) => perMember.find((m) => m.memberId === id)?.memberName ?? id.slice(0, 8),
  );
}
