import type { ExecutionPlan, ExecutionPlanner } from '../execution';
import type { ExecutionAnalytics } from '../intelligence';
import type { ContextBuilder, MemoryStore } from '../memory';
import type { ManagedExecutionResult, ExecutionRuntime } from '../runtime';
import type { CapabilityRouter, RoutingDecision } from '../router';
import type { WorkerManager } from '../workers';
import { OrchestrationDebugger, type OrchestrationDebugSnapshot } from './OrchestrationDebugger';
import { OrchestrationEvents } from './OrchestrationEvents';
import { OrchestrationPolicy, type OrchestrationPolicyResult } from './OrchestrationPolicy';
import { OrchestrationHistory, type OrchestrationRuntimeInspection } from './OrchestrationHistory';
import { createSession, updateSession, type OrchestrationSession } from './OrchestrationSession';
import { freezeContext, type OrchestrationContext, type OrchestrationRequest } from './OrchestrationContext';
import { OrchestrationPolicyError, OrchestrationSessionNotFoundError } from './OrchestrationErrors';

export interface AIOrchestratorServices { readonly router: CapabilityRouter; readonly planner: ExecutionPlanner; readonly runtime: ExecutionRuntime; readonly workers?: WorkerManager; readonly memory?: { readonly builder: ContextBuilder; readonly store?: MemoryStore }; readonly intelligence?: { readonly analytics: ExecutionAnalytics }; readonly policy?: OrchestrationPolicy; readonly history?: OrchestrationHistory; readonly events?: OrchestrationEvents; }
export interface OrchestrationPlanResult { readonly session: OrchestrationSession; readonly context: OrchestrationContext; readonly route: RoutingDecision; readonly plan: ExecutionPlan; readonly policy: OrchestrationPolicyResult; readonly debug?: OrchestrationDebugSnapshot; }
export interface OrchestrationExecutionResult extends OrchestrationPlanResult { readonly session: OrchestrationSession; readonly runtime: ManagedExecutionResult; }

/** Coordinates memory, routing, planning, policy, runtime, workers, and analytics through injected public platform APIs. */
export class AIOrchestrator {
  readonly historyStore: OrchestrationHistory; readonly events: OrchestrationEvents;
  private readonly policy: OrchestrationPolicy; private readonly debugger = new OrchestrationDebugger();
  private readonly sessions = new Map<string, OrchestrationSession>(); private readonly contexts = new Map<string, OrchestrationContext>();
  private readonly routes = new Map<string, RoutingDecision>(); private readonly plans = new Map<string, ExecutionPlan>(); private readonly runtimes = new Map<string, ManagedExecutionResult>();
  constructor(private readonly services: AIOrchestratorServices) { this.policy = services.policy ?? new OrchestrationPolicy(); this.historyStore = services.history ?? new OrchestrationHistory(); this.events = services.events ?? new OrchestrationEvents(); }

  /** Builds memory context, route, and execution plan without running the plan. */
  async plan(request: OrchestrationRequest): Promise<OrchestrationPlanResult> {
    let session = createSession(request.request, request.metadata); this.sessions.set(session.sessionId, session); await this.events.emit('orchestration.started', session.sessionId, { request: request.request });
    const context = this.buildContext(request); this.contexts.set(session.sessionId, context); session = this.setSession(updateSession(session, { state: 'PLANNING' }));
    const route = await this.services.router.route(request.request); const plan = this.services.planner.createPlan(route); const policy = this.policy.evaluate(context, route, plan);
    session = this.setSession(updateSession(session, { state: policy.allowed ? 'READY' : 'FAILED', routeId: route.route.routeId, planId: plan.id, errors: policy.violations }));
    this.routes.set(session.sessionId, route); this.plans.set(session.sessionId, plan); await this.events.emit('orchestration.planned', session.sessionId, { routeId: route.route.routeId, planId: plan.id });
    if (!policy.allowed) { this.record(session, route, plan, undefined, undefined); throw new OrchestrationPolicyError(policy.violations); }
    return Object.freeze({ session, context, route, plan, policy, debug: this.debugger.snapshot(session, context, route, plan) });
  }

  /** Runs the complete orchestration pipeline and records memory plus analytics feedback. */
  async execute(request: OrchestrationRequest): Promise<OrchestrationExecutionResult> {
    const planned = await this.plan(request); let session = this.setSession(updateSession(planned.session, { state: 'RUNNING' })); await this.events.emit('orchestration.runtime.started', session.sessionId, { planId: planned.plan.id });
    try {
      const unsubscribeStarted = this.services.runtime.events.on('execution.started', (event) => { if (event.planId === planned.plan.id) this.setSession(updateSession(this.require(session.sessionId), { runtimeId: event.executionId })); });
      const runtime = await this.services.runtime.execute(planned.plan); unsubscribeStarted(); this.runtimes.set(session.sessionId, runtime);
      const finalState = runtime.state === 'COMPLETED' ? 'COMPLETED' : runtime.state === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
      session = this.setSession(updateSession(session, { state: finalState, runtimeId: runtime.executionId, completedAt: new Date().toISOString(), result: runtime, errors: runtime.error ? [runtime.error] : [] }));
      this.rememberOutcome(request, session, planned.route, planned.plan, runtime); this.record(session, planned.route, planned.plan, runtime, runtime);
      await this.events.emit(finalState === 'COMPLETED' ? 'orchestration.completed' : finalState === 'CANCELLED' ? 'orchestration.cancelled' : 'orchestration.failed', session.sessionId, { runtimeId: runtime.executionId });
      return Object.freeze({ ...planned, session, runtime, debug: this.debugger.snapshot(session, planned.context, planned.route, planned.plan, runtime) });
    } catch (error) {
      session = this.setSession(updateSession(session, { state: 'FAILED', completedAt: new Date().toISOString(), errors: [message(error)] })); this.record(session, planned.route, planned.plan, undefined, undefined); await this.events.emit('orchestration.failed', session.sessionId, { error: message(error) }); throw error;
    }
  }

