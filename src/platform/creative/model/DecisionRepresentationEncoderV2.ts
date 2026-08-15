import { FEATURE_SCHEMA_VERSION } from './DecisionFeatureEncoderV1';
import { clamp, immutable, round, stableHash } from './immutable';
import type { DecisionCandidate, DecisionConstraints, DecisionContext, DecisionHistoryFeatures } from './types';
import type {
  ColdStartReason,
  DecisionRepresentation,
  DecisionRepresentationInput,
  RelevantOutcome,
  UserPreferenceSignals,
} from './v2-types';

export const REPRESENTATION_ENCODER_VERSION = 'decision-representation-v2.0';
const EMBEDDING_SIZE = 4;
const MAX_SEQUENCE = 8;

const embed = (value: string): readonly number[] => {
  const normalized = value.trim().toLowerCase();
  return immutable(Array.from({ length: EMBEDDING_SIZE }, (_, index) => {
    return round(stableHash(`${index}:${normalized}`) * 2 - 1);
  }));
};

const defaults: DecisionHistoryFeatures = {
  modelSuccessRate: 0.5,
  providerSuccessRate: 0.5,
  deviceSpecificSuccessRate: 0.5,
  cloudAvoidance: 0.5,
  acceptanceRate: 0.5,
  undoRate: 0,
};

const preferenceDefaults: UserPreferenceSignals = {
  localPreference: 0.5,
  qualityPreference: 0.5,
  speedPreference: 0.5,
  costSensitivity: 0.5,
  styleAlignment: 0.5,
};

export class ContextEncoder {
  encode(context: DecisionContext): readonly number[] {
    return immutable([
      ...embed(context.operation), ...embed(context.intent), ...embed(context.projectType),
      clamp(context.qualityTarget), clamp(context.latencyTarget / 60_000), clamp(context.budget / 100),
    ]);
  }
}

export class CandidateEncoder {
  encode(candidate: DecisionCandidate): readonly number[] {
    return immutable([
      ...embed(candidate.model), ...embed(candidate.provider), ...embed(candidate.runtime),
      candidate.executionTarget === 'LOCAL' ? 1 : 0,
      candidate.executionTarget === 'CLOUD' ? 1 : 0,
      clamp(candidate.estimatedQuality), clamp(candidate.estimatedLatency / 60_000),
      clamp(candidate.estimatedCost / 100), clamp(candidate.energy / 100),
      clamp(candidate.memory / 65_536), clamp(candidate.reliability),
    ]);
  }
}

export class HistoryEncoder {
  encode(history: Partial<DecisionHistoryFeatures> = {}, outcomes: readonly RelevantOutcome[] = []): readonly number[] {
    const aggregate = { ...defaults, ...history };
    const recent = outcomes.slice(-MAX_SEQUENCE);
    const sequence = recent.flatMap((outcome, index) => {
      const recency = (index + 1) / MAX_SEQUENCE;
      return [Number(outcome.success), Number(outcome.accepted), clamp(outcome.quality), clamp(outcome.latency / 60_000), clamp(outcome.cost / 100), recency];
    });
    while (sequence.length < MAX_SEQUENCE * 6) sequence.push(0);
    return immutable([
      clamp(aggregate.modelSuccessRate), clamp(aggregate.providerSuccessRate),
      clamp(aggregate.deviceSpecificSuccessRate), clamp(aggregate.cloudAvoidance),
      clamp(aggregate.acceptanceRate), clamp(aggregate.undoRate),
      clamp(recent.length / MAX_SEQUENCE), ...sequence,
    ].map(round));
  }
}

export class DeviceEncoder {
  encode(context: DecisionContext, imageSize?: Readonly<{ width: number; height: number }>): readonly number[] {
    const pixels = imageSize ? imageSize.width * imageSize.height : 0;
    return immutable([...embed(context.deviceClass), ...embed(context.platform), clamp(pixels / 40_000_000)]);
  }
}

export class GoalEncoder {
  encode(context: DecisionContext, preferences: Partial<UserPreferenceSignals> = {}): readonly number[] {
    const resolved = { ...preferenceDefaults, ...preferences };
    return immutable([...embed(context.goal), clamp(resolved.qualityPreference), clamp(resolved.styleAlignment), clamp(resolved.localPreference), clamp(resolved.speedPreference), clamp(resolved.costSensitivity)]);
  }
}

