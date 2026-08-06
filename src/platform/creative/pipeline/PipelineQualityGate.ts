import type { PipelineQualityGateResult } from './types';

export class PipelineQualityGate {
  evaluate(stage: string, qualityScore: number, threshold = 0.75): PipelineQualityGateResult {
    return { stage, qualityScore, threshold, decision: qualityScore >= threshold ? 'SKIP_AI' : 'ESCALATE_AI' };
  }
}
