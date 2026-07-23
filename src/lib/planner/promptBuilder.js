// PromptBuilder — assembles the final edit prompt. No AI calls; pure templating.

const PRESERVATION_RULES = [
  'Keep every other part of the image exactly identical',
  'Preserve composition, lighting, perspective and colors',
  'Do not alter the background unless explicitly requested',
];

const SAFETY_RULES = [
  'No explicit, violent or illegal content',
  'Do not change the identity of any person unless explicitly requested',
];

const QUALITY_RULES = [
  'Photorealistic result matching the source image quality',
  'Seamless blending at edit boundaries',
];

// Returns { raw, structured }
export function buildPrompt({ intent, object, instruction }) {
  const target = object?.label || (intent?.scope === 'whole_image' ? 'the whole image' : 'the selected object');

  const structured = {
    target_object: target,
    action: intent?.action || 'custom_prompt',
    modification: instruction,
    preservation_rules: PRESERVATION_RULES,
    restrictions: [`Edit ONLY ${target}`, 'No changes outside the target region'],
    safety_rules: SAFETY_RULES,
    quality_instructions: QUALITY_RULES,
  };

  const raw =
    `Edit ONLY the ${target}: ${instruction}. ` +
    `${PRESERVATION_RULES.join('. ')}. ` +
    `${QUALITY_RULES.join('. ')}.`;

  return { raw, structured };
}