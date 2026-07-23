import { taskExtractor } from '@/lib/agent/taskExtractor';
import { taskValidator } from '@/lib/agent/taskValidator';
import { dependencyResolver } from '@/lib/agent/dependencyResolver';
import { taskOptimizer } from '@/lib/agent/taskOptimizer';

// TaskPlanner — turns raw parsed tasks into a complete, ordered, optimized execution plan.
class TaskPlanner {
  plan({ rawTasks, objects = [] }) {
    const extracted = taskExtractor.extract(rawTasks);
    const ordered = dependencyResolver.resolve(extracted);
    const optimized = taskOptimizer.optimize(ordered);
    const { issues } = taskValidator.validate(optimized, objects);
    return {
      tasks: optimized,
      issues,
      totalCredits: optimized.reduce((s, t) => s + t.estimatedCredits, 0),
      totalTimeMs: optimized.reduce((s, t) => s + t.estimatedTime, 0),
    };
  }
}

export const taskPlanner = new TaskPlanner();