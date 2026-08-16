import { clamp, immutable, mean, stableHash } from './immutable';
import type { DecisionFeaturesV1, HistoricalOutcome } from './types';

export const DECISION_REPRESENTATION_VERSION = 'decision-representation-v2.0';
const hash = (value = '') => stableHash(value.trim().toLowerCase()) / 0xffffffff;
const numericPreferences = (preferences?: Readonly<Record<string, number>>) => preferences ? mean(Object.values(preferences).map(value => clamp(value))) : .5;

export interface RepresentationBlock { readonly name: string; encode(input: DecisionFeaturesV1): readonly number[] }
export class ContextEncoder implements RepresentationBlock { readonly name = 'context'; encode({ context }: DecisionFeaturesV1) { return immutable([hash(context.intent), hash(context.operation), hash(context.projectType), hash(context.style), hash(context.platform)]); } }
export class GoalEncoder implements RepresentationBlock { readonly name = 'goal'; encode({ context }: DecisionFeaturesV1) { return immutable([hash(context.goal), clamp(context.qualityTarget), numericPreferences(context.userPreferences)]); } }
export class ConstraintEncoder implements RepresentationBlock { readonly name = 'constraint'; encode({ context }: DecisionFeaturesV1) { return immutable([hash(context.privacyMode), clamp(context.budget / 100), clamp(context.latencyTarget / 60_000), clamp((context.constraints?.length ?? 0) / 10)]); } }
export class CandidateEncoder implements RepresentationBlock { readonly name = 'candidate'; encode({ candidate }: DecisionFeaturesV1) { return immutable([hash(candidate.id), hash(candidate.executionTarget), hash(candidate.model), hash(candidate.provider), hash(candidate.runtime), clamp(candidate.estimatedQuality), clamp(candidate.estimatedLatency / 60_000), clamp(candidate.estimatedCost / 100), clamp(candidate.reliability)]); } }
export class DeviceEncoder implements RepresentationBlock { readonly name = 'device'; encode({ context, candidate }: DecisionFeaturesV1) { const pixels = (context.imageWidth ?? 0) * (context.imageHeight ?? 0); return immutable([hash(context.deviceClass), hash(context.deviceId), clamp(pixels / 16_000_000), clamp(candidate.memory / 32_768), clamp(candidate.energy / 10)]); } }
export class HistoryEncoder implements RepresentationBlock {
  readonly name = 'history'; constructor(readonly sequenceLimit = 8) {}
  encode({ context, history }: DecisionFeaturesV1) {
    const relevant = [...(history.relevantOutcomes ?? [])].filter(row => row.operation === context.operation || row.deviceClass === context.deviceClass).sort((a, b) => b.timestamp - a.timestamp).slice(0, this.sequenceLimit);
    const sequence = (selector: (row: HistoricalOutcome) => number, fallback: number) => relevant.length ? mean(relevant.map(selector)) : fallback;
    return immutable([clamp(history.modelSuccessRate), clamp(history.providerSuccessRate), clamp(history.deviceSpecificSuccessRate), clamp(history.acceptanceRate), clamp(history.undoRate), clamp(sequence(row => row.quality, .5)), clamp(sequence(row => Number(row.accepted), .5)), clamp(relevant.length / this.sequenceLimit), clamp((history.sampleCount ?? relevant.length) / 50)]);
  }
}

/** Versioned, deterministic fusion encoder. It keeps global and device-specific signals separate. */
export class DecisionRepresentationEncoderV2 {
  readonly version = DECISION_REPRESENTATION_VERSION;
  readonly blocks: readonly RepresentationBlock[];
  constructor(blocks: readonly RepresentationBlock[] = [new ContextEncoder(), new GoalEncoder(), new ConstraintEncoder(), new CandidateEncoder(), new DeviceEncoder(), new HistoryEncoder()]) { this.blocks = Object.freeze([...blocks]); }
  encode(input: DecisionFeaturesV1) {
    const encodedBlocks = this.blocks.map(block => immutable({ name: block.name, values: block.encode(input) }));
    const base = encodedBlocks.flatMap(block => block.values);
    const { context, candidate } = input;
    const interactions = [
      hash(`${context.deviceClass}:${candidate.model}`), hash(`${context.operation}:${candidate.model}`), hash(`${context.goal}:${context.style ?? 'none'}`),
      hash(`${context.privacyMode}:${candidate.executionTarget}`), clamp(context.qualityTarget * (1 - clamp(candidate.estimatedCost / Math.max(context.budget, .01)))),
      hash(`${candidate.runtime}:${context.imageWidth ?? 0}x${context.imageHeight ?? 0}`),
    ];
    return immutable({ version: this.version, blocks: encodedBlocks, interactions, vector: [...base, ...interactions] });
  }
}
