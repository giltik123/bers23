import type { AIExplainabilityContract, EditExplanation, PreviewDecision } from './types';

export class EditExplanationEngine {
  explain(preview: PreviewDecision): EditExplanation {
    const free = preview.freeOperations.length > 0 ? preview.freeOperations.map((operation) => `✓ ${operation}`).join('\n') : '—';
    const aiExplainability = preview.operations.map((operation) => operation.explainability).filter((contract): contract is AIExplainabilityContract => Boolean(contract));
    const ai = aiExplainability.length > 0 ? aiExplainability.map((contract) => `Для ${contract.operation} потребуется AI: ${contract.whyAI}. Локально нельзя: ${contract.whyNotLocal}. Ожидаемый результат: ${contract.expectedBenefit}.`).join('\n') : 'AI не нужен для выбранного варианта.';
    const costExplanation = preview.totalCost > 0 ? `Стоимость: ${preview.totalCost} кредитов.` : 'Стоимость: 0 кредитов.';
    return { reason: preview.requiresConfirmation ? 'AI credits are required before execution.' : 'All selected edits can run locally before execution.', operations: preview.operations.map((operation) => operation.name), costExplanation, userMessage: `Я могу улучшить изображение бесплатно:\n${free}\n\n${ai}\n${costExplanation}`, aiExplainability };
  }
}
