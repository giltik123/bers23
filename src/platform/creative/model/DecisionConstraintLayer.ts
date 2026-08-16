import { immutable } from './immutable';
import type { ConstraintPolicy, DecisionCandidateV1, DecisionContextV1 } from './types';
export class DecisionConstraintLayer {
  evaluate(context: DecisionContextV1, candidate: DecisionCandidateV1, overrides: Partial<ConstraintPolicy> = {}) {
    const policy: ConstraintPolicy = { budget: context.budget, privacyMode: context.privacyMode, cloudAllowed: true, ...overrides };
    const exclusions: string[] = [];
    const cloud = candidate.executionTarget === 'CLOUD' || candidate.executionTarget === 'HYBRID';
    if (cloud && ['LOCAL_ONLY', 'OFFLINE_ONLY'].includes(policy.privacyMode)) exclusions.push('PRIVACY_LOCAL_ONLY');
    if (cloud && !policy.cloudAllowed) exclusions.push('CLOUD_DISABLED');
    if (cloud && candidate.outboundDataAllowed === false) exclusions.push('OUTBOUND_DATA_FORBIDDEN');
    if (candidate.quarantined) exclusions.push('MODEL_QUARANTINED');
    if (candidate.trusted === false) exclusions.push('MODEL_UNTRUSTED');
    if (candidate.runtimeSupported === false || (policy.allowedRuntimes && !policy.allowedRuntimes.includes(candidate.runtime))) exclusions.push('RUNTIME_UNSUPPORTED');
    if (policy.allowedProviders && !policy.allowedProviders.includes(candidate.provider)) exclusions.push('PROVIDER_FORBIDDEN');
    if (candidate.estimatedCost > policy.budget) exclusions.push('BUDGET_EXCEEDED');
    return immutable({ allowed: exclusions.length === 0, exclusions });
  }
}
