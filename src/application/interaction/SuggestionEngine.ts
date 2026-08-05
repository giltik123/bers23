import { createSuggestionId, immutable, type InteractionAction, type InteractionContext, type InteractionSuggestion } from './InteractionModel';

export class SuggestionEngine {
  suggest(context: InteractionContext, completedAction?: InteractionAction): readonly InteractionSuggestion[] {
    const suggestions: InteractionSuggestion[] = [];
    const history = new Set(context.workflowHistory);

    if (completedAction === 'TRY_ON' || history.has('try-on')) {
      suggestions.push(this.#suggestion('Улучшить фон', 'CHANGE_BACKGROUND', 'После замены одежды можно подготовить более чистый фон.'));
      suggestions.push(this.#suggestion('Сделать вариант для каталога', 'CREATE_IMAGE', 'История workflow указывает на fashion/catalog сценарий.'));
    }

    if (completedAction === 'EDIT_IMAGE' || context.memory.some((item) => item.toLowerCase().includes('style'))) {
      suggestions.push(this.#suggestion('Сохранить стиль', 'CHANGE_STYLE', 'Можно закрепить удачный стиль для следующих генераций.'));
    }

    if (suggestions.length === 0) {
      suggestions.push(this.#suggestion('Продолжить работу', 'CONTINUE', 'Можно продолжить незавершённую операцию или уточнить результат.'));
    }

    return immutable(suggestions);
  }

  #suggestion(title: string, action: InteractionAction, reason: string): InteractionSuggestion {
    return immutable({ id: createSuggestionId(), title, action, reason });
  }
}
