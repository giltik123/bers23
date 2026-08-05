import type { WorkflowBudget, WorkflowDefinition, WorkflowInspection, WorkflowRiskLevel } from './WorkflowDefinition';
import { WorkflowGraphBuilder } from './WorkflowGraph';
import { WorkflowComposer, type WorkflowComposeRequest } from './WorkflowComposer';
import { createExecutionPlan, type WorkflowExecutionContext, type WorkflowExecutionPlan, type WorkflowOrchestrator, type WorkflowRun } from './WorkflowExecution';
import { WorkflowRegistry } from './WorkflowRegistry';
import { WorkflowHistory } from './WorkflowHistory';
import { WorkflowDebugger } from './WorkflowDebugger';
import { WorkflowValidator, type WorkflowValidationPolicy, type WorkflowValidationResult } from './WorkflowValidator';
import type { WorkflowStepExecutionResult } from './WorkflowStep';

export interface WorkflowExecuteRequest { readonly workflowId?: string; readonly intent?: string; readonly input?: Record<string, unknown>; readonly policy?: WorkflowValidationPolicy; readonly signal?: AbortSignal; }
export interface WorkflowEngineOptions { readonly registry?: WorkflowRegistry; readonly composer?: WorkflowComposer; readonly validator?: WorkflowValidator; readonly history?: WorkflowHistory; readonly debugger?: WorkflowDebugger; readonly orchestrator?: WorkflowOrchestrator; readonly defaultPolicy?: WorkflowValidationPolicy; }

