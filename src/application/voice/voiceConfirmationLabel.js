const LABELS = Object.freeze({
  PROMPT_REPLACE: 'Подтвердить текст',
  PROMPT_APPEND: 'Добавить текст в промпт',
  PROMPT_CLEAR: 'Очистить промпт',
  NAVIGATE: 'Перейти к разделу',
  NAVIGATE_PROMPT: 'Открыть промпт',
  WARDROBE_QUERY: 'Открыть поиск в гардеробе',
  TRYON_SELECT_PROPOSAL: 'Подготовить выбор вещи для примерки',
  AGENT_PROPOSAL: 'Подготовить задачу Agent',
  HISTORY_UNDO: 'Отменить последнее редактирование',
  HISTORY_REDO: 'Повторить редактирование',
  HISTORY_RESTORE: 'Вернуть оригинал',
  TRANSFORM: 'Создать предпросмотр поворота или отражения',
  RESIZE: 'Создать предпросмотр изменения размера',
});

export function getVoiceConfirmationLabel(kind) {
  return typeof kind === 'string' && Object.hasOwn(LABELS, kind)
    ? LABELS[kind]
    : 'Подтвердить действие';
}