  pause(sessionId: string): OrchestrationSession { const session = this.require(sessionId); if (session.runtimeId) this.services.runtime.pause(session.runtimeId); return this.setSession(updateSession(session, { state: 'PAUSED' })); }
  resume(sessionId: string): OrchestrationSession { const session = this.require(sessionId); if (session.runtimeId) this.services.runtime.resume(session.runtimeId); void this.events.emit('orchestration.recovered', sessionId); return this.setSession(updateSession(session, { state: 'RECOVERING' })); }
  cancel(sessionId: string): OrchestrationSession { const session = this.require(sessionId); if (session.runtimeId) this.services.runtime.cancel(session.runtimeId); void this.events.emit('orchestration.cancelled', sessionId); return this.setSession(updateSession(session, { state: 'CANCELLED', completedAt: new Date().toISOString() })); }
  history(): OrchestrationHistory { return this.historyStore; }
  inspect(): OrchestrationRuntimeInspection { const latestPlan = [...this.plans.values()].at(-1); return Object.freeze({ currentSessions: this.sessions.size, activeRuntime: this.services.runtime.inspect(), memoryUsage: this.services.memory?.store ? this.services.memory.store.query({ limit: 10000 }, { tenantId: '*', userId: '*' }).length : 0, executionGraph: latestPlan?.executionOrder, workerStatus: this.services.workers ? Object.freeze(this.services.workers.registry.getAll().map((worker) => Object.freeze({ id: worker.id, capabilities: worker.capabilities, health: this.services.workers!.health.get(worker.id) }))) : Object.freeze([]), providerStatus: Object.freeze([...this.routes.values()].at(-1)?.providers ?? []), routingSummary: Object.freeze([...this.routes.values()].at(-1)?.capabilities ?? []), analyticsSummary: this.services.intelligence ? this.services.intelligence.analytics.performance.analyzeAll() : Object.freeze([]) }); }

  private buildContext(request: OrchestrationRequest): OrchestrationContext { const memory = this.services.memory?.builder.build({ request: request.request, tenantId: request.tenantId, userId: request.userId, projectId: request.projectId, executionHistory: this.historyStore.recent(10) }); return freezeContext({ tenantId: request.tenantId, userId: request.userId, projectId: request.projectId, budget: request.budget, memory, executionHistory: this.historyStore.recent(10), routingHistory: Object.freeze([]), analytics: Object.freeze({ statistics: this.historyStore.statistics() }), metadata: Object.freeze({ ...(request.metadata ?? {}) }) }); }
  private rememberOutcome(request: OrchestrationRequest, session: OrchestrationSession, route: RoutingDecision, plan: ExecutionPlan, runtime: ManagedExecutionResult): void { this.services.memory?.store?.save({ namespace: 'orchestration', category: 'EXECUTION_PATTERN', owner: { tenantId: request.tenantId, userId: request.userId, projectId: request.projectId }, visibility: request.projectId ? 'PROJECT' : 'PRIVATE', value: { sessionId: session.sessionId, routeId: route.route.routeId, planId: plan.id, state: runtime.state }, tags: [...route.capabilities], confidence: runtime.state === 'COMPLETED' ? 0.9 : 0.4 }); this.services.intelligence?.analytics.record({ executionId: runtime.executionId, routeId: route.route.routeId, capability: route.capabilities[0] ?? 'unknown', provider: route.providers[0] ?? 'none', worker: route.providers[0] ?? 'none', duration: plan.estimatedDuration, cost: plan.estimatedCost, status: runtime.state === 'COMPLETED' ? 'SUCCESS' : runtime.state === 'CANCELLED' ? 'CANCELLED' : 'FAILED', retryCount: Object.values(runtime.attempts).reduce((sum, attempts) => sum + Math.max(0, attempts - 1), 0), timestamp: new Date().toISOString(), metadata: { sessionId: session.sessionId } }); }
  private record(session: OrchestrationSession, route?: RoutingDecision, plan?: ExecutionPlan, runtime?: ManagedExecutionResult, result?: unknown): void { this.historyStore.record({ request: session.request, session, route, plan, runtime, duration: session.completedAt ? Date.parse(session.completedAt) - Date.parse(session.startedAt) : 0, status: session.state, provider: route?.providers ?? Object.freeze([]), cost: plan?.estimatedCost ?? 0, result }); }
  private setSession(session: OrchestrationSession): OrchestrationSession { this.sessions.set(session.sessionId, session); return session; }
  private require(sessionId: string): OrchestrationSession { const session = this.sessions.get(sessionId); if (!session) throw new OrchestrationSessionNotFoundError(sessionId); return session; }
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
