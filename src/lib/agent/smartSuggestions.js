import { createTask } from '@/lib/agent/taskModel';

// SmartSuggestions — rule-based follow-up improvements for the current plan.
export function suggestFor(tasks = [], objects = []) {
  const text = tasks.map((t) => `${t.label} ${t.customPrompt || ''} ${t.targetObject || ''}`).join(' ').toLowerCase();
  const labels = objects.map((o) => (o.label || '').toLowerCase());
  const suggestions = [];

  if (/hair/.test(text) && /color|recolor|dye|blonde|brunette|red|dark|light/.test(text)) {
    suggestions.push({ key: 'brows', label: 'Match eyebrow color', task: () => createTask({ label: 'Match Eyebrow Color', targetObject: 'face', customPrompt: 'Adjust the eyebrow color to naturally match the new hair color', estimatedCredits: 20, estimatedTime: 25000 }) });
  }
  if (/shirt|top|blouse|jacket/.test(text) && !/pants|jeans|trousers/.test(text)) {
    suggestions.push({ key: 'pants', label: 'Match pants to the new top', task: () => createTask({ label: 'Match Pants', type: 'recipe', recipe: 'clothing_change_pants', targetObject: 'pants', customPrompt: 'Change the pants to a style and color that complements the new top, with natural drape and fit', estimatedCredits: 30, estimatedTime: 30000 }) });
  }
  if (labels.some((l) => /person|face|woman|man|portrait/.test(l)) && !/skin|smooth|portrait enhancement/.test(text)) {
    suggestions.push({ key: 'portrait', label: 'Portrait enhancement', task: () => createTask({ label: 'Portrait Enhancement', type: 'recipe', recipe: 'skin_smooth', targetObject: 'face', estimatedCredits: 30, estimatedTime: 30000 }) });
  }
  return suggestions;
}