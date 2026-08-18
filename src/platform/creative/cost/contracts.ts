import { immutable, type ExecutionTarget } from '../operations/contracts';

export type Money = Readonly<{ amount: number; currency: string }>;
export type BudgetMode = 'HARD' | 'SOFT' | 'UNLIMITED';
export type CostPolicy = Readonly<{ maxCredits: number; maxProviderCost: number; allowFallback: boolean; allowRetry: boolean; allowEscalation: boolean; budgetMode: BudgetMode }>;
export type CostEstimate = Readonly<{
  estimatedCredits: number; estimatedProviderCost: Money; estimatedDeviceCost: number;
  estimatedEnergyCost: number; estimatedLatency: number; estimatedRetries: number;
  estimatedFallbackCost: Money; worstCaseCredits: number;
}>;
export type ProviderCostReport = Readonly<{
  provider: string; model: string; actualProviderCost: number; providerCurrency: string;
  providerExecutionId: string; usage: Readonly<Record<string, number>>;
}>;
export type ActualCost = Readonly<{
  actualProviderCost: Money; actualCreditsBasis: number; actualLatency: number;
  actualRetries: number; actualFallbacks: number; actualDeviceCost: number; actualEnergyEstimate: number;
}>;
export type RetryCost = Readonly<{ attemptId: string; retryReason: string; estimatedCost: CostEstimate; actualCost?: ActualCost; billable: boolean }>;
export type OperationCostNode = Readonly<{ nodeId: string; target: ExecutionTarget; providerCost: Money; deviceCost: number; billableCredits: number; preserved?: boolean }>;
export type OperationCostBreakdown = Readonly<{ nodes: readonly OperationCostNode[]; providerTotals: Readonly<Record<string, number>>; totalDeviceCost: number; totalBillableCredits: number }>;

const finite = (value: number, field: string) => { if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative finite number`); };

export class CreativeCostAuthority {
  estimate(input: Readonly<{ target: ExecutionTarget; billable: boolean; credits: number; providerCost?: Money; deviceCost?: number; energyCost?: number; latency?: number; retries?: number; fallbackCost?: Money; worstCaseCredits?: number }>): CostEstimate {
    [input.credits, input.deviceCost ?? 0, input.energyCost ?? 0, input.latency ?? 0, input.retries ?? 0].forEach((v, i) => finite(v, `estimate[${i}]`));
    const credits = input.target === 'LOCAL' || !input.billable ? 0 : input.credits;
    const provider = input.target === 'LOCAL' ? { amount: 0, currency: input.providerCost?.currency ?? 'USD' } : (input.providerCost ?? { amount: 0, currency: 'USD' });
    finite(provider.amount, 'estimatedProviderCost');
    const worst = input.worstCaseCredits ?? credits;
    finite(worst, 'worstCaseCredits');
    if (worst < credits) throw new Error('worstCaseCredits cannot be lower than estimatedCredits');
    return immutable({ estimatedCredits: credits, estimatedProviderCost: provider, estimatedDeviceCost: input.deviceCost ?? 0, estimatedEnergyCost: input.energyCost ?? 0, estimatedLatency: input.latency ?? 0, estimatedRetries: input.retries ?? 0, estimatedFallbackCost: input.fallbackCost ?? { amount: 0, currency: provider.currency }, worstCaseCredits: worst });
  }

  preflight(estimate: CostEstimate, policy: CostPolicy): Readonly<{ allowed: boolean; reason: string; budgetStatus: 'ALLOWED' | 'DENIED' | 'WARNING' }> {
    if (policy.budgetMode === 'UNLIMITED') return immutable({ allowed: true, reason: 'Unlimited budget policy', budgetStatus: 'ALLOWED' as const });
    const over = estimate.worstCaseCredits > policy.maxCredits || estimate.estimatedProviderCost.amount + estimate.estimatedFallbackCost.amount > policy.maxProviderCost;
    if (!over) return immutable({ allowed: true, reason: 'Worst-case cost is within budget', budgetStatus: 'ALLOWED' as const });
    return policy.budgetMode === 'SOFT'
      ? immutable({ allowed: true, reason: 'Cost exceeds soft budget', budgetStatus: 'WARNING' as const })
      : immutable({ allowed: false, reason: 'Cost exceeds hard budget', budgetStatus: 'DENIED' as const });
  }

  fromProvider(report: ProviderCostReport, input: Readonly<{ creditsBasis: number; latency: number; retries?: number; fallbacks?: number }>): ActualCost {
    finite(report.actualProviderCost, 'actualProviderCost');
    return immutable({ actualProviderCost: { amount: report.actualProviderCost, currency: report.providerCurrency }, actualCreditsBasis: input.creditsBasis, actualLatency: input.latency, actualRetries: input.retries ?? 0, actualFallbacks: input.fallbacks ?? 0, actualDeviceCost: 0, actualEnergyEstimate: 0 });
  }

  local(input: Readonly<{ latency: number; deviceCost?: number; energyEstimate?: number }>): ActualCost {
    return immutable({ actualProviderCost: { amount: 0, currency: 'USD' }, actualCreditsBasis: 0, actualLatency: input.latency, actualRetries: 0, actualFallbacks: 0, actualDeviceCost: input.deviceCost ?? 0, actualEnergyEstimate: input.energyEstimate ?? 0 });
  }

  aggregate(nodes: readonly OperationCostNode[]): OperationCostBreakdown {
    const providerTotals: Record<string, number> = {};
    for (const node of nodes) providerTotals[node.providerCost.currency] = (providerTotals[node.providerCost.currency] ?? 0) + node.providerCost.amount;
    return immutable({ nodes: [...nodes], providerTotals, totalDeviceCost: nodes.reduce((n, x) => n + x.deviceCost, 0), totalBillableCredits: nodes.reduce((n, x) => n + x.billableCredits, 0) });
  }

  incremental(nodes: readonly OperationCostNode[]): OperationCostBreakdown { return this.aggregate(nodes.filter((node) => !node.preserved)); }
}
