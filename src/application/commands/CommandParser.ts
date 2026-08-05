import type { AICommand, AICommandEntity, AICommandIntent } from './AICommand';
import { createCommandId } from './AICommand';

interface ParseRule { readonly intent: AICommandIntent; readonly workflow: string | null; readonly capabilities: readonly string[]; readonly patterns: readonly RegExp[]; readonly entities?: (input: string) => readonly AICommandEntity[]; readonly confidence: number; }

const entity = (type: string, value: string, confidence = 0.9): AICommandEntity => Object.freeze({ type, value, confidence });
const includes = (input: string, pattern: RegExp) => pattern.test(input);

const rules: readonly ParseRule[] = Object.freeze([
  { intent: 'fashion_catalog_image', workflow: 'virtual-try-on', capabilities: ['virtual-try-on', 'person-preservation'], patterns: [/каталог/i, /магазин/i, /одежд/i, /костюм/i, /try.?on/i, /outfit/i, /catalog/i, /clothes/i], entities: (input) => [includes(input, /костюм|suit/i) ? entity('garment', 'suit') : entity('garment', 'clothes')], confidence: 0.94 },
  { intent: 'hair_color_change', workflow: 'hair-color-edit', capabilities: ['hair-color-edit', 'person-preservation'], patterns: [/цвет волос/i, /волос/i, /hair color/i], confidence: 0.92 },
  { intent: 'background_replacement', workflow: 'background-replacement', capabilities: ['background-replacement', 'subject-preservation'], patterns: [/замени фон/i, /фон/i, /replace background/i, /background/i], confidence: 0.9 },
  { intent: 'portrait_enhancement', workflow: 'portrait-enhancement', capabilities: ['portrait-enhancement', 'person-preservation'], patterns: [/портрет/i, /улучши лицо/i, /improve portrait/i, /portrait/i], confidence: 0.88 },
  { intent: 'style_transfer', workflow: 'image-edit-basic', capabilities: ['style-transfer', 'image-editing'], patterns: [/style transfer/i, /перенеси стиль/i, /стиль/i], confidence: 0.84 },
  { intent: 'artistic_edit', workflow: 'image-edit-basic', capabilities: ['artistic-edit', 'image-editing'], patterns: [/artistic/i, /арт/i, /художе/i], confidence: 0.82 },
  { intent: 'identity_transformation', workflow: 'portrait-enhancement', capabilities: ['identity-transformation'], patterns: [/измени лицо/i, /другое лицо/i, /старше/i, /моложе/i, /replace identity/i], confidence: 0.86 },
]);

export class CommandParser {
  parse(userInput: string): AICommand {
    const normalized = userInput.trim();
    const matched = rules.find((rule) => rule.patterns.some((pattern) => pattern.test(normalized)));
    const fallback = { intent: 'generic_edit' as AICommandIntent, workflow: 'image-edit-basic', capabilities: ['image-editing'], confidence: 0.55, entities: () => [] };
    const rule = matched || fallback;
    return Object.freeze({ id: createCommandId(), userInput: normalized, intent: rule.intent, entities: Object.freeze(rule.entities?.(normalized) || []), requiredCapabilities: Object.freeze([...rule.capabilities]), requiredWorkflow: rule.workflow, confidence: rule.confidence, status: 'PARSED', metadata: Object.freeze({ deterministic: true }) });
  }
}
