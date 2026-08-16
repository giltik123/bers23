import { clamp, immutable, mean, stableHash } from './immutable';
import { REPRESENTATION_SCHEMA_VERSION_V2 } from './v2-types';
import type { DecisionInputV2, DecisionRepresentationV2, RepresentationBlockV2 } from './v2-types';

const hash = (value: string) => stableHash(value.trim().toLowerCase()) / 0xffffffff;
const preferenceDefaults = { qualityBias: .5, speedBias: .5, costBias: .5, localBias: .5, styleAlignment: .5, correctionRate: 0, repeatedEditRate: 0 };
const block = (name: RepresentationBlockV2['name'], values: readonly number[]): RepresentationBlockV2 => immutable({ name, values: values.map(value => clamp(value)) });
export class ContextEncoderV2 { encode(input: DecisionInputV2) { const c = input.context; return block('context', [hash(c.operation), hash(c.intent), hash(c.platform), hash(c.projectType)]); } }
export class CandidateEncoderV2 { encode(input: DecisionInputV2) { const c = input.candidate; return block('candidate', [hash(c.executionTarget), hash(c.model), hash(c.provider), hash(c.runtime), clamp(c.estimatedQuality), clamp(c.estimatedLatency / 60_000), clamp(c.estimatedCost / 100), clamp(c.reliability)]); } }
export class HistoryEncoderV2 { encode(input: DecisionInputV2) { const h = input.history; return block('history', [h.modelSuccessRate, h.providerSuccessRate, h.deviceSpecificSuccessRate, h.cloudAvoidance, h.acceptanceRate, h.undoRate]); } }
export class DeviceEncoderV2 { encode(input: DecisionInputV2) { const d = input.device ?? {}; return block('device', [hash(d.deviceClass ?? input.context.deviceClass), hash(d.runtime ?? input.candidate.runtime), clamp((d.memoryMb ?? input.candidate.memory) / 32_768), clamp((d.imageMegapixels ?? 1) / 100), clamp(d.computeScore ?? .5), clamp(d.thermalPressure ?? 0), Number(d.isNew ?? false)]); } }
export class GoalEncoderV2 { encode(input: DecisionInputV2) { return block('goal', [hash(input.context.goal), hash(input.context.intent), clamp(input.context.qualityTarget)]); } }
export class ConstraintEncoderV2 { encode(input: DecisionInputV2) { const c = input.context, candidate = input.candidate; return block('constraint', [hash(c.privacyMode), clamp(c.budget / 100), clamp(c.latencyTarget / 60_000), clamp(c.qualityTarget), Number(candidate.executionTarget === 'LOCAL'), Number(candidate.quarantined ?? false), Number(candidate.runtimeSupported === false)]); } }
export class SequenceEncoderV2 { constructor(private readonly limit = 8) {} encode(input: DecisionInputV2) { const relevant = (input.recentOutcomes ?? []).filter(item => item.operation === input.context.operation || item.deviceClass === input.context.deviceClass).sort((a, b) => b.timestamp - a.timestamp).slice(0, this.limit); return block('sequence', [clamp(relevant.length / this.limit), mean(relevant.map(item => item.quality)), mean(relevant.map(item => Number(item.accepted))), mean(relevant.map(item => item.satisfaction)), clamp(mean(relevant.map(item => item.cost)) / 100), clamp(mean(relevant.map(item => item.latency)) / 60_000)]); } }
export class PreferenceEncoderV2 { encode(input: DecisionInputV2) { const p = { ...preferenceDefaults, ...input.preferences }; return block('preference', Object.values(p)); } }

export class DecisionRepresentationEncoderV2 {
  readonly schemaVersion = REPRESENTATION_SCHEMA_VERSION_V2;
  constructor(readonly encoderVersion = 'representation-encoder-v2.0', private readonly encoders = [new ContextEncoderV2(), new CandidateEncoderV2(), new HistoryEncoderV2(), new DeviceEncoderV2(), new GoalEncoderV2(), new ConstraintEncoderV2(), new SequenceEncoderV2(), new PreferenceEncoderV2()]) {}
  encode(input: DecisionInputV2): DecisionRepresentationV2 {
    const blocks = this.encoders.map(encoder => encoder.encode(input)); const byName = Object.fromEntries(blocks.map(item => [item.name, item.values]));
    const candidate = byName.candidate, device = byName.device, context = byName.context, goal = byName.goal, constraint = byName.constraint;
    const interaction = block('interaction', [device[2] * candidate[7], context[0] * candidate[1], goal[0] * (input.preferences?.styleAlignment ?? .5), constraint[0] * candidate[0], goal[2] * constraint[1], device[3] * candidate[3], candidate[4] * candidate[6], byName.history[2] * candidate[1]]);
    const all = [...blocks, interaction], values = all.flatMap(item => item.values); const unknowns = [!input.recentOutcomes?.length && 'HISTORY_SEQUENCE', input.device?.isNew && 'NEW_DEVICE', input.candidate.model === 'unknown' && 'NEW_MODEL', input.candidate.provider === 'unknown' && 'NEW_PROVIDER'].filter(Boolean) as string[];
    const coverage = clamp(1 - unknowns.length / 5); return immutable({ schemaVersion: this.schemaVersion, encoderVersion: this.encoderVersion, blocks: all, values, coverage, coldStart: unknowns.length > 0, unknowns });
  }
}
