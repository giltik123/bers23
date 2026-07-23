import { styleLock } from '@/lib/scene/styleLock';

// PromptCompiler — turns the AI Planner's structured prompt into the final provider prompt.
// Internal preservation directives are appended automatically and NEVER shown to the user.
// When Style Lock is enabled, hidden Scene Memory preservation instructions are injected too.
const INTERNAL_DIRECTIVES = [
  'Preserve identity.',
  'Preserve lighting.',
  'Preserve camera angle.',
  'Preserve perspective.',
  'Modify only masked region.',
  'Maintain photorealism.',
  'Maintain high detail.',
];

class PromptCompiler {
  // ({ instruction, plan, objects }) → { prompt (full, provider-only), userPrompt (safe to display) }
  compile({ instruction, plan, objects = [] }) {
    const labels = objects.map((o) => o.label).filter(Boolean);
    const scope = labels.length
      ? `Edit ONLY the ${labels.join(' and ')}: `
      : 'Edit the image: ';

    const base = (plan?.compiled_instruction || plan?.prompt || instruction || '').trim();
    const userPrompt = scope + base;
    // Hidden Scene Memory preservation directives (empty when Style Lock is off or no memory).
    const sceneDirectives = styleLock.activeDirectives();
    const prompt = `${userPrompt}. Keep every other part of the image exactly identical — same composition, colors and background. ${INTERNAL_DIRECTIVES.join(' ')}${sceneDirectives ? ` ${sceneDirectives}` : ''}`;

    return { prompt, userPrompt };
  }
}

export const promptCompiler = new PromptCompiler();