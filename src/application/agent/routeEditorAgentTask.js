import { parseRussianVoiceIntent } from '../voice/parseRussianVoiceIntent.js';
import { interpretPhotoCommand } from '../editor/ai-first/interpretPhotoCommand.js';

const INVALID_TEXT = 'Введите текстовую задачу длиной до 850 символов.';
const LOCAL_HINT = 'Уточните поворот и итоговый размер, например: «Поверни фото вправо и затем сделай 1024 на 1024».';
const DIRECT_HINT = 'Эта команда требует отдельного инструмента редактора. AI Agent не должен незаметно добавлять поворот или изменение размера.';
const MAX_TEXT = 850;
const FORBIDDEN_CONTROL = /[\x00-\x08\x0e-\x1f\x7f]/u;


// This recognition is advisory, with the same broad geometry ceiling as the
// Voice draft parser. Core performs its own authoritative bounds verification.
const TEXT_MAX_DIMENSION = 16_384;
const TEXT_MAX_PIXELS = 24_000_000;
function admissibleTextTarget(width, height) {
  return Number.isSafeInteger(width) && Number.isSafeInteger(height) &&
    width > 0 && height > 0 && width <= TEXT_MAX_DIMENSION &&
    height <= TEXT_MAX_DIMENSION && width * height <= TEXT_MAX_PIXELS;
}
function reviewedTransformMode(text) {
  const parsed = parseRussianVoiceIntent(text);
  if (parsed?.kind === 'TRANSFORM') return parsed.params.mode;
  const match = text.match(/^поверни(?:\s+(?:фото|фотографию|изображение))?\s+(вправо|влево)$/iu);
  return match ? (match[1].toLowerCase() === 'вправо' ? 'ROTATE_90_CW' : 'ROTATE_270_CW') : null;
}
function compoundLocalDraft(instruction) {
  const match = instruction.match(/^(.+?)\s+(?:и затем|затем|и)\s+(?:сделай|установи размер)\s+(\d{1,5})\s*(?:на|x|х|×)\s*(\d{1,5})(?:\s*(?:пиксел(?:ей|я|ь|и)|px))?$/iu);
  if (!match) return null;
  const mode = reviewedTransformMode(match[1]);
  if (!mode) return null;
  const width = Number(match[2]), height = Number(match[3]);
  if (!admissibleTextTarget(width, height)) {
    return Object.freeze({ kind: 'CLARIFY', message: 'Размеры выходят за ограничения BERS: до 16384 пикселей по стороне и 24 Мп.' });
  }
  return Object.freeze({
    kind: 'LOCAL_WORKFLOW_DRAFT', mode, width, height,
    message: 'Подготовлен двухшаговый локальный сценарий. Проверьте поворот и размеры, затем отдельно подтвердите запуск.',
  });
}

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
  const compound = compoundLocalDraft(instruction);
  if (compound) return compound;
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

  if (voiceIntent?.kind === 'RESIZE') {
    const { width, height } = voiceIntent.params;
    if (!admissibleTextTarget(width, height)) {
      return Object.freeze({ kind: 'CLARIFY', message: 'Некорректный размер для редактора BERS.' });
    }
    return Object.freeze({
      kind: 'RESIZE_DRAFT', width, height,
      message: 'Подготовлен размер для штатного инструмента Resize. Откройте параметры, проверьте размер и отдельно запустите предпросмотр.',
    });
  }
  if (voiceIntent?.kind === 'TRANSFORM') {
    return Object.freeze({
      kind: 'TRANSFORM_DRAFT', mode: voiceIntent.params.mode,
      message: 'Подготовлен одиночный локальный поворот/отражение. Только по отдельному нажатию создаётся предпросмотр; сохранение требует Accept.',
    });
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
      (instruction.length < 3 || /^(?:поверни|отрази|отзеркаль|измени размер|обрежь|сделай\s+\d|rotate|resize|flip|crop)(?=\s|$|[.!?])/iu.test(instruction))) {
    return Object.freeze({ kind: 'CLARIFY', message: LOCAL_HINT });
  }
  return Object.freeze({
    kind: 'AI_STUDIO_DRAFT',
    instruction,
    message: 'Запрос перенесётся в AI Studio для выбора области и явного подтверждения облачной генерации. Ничего не отправляется автоматически.',
  });
}
