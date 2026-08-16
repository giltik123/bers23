import { clamp, immutable, stableHash } from './immutable';
import type { DecisionFeaturesV1 } from './types';

export const FEATURE_SCHEMA_VERSION = 'decision-features-v1';
export const FEATURE_NAMES_V1 = Object.freeze(['operation', 'intent', 'goal', 'deviceClass', 'platform', 'projectType', 'privacyMode', 'budget', 'latencyTarget', 'qualityTarget', 'executionTarget', 'model', 'provider', 'runtime', 'estimatedQuality', 'estimatedLatency', 'estimatedCost', 'energy', 'memory', 'reliability', 'modelSuccessRate', 'providerSuccessRate', 'deviceSpecificSuccessRate', 'cloudAvoidance', 'acceptanceRate', 'undoRate'] as const);
const categorical = (value: string) => stableHash(value.trim().toLowerCase()) / 0xffffffff;
export class DecisionFeatureEncoderV1 {
  readonly schemaVersion = FEATURE_SCHEMA_VERSION;
  readonly featureNames = FEATURE_NAMES_V1;
  encode(input: DecisionFeaturesV1): readonly number[] {
    const { context, candidate, history } = input;
    return immutable([
      categorical(context.operation), categorical(context.intent), categorical(context.goal), categorical(context.deviceClass), categorical(context.platform), categorical(context.projectType), categorical(context.privacyMode),
      clamp(context.budget / 100), clamp(context.latencyTarget / 60_000), clamp(context.qualityTarget),
      categorical(candidate.executionTarget), categorical(candidate.model), categorical(candidate.provider), categorical(candidate.runtime), clamp(candidate.estimatedQuality), clamp(candidate.estimatedLatency / 60_000), clamp(candidate.estimatedCost / 100), clamp(candidate.energy / 10), clamp(candidate.memory / 32_768), clamp(candidate.reliability),
      clamp(history.modelSuccessRate), clamp(history.providerSuccessRate), clamp(history.deviceSpecificSuccessRate), clamp(history.cloudAvoidance), clamp(history.acceptanceRate), clamp(history.undoRate),
    ]);
  }
}
