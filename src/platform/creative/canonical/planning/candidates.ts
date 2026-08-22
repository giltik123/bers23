import type { CreativeCandidateScore, CreativePlanCandidate, CreativePlanningConstraints, CreativePlanUncertainty, CreativeRequest, PlanningTargetPreference } from '../contracts';
import { decomposeOperations, isCompositePlanningRequest } from './decomposer';
import { deepFreeze } from './immutable';

export function generateCandidates(request: CreativeRequest, constraints: CreativePlanningConstraints, uncertainty: CreativePlanUncertainty): readonly CreativePlanCandidate[] {
  const composite = isCompositePlanningRequest(request);
  const operations = decomposeOperations(request);
  const local = candidate('local-efficient', 'LOCAL', operations, composite ? 0 : 0, composite ? 4500 : 2500, composite ? 0.72 : 0.74, 0.84, uncertainty, constraints, ['strategy:local-efficient']);
  const cloud = candidate('cloud-quality', 'CLOUD', operations, composite ? 3 : 1, composite ? 8500 : 6500, composite ? 0.95 : 0.94, 0.91, uncertainty, constraints, ['strategy:cloud-quality']);
  return deepFreeze(rankCandidates([local, cloud], constraints));
}

export function rankCandidates(candidates: readonly CreativePlanCandidate[], constraints?: CreativePlanningConstraints): readonly CreativePlanCandidate[] {
  return Object.freeze([...candidates].sort((left, right) => {
    const leftScore = adjustedScore(left, constraints);
    const rightScore = adjustedScore(right, constraints);
    if (rightScore !== leftScore) return rightScore - leftScore;
    return left.id.localeCompare(right.id);
  }));
}

function candidate(
  id: string,
  targetPreference: PlanningTargetPreference,
  operations: CreativePlanCandidate['operations'],
  estimatedCredits: number,
  estimatedLatencyMs: number,
  expectedQuality: number,
  reliability: number,
  uncertainty: CreativePlanUncertainty,
  constraints: CreativePlanningConstraints,
  reasons: readonly string[],
): CreativePlanCandidate {
  const rejectionReasons = reject(targetPreference, estimatedCredits, estimatedLatencyMs, expectedQuality, constraints);
  const score = scoreCandidate(expectedQuality, estimatedCredits, estimatedLatencyMs, reliability, uncertainty.aggregateConfidence);
  return deepFreeze({
    id,
    operations,
    targetPreference,
    estimatedCredits,
    estimatedLatencyMs,
    expectedQuality,
    score,
    reasons: Object.freeze([...reasons, `target:${targetPreference.toLowerCase()}`]),
    rejected: rejectionReasons.length > 0,
    rejectionReasons,
  });
}

export function scoreCandidate(quality: number, credits: number, latencyMs: number, reliability: number, confidence: number): CreativeCandidateScore {
  const qualityScore = clamp(quality);
  const costEfficiency = clamp(1 - credits / 5);
  const latency = clamp(1 - latencyMs / 20_000);
  const reliabilityScore = clamp(reliability);
  const confidenceScore = clamp(confidence);
  const total = round(qualityScore * 0.35 + costEfficiency * 0.15 + latency * 0.15 + reliabilityScore * 0.2 + confidenceScore * 0.15);
  return deepFreeze({ quality: qualityScore, costEfficiency, latency, reliability: reliabilityScore, confidence: confidenceScore, total });
}

function reject(target: PlanningTargetPreference, credits: number, latencyMs: number, quality: number, constraints: CreativePlanningConstraints): readonly string[] {
  const reasons: string[] = [];
  if (constraints.executionPolicy === 'LOCAL_ONLY' && target !== 'LOCAL') reasons.push('constraint:local-only');
  if (constraints.forbiddenTargets.includes(target)) reasons.push('constraint:forbidden-target');
  if (constraints.maxCredits !== undefined && credits > constraints.maxCredits) reasons.push('constraint:max-credits');
  if (constraints.maxLatencyMs !== undefined && latencyMs > constraints.maxLatencyMs) reasons.push('constraint:max-latency');
  if (constraints.minimumQuality !== undefined && quality < constraints.minimumQuality) reasons.push('constraint:minimum-quality');
  return Object.freeze(reasons);
}

function adjustedScore(candidate: CreativePlanCandidate, constraints?: CreativePlanningConstraints): number {
  if (candidate.rejected) return -1;
  const preference = constraints?.executionPolicy === 'CLOUD_PREFERRED' && candidate.targetPreference === 'CLOUD' ? 0.08 : 0;
  return round(candidate.score.total + preference);
}
function clamp(value: number): number { return Math.min(1, Math.max(0, value)); }
function round(value: number): number { return Math.round(value * 10_000) / 10_000; }
