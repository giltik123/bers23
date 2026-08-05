import type { EditDecision, EditRequest } from './CreativeOperation';
import type { OperationType } from './OperationType';
import { aiOperationWorkflows, localOperationTypes } from './OperationType';

const promptMappings: readonly { readonly pattern: RegExp; readonly type: OperationType }[] = Object.freeze([
  { pattern: /brightness|ярк|светлее|темнее/i, type: 'brightness' },
  { pattern: /contrast|контраст/i, type: 'contrast' },
  { pattern: /color correction|цветокоррекц|цвет/i, type: 'color_correction' },
  { pattern: /background|фон|замени фон|change background/i, type: 'background_replacement' },
  { pattern: /try[- ]?on|костюм|одежд|пример/i, type: 'virtual_try_on' },
  { pattern: /remove object|удали объект|убери объект/i, type: 'remove_object' },
]);

export class EditCapabilityResolver {
  resolve(request: Pick<EditRequest, 'prompt' | 'type'>): EditDecision {
    const type = request.type || this.inferType(request.prompt || '');
    if (localOperationTypes.includes(type)) return Object.freeze({ mode: 'LOCAL', type, credits: 0, estimatedCost: 0, reason: 'Operation can be applied locally' });
    const workflow = aiOperationWorkflows[type] || 'ai-editing';
    return Object.freeze({ mode: 'AI', type, workflow, credits: this.estimate(type), estimatedCost: this.estimate(type), reason: 'Operation requires AI workflow' });
  }

  private inferType(prompt: string): OperationType {
    return promptMappings.find((mapping) => mapping.pattern.test(prompt))?.type || 'generative_fill';
  }

  private estimate(type: OperationType): number {
    if (type === 'virtual_try_on') return 15;
    if (type === 'background_replacement') return 10;
    if (type === 'remove_object') return 8;
    return 12;
  }
}
