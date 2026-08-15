import { clamp, immutable, round, stableHash } from './immutable';
import type { DecisionContext } from './types';
import type { OperationNeed, OperationNeedPrediction, VisualGoalAlignment, VisualOperation, VisualQualityPrediction, VisualRepresentation, VisualStyle } from './visual-types';

const desiredStyle = (context: DecisionContext): VisualStyle => {
  const text = `${context.goal} ${context.intent}`.toLowerCase();
  if (/luxury|premium|дорог/.test(text)) return 'LUXURY';
  if (/editorial|fashion|редак/.test(text)) return 'EDITORIAL';
  if (/catalog|каталог/.test(text)) return 'CATALOG';
  if (/cinematic|кино/.test(text)) return 'CINEMATIC';
  if (/minimal|минимал/.test(text)) return 'MINIMAL';
  if (/natural|естеств/.test(text)) return 'NATURAL';
  return 'UNKNOWN';
};

export class VisualQualityHead {
  predict(visual: VisualRepresentation): VisualQualityPrediction {
    const item = visual.observations;
    const resolution = clamp(Math.sqrt(visual.width * visual.height) / 3000);
    const lightingPenalty = item.lighting === 'DARK' || item.lighting === 'HIGH_CONTRAST' ? 0.12 : 0;
    return immutable({
      technicalQuality: round(clamp(item.estimatedQuality * 0.75 + resolution * 0.25)),
      visualCoherence: round(clamp(item.composition * 0.45 + (1 - item.backgroundComplexity) * 0.25 + item.depthCues * 0.3 - lightingPenalty)),
      identityPreservation: round(clamp(0.55 + item.facePresence * 0.25 - item.segmentationComplexity * 0.15 + item.requestedStyleSimilarity * 0.2)),
      compositionQuality: round(clamp(item.composition * 0.8 + (1 - item.backgroundComplexity) * 0.2)),
    });
  }
}

export class VisualGoalAlignmentEngine {
  align(context: DecisionContext, visual: VisualRepresentation): VisualGoalAlignment {
    const desired = desiredStyle(context);
    const current = visual.observations.visualStyle;
    const categorical = desired === 'UNKNOWN' ? 0.5 : desired === current ? 1 : 1 - Math.abs(stableHash(desired) - stableHash(current));
    const similarity = round(clamp(categorical * 0.55 + visual.observations.requestedStyleSimilarity * 0.45));
    const reasons: string[] = [];
    if (desired !== current && desired !== 'UNKNOWN') reasons.push(`STYLE_${current}_TO_${desired}`);
    if (visual.observations.lighting === 'DARK') reasons.push('LIGHTING_TOO_DARK');
    if (visual.observations.backgroundComplexity > 0.7) reasons.push('BACKGROUND_TOO_COMPLEX');
    return immutable({ desiredStyle: desired, currentStyle: current, similarity, gap: round(1 - similarity), reasons });
  }
}

export class OperationNeedPredictor {
  constructor(private readonly threshold = 0.58) {}
  predict(context: DecisionContext, visual: VisualRepresentation, alignment: VisualGoalAlignment): OperationNeedPrediction {
    const item = visual.observations;
    const pixels = visual.width * visual.height;
    const requested = `${context.operation} ${context.intent} ${context.goal}`.toLowerCase();
    const probability: Record<VisualOperation, number> = {
      SEGMENTATION: clamp(item.segmentationComplexity * 0.45 + item.backgroundComplexity * 0.3 + Number(/segment|mask|background/.test(requested)) * 0.25),
      RELIGHTING: clamp(Number(['DARK', 'HIGH_CONTRAST'].includes(item.lighting)) * 0.55 + Number(/light|релайт|свет/.test(requested)) * 0.35 + alignment.gap * 0.1),
      UPSCALE: clamp(Number(pixels < 2_000_000) * 0.55 + (1 - item.estimatedQuality) * 0.25 + Number(/upscale|resolution|разреш/.test(requested)) * 0.2),
      BACKGROUND_REPLACEMENT: clamp(item.backgroundComplexity * 0.25 + Number(/replace background|background replacement|замен.*фон/.test(requested)) * 0.7),
      GENERATION: clamp(alignment.gap * 0.35 + Number(/generate|generation|сгенер/.test(requested)) * 0.5 + (1 - item.estimatedQuality) * 0.1),
    };
    const reasons: Record<VisualOperation, string> = { SEGMENTATION: 'subject/background separation', RELIGHTING: 'lighting-to-goal mismatch', UPSCALE: 'resolution or technical quality gap', BACKGROUND_REPLACEMENT: 'explicit background change', GENERATION: 'large visual-goal gap' };
    const operations: OperationNeed[] = (Object.keys(probability) as VisualOperation[]).map((operation) => immutable({ operation, probability: round(probability[operation]), needed: probability[operation] >= this.threshold, reason: reasons[operation] }));
    const maximum = Math.max(...operations.map((operation) => operation.probability));
    const unnecessaryAIProbability = round(clamp(1 - maximum));
    return immutable({ operations: immutable(operations), unnecessaryAIProbability,
      recommendedAction: maximum < 0.35 ? 'NO_AI' : maximum < this.threshold ? 'LOCAL_EDIT' : 'MODEL_RANKING' });
  }
}
