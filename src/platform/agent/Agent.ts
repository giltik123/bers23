import type { AIOrchestrator } from '../orchestrator';
import { AgentDebugger, type AgentDebugSnapshot } from './AgentDebugger';
import { AgentEvents } from './AgentEvents';
import { AgentHistory } from './AgentHistory';
import { AgentMemoryBridge, type AgentMemoryBridgeServices } from './AgentMemoryBridge';
import { createAgentSession, updateAgentSession, type AgentSession } from './AgentSession';
import type { AgentContext, AgentRequest } from './AgentContext';
import { AgentSessionNotFoundError } from './AgentErrors';
import { ExecutionSupervisor } from './ExecutionSupervisor';
import { GoalResolver, type ResolvedGoal } from './GoalResolver';
import { TaskPlanner, type AgentTask } from './TaskPlanner';

export interface AgentOptions extends AgentMemoryBridgeServices { readonly maxRetries?: number; readonly goalResolver?: GoalResolver; readonly taskPlanner?: TaskPlanner; readonly supervisor?: ExecutionSupervisor; readonly history?: AgentHistory; readonly events?: AgentEvents; }
export interface AgentResponse { readonly session: AgentSession; readonly goal: ResolvedGoal; readonly tasks: readonly AgentTask[]; readonly results: readonly unknown[]; readonly context: AgentContext; readonly debug: AgentDebugSnapshot; }
export interface AgentInspection { readonly currentSessions: number; readonly activeSessions: readonly AgentSession[]; readonly history: ReturnType<AgentHistory['statistics']>; readonly orchestrator: unknown; }

/** AI Agent core: interprets user intent, decomposes tasks, and delegates execution to AIOrchestrator. */
export class Agent {
  readonly events: AgentEvents; readonly historyStore: AgentHistory;
  private readonly goalResolver: GoalResolver; private readonly taskPlanner: TaskPlanner; private readonly memory: AgentMemoryBridge; private readonly supervisor: ExecutionSupervisor; private readonly debugger = new AgentDebugger();
  private readonly sessions = new Map<string, AgentSession>(); private readonly tasks = new Map<string, readonly AgentTask[]>(); private readonly contexts = new Map<string, AgentContext>();
  constructor(private readonly orchestrator: AIOrchestrator, options: AgentOptions = {}) { this.events = options.events ?? new AgentEvents(); this.historyStore = options.history ?? new AgentHistory(); this.goalResolver = options.goalResolver ?? new GoalResolver(); this.taskPlanner = options.taskPlanner ?? new TaskPlanner(); this.memory = new AgentMemoryBridge(options); this.supervisor = options.supervisor ?? new ExecutionSupervisor(orchestrator, { maxRetries: options.maxRetries ?? 1 }); }

  /** Runs the full Agent pipeline over public Platform APIs and returns an immutable response. */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    let session = this.setSession(createAgentSession(request)); await this.events.emit('agent.started', session.sessionId, { request: request.request });
    const context = this.memory.buildContext(request); this.contexts.set(session.sessionId, context);
    try {
      session = this.setSession(updateAgentSession(session, { state: 'RESOLVING_GOAL' })); const goal = this.goalResolver.resolve(request.request); session = this.setSession(updateAgentSession(session, { goal: goal.intent })); await this.events.emit('agent.goal.resolved', session.sessionId, { goal: goal.intent });
      session = this.setSession(updateAgentSession(session, { state: 'PLANNING_TASKS' })); const tasks = this.taskPlanner.plan(request.request, goal, context); this.tasks.set(session.sessionId, tasks); session = this.setSession(updateAgentSession(session, { taskIds: tasks.map((task) => task.id) })); await this.events.emit('agent.tasks.planned', session.sessionId, { tasks: tasks.length });
      session = this.setSession(updateAgentSession(session, { state: 'RUNNING' })); const supervised = await this.runTasks(session.sessionId, tasks, context); const results = Object.freeze(supervised.map((item) => item.result));
      session = this.setSession(updateAgentSession(session, { state: 'COMPLETED', completedAt: new Date().toISOString(), result: results })); this.memory.remember(session, results); this.record(session, tasks, results); await this.events.emit('agent.completed', session.sessionId, { tasks: tasks.length });
      return Object.freeze({ session, goal, tasks, results, context, debug: this.debugger.snapshot(session, context, tasks, results) });
    } catch (error) {
      session = this.setSession(updateAgentSession(session, { state: session.state === 'CANCELLED' ? 'CANCELLED' : 'FAILED', completedAt: new Date().toISOString(), errors: [message(error)] })); this.memory.remember(session, { error: message(error) }); this.record(session, this.tasks.get(session.sessionId) ?? Object.freeze([]), { error: message(error) }); await this.events.emit(session.state === 'CANCELLED' ? 'agent.cancelled' : 'agent.failed', session.sessionId, { error: message(error) }); throw error;
    }
  }

  cancel(sessionId: string): AgentSession { const session = this.require(sessionId); this.supervisor.cancel(sessionId); return this.setSession(updateAgentSession(session, { state: 'CANCELLED', completedAt: new Date().toISOString() })); }
  history(): AgentHistory { return this.historyStore; }
  inspect(): AgentInspection { return Object.freeze({ currentSessions: this.sessions.size, activeSessions: Object.freeze([...this.sessions.values()].filter((session) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(session.state))), history: this.historyStore.statistics(), orchestrator: this.orchestrator.inspect() }); }
  private async runTasks(sessionId: string, tasks: readonly AgentTask[], context: AgentContext) { const results = []; for (const task of tasks) { if (this.require(sessionId).state === 'CANCELLED') throw new Error(`Agent session "${sessionId}" was cancelled.`); await this.events.emit('agent.task.started', sessionId, { taskId: task.id }); const [result] = await this.supervisor.run(sessionId, [task], context); results.push(result); await this.events.emit('agent.task.completed', sessionId, { taskId: task.id }); if (this.require(sessionId).state === 'CANCELLED') throw new Error(`Agent session "${sessionId}" was cancelled.`); } return Object.freeze(results); }
  private record(session: AgentSession, tasks: readonly AgentTask[], result: unknown): void { this.historyStore.record({ session, tasks, duration: session.completedAt ? Date.parse(session.completedAt) - Date.parse(session.startedAt) : 0, status: session.state, result }); }
  private setSession(session: AgentSession): AgentSession { this.sessions.set(session.sessionId, session); return session; }
  private require(sessionId: string): AgentSession { const session = this.sessions.get(sessionId); if (!session) throw new AgentSessionNotFoundError(sessionId); return session; }
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
