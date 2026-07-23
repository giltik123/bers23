import { recipeManager } from '@/lib/recipes/recipeManager';

// TaskValidator — sanity-checks tasks before they are queued. Issues never block
// execution outright; they are surfaced so the user can fix or disable tasks.
class TaskValidator {
  validate(tasks = [], objects = []) {
    const issues = [];
    const labels = objects.map((o) => (o.label || '').toLowerCase());
    for (const task of tasks) {
      if (!task.customPrompt && !task.recipe) {
        issues.push({ taskId: task.id, message: `"${task.label}" has no prompt or recipe` });
      }
      if (task.recipe && !recipeManager.get(task.recipe)) {
        issues.push({ taskId: task.id, message: `"${task.label}" references an unknown recipe` });
      }
      if (task.targetObject && labels.length && !labels.some((l) => l.includes(task.targetObject.toLowerCase()) || task.targetObject.toLowerCase().includes(l))) {
        issues.push({ taskId: task.id, message: `"${task.targetObject}" was not found among detected objects — the edit will apply best-effort` });
      }
      if (task.ambiguous) {
        issues.push({ taskId: task.id, message: `"${task.label}" is ambiguous: ${task.ambiguityReason || 'please review the prompt'}` });
      }
    }
    return { valid: issues.length === 0, issues };
  }
}

export const taskValidator = new TaskValidator();