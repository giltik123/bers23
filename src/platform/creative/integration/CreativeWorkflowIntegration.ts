import type { ExecutionGraphSnapshot, ExecutionVerificationStep } from '../execution';
import { deepFreeze, sameScope } from './immutable';
import { ExecutionEventLog } from './ExecutionEventLog';
import { ExecutionWorkflowTranslator } from './ExecutionWorkflowTranslator';
import { IntegrationDebugger } from './IntegrationDebugger';
import { OperationRegistry } from './OperationRegistry';
import { ProgressModel } from './ProgressModel';
import { ReplanningBridge } from './ReplanningBridge';
import { RollbackBridge } from './RollbackBridge';
import { RuntimeBridge } from './RuntimeBridge';
import { StatusSynchronizer } from './StatusSynchronizer';
import { UnifiedTimeline } from './UnifiedTimeline';
import { VerificationBridge } from './VerificationBridge';
import type {
  IntegrationDependencies, WorkflowExecutionPlan, WorkflowExecutor, WorkflowResult,
  WorkflowSnapshot, WorkflowStatus,
} from './types';

export class CreativeWorkflowIntegration {
  readonly registry: OperationRegistry;
  readonly statuses = new StatusSynchronizer();
  readonly events: ExecutionEventLog;
  readonly timeline: UnifiedTimeline;
  private readonly translator: ExecutionWorkflowTranslator;
  private readonly runtime: RuntimeBridge;
  private readonly progress = new ProgressModel();
  private readonly verificationBridge = new VerificationBridge();
  private readonly rollbackBridge = new RollbackBridge();
  private readonly replanning: ReplanningBridge;
  private readonly debugger = new IntegrationDebugger();
  private execution?: ExecutionGraphSnapshot;
  private workflow?: WorkflowExecutionPlan;
  private result?: WorkflowResult;
  private verification: ReturnType<VerificationBridge['compare']> = [];
  private recovery: ReturnType<RollbackBridge['decide']> = [];

  constructor(
    private readonly dependencies: IntegrationDependencies,
    executor: WorkflowExecutor,
    registry = new OperationRegistry(),
  ) {
    if (!dependencies?.id || !dependencies?.now) throw new Error('Workflow integration requires id and now dependencies');
    this.registry = registry;
    this.events = new ExecutionEventLog(dependencies);
    this.timeline = new UnifiedTimeline(dependencies);
    this.translator = new ExecutionWorkflowTranslator(dependencies, registry);
    this.runtime = new RuntimeBridge(executor, this.events);
    this.replanning = new ReplanningBridge(dependencies);
  }

  translate(execution: ExecutionGraphSnapshot): WorkflowExecutionPlan {
    this.execution = execution;
    this.workflow = this.translator.translate(execution);
    this.timeline.append(execution.scope, 'execution', execution.id, 'completed', 'Execution graph accepted');
    this.timeline.append(execution.scope, 'workflow', this.workflow.id, 'pending', 'Workflow plan translated');
    return this.workflow;
  }

  async execute(execution: ExecutionGraphSnapshot = this.requiredExecution()): Promise<WorkflowResult> {
    const workflow = this.workflow?.executionGraphId === execution.id ? this.workflow : this.translate(execution);
    this.result = await this.runtime.execute(workflow);
    this.timeline.append(execution.scope, 'workflow', workflow.id, this.result.status, 'Workflow result synchronized');
    return this.result;
  }

  async cancel(): Promise<void> { await this.runtime.cancel(this.requiredWorkflow().id); }
  async pause(): Promise<void> { await this.runtime.pause(this.requiredWorkflow().id); }
  async resume(): Promise<void> { await this.runtime.resume(this.requiredWorkflow().id); }
  async status(): Promise<WorkflowStatus> { return this.runtime.status(this.requiredWorkflow().id); }

  synchronize(result: WorkflowResult, expected: readonly ExecutionVerificationStep[] = []): WorkflowSnapshot {
    const execution = this.requiredExecution();
    const workflow = this.requiredWorkflow();
    if (result.workflowId !== workflow.id) throw new Error('Workflow result does not belong to integration plan');
    this.result = deepFreeze(result) as WorkflowResult;
    this.verification = this.verificationBridge.compare({ expected, actual: result, workflow });
    this.recovery = this.rollbackBridge.decide(execution, workflow, result, this.verification);
    this.timeline.append(execution.scope, 'verification', workflow.id, this.verification.every((item) => item.passed) ? 'completed' : 'failed', 'Expected and actual results compared');
    if (this.recovery.some((item) => item.action !== 'none')) this.timeline.append(execution.scope, 'recovery', workflow.id, 'pending', 'Recovery directive created');
    return this.snapshot();
  }

  replan(reason = 'Workflow or verification failure') {
    const failed = this.recovery.filter((item) => item.action === 'replan' || item.action === 'retry').flatMap((item) => item.executionNodeId ? [item.executionNodeId] : []);
    const value = this.replanning.replan(this.requiredExecution(), failed, reason);
    this.execution = value.graph;
    this.workflow = undefined;
    this.timeline.append(value.graph.scope, 'recovery', value.graph.id, 'completed', 'Partial execution graph replanned');
    return value;
  }

  snapshot(): WorkflowSnapshot {
    const execution = this.requiredExecution();
    const workflow = this.requiredWorkflow();
    const result = this.result;
    const status = result?.status ?? this.runtime.synchronizedStatus(workflow.id);
    const progress = this.progress.calculate(execution, workflow, result);
    const operations = result?.operations ?? [];
    const metrics = {
      completion: progress.overall,
      successfulOperations: operations.filter((item) => item.status === 'completed').length,
      failedOperations: operations.filter((item) => item.status === 'failed').length,
      verificationPassRate: this.verification.length ? this.verification.filter((item) => item.passed).length / this.verification.length : 0,
    };
    return deepFreeze({ id: this.dependencies.id(), scope: { ...execution.scope }, execution, workflow, status, verification: this.verification, metrics, events: this.events.list(execution.scope, workflow.id), progress, recovery: this.recovery, timeline: this.timeline.list(execution.scope), checkpoints: [], createdAt: this.dependencies.now() });
  }

  debug(goal: string, planId: string) {
    const workflow = this.requiredWorkflow();
    return this.debugger.debug(goal, planId, this.requiredExecution(), workflow, this.result?.status ?? this.runtime.synchronizedStatus(workflow.id), this.verification, this.recovery);
  }

  assertScope(scope: ExecutionGraphSnapshot['scope']): void {
    if (!sameScope(this.requiredExecution().scope, scope)) throw new Error('Scope isolation violation');
  }

  private requiredExecution(): ExecutionGraphSnapshot { if (!this.execution) throw new Error('No execution graph integrated'); return this.execution; }
  private requiredWorkflow(): WorkflowExecutionPlan { if (!this.workflow) throw new Error('No workflow plan translated'); return this.workflow; }
}