const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export class WorkflowEngine {
  private readonly graphBuilder = new WorkflowGraphBuilder();
  private readonly registryValue: WorkflowRegistry;
  private readonly composer: WorkflowComposer;
  private readonly validator: WorkflowValidator;
  private readonly historyValue: WorkflowHistory;
  private readonly debuggerValue: WorkflowDebugger;
  private readonly orchestrator?: WorkflowOrchestrator;
  private readonly defaultPolicy: WorkflowValidationPolicy;

  constructor(options: WorkflowEngineOptions = {}) {
    this.registryValue = options.registry ?? new WorkflowRegistry();
    this.composer = options.composer ?? new WorkflowComposer();
    this.validator = options.validator ?? new WorkflowValidator();
    this.historyValue = options.history ?? new WorkflowHistory();
    this.debuggerValue = options.debugger ?? new WorkflowDebugger();
    this.orchestrator = options.orchestrator;
    this.defaultPolicy = options.defaultPolicy ?? {};
  }

  register(definition: WorkflowDefinition): WorkflowDefinition { this.validator.assertValid(definition); return this.registryValue.register(definition); }
  validate(definitionOrId: WorkflowDefinition | string, policy: WorkflowValidationPolicy = this.defaultPolicy): WorkflowValidationResult { return this.validator.validate(this.resolve(definitionOrId), policy); }
  inspect(definitionOrId: WorkflowDefinition | string): WorkflowInspection { const definition = this.resolve(definitionOrId); const graph = this.graphBuilder.build(definition); const orderedSteps = graph.order.map((stepId) => definition.steps.find((step) => step.id === stepId)!); return { definition, graph, orderedSteps, estimatedBudget: this.estimateBudget(definition) }; }
  history(): WorkflowHistory { return this.historyValue; }
  registry(): WorkflowRegistry { return this.registryValue; }
  debugSnapshot(workflowId: string) { return this.debuggerValue.snapshot(workflowId); }

  async execute(request: WorkflowExecuteRequest): Promise<WorkflowRun> {
    const definition = request.workflowId ? this.resolve(request.workflowId) : this.composer.compose({ intent: request.intent || '', metadata: request.input });
    const policy = { ...this.defaultPolicy, ...(request.policy || {}) };
    const validation = this.validate(definition, policy);
    if (!validation.valid) return this.reject(definition.id, validation.errors.join(' '));
    if (!this.orchestrator) throw new Error('WorkflowEngine requires an orchestrator to execute workflow plans.');
    const inspection = this.inspect(definition);
    const plan = createExecutionPlan(definition, inspection.orderedSteps);
    const runId = id('workflow_run');
    const startedAt = Date.now();
    const results = new Map<string, WorkflowStepExecutionResult>();
    const stepResults: WorkflowStepExecutionResult[] = [];
    this.historyValue.record({ type: 'workflow_started', workflowId: definition.id, runId, payload: { plan } });
    this.debuggerValue.workflowStarted(definition.id);
    try {
      for (const plannedStep of plan.steps) {
        if (request.signal?.aborted) throw new Error('Workflow execution cancelled.');
        const context: WorkflowExecutionContext = { runId, definition, inspection, results, signal: request.signal };
        const result = await this.executeStepWithRecovery(plannedStep.workflowStep.id, plan, context);
        results.set(result.stepId, result);
        stepResults.push(result);
        result.status === 'failed' ? this.debuggerValue.stepFailed(definition.id, result) : this.debuggerValue.stepCompleted(definition.id, result);
        if (result.status === 'failed') throw new Error(result.error || `Workflow step failed: ${result.stepId}`);
      }
      return this.finish({ id: runId, workflowId: definition.id, status: stepResults.some((result) => result.status === 'recovered') ? 'recovered' : 'completed', startedAt, completedAt: Date.now(), stepResults, output: stepResults.at(-1)?.output });
    } catch (error) {
      return this.finish({ id: runId, workflowId: definition.id, status: 'failed', startedAt, completedAt: Date.now(), stepResults, error: (error as Error).message });
    }
  }

  private async executeStepWithRecovery(stepId: string, plan: WorkflowExecutionPlan, context: WorkflowExecutionContext): Promise<WorkflowStepExecutionResult> {
    const planned = plan.steps.find((step) => step.workflowStep.id === stepId);
    if (!planned) throw new Error(`Workflow plan step not found: ${stepId}.`);
    const maxAttempts = planned.workflowStep.recovery?.maxAttempts ?? 1;
    let last: WorkflowStepExecutionResult | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      last = await Promise.resolve(this.orchestrator!.execute({ workflowId: plan.workflowId, steps: [planned] }, context));
      if (last.status === 'completed') return attempt > 1 ? { ...last, status: 'recovered', attempt } : last;
      if (planned.workflowStep.recovery?.strategy !== 'retry') break;
    }
    if (planned.workflowStep.recovery?.strategy === 'skip' && last) return { ...last, status: 'skipped' };
    return last ?? { stepId, status: 'failed', attempt: 1, durationMs: 0, error: 'Step did not produce a result.' };
  }

  private finish(run: Omit<WorkflowRun, 'durationMs'>): WorkflowRun { const completedAt = run.completedAt ?? Date.now(); const finished = { ...run, completedAt, durationMs: completedAt - run.startedAt }; this.historyValue.recordRun(finished); this.debuggerValue.workflowFinished(finished); return finished; }
  private reject(workflowId: string, error: string): WorkflowRun { return this.finish({ id: id('workflow_run'), workflowId, status: 'rejected', startedAt: Date.now(), completedAt: Date.now(), stepResults: [], error }); }
  private resolve(definitionOrId: WorkflowDefinition | string): WorkflowDefinition { if (typeof definitionOrId !== 'string') return definitionOrId; const definition = this.registryValue.get(definitionOrId); if (!definition) throw new Error(`Workflow is not registered: ${definitionOrId}.`); return definition; }
  private estimateBudget(definition: WorkflowDefinition): Required<WorkflowBudget> { return { maxCredits: definition.budget.maxCredits ?? 0, maxDurationMs: definition.budget.maxDurationMs ?? 0, maxProviderCalls: definition.budget.maxProviderCalls ?? definition.steps.length }; }
}

export type { WorkflowRiskLevel };
