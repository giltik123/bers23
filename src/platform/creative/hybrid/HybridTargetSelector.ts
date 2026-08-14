import { immutableClone } from './immutable';
import type { ExecutionCandidate, HybridPolicy, HybridTarget } from './types';
export type TargetSelection = Readonly<{ target: HybridTarget; candidate: ExecutionCandidate | null; fallback: readonly ExecutionCandidate[]; utility: number; reason: string }>;
export class HybridTargetSelector {
  select(candidates: readonly ExecutionCandidate[], policy: HybridPolicy): TargetSelection {
    const eligible = candidates.filter((candidate) => this.#eligible(candidate, policy)).map((candidate) => ({ candidate, utility: this.utility(candidate, policy) })).filter(({ candidate }) => candidate.metrics.quality >= policy.qualityRequirement).sort((a, b) => b.utility - a.utility || order(a.candidate.target) - order(b.candidate.target) || key(a.candidate).localeCompare(key(b.candidate)));
    const best = eligible[0]; if (!best) return immutableClone({ target: 'BLOCKED', candidate: null, fallback: [], utility: -Infinity, reason: 'No policy-compliant candidate meets required quality' });
    return immutableClone({ target: best.candidate.target, candidate: best.candidate, fallback: eligible.slice(1).map((item) => item.candidate), utility: best.utility, reason: `${best.candidate.target} maximizes quality, cost, latency, privacy, energy, and reliability utility` });
  }
  utility(candidate: ExecutionCandidate, policy: HybridPolicy): number { const m = candidate.metrics; return m.quality * 100 + m.reliability * policy.reliabilityWeight * 20 + m.providerHealth * 10 - m.monetaryCost * 10 - m.deviceCost * 5 - m.energyCost * policy.energyWeight * 10 - m.latencyMs / Math.max(1, policy.latencyWeight * 100) - m.privacyExposure * policy.privacyWeight * 20 - m.deviceLoad * 5; }
  #eligible(candidate: ExecutionCandidate, policy: HybridPolicy): boolean { if (policy.mode === 'LOCAL_ONLY' && candidate.target !== 'LOCAL') return false; if (policy.mode === 'CLOUD_ONLY' && candidate.target !== 'CLOUD') return false; if ((candidate.target === 'CLOUD' || candidate.target === 'HYBRID') && (!policy.cloudAllowed || candidate.providerAvailable === false || candidate.metrics.monetaryCost > policy.creditBudget)) return false; return candidate.target !== 'LOCAL' || candidate.trustedModel !== false; }
}
const order = (target: ExecutionCandidate['target']) => target === 'LOCAL' ? 0 : target === 'HYBRID' ? 1 : 2;
const key = (candidate: ExecutionCandidate) => `${candidate.localModel ?? ''}:${candidate.cloudProvider ?? ''}`;
