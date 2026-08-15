import { DecisionRepresentationEncoderV2 } from './DecisionRepresentationEncoderV2';
import { clamp, immutable, round, stableHash } from './immutable';
import { DECISION_REPRESENTATION_V3_VERSION } from './visual-types';
import type { DecisionRepresentationV3, MultimodalDecisionInput } from './visual-types';

export class MultimodalFusionV3 {
  readonly version = DECISION_REPRESENTATION_V3_VERSION;
  constructor(private readonly decisionEncoder = new DecisionRepresentationEncoderV2()) {}

  encode(input: MultimodalDecisionInput): DecisionRepresentationV3 {
    if (!input.visual.privacy.featureOnly || input.visual.privacy.rawImageRetained || input.visual.privacy.rawImageTransmitted) throw new Error('Fusion requires a privacy-safe visual representation');
    const decision = this.decisionEncoder.encode({ context: input.context, candidate: input.candidate, history: input.history,
      recentOutcomes: input.recentOutcomes, preferences: input.preferences, constraints: input.constraints,
      imageSize: { width: input.visual.width, height: input.visual.height } });
    const visual = input.visual.observations;
    const crossModalInteractions = immutable({
      'goal×visualStyle': round(stableHash(`${input.context.goal}|${visual.visualStyle}`) * visual.requestedStyleSimilarity),
      'operation×segmentation': round(stableHash(input.context.operation) * visual.segmentationComplexity),
      'qualityTarget×visualQuality': round(input.context.qualityTarget * visual.estimatedQuality),
      'candidate×resolution': round(stableHash(input.candidate.model) * clamp((input.visual.width * input.visual.height) / 80_000_000)),
      'runtime×visualComplexity': round(stableHash(input.candidate.runtime) * ((visual.backgroundComplexity + visual.segmentationComplexity) / 2)),
      'privacy×visualSource': input.context.privacyMode === 'LOCAL_ONLY' && input.visual.source === 'CLOUD' ? -1 : 1,
    });
    const interactions = Object.keys(crossModalInteractions).sort().map((key) => crossModalInteractions[key]);
    return immutable({ version: this.version, decisionValues: decision.values, visualValues: input.visual.values,
      values: immutable([...decision.values, ...input.visual.values, ...interactions]), crossModalInteractions,
      visual: input.visual, coverage: round(clamp(decision.coverage * 0.7 + visual.estimatedQuality * 0.3)) });
  }
}
