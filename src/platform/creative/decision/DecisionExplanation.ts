import type { CreativeDecision, DecisionExplanation as DecisionExplanationShape } from './types';

export class DecisionExplanation {
  explain(decision: CreativeDecision): DecisionExplanationShape {
    const modeText = decision.mode === 'HYBRID' ? 'Я сначала применю бесплатные улучшения цвета и света. AI использую только для операции, где он действительно нужен.' : decision.mode === 'LOCAL' ? 'Задачу можно выполнить локально бесплатно.' : decision.mode === 'AI' ? 'Для результата нужно создать новое визуальное содержимое, поэтому потребуется AI.' : 'Нужно уточнить направление перед выполнением.';
    const savings = decision.savedCredits > 0 ? ` Экономия: ${decision.savedCredits} кредитов.` : '';
    return Object.freeze({ decisionId: decision.id, mode: decision.mode, explanation: `${modeText}${savings}`, reasons: decision.reasons, estimatedCredits: decision.estimatedCredits, savedCredits: decision.savedCredits });
  }
}
