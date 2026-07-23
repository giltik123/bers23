// IntentAnalyzer — pure rule-based intent detection. No AI, no API calls.

export const ACTIONS = {
  CHANGE_COLOR: 'change_color',
  REPLACE_OBJECT: 'replace_object',
  REMOVE_OBJECT: 'remove_object',
  ADD_OBJECT: 'add_object',
  CHANGE_MATERIAL: 'change_material',
  RETOUCH: 'retouch',
  BACKGROUND_EDIT: 'background_edit',
  WHOLE_IMAGE_EDIT: 'whole_image_edit',
  VIRTUAL_TRY_ON: 'virtual_try_on',
  FACE_EDIT: 'face_edit',
  HAIR_EDIT: 'hair_edit',
  CUSTOM_PROMPT: 'custom_prompt',
};

export const ACTION_LABELS = {
  change_color: 'Change Color',
  replace_object: 'Replace Object',
  remove_object: 'Remove Object',
  add_object: 'Add Object',
  change_material: 'Change Material',
  retouch: 'Retouch',
  background_edit: 'Background Edit',
  whole_image_edit: 'Whole Image Edit',
  virtual_try_on: 'Virtual Try-On',
  face_edit: 'Face Edit',
  hair_edit: 'Hair Edit',
  custom_prompt: 'Custom Prompt',
};

// Order matters: more specific intents first.
const RULES = [
  { action: ACTIONS.VIRTUAL_TRY_ON, patterns: [/try[\s-]?on/, /\bwear(ing)?\b/, /put on/] },
  { action: ACTIONS.HAIR_EDIT, patterns: [/\bhair(style|cut)?\b/, /\bbangs\b/, /\bblonde?\b|\bbrunette\b|\bcurly\b/] },
  { action: ACTIONS.FACE_EDIT, patterns: [/\bface\b|\bsmile\b|\beyes?\b|\bwrinkles?\b|\bbeard\b|\bmakeup\b/] },
  { action: ACTIONS.WHOLE_IMAGE_EDIT, patterns: [/whole (image|photo|picture)/, /entire (image|photo|picture)/, /\beverything\b/] },
  { action: ACTIONS.BACKGROUND_EDIT, patterns: [/\bbackground\b|\bbackdrop\b|\bbehind\b/] },
  { action: ACTIONS.REMOVE_OBJECT, patterns: [/\bremove\b|\bdelete\b|\berase\b|get rid of/] },
  { action: ACTIONS.REPLACE_OBJECT, patterns: [/\breplace\b|\bswap\b|turn .+ into/] },
  { action: ACTIONS.ADD_OBJECT, patterns: [/\badd\b|\binsert\b|\bplace an?\b/] },
  { action: ACTIONS.CHANGE_MATERIAL, patterns: [/\bmaterial\b|\bwooden?\b|\bmetal(lic)?\b|\bleather\b|\bglass\b|\bmarble\b|\bfabric\b|\bvelvet\b/] },
  { action: ACTIONS.CHANGE_COLOR, patterns: [/\bcolou?r\b|\bred\b|\bblue\b|\bgreen\b|\byellow\b|\bpurple\b|\bpink\b|\bblack\b|\bwhite\b|\borange\b|\bdarker\b|\blighter\b/] },
  { action: ACTIONS.RETOUCH, patterns: [/\bretouch\b|\bclean\b|\bfix\b|\benhance\b|\bsharpen\b|\bbrighten\b|\bsmooth\b/] },
];

const WHOLE_IMAGE_ACTIONS = [ACTIONS.WHOLE_IMAGE_EDIT, ACTIONS.BACKGROUND_EDIT, ACTIONS.ADD_OBJECT];

// Returns { action, target, scope, confidence, ambiguity[] }
export function analyzeIntent(prompt, selectedObject = null) {
  const text = (prompt || '').toLowerCase().trim();
  const matched = RULES.filter((r) => r.patterns.some((p) => p.test(text))).map((r) => r.action);

  const action = matched[0] || ACTIONS.CUSTOM_PROMPT;
  const scope = WHOLE_IMAGE_ACTIONS.includes(action) ? 'whole_image' : 'object';

  const ambiguity = [];
  if (matched.length > 1) {
    ambiguity.push(`Request could also mean: ${matched.slice(1).map((a) => ACTION_LABELS[a]).join(', ')}`);
  }
  if (scope === 'object' && !selectedObject) {
    ambiguity.push('No object selected for an object-scoped edit');
  }

  let confidence = 0.5;
  if (matched.length === 1) confidence = 0.9;
  else if (matched.length > 1) confidence = 0.65;
  if (scope === 'object' && selectedObject) confidence = Math.min(1, confidence + 0.1);

  return {
    action,
    actionLabel: ACTION_LABELS[action],
    target: selectedObject?.label || null,
    scope,
    confidence,
    ambiguity,
  };
}