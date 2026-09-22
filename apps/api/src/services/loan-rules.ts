/**
 * ── Loan governance service ──────────────────────────────────────────────────
 * The single place where approval-matrix resolution, cycle policy, eligibility
 * gates, overlap aggregation and utilization reports are computed. Both the
 * demo and Supabase routers call these functions with data fetched from their
 * respective stores, so the business rules exist exactly once.
 */
import {
  buildUtilizationReport,
  evaluateLoanEligibility,
  resolveApproval,
  summarizeCycle,
  type ApprovalMatrixRow,
  type LoanCycleCheckResult,
  type LoanCyclePolicy,
  type LoanCycleSummary,
  type OverlapReport,
  type OverdueInstallment,
  type UtilizationPlanInput,
  type UtilizationReport,
} from '@samity/shared';

export interface LoanFacts {
  overdueInstallments: OverdueInstallment[];
  activeMonthlyInstallments: string;
  monthlyIncome: string;
  totalActiveLoanBalance: string;
  savingsBalance: string;
  activeLoanCount: number;
  completedCycles: Array<{ closedOnTime: boolean }>;
}

/** Cycle summary from completed-closure history (replaces the demo heuristic). */
export function cycleSummaryFor(policy: LoanCyclePolicy, facts: LoanFacts): LoanCycleSummary {
  return summarizeCycle(
    policy,
    facts.completedCycles.map((c) => ({ status: 'closed' as const, closedOnTime: c.closedOnTime })),
  );
}

export function checkEligibility(
  input: { amount: string; policy: LoanCyclePolicy; facts: LoanFacts },
  cycle?: LoanCycleSummary,
): LoanCycleCheckResult {
  const summary = cycle ?? cycleSummaryFor(input.policy, input.facts);
  return evaluateLoanEligibility({
    amount: input.amount,
    policy: input.policy,
    cycle: summary,
    overdueInstallments: input.facts.overdueInstallments,
    activeMonthlyInstallments: input.facts.activeMonthlyInstallments,
    monthlyIncome: input.facts.monthlyIncome,
    totalActiveLoanBalance: input.facts.totalActiveLoanBalance,
    savingsBalance: input.facts.savingsBalance,
    activeLoanCount: input.facts.activeLoanCount,
  });
}

export { buildUtilizationReport, resolveApproval, summarizeCycle };

/** Overlap aggregation shared by demo + Supabase paths. */
export function buildOverlapReport(
  memberId: string,
  loans: Array<{
    applicationId: string;
    applicationNumber: string;
    productId: string | null;
    productName: string | null;
    status: string;
    outstanding: string;
    monthlyInstallment: string | null;
    branchId: string | null;
  }>,
  limit: number,
): OverlapReport {
  const active = loans.filter((l) => ['approved', 'disbursed', 'officer_review', 'bm_review', 'am_review'].includes(l.status));
  const totalOutstanding = active.reduce((s, l) => s + Number(l.outstanding), 0);
  const totalMonthly = active.reduce((s, l) => s + Number(l.monthlyInstallment ?? 0), 0);
  return {
    memberId,
    totalActive: active.length,
    totalOutstanding: totalOutstanding.toFixed(2),
    totalMonthlyInstallments: totalMonthly.toFixed(2),
    loans: active,
    exceedsLimit: active.length > limit,
    limit,
  };
}

/** Utilization plan invariant: item amounts must be positive decimals. */
export function validateUtilizationPlan(plan: UtilizationPlanInput): void {
  for (const item of plan.items) {
    if (!(Number(item.amount) > 0)) {
      throw new Error(`Utilization item "${item.category}" needs a positive amount`);
    }
  }
}
