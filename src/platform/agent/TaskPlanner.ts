import type { AgentContext } from './AgentContext';
import type { ResolvedGoal } from './GoalResolver';
export interface AgentTask { readonly id: string; readonly request: string; readonly dependencies: readonly string[]; readonly goal: string; readonly strategy: 'single' | 'sequential' | 'recovery'; readonly metadata: Readonly<Record<string, unknown>>; }

/** Decomposes an agent goal into ordered orchestration requests. */
export class TaskPlanner {
  plan(request: string, goal: ResolvedGoal, context: AgentContext): readonly AgentTask[] {
    const fragments = splitRequest(request, goal.intent); const tasks = fragments.map((fragment, index) => Object.freeze({ id: `task-${index + 1}`, request: fragment, dependencies: Object.freeze(index === 0 ? [] : [`task-${index}`]), goal: goal.intent, strategy: fragments.length === 1 ? 'single' : 'sequential', metadata: Object.freeze({ tenantId: context.tenantId, projectId: context.projectId }) } satisfies AgentTask));
    return Object.freeze(tasks);
  }
}
function splitRequest(request: string, intent: string): readonly string[] { const normalized = request.trim(); if (intent === 'creative-workflow') return Object.freeze(['Select creative direction', 'Prepare subject and assets', 'Replace background and lighting', 'Validate style consistency']); const parts = normalized.split(/\s+(?:then|and then|после этого|затем)\s+|\s*\+\s*/i).map((part) => part.trim()).filter(Boolean); return Object.freeze(parts.length > 1 ? parts : [normalized]); }
