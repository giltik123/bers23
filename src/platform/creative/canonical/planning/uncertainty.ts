import type { CreativePlanUncertainty, CreativeRequest } from '../contracts';
import { deepFreeze } from './immutable';

export interface PlanningUncertaintyThresholds {
  readonly minimumIntentConfidence: number;
  readonly minimumTargetConfidence: number;
  readonly minimumFeasibilityConfidence: number;
  readonly maximumPreservationRisk: number;
}

export const DEFAULT_UNCERTAINTY_THRESHOLDS: PlanningUncertaintyThresholds = Object.freeze({
  minimumIntentConfidence: 0.6,
  minimumTargetConfidence: 0.6,
  minimumFeasibilityConfidence: 0.5,
  maximumPreservationRisk: 0.7,
});

export function evaluateUncertainty(request: CreativeRequest): CreativePlanUncertainty {
  const metadata = request.metadata ?? Object.freeze({});
  const intent = confidence(metadata.intentConfidence, 0.95);
  const targetResolution = metadata.targetAmbiguous === true ? 0.4 : confidence(metadata.targetConfidence, 0.95);
  const feasibility = confidence(metadata.capabilityConfidence, 0.9);
  const preservationRisk = confidence(metadata.preservationRisk, 0.2);
  const aggregateConfidence = round((intent + targetResolution + feasibility + (1 - preservationRisk)) / 4);
  return deepFreeze({ intent, targetResolution, feasibility, preservationRisk, aggregateConfidence });
}

export function confirmationReasons(uncertainty: CreativePlanUncertainty, thresholds: PlanningUncertaintyThresholds): readonly string[] {
  const reasons: string[] = [];
  if (uncertainty.intent < thresholds.minimumIntentConfidence) reasons.push('uncertainty:intent');
  if (uncertainty.targetResolution < thresholds.minimumTargetConfidence) reasons.push('uncertainty:target-resolution');
  if (uncertainty.feasibility < thresholds.minimumFeasibilityConfidence) reasons.push('uncertainty:feasibility');
  if (uncertainty.preservationRisk > thresholds.maximumPreservationRisk) reasons.push('uncertainty:preservation-risk');
  return Object.freeze(reasons);
}

function confidence(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}
function round(value: number): number { return Math.round(value * 10_000) / 10_000; }
