// DependencyResolver — orders tasks correctly. Explicit dependencies are honored
// via topological sort; ties are broken by editing phase (removals before object
// edits before background before global lighting/grading).
const phaseOf = (task) => {
  const a = (task.action || '').toLowerCase();
  const t = `${task.label} ${task.customPrompt || ''}`.toLowerCase();
  if (a === 'remove' || /remove|erase|delete/.test(t)) return 0;
  if (a === 'background' || /background|sky|scene/.test(t)) return 2;
  if (a === 'relight' || /light|sharpen|contrast|color grade|dramatic/.test(t)) return 3;
  return task.targetObject ? 1 : 3;
};

class DependencyResolver {
  resolve(tasks = []) {
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
    const indegree = Object.fromEntries(tasks.map((t) => [t.id, 0]));
    const dependents = Object.fromEntries(tasks.map((t) => [t.id, []]));
    for (const t of tasks) {
      for (const dep of t.dependencies) {
        if (byId[dep]) { indegree[t.id]++; dependents[dep].push(t.id); }
      }
    }
    const ready = tasks.filter((t) => indegree[t.id] === 0);
    const ordered = [];
    while (ready.length) {
      ready.sort((a, b) => phaseOf(a) - phaseOf(b));
      const next = ready.shift();
      ordered.push(next);
      for (const depId of dependents[next.id]) {
        if (--indegree[depId] === 0) ready.push(byId[depId]);
      }
    }
    // Cycle fallback: append any tasks not reached, in original order.
    for (const t of tasks) if (!ordered.includes(t)) ordered.push(t);
    return ordered;
  }
}

export const dependencyResolver = new DependencyResolver();