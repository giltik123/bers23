// TaskOptimizer — merges compatible edits targeting the same object into one task,
// avoiding unnecessary provider calls. Only adjacent-in-order, dependency-safe tasks merge.
const MERGEABLE_ACTIONS = ['recolor', 'restyle', 'enhance', 'replace', 'add', 'other'];

class TaskOptimizer {
  optimize(orderedTasks = []) {
    const result = [];
    const remap = {}; // merged task id → surviving task id

    for (const task of orderedTasks) {
      const prev = result[result.length - 1];
      const canMerge =
        prev &&
        task.targetObject &&
        prev.targetObject === task.targetObject &&
        MERGEABLE_ACTIONS.includes((task.action || 'other').toLowerCase()) &&
        MERGEABLE_ACTIONS.includes((prev.action || 'other').toLowerCase()) &&
        !task.dependencies.some((d) => d !== prev.id && !remap[d]);

      if (canMerge) {
        prev.label = `${prev.label} + ${task.label}`;
        prev.customPrompt = [prev.customPrompt, task.customPrompt].filter(Boolean).join('. ');
        prev.estimatedCredits = Math.round((prev.estimatedCredits + task.estimatedCredits) * 0.7);
        prev.estimatedTime = Math.max(prev.estimatedTime, task.estimatedTime) + 5000;
        prev.merged = true;
        remap[task.id] = prev.id;
      } else {
        result.push(task);
      }
    }

    // Re-point dependencies from merged tasks to their survivors.
    for (const t of result) {
      t.dependencies = [...new Set(t.dependencies.map((d) => remap[d] || d))].filter((d) => d !== t.id && result.some((x) => x.id === d));
    }
    return result;
  }
}

export const taskOptimizer = new TaskOptimizer();