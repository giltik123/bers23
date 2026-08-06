import type { CreativePipeline, PipelineExplanation } from './types';

export class PipelineExplanationEngine {
  explain(pipeline: CreativePipeline): PipelineExplanation {
    const local = pipeline.steps.filter((step) => step.source === 'LOCAL').map((step) => step.operation);
    const ai = pipeline.steps.filter((step) => step.source === 'AI');
    const aiText = ai.length > 0 ? `AI потребуется для ${ai.map((step) => step.operation).join(', ')}, потому что нужно создать новое визуальное содержимое.` : 'AI не нужен: локального качества достаточно.';
    return { userMessage: `Я сначала выполню бесплатно: ${local.join(', ')}. ${aiText} Стоимость AI: ${pipeline.totalCost} кредитов. Продолжить?`, requiresConfirmation: pipeline.totalCost > 0, aiCost: pipeline.totalCost, reasons: pipeline.steps.map((step) => step.reason) };
  }
}
