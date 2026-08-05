import type { WorkflowInspection } from '../../platform/workflow/WorkflowDefinition';
import type { WorkflowRun } from '../../platform/workflow/WorkflowExecution';
import { GatewayAuthorizationError, GatewayBudgetExceededError, GatewayCancelledError, GatewayExecutionError, GatewayPolicyRejectedError, GatewayWorkflowError } from './GatewayErrors';
import { GatewayMetrics } from './GatewayMetrics';
import type { ApplicationContext, GatewayPolicyDecision, GatewayRequest } from './GatewayRequest';
import type { GatewayResponse } from './GatewayResponse';
import { GatewaySession } from './GatewaySession';

export interface GatewayAgentDecision { readonly workflowId: string; readonly confidence?: number; readonly riskLevel?: 'low' | 'medium' | 'high'; readonly capabilities?: readonly string[]; readonly confirmationRequired?: boolean; readonly fallbackWorkflowId?: string; readonly metadata?: Record<string, unknown>; }
export interface GatewayAgent { process(context: ApplicationContext): Promise<GatewayAgentDecision> | GatewayAgentDecision; }
export interface GatewayWorkflowEngine { execute(request: { workflowId?: string; intent?: string; input?: Record<string, unknown>; policy?: Record<string, unknown>; signal?: AbortSignal }): Promise<WorkflowRun>; inspect(workflowId: string): WorkflowInspection; }
export interface GatewayIdentityService { authorize(request: GatewayRequest): Promise<GatewayPolicyDecision> | GatewayPolicyDecision; }
export interface GatewayMemoryService { load(context: Pick<GatewayRequest, 'userId' | 'tenantId' | 'projectId'>): Promise<Record<string, unknown>> | Record<string, unknown>; update(context: ApplicationContext, run: WorkflowRun): Promise<readonly unknown[]> | readonly unknown[]; }
export interface GatewayIntelligenceService { summarize(context: ApplicationContext, run: WorkflowRun): Promise<Record<string, unknown>> | Record<string, unknown>; feedback?(context: ApplicationContext, run: WorkflowRun): Promise<void> | void; }
export interface GatewayAnalytics { track(event: string, payload: Record<string, unknown>): Promise<void> | void; }
export interface GatewayProjectService { load(request: GatewayRequest): Promise<Record<string, unknown>> | Record<string, unknown>; }

export interface AIApplicationGatewayOptions { readonly agent: GatewayAgent; readonly workflowEngine: GatewayWorkflowEngine; readonly identity?: GatewayIdentityService; readonly memory?: GatewayMemoryService; readonly intelligence?: GatewayIntelligenceService; readonly analytics?: GatewayAnalytics; readonly project?: GatewayProjectService; readonly metrics?: GatewayMetrics; }

