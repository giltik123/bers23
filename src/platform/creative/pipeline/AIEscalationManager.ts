import type { AIEscalationResult, CreativePipeline, PipelineQualityGateResult } from './types';

export class AIEscalationManager {
  decide(pipeline: CreativePipeline, gate: PipelineQualityGateResult): AIEscalationResult {
    if (gate.decision === 'SKIP_AI') return { selectedStage: gate.stage, reason: 'local quality sufficient', estimatedCost: 0 };
    const ai = pipeline.steps.find((step) => step.source === 'AI');
    return { selectedStage: gate.stage, selectedOperation: ai?.operation, reason: 'AI selected at highest-impact stage after local quality check', estimatedCost: ai?.estimatedCost ?? 0 };
  }
}
