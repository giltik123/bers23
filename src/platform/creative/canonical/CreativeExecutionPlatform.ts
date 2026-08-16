import { CreativeWorkflowEngine, WorkflowCompiler, type Artifact, type WorkflowSnapshot } from '../workflow-engine';
import type { CreativeArtifact, CreativeDecision, CreativeExecutionPlan, CreativeExecutionPlatformDependencies, CreativePipeline, CreativePlan, CreativeRequest, ProductionOutcome, VerificationResult } from './contracts';

type RecordState = { request: CreativeRequest; decision?: CreativeDecision; plan?: CreativePlan; execution?: CreativeExecutionPlan; pipeline?: CreativePipeline; workflow?: ReturnType<WorkflowCompiler['compile']>; snapshot?: WorkflowSnapshot; outcome?: ProductionOutcome; paused: boolean; cancelled: boolean };

/**
 * The sole recommended production entry point for Creative execution.
 * Planning and compilation are pure boundaries; CreativeWorkflowEngine is the
 * only graph execution authority. Runtimes remain operation adapters.
 */
export class CreativeExecutionPlatform {
  readonly #records = new Map<string, RecordState>();
  readonly #workflow: CreativeWorkflowEngine;
  constructor(private readonly dependencies: CreativeExecutionPlatformDependencies) { this.#workflow = new CreativeWorkflowEngine(dependencies); }

  createExecution(request: CreativeRequest): string { if (this.#records.has(request.id)) throw new Error(`Execution "${request.id}" already exists`); this.#records.set(request.id, { request, paused: false, cancelled: false }); return request.id; }
  async plan(id: string): Promise<CreativePlan> { const record = this.require(id); record.decision ??= await this.dependencies.decision.decide(record.request); record.plan = await this.dependencies.planning.plan(record.request, record.decision); return record.plan; }
  async compile(id: string): Promise<CreativeExecutionPlan> { const record = this.require(id); const plan = record.plan ?? await this.plan(id); const targets = Object.fromEntries(plan.operations.map(operation => [operation.id, this.dependencies.targetSelector.select(operation, record.request)])); for (const operation of plan.operations) { const target = targets[operation.id]; if (target === 'BLOCKED' || !this.dependencies.securityGate.authorize(record.request, operation, target)) throw new Error(`Security or target policy blocked operation ${operation.id}`); }
    record.execution = { requestId: record.request.id, operations: plan.operations, targets }; record.pipeline = { operationIds: plan.operations.map(operation => operation.id) }; record.workflow = new WorkflowCompiler().compile({ id, prompt: record.request.intent, scope: record.request.scope, sources: { executionGraph: { operations: plan.operations }, pipelineGraph: { operations: record.pipeline.operationIds.map(operationId => { const operation = plan.operations.find(item => item.id === operationId)!; return { ...operation, providerId: targets[operation.id] === 'LOCAL' ? undefined : operation.providerId }; }) } }, budget: record.request.budget, compiledAt: (this.dependencies.now ?? Date.now)() }); return record.execution; }
  async execute(id: string): Promise<ProductionOutcome> { const record = this.require(id); if (record.cancelled) throw new Error('Execution is cancelled'); if (record.paused) throw new Error('Execution is paused'); if (!record.workflow) await this.compile(id); const seed = (record.request.inputArtifacts ?? []).map(toWorkflowArtifact); record.snapshot = await this.#workflow.execute(record.workflow!, seed); const verification = this.verification(record.snapshot); const outcome: ProductionOutcome = { executionId: id, status: record.snapshot.status === 'SUCCESS' && verification.valid ? 'SUCCESS' : 'FAILED', workflow: record.snapshot, verification, artifacts: record.snapshot.artifacts.map(fromWorkflowArtifact) }; record.outcome = outcome; await this.dependencies.telemetry?.record(outcome); return outcome; }
  status(id: string) { const record = this.require(id); return record.cancelled ? 'SKIPPED' as const : record.paused ? 'WAITING' as const : record.outcome?.status ?? (record.snapshot ? 'RUNNING' as const : 'READY' as const); }
  pause(id: string): void { this.require(id).paused = true; }
  resume(id: string): void { const record = this.require(id); if (record.cancelled) throw new Error('Cancelled execution cannot resume'); record.paused = false; }
  cancel(id: string): void { this.require(id).cancelled = true; }
  recover(id: string) { const record = this.require(id); if (record.outcome?.status !== 'FAILED') throw new Error('Only failed executions can recover'); return this.dependencies.recovery.decide({ executionId: id, error: record.workflow?.id ?? 'workflow-failed' }); }
  verify(id: string): VerificationResult { const snapshot = this.require(id).snapshot; if (!snapshot) throw new Error('Execution has not run'); return this.verification(snapshot); }
  result(id: string): ProductionOutcome | undefined { return this.require(id).outcome; }
  snapshot(id: string): WorkflowSnapshot | undefined { return this.require(id).snapshot; }
  replay(id: string): WorkflowSnapshot { const snapshot = this.require(id).snapshot; if (!snapshot) throw new Error('Execution has not run'); return this.#workflow.replay(snapshot); }
  private verification(snapshot: WorkflowSnapshot): VerificationResult { return { valid: snapshot.status === 'SUCCESS' && snapshot.verification.every(item => item.valid), checks: snapshot.verification.flatMap(item => item.checks), errors: snapshot.verification.flatMap(item => item.errors) }; }
  private require(id: string): RecordState { const record = this.#records.get(id); if (!record) throw new Error(`Execution "${id}" not found`); return record; }
}
function toWorkflowArtifact(value: CreativeArtifact): Artifact { return { id: value.id, kind: value.kind, value: value.value, producerStepId: value.producerOperationId, scope: value.scope, metadata: { ...value.metadata, lifecycle: value.state } }; }
function fromWorkflowArtifact(value: Artifact): CreativeArtifact { return { id: value.id, kind: value.kind, value: value.value, producerOperationId: value.producerStepId, scope: value.scope, state: 'FINAL', metadata: value.metadata }; }
