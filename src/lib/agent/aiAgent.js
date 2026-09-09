import { requestParser } from '@/lib/agent/requestParser';
import { taskPlanner } from '@/lib/agent/taskPlanner';
import { executionQueue } from '@/lib/agent/executionQueue';
import { taskHistory } from '@/lib/agent/taskHistory';

// Legacy/advisory compatibility facade only. It may parse and preview a browser-local
// plan, but it owns no production execution, Artifact lineage, Project mutation,
// provider/Billing selection, retry identity or terminal-state authority. Production
// Agent execution is admitted by Core and runs through WorkflowContinuation + ExecutionRun.
class AIAgent {
  async createPlan({ request, objects = [] }) {
    const rawTasks = await requestParser.parse({ request, objects });
    if (!rawTasks.length) throw new Error('Could not identify any edits in that request — try rephrasing.');
    const plan = taskPlanner.plan({ rawTasks, objects });
    taskHistory.clear();
    executionQueue.load(plan.tasks);
    return plan;
  }
}

export const aiAgent = new AIAgent();