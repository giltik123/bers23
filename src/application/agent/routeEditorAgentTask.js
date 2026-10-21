import { parseRussianVoiceIntent } from '../voice/parseRussianVoiceIntent.js';
import { interpretPhotoCommand } from '../editor/ai-first/interpretPhotoCommand.js';

const INVALID_TEXT = 'Введите текстовую задачу длиной до 850 символов.';
const LOCAL_HINT = 'Уточните поворот и итоговый размер, например: «Поверни фото вправо и затем сделай 1024 на 1024».';
const DIRECT_HINT = 'Эта команда требует отдельного инструмента редактора. AI Agent не должен незаметно добавлять поворот или изменение размера.';
const MAX_TEXT = 850;
const FORBIDDEN_CONTROL = /[\x00-\x08\x0e-\x1f\x7f]/u;

/**
 * Read-only UX task router, NOT the production Agent/AEE authority.
 * It never creates execution tickets, runs models, charges credits or edits
 * Project state. All mutations remain behind explicit Core-bound controls.
 */
export function routeEditorAgentTask(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim() ||
      rawText.length > MAX_TEXT || FORBIDDEN_CONTROL.test(rawText)) {
    return Object.freeze({ kind: 'CLARIFY', message: INVALID_TEXT });
  }
  const instruction = rawText.trim();
  let voiceIntent;
  try {
    voiceIntent = parseRussianVoiceIntent(instruction);
  } catch {
    return Object.freeze({ kind: 'CLARIFY', message: INVALID_TEXT });
  }

  if (voiceIntent?.kind === 'AGENT_PROPOSAL') {
    const { mode, width, height } = voiceIntent.params;
    if (typeof mode === 'string' && Number.isSafeInteger(width) && Number.isSafeInteger(height)) {
      return Object.freeze({
        kind: 'LOCAL_WORKFLOW_DRAFT',
        mode, width, height,
        message: 'Подготовлен локальный сценарий «поворот → размер → Core verify». Проверьте параметры и отдельно подтвердите запуск.',
      });
    }
    return Object.freeze({ kind: 'CLARIFY', message: LOCAL_HINT });
  }

  if (voiceIntent?.kind === 'TRYON_SELECT_PROPOSAL' || voiceIntent?.kind === 'WARDROBE_QUERY' ||
      (voiceIntent?.kind === 'NAVIGATE' && voiceIntent.params.tab === 'fashion')) {
    return Object.freeze({
      kind: 'FASHION_DRAFT',
      message: 'Откройте Fashion и выберите реальную вещь из гардероба. Примерка запускается только после подтверждения.',
    });
  }
  if (voiceIntent?.kind === 'AMBIGUOUS') {
    return Object.freeze({ kind: 'CLARIFY', message: voiceIntent.params.reason || LOCAL_HINT });
  }
  if (voiceIntent) {
    return Object.freeze({ kind: 'CLARIFY', message: DIRECT_HINT });
  }

  const interpreted = interpretPhotoCommand(instruction);
  if (interpreted.kind === 'FASHION') {
    return Object.freeze({
      kind: 'FASHION_DRAFT',
      message: 'Для примерки нужна выбранная вещь и подтверждение в Fashion.',
    });
  }
  if (interpreted.kind === 'CLARIFY' &&
      (instruction.length < 3 || /^(?:поверни|отрази|измени размер|обрежь|rotate|resize|flip|crop)\b/iu.test(instruction))) {
    return Object.freeze({ kind: 'CLARIFY', message: LOCAL_HINT });
  }
  return Object.freeze({
    kind: 'AI_STUDIO_DRAFT',
    instruction,
    message: 'Запрос перенесётся в AI Studio для выбора области и явного подтверждения облачной генерации. Ничего не отправляется автоматически.',
  });
}
