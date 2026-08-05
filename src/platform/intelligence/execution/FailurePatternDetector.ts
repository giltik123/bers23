import type { ExecutionMetricsStore } from './ExecutionMetricsStore';

export interface FailurePattern { readonly provider: string; readonly capability: string; readonly signature: string; readonly occurrences: number; readonly riskIncrease: number; readonly alternativeWorkflow: boolean; }

/** Groups failure metadata into repeatable workflow risk signatures. */
export class FailurePatternDetector {
  constructor(private readonly store: ExecutionMetricsStore) {}
  detect(minimumOccurrences = 3): readonly FailurePattern[] {
    const groups = new Map<string, { provider: string; capability: string; signature: string; occurrences: number }>();
    for (const metric of this.store.getFailures()) {
      const signature = String(metric.metadata.failureSignature ?? metric.metadata.scene ?? metric.metadata.errorCode ?? 'unknown'); const key = `${metric.provider}:${metric.capability}:${signature}`;
      const current = groups.get(key) ?? { provider: metric.provider, capability: metric.capability, signature, occurrences: 0 }; current.occurrences += 1; groups.set(key, current);
    }
    return Object.freeze([...groups.values()].filter((group) => group.occurrences >= minimumOccurrences).map((group) => Object.freeze({ ...group, riskIncrease: Math.min(1, group.occurrences / 10), alternativeWorkflow: true })));
  }
}
