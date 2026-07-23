import { requestParser } from '@/lib/agent/requestParser';
import { taskPlanner } from '@/lib/agent/taskPlanner';
import { executionQueue } from '@/lib/agent/executionQueue';
import { taskHistory } from '@/lib/agent/taskHistory';

// AIAgent — facade. Converts one natural-language request into a full execution plan.
// It NEVER edits images: execution flows Agent → Recipe Engine → AI Planner → Editing Engine → Provider.
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