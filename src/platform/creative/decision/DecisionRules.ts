import type { DecisionMode, DecisionReason } from './types';

const localOperations = new Set(['brightness', 'contrast', 'color_correction', 'crop', 'light_adjustment', 'lighting', 'final_enhancement']);
const aiOperations = new Set(['virtual_try_on', 'background_generation', 'object_removal', 'generative_fill']);

export class DecisionRules {
  detectOperations(prompt: string, availableOperations: readonly string[]): string[] {
    const text = prompt.toLowerCase();
    const detected: string[] = [];
    if (/(цвет|color|контраст|улучш)/i.test(text)) detected.push('color_correction');
    if (/(свет|lighting|ярче|light)/i.test(text)) detected.push('lighting');
    if (/(одежд|clothes|каталог одежды)/i.test(text)) detected.push('lighting', 'color_correction', 'virtual_try_on', 'final_enhancement');
    if (/(фон|background|париж|paris)/i.test(text)) detected.push('background_generation');
    if (/(убери|remove|object)/i.test(text)) detected.push('object_removal');
    return [...new Set(detected)].filter((operation) => availableOperations.includes(operation) || localOperations.has(operation) || aiOperations.has(operation));
  }

  classify(operations: readonly string[]): DecisionMode {
    const hasLocal = operations.some((operation) => localOperations.has(operation));
    const hasAI = operations.some((operation) => aiOperations.has(operation));
    if (hasLocal && hasAI) return 'HYBRID';
    if (hasAI) return 'AI';
    if (hasLocal) return 'LOCAL';
    return 'ASK_USER';
  }

  reasons(mode: DecisionMode, operations: readonly string[]): DecisionReason[] {
    return [{ id: 'capability-route', category: 'CAPABILITY', message: `Detected ${operations.join(', ') || 'no clear operation'} and selected ${mode}.` }];
  }

  cost(operation: string): number { return aiOperations.has(operation) ? operation === 'virtual_try_on' ? 10 : 15 : 0; }
  isAI(operation: string): boolean { return aiOperations.has(operation); }
  isLocal(operation: string): boolean { return localOperations.has(operation); }
}
