// Task Model — the unit of work the AI Agent produces. Tasks are executed ONLY via
// Recipe Engine → AI Planner → Editing Engine; the agent never touches providers.
export const TASK_STATUS = ['pending', 'running', 'done', 'failed', 'skipped'];

let counter = 0;
export const taskId = () => `task_${Date.now().toString(36)}_${counter++}`;

export function createTask({
  label,
  type = 'custom',          // 'recipe' | 'custom'
  targetObject = null,       // object label hint, e.g. 'jacket'
  recipe = null,             // recipe id from the Recipe Library
  customPrompt = null,       // user-editable prompt (overrides compiled recipe prompt)
  variables = {},
  dependencies = [],         // ids of tasks that must run first
  estimatedCredits = 30,
  estimatedTime = 30000,
  ambiguous = false,
  ambiguityReason = null,
}) {
  return {
    id: taskId(),
    label, type, targetObject, recipe, customPrompt, variables,
    dependencies, estimatedCredits, estimatedTime,
    status: 'pending', enabled: true, error: null,
    ambiguous, ambiguityReason,
  };
}