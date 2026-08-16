import { DecisionRepresentationEncoderV2 } from './DecisionRepresentationEncoderV2';
import { immutable } from './immutable';
import { OperationNeedPredictor, VisualGoalAlignment, VisualQualityHead } from './VisualDecisionHeads';
import type { DecisionFeaturesV3, DecisionRepresentationV3 } from './types';

const clamp = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
export class DecisionRepresentationEncoderV3 {
  readonly schemaVersion = 'decision-representation-v3' as const;
  constructor(private readonly base = new DecisionRepresentationEncoderV2(), private readonly quality = new VisualQualityHead(), private readonly alignment = new VisualGoalAlignment(), private readonly operations = new OperationNeedPredictor(), readonly encoderVersion = 'decision-fusion-v3.0.0') {}
  encode(features: DecisionFeaturesV3): DecisionRepresentationV3 { const base = this.base.encode(features), quality = this.quality.predict(features.visual), goalAlignment = this.alignment.evaluate(features.visual, features.visualGoal), operationNeeds = this.operations.predict(features.visual, features.visualGoal); const visual = immutable([features.visual.composition.balance, features.visual.composition.focus, clamp(features.visual.subjectCount / 10), features.visual.facePresence, features.visual.backgroundComplexity, features.visual.estimatedQuality, clamp(features.visual.resolution.megapixels / 12), features.visual.depthCues, features.visual.segmentationComplexity, features.visual.requestedStyleSimilarity]); const visualGoal = immutable([goalAlignment.similarity, goalAlignment.gap, quality.technicalQuality, quality.visualCoherence, quality.identityPreservation, quality.compositionQuality]); const blocks = immutable({ ...base.blocks, visual, visualGoal }); return immutable({ ...base, schemaVersion: this.schemaVersion, encoderVersion: this.encoderVersion, blocks, vector: immutable([...base.vector, ...visual, ...visualGoal]), visualQuality: quality, goalAlignment, operationNeeds }); }
}
