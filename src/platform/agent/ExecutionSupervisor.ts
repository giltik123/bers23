import type { AIOrchestrator, OrchestrationExecutionResult } from '../orchestrator';
import type { AgentContext } from './AgentContext';
import { AgentCancelledError } from './AgentErrors';
import type { AgentTask } from './TaskPlanner';
export interface SupervisionResult { readonly task: AgentTask; readonly result: OrchestrationExecutionResult; readonly attempts: number; }
export interface ExecutionSupervisorOptions { readonly maxRetries?: number; readonly recover?: boolean; }

/** Runs agent tasks through AIOrchestrator sequentially and supervises retry/recovery boundaries. */
export class ExecutionSupervisor {
  private readonly cancelled = new Set<string>();
  private readonly completedBySession = new Map<string, Set<string>>();
  constructor(private readonly orchestrator: AIOrchestrator, private readonly options: ExecutionSupervisorOptions = {}) {}
  cancel(sessionId: string): void { this.cancelled.add(sessionId); }
  async run(sessionId: string, tasks: readonly AgentTask[], context: AgentContext): Promise<readonly SupervisionResult[]> {
    const results: SupervisionResult[] = []; const completed = this.completedBySession.get(sessionId) ?? new Set<string>(); this.completedBySession.set(sessionId, completed);
    for (const task of tasks) {
      if (this.cancelled.has(sessionId)) throw new AgentCancelledError(sessionId);
      if (task.dependencies.some((dependency) => !completed.has(dependency))) throw new Error(`Task "${task.id}" dependency is not completed.`);
      const result = await this.runTask(task, context); results.push(result); completed.add(task.id);
    }
    return Object.freeze(results);
  }
  private async runTask(task: AgentTask, context: AgentContext): Promise<SupervisionResult> {
    const max = this.options.maxRetries ?? 1; let lastError: unknown;
    for (let attempt = 1; attempt <= max + 1; attempt += 1) {
      try { const result = await this.orchestrator.execute({ request: task.request, tenantId: context.tenantId, userId: context.userId, projectId: context.projectId, budget: context.budget, metadata: { ...context.metadata, agentTaskId: task.id, attempt } }); return Object.freeze({ task, result, attempts: attempt }); }
      catch (error) { lastError = error; if (attempt > max) break; }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
