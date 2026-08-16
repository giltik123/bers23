import { immutable, mean } from './immutable';
import type { DecisionFeaturesV2, DecisionRepresentationV2, HistoricalOutcomeV2 } from './types';

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const hash = (value: string) => { let h = 2166136261; for (const char of value) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
const categorical = (...values: string[]) => values.map((value, index) => hash(`${index}:${value}`));

export interface RepresentationBlockEncoder { encode(features: DecisionFeaturesV2): readonly number[] }
export class ContextEncoder implements RepresentationBlockEncoder { encode({ context }: DecisionFeaturesV2) { return categorical(context.intent, context.operation, context.projectType, context.platform); } }
export class CandidateEncoder implements RepresentationBlockEncoder { encode({ candidate }: DecisionFeaturesV2) { return immutable([...categorical(candidate.id, candidate.executionTarget, candidate.model, candidate.provider, candidate.runtime), clamp(candidate.estimatedQuality), clamp(candidate.reliability), clamp(candidate.estimatedCost / 100), clamp(candidate.estimatedLatency / 60_000)]); } }
export class DeviceEncoder implements RepresentationBlockEncoder { encode({ context }: DecisionFeaturesV2) { return categorical(context.deviceClass, context.deviceId ?? 'unknown-device', context.platform); } }
export class GoalEncoder implements RepresentationBlockEncoder { encode(features: DecisionFeaturesV2) { return immutable([...categorical(features.context.goal, ...(features.goals ?? [])), clamp(features.context.qualityTarget)]); } }
export class ConstraintEncoder implements RepresentationBlockEncoder { encode(features: DecisionFeaturesV2) { return immutable([...categorical(features.context.privacyMode, ...(features.constraints ?? [])), clamp(features.context.budget / 100), clamp(features.context.latencyTarget / 60_000)]); } }
export class HistoryEncoder implements RepresentationBlockEncoder {
  constructor(private readonly limit = 8) {}
  encode(features: DecisionFeaturesV2) { const relevant = [...(features.recentOutcomes ?? [])].filter(item => item.operation === features.context.operation || item.deviceClass === features.context.deviceClass).sort((a, b) => b.timestamp - a.timestamp).slice(0, this.limit); const aggregate = (selector: (o: HistoricalOutcomeV2) => number, fallback: number) => relevant.length ? mean(relevant.map(selector)) : fallback; return immutable([clamp(features.history.modelSuccessRate), clamp(features.history.providerSuccessRate), clamp(features.history.deviceSpecificSuccessRate), clamp(features.history.acceptanceRate), clamp(aggregate(o => o.quality, .5)), clamp(aggregate(o => Number(o.accepted), .5)), clamp(relevant.length / this.limit)]); }
}

export class DecisionRepresentationEncoderV2 {
  readonly schemaVersion = 'decision-representation-v2';
  constructor(readonly encoderVersion = 'decision-encoder-v2.0.0', private readonly encoders: Readonly<Record<string, RepresentationBlockEncoder>> = { context: new ContextEncoder(), candidate: new CandidateEncoder(), device: new DeviceEncoder(), goal: new GoalEncoder(), constraint: new ConstraintEncoder(), history: new HistoryEncoder() }) {}
  encode(features: DecisionFeaturesV2): DecisionRepresentationV2 { const blocks = Object.fromEntries(Object.entries(this.encoders).map(([name, encoder]) => [name, encoder.encode(features)])); const base = Object.values(blocks).flat(); const interactions = [base[0] * base[7], base[1] * base[9], base[2] * base[16], base[18] * base[20], base[6] * base[22]].map(clamp); const recent = features.recentOutcomes ?? []; const coldStart: Array<DecisionRepresentationV2['coldStart'][number]> = []; if (!features.context.deviceId || !recent.some(o => o.deviceClass === features.context.deviceClass)) coldStart.push('NEW_DEVICE'); if (!recent.some(o => o.operation === features.context.operation)) coldStart.push('NEW_OPERATION'); if (!recent.some(o => o.model === features.candidate.model)) coldStart.push('NEW_MODEL'); if (!recent.some(o => o.provider === features.candidate.provider)) coldStart.push('NEW_PROVIDER'); const coverage = clamp((recent.length + (features.history.modelSuccessRate > 0 ? 2 : 0)) / 10); return immutable({ schemaVersion: this.schemaVersion, encoderVersion: this.encoderVersion, vector: [...base, ...interactions], blocks, coverage, coldStart }); }
}
