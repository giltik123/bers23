// ObjectResolver — decides WHICH object an edit applies to. Pure logic, no AI.

// Returns { object, confidence, strategy, needsClarification }
export function resolveObject({ objects = [], selectedObject = null, prompt = '', intent = null }) {
  // 1. Explicit user selection always wins.
  if (selectedObject) {
    return { object: selectedObject, confidence: 1, strategy: 'user_selection', needsClarification: false };
  }

  // 2. Try matching an object label mentioned in the prompt.
  const text = (prompt || '').toLowerCase();
  const match = objects.find((o) => o.label && text.includes(o.label.toLowerCase()));
  if (match) {
    return { object: match, confidence: 0.75, strategy: 'label_match', needsClarification: false };
  }

  // 3. Whole-image scoped intents don't need a specific object.
  if (intent?.scope === 'whole_image') {
    return { object: null, confidence: 0.7, strategy: 'whole_image', needsClarification: false };
  }

  // 4. Nothing resolvable — the planner must ask the user to clarify.
  return { object: null, confidence: 0, strategy: 'none', needsClarification: true };
}