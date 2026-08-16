import { clamp, immutable, mean } from './immutable';
import type { DecisionFeaturesV1, DecisionRepresentationV2, HistoricalOutcomeV2 } from './types';

const hash = (value: string, slots = 4) => { const output = Array(slots).fill(0); let state = 2166136261; for (const char of value) state = Math.imul(state ^ char.charCodeAt(0), 16777619); output[Math.abs(state) % slots] = 1; return output; };
const bounded = (value: number, scale = 1) => clamp(value / Math.max(scale, 1));
const relevant = (features: DecisionFeaturesV1, limit: number): readonly HistoricalOutcomeV2[] => [...(features.recentOutcomes ?? [])].filter(item => item.operation === features.context.operation || item.deviceClass === features.context.deviceClass).sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);

export class ContextEncoder { encode(input: DecisionFeaturesV1) { return [...hash(input.context.intent), ...hash(input.context.operation), Number(input.candidate.executionTarget === 'LOCAL')]; } }
export class CandidateEncoder { encode(input: DecisionFeaturesV1) { const c = input.candidate; return [...hash(c.model), ...hash(c.provider), bounded(c.estimatedQuality), bounded(c.estimatedLatency, 60_000), bounded(c.estimatedCost, Math.max(input.context.budget, 1)), bounded(c.reliability)]; } }
export class HistoryEncoder { constructor(readonly sequenceLength = 8) {} encode(input: DecisionFeaturesV1) { const sequence = relevant(input, this.sequenceLength), fallback = input.history; return [bounded(fallback.modelSuccessRate), bounded(fallback.providerSuccessRate), bounded(fallback.acceptanceRate), bounded(fallback.undoRate), bounded(mean(sequence.map(item => item.quality))), bounded(mean(sequence.map(item => Number(item.accepted)))), bounded(sequence.length, this.sequenceLength)]; } }
export class DeviceEncoder { encode(input: DecisionFeaturesV1) { return [...hash(input.context.deviceClass), ...hash(input.context.platform), bounded(input.history.deviceSpecificSuccessRate)]; } }
export class GoalEncoder { encode(input: DecisionFeaturesV1) { return [...hash(input.context.goal), bounded(input.context.qualityTarget), bounded(input.context.latencyTarget, 60_000)]; } }
export class ConstraintEncoder { encode(input: DecisionFeaturesV1) { return [Number(input.context.privacyMode === 'LOCAL_ONLY'), Number(input.context.privacyMode === 'OFFLINE_ONLY'), bounded(input.context.budget, 100), Number(input.candidate.outboundDataAllowed !== false)]; } }

export class DecisionRepresentationEncoderV2 {
  readonly schemaVersion = 'decision-representation-v2.1';
  constructor(readonly sequenceLength = 8, private readonly encoders = { context: new ContextEncoder(), candidate: new CandidateEncoder(), history: new HistoryEncoder(sequenceLength), device: new DeviceEncoder(), goal: new GoalEncoder(), constraint: new ConstraintEncoder() }) {}
  encode(input: DecisionFeaturesV1): DecisionRepresentationV2 {
    const preference = [input.preferenceSignals?.modelAffinity ?? .5, input.preferenceSignals?.providerAffinity ?? .5, input.preferenceSignals?.localPreference ?? .5, input.preferenceSignals?.styleAlignment ?? .5].map(value => clamp(value));
    const blocks = { context: this.encoders.context.encode(input), candidate: this.encoders.candidate.encode(input), history: this.encoders.history.encode(input), device: this.encoders.device.encode(input), goal: this.encoders.goal.encode(input), constraint: this.encoders.constraint.encode(input), preference };
    const interactions = [Number(input.candidate.executionTarget === 'LOCAL') * input.history.deviceSpecificSuccessRate, input.candidate.estimatedQuality * input.context.qualityTarget, bounded(input.candidate.estimatedCost, Math.max(input.context.budget, 1)) * input.context.qualityTarget, Number(input.context.privacyMode !== 'NORMAL') * Number(input.candidate.executionTarget !== 'LOCAL'), bounded(input.candidate.estimatedLatency, input.context.latencyTarget) * bounded(input.candidate.memory, 8192)];
    const recent = relevant(input, this.sequenceLength), coldStart: DecisionRepresentationV2['coldStart'][number][] = [];
    if (!recent.some(x => x.deviceClass === input.context.deviceClass)) coldStart.push('NEW_DEVICE'); if (!recent.some(x => x.operation === input.context.operation)) coldStart.push('NEW_OPERATION'); if (!recent.some(x => x.model === input.candidate.model)) coldStart.push('NEW_MODEL'); if (!recent.some(x => x.provider === input.candidate.provider)) coldStart.push('NEW_PROVIDER');
    const fused = [...Object.values(blocks).flat(), ...interactions].map(value => Number(clamp(value).toFixed(8))), coverage = clamp(recent.length / this.sequenceLength);
    return immutable({ schemaVersion: this.schemaVersion, blocks, interactions, fused, coverage, coldStart });
  }
}