export class ConstraintEncoder {
  encode(context: DecisionContext, constraints: DecisionConstraints = {}): readonly number[] {
    const localOnly = context.privacyMode === 'LOCAL_ONLY';
    return immutable([
      ...embed(context.privacyMode), Number(localOnly),
      Number(constraints.cloudAllowed !== false), clamp((constraints.budget ?? context.budget) / 100),
      clamp((constraints.supportedRuntimes?.length ?? 0) / 10),
      clamp((constraints.quarantinedModels?.length ?? 0) / 10),
    ]);
  }
}

export interface RepresentationEncoderDependencies {
  readonly knownDevices?: ReadonlySet<string>;
  readonly knownOperations?: ReadonlySet<string>;
  readonly knownModels?: ReadonlySet<string>;
  readonly knownProviders?: ReadonlySet<string>;
}

export class DecisionRepresentationEncoderV2 {
  readonly version = REPRESENTATION_ENCODER_VERSION;

  constructor(
    private readonly contextEncoder = new ContextEncoder(),
    private readonly candidateEncoder = new CandidateEncoder(),
    private readonly historyEncoder = new HistoryEncoder(),
    private readonly deviceEncoder = new DeviceEncoder(),
    private readonly goalEncoder = new GoalEncoder(),
    private readonly constraintEncoder = new ConstraintEncoder(),
    private readonly dependencies: RepresentationEncoderDependencies = {},
  ) {}

  encode(input: DecisionRepresentationInput): DecisionRepresentation {
    const relevant = this.relevantOutcomes(input);
    const blocks = immutable({
      context: this.contextEncoder.encode(input.context),
      candidate: this.candidateEncoder.encode(input.candidate),
      history: this.historyEncoder.encode(input.history, relevant),
      device: this.deviceEncoder.encode(input.context, input.imageSize),
      goal: this.goalEncoder.encode(input.context, input.preferences),
      constraint: this.constraintEncoder.encode(input.context, input.constraints),
    });
    const interactions = this.interactions(input);
    const interactionVector = Object.keys(interactions).sort().map((key) => interactions[key]);
    const values = immutable([...Object.values(blocks).flat(), ...interactionVector].map(round));
    const coldStartReasons = this.coldStart(input);
    const coverage = round(clamp((relevant.length / MAX_SEQUENCE) * 0.6 + (1 - coldStartReasons.length / 4) * 0.4));
    return immutable({ encoderVersion: this.version, featureSchemaVersion: FEATURE_SCHEMA_VERSION, values, blocks, interactions, coverage, coldStartReasons });
  }

  private relevantOutcomes(input: DecisionRepresentationInput): readonly RelevantOutcome[] {
    return (input.recentOutcomes ?? [])
      .filter((item) => item.operation === input.context.operation || item.deviceClass === input.context.deviceClass)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_SEQUENCE);
  }

  private interactions(input: DecisionRepresentationInput): Readonly<Record<string, number>> {
    const { context, candidate } = input;
    const pixels = input.imageSize ? input.imageSize.width * input.imageSize.height : 0;
    return immutable({
      'device×model': round(stableHash(`${context.deviceClass}|${candidate.model}`) * candidate.reliability),
      'goal×style': round(stableHash(`${context.goal}|${input.preferences?.styleAlignment ?? 0.5}`)),
      'localRuntime×imageSize': round((candidate.executionTarget === 'LOCAL' ? 1 : 0) * clamp(pixels / 40_000_000) * stableHash(candidate.runtime)),
      'operation×model': round(stableHash(`${context.operation}|${candidate.model}`) * candidate.estimatedQuality),
      'privacy×target': context.privacyMode === 'LOCAL_ONLY' && candidate.executionTarget !== 'LOCAL' ? -1 : 1,
      'qualityTarget×budget': round(clamp(context.qualityTarget) * clamp(context.budget / 100)),
    });
  }

  private coldStart(input: DecisionRepresentationInput): readonly ColdStartReason[] {
    const reasons: ColdStartReason[] = [];
    const { context, candidate } = input;
    if (this.dependencies.knownDevices && !this.dependencies.knownDevices.has(context.deviceClass)) reasons.push('NEW_DEVICE');
    if (this.dependencies.knownOperations && !this.dependencies.knownOperations.has(context.operation)) reasons.push('NEW_OPERATION');
    if (this.dependencies.knownModels && !this.dependencies.knownModels.has(candidate.model)) reasons.push('NEW_MODEL');
    if (this.dependencies.knownProviders && !this.dependencies.knownProviders.has(candidate.provider)) reasons.push('NEW_PROVIDER');
    return immutable(reasons);
  }
}
