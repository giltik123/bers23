import type { ObservabilityOutcome } from '../observability/types';
import { immutable, stableHash } from './immutable';
import { calculateReward } from './reward';
import type { ActualDecisionOutcome, DecisionCandidateV1, DecisionContextV1, DecisionDatasetRecord, DecisionHistoryV1, RewardPolicy } from './types';

export interface DatasetSource { observability: ObservabilityOutcome; context?: Partial<DecisionContextV1>; candidate?: Partial<DecisionCandidateV1>; history?: Partial<DecisionHistoryV1>; timestamp?: number; modelVersion?: string; projectId?: string; deviceId?: string; decision?: string }
const historyDefaults: DecisionHistoryV1 = { modelSuccessRate: .5, providerSuccessRate: .5, deviceSpecificSuccessRate: .5, cloudAvoidance: .5, acceptanceRate: .5, undoRate: 0 };
export class DecisionDatasetBuilder {
  constructor(private readonly rewardPolicy: Partial<RewardPolicy> = {}, private readonly now: () => number = Date.now) {}
  build(sources: readonly DatasetSource[]): readonly DecisionDatasetRecord[] {
    return immutable(sources.map((source, index) => this.record(source, index)).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)));
  }
  fromOutcomes(outcomes: readonly ObservabilityOutcome[], defaults: Omit<DatasetSource, 'observability'> = {}) { return this.build(outcomes.map(observability => ({ ...defaults, observability }))); }
  private record(source: DatasetSource, index: number): DecisionDatasetRecord {
    const item = source.observability;
    const timestamp = source.timestamp ?? this.now();
    const projectId = source.projectId ?? source.context?.projectId ?? 'unknown-project';
    const deviceId = source.deviceId ?? source.context?.deviceId ?? 'unknown-device';
    const target = item.selectedTarget === 'CLOUD' ? 'CLOUD' : 'LOCAL';
    const context: DecisionContextV1 = { operation: item.operation, intent: 'unknown', goal: 'complete-operation', deviceClass: 'unknown', platform: 'unknown', projectType: 'unknown', privacyMode: 'NORMAL', budget: Math.max(item.actualCost, 1), latencyTarget: Math.max(item.actualLatency, 1), qualityTarget: .8, ...source.context, projectId, deviceId, timestamp };
    const candidate: DecisionCandidateV1 = { id: `${item.operation}:${target}`, executionTarget: target, model: 'unknown', provider: target === 'LOCAL' ? 'local' : 'unknown', runtime: 'unknown', estimatedQuality: item.actualQuality, estimatedLatency: item.actualLatency, estimatedCost: item.actualCost, energy: 0, memory: 0, reliability: .5, ...source.candidate };
    const actualOutcome: ActualDecisionOutcome = { quality: item.actualQuality, success: ['SUCCESS', 'ACCEPTED'].includes(item.actualOutcome), accepted: item.userReaction === 'ACCEPTED', latency: item.actualLatency, cost: item.actualCost, escalated: false, undone: item.userReaction === 'UNDO', corrected: item.userReaction === 'CORRECTED' };
    const history = { ...historyDefaults, ...source.history };
    const identity = `${projectId}|${deviceId}|${timestamp}|${candidate.id}|${index}`;
    return { id: `decision-${stableHash(identity).toString(16)}`, features: { context, candidate, history }, context, candidate, decision: source.decision ?? candidate.id, actualOutcome, reward: calculateReward(actualOutcome, context, this.rewardPolicy), timestamp, modelVersion: source.modelVersion ?? 'baseline-v0', projectId, deviceId };
  }
}
