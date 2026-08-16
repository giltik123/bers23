import { clamp, immutable, round, stableHash } from './immutable';
import type { DecisionCandidate, DecisionContext, DecisionHistoryFeatures } from './types';

export const FEATURE_SCHEMA_VERSION = 'decision-features-v1';
export const FEATURE_NAMES = immutable(['operation', 'intent', 'goal', 'deviceClass', 'platform', 'projectType', 'privacyMode', 'budget', 'latencyTarget', 'qualityTarget', 'executionTarget', 'model', 'provider', 'runtime', 'estimatedQuality', 'estimatedLatency', 'estimatedCost', 'energy', 'memory', 'reliability', 'modelSuccessRate', 'providerSuccessRate', 'deviceSpecificSuccessRate', 'cloudAvoidance', 'acceptanceRate', 'undoRate'] as const);
const defaults: DecisionHistoryFeatures = { modelSuccessRate: .5, providerSuccessRate: .5, deviceSpecificSuccessRate: .5, cloudAvoidance: .5, acceptanceRate: .5, undoRate: 0 };
export class DecisionFeatureEncoderV1 {
  readonly schemaVersion = FEATURE_SCHEMA_VERSION;
  readonly featureNames = FEATURE_NAMES;
  encode(context: DecisionContext, candidate: DecisionCandidate, history: Partial<DecisionHistoryFeatures> = {}): readonly number[] {
    const h = { ...defaults, ...history };
    const categorical = [context.operation, context.intent, context.goal, context.deviceClass, context.platform, context.projectType, context.privacyMode];
    const candidateCategories = [candidate.executionTarget, candidate.model, candidate.provider, candidate.runtime];
    return immutable([...categorical.map(stableHash), clamp(context.budget / 100), clamp(context.latencyTarget / 60000), clamp(context.qualityTarget), ...candidateCategories.map(stableHash), clamp(candidate.estimatedQuality), clamp(candidate.estimatedLatency / 60000), clamp(candidate.estimatedCost / 100), clamp(candidate.energy / 100), clamp(candidate.memory / 65536), clamp(candidate.reliability), clamp(h.modelSuccessRate), clamp(h.providerSuccessRate), clamp(h.deviceSpecificSuccessRate), clamp(h.cloudAvoidance), clamp(h.acceptanceRate), clamp(h.undoRate)].map(round));
  }
}