const createRequestId = () => `gateway_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const riskRank = { low: 1, medium: 2, high: 3 } as const;

export class AIApplicationGateway {
  readonly metrics: GatewayMetrics;
  private readonly sessions = new Map<string, GatewaySession>();
  private readonly agent: GatewayAgent;
  private readonly workflowEngine: GatewayWorkflowEngine;
  private readonly identity?: GatewayIdentityService;
  private readonly memory?: GatewayMemoryService;
  private readonly intelligence?: GatewayIntelligenceService;
  private readonly analytics?: GatewayAnalytics;
  private readonly project?: GatewayProjectService;

  constructor(options: AIApplicationGatewayOptions) {
    this.agent = options.agent;
    this.workflowEngine = options.workflowEngine;
    this.identity = options.identity;
    this.memory = options.memory;
    this.intelligence = options.intelligence;
    this.analytics = options.analytics;
    this.project = options.project;
    this.metrics = options.metrics ?? new GatewayMetrics();
  }

  async execute(request: GatewayRequest): Promise<GatewayResponse> {
    const requestId = request.requestId || createRequestId();
    const started = Date.now();
    const session = new GatewaySession(requestId, { ...request, requestId });
    this.sessions.set(requestId, session);
    try {
      session.transition('AUTHORIZING');
      await this.authorize(request);
      session.transition('CONTEXT_BUILDING');
      const context = await this.buildContext({ ...request, requestId });
      session.setContext(context);
      session.transition('AGENT_PROCESSING');
      const decision = await Promise.resolve(this.agent.process(context));
      session.setAgentDecision(decision);
      this.enforcePolicy(context, decision);
      const inspection = this.workflowEngine.inspect(decision.workflowId);
      session.setWorkflow(inspection.definition);
      session.setExecutionGraph(inspection.graph);
      session.setProviders(inspection.orderedSteps.map((step) => step.capability));
      session.transition('WORKFLOW_EXECUTION');
      const run = await this.executeWorkflow(decision, context, session);
      if (session.state === 'CANCELLED' || session.abortController.signal.aborted) throw new GatewayCancelledError();
      session.transition('FINALIZING');
      const response = await this.finalize({ requestId, started, context, decision, run });
      session.setCost(response.cost);
      session.setResponse(response);
      session.transition(response.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED');
      this.metrics.record(response);
      await Promise.resolve(this.analytics?.track('gateway_completed', { requestId, workflowId: response.workflowId, status: response.status }));
      return response;
    } catch (error) {
      const response = this.errorResponse({ requestId, started, session, error });
      session.addError(response.error || 'Gateway failed');
      session.setResponse(response);
      if (response.status !== 'CANCELLED') session.transition(response.status === 'REJECTED' ? 'FAILED' : 'FAILED');
      this.metrics.record(response);
      await Promise.resolve(this.analytics?.track('gateway_failed', { requestId, status: response.status, error: response.error }));
      return response;
    }
  }

  pause(requestId: string): void { this.getSession(requestId).pause(); }
  resume(requestId: string): void { this.getSession(requestId).resume(); }
  cancel(requestId: string): void { this.getSession(requestId).cancel(); }
  inspect(requestId: string) { return this.getSession(requestId).inspect(); }
  debug(requestId: string) { return this.inspect(requestId); }

  private async authorize(request: GatewayRequest): Promise<void> {
    if (!request.userId || !request.tenantId || !request.projectId) throw new GatewayAuthorizationError('Identity, tenant, and project are required.');
    const decision = await Promise.resolve(this.identity?.authorize(request) ?? { allowed: true });
    if (!decision.allowed) throw new GatewayAuthorizationError(decision.reason || 'Identity is not allowed for tenant/project.');
  }

  private async buildContext(request: GatewayRequest): Promise<ApplicationContext> {
    const [memory, project] = await Promise.all([
      Promise.resolve(this.memory?.load(request) ?? {}),
      Promise.resolve(this.project?.load(request) ?? { projectId: request.projectId }),
    ]);
    return { request, memory, intelligence: {}, preferences: request.preferences || {}, project, budget: request.budget || {}, executionHistory: [] };
  }

  private enforcePolicy(context: ApplicationContext, decision: GatewayAgentDecision): void {
    const availableCredits = context.budget.availableCredits ?? Number.POSITIVE_INFINITY;
    const maxCredits = context.budget.maxCredits ?? 0;
    if (maxCredits > availableCredits) throw new GatewayBudgetExceededError('Available credits are lower than requested budget.');
    if (context.preferences.allowedWorkflows && !context.preferences.allowedWorkflows.includes(decision.workflowId)) throw new GatewayPolicyRejectedError('Workflow is not allowed by plan.');
    if (context.preferences.allowedCapabilities && decision.capabilities?.some((capability) => !context.preferences.allowedCapabilities?.includes(capability))) throw new GatewayPolicyRejectedError('Capability is not allowed by plan.');
    if ((decision.confirmationRequired || riskRank[decision.riskLevel || 'low'] >= riskRank.high) && !context.preferences.confirmation) throw new GatewayPolicyRejectedError('High risk workflow requires confirmation.');
  }

  private async executeWorkflow(decision: GatewayAgentDecision, context: ApplicationContext, session: GatewaySession): Promise<WorkflowRun> {
    const run = await this.workflowEngine.execute({ workflowId: decision.workflowId, intent: context.request.prompt, input: { imageContext: context.request.imageContext, metadata: context.request.metadata }, policy: { budget: { maxCredits: context.budget.maxCredits, maxDurationMs: context.budget.maxDurationMs }, allowedCapabilities: context.preferences.allowedCapabilities }, signal: session.abortController.signal });
    if (run.status === 'failed' && decision.fallbackWorkflowId) return this.workflowEngine.execute({ workflowId: decision.fallbackWorkflowId, intent: context.request.prompt, input: { fallbackFrom: decision.workflowId }, signal: session.abortController.signal });
    if (run.status === 'failed') throw new GatewayWorkflowError(run.error || 'Workflow execution failed.');
    return run;
  }

  private async finalize({ requestId, started, context, decision, run }: { requestId: string; started: number; context: ApplicationContext; decision: GatewayAgentDecision; run: WorkflowRun }): Promise<GatewayResponse> {
    const [memoryUpdates, intelligenceSummary] = await Promise.all([
      Promise.resolve(this.memory?.update(context, run) ?? []),
      Promise.resolve(this.intelligence?.summarize(context, run) ?? { workflowStatus: run.status, steps: run.stepResults.length }),
    ]);
    await Promise.resolve(this.intelligence?.feedback?.(context, run));
    const cost = this.extractCost(run);
    return { requestId, status: 'COMPLETED', workflowId: decision.workflowId, executionId: run.id, result: this.normalizeResult(run), cost, duration: Date.now() - started, confidence: decision.confidence ?? 0.8, memoryUpdates, intelligenceSummary };
  }

  private normalizeResult(run: WorkflowRun): unknown { return run.output ?? run.stepResults.at(-1)?.output ?? { status: run.status }; }
  private extractCost(run: WorkflowRun) { const credits = run.stepResults.reduce((sum, step) => sum + ((step.metadata as { cost?: { credits?: number } } | undefined)?.cost?.credits || 0), 0); return { credits, providerCostUsd: 0 }; }
  private errorResponse({ requestId, started, session, error }: { requestId: string; started: number; session: GatewaySession; error: unknown }): GatewayResponse { const message = (error as Error).message; const cancelled = error instanceof GatewayCancelledError || session.state === 'CANCELLED'; const rejected = error instanceof GatewayBudgetExceededError || error instanceof GatewayPolicyRejectedError || error instanceof GatewayAuthorizationError; return { requestId, status: cancelled ? 'CANCELLED' : rejected ? 'REJECTED' : 'FAILED', cost: { credits: 0 }, duration: Date.now() - started, confidence: 0, memoryUpdates: [], intelligenceSummary: {}, error: message }; }
  private getSession(requestId: string): GatewaySession { const session = this.sessions.get(requestId); if (!session) throw new GatewayExecutionError(`Gateway session not found: ${requestId}`); return session; }
}
