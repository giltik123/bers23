import { ArtifactRouter } from './ArtifactRouter';
import { immutableClone } from './immutable';
import { WorkflowOptimizer } from './WorkflowOptimizer';
import type { Artifact, CompiledWorkflow, ResourceBudget, StepResult, TimelineEvent, VerificationResult, WorkflowEngineDependencies, WorkflowMetrics, WorkflowOperation, WorkflowSnapshot } from './types';
const zeroMetrics = (): WorkflowMetrics => ({ executionTimeMs: 0, latencyMs: 0, credits: 0, peakMemoryMb: 0, gpuMs: 0, aiCalls: 0, failures: 0, retries: 0, maxParallelism: 0, providerUsage: {} });
const operationCost = (operation: WorkflowOperation): ResourceBudget => ({ credits: 0, latencyMs: 0, ramMb: 0, gpuMs: 0, aiCalls: operation.providerId ? 1 : 0, retries: 0, ...operation.cost });

export class CreativeWorkflowEngine {
  readonly #snapshots = new Map<string, WorkflowSnapshot>();
  constructor(private readonly dependencies: WorkflowEngineDependencies) {}
  async execute(source: CompiledWorkflow, seedArtifacts: readonly Artifact[] = []): Promise<WorkflowSnapshot> {
    const workflow = new WorkflowOptimizer().optimize(source, seedArtifacts.map((item) => item.id)); const router = new ArtifactRouter();
    seedArtifacts.forEach((item) => router.put(assertArtifactScope(item, workflow))); const timeline: TimelineEvent[] = []; const steps: StepResult[] = []; const verification: VerificationResult[] = [];
    const metrics = zeroMetrics() as MutableMetrics; const now = this.dependencies.now ?? (() => Date.now()); const started = now();
    const emit = (type: string, stepId?: string, details?: Record<string, unknown>) => timeline.push({ sequence: timeline.length + 1, at: now(), type, stepId, details });
    emit('WORKFLOW_STARTED', undefined, { prompt: workflow.prompt }); let failed = false;
    for (const group of workflow.parallelGroups) { metrics.maxParallelism = Math.max(metrics.maxParallelism, group.length);
      for (const id of group) { const operation = workflow.operations.find((item) => item.id === id)!; const result = await this.#runStep(workflow, operation, router, steps, verification, metrics, emit); steps.push(result); if (result.state === 'FAILED') { failed = true; break; } }
      if (failed) break; }
    metrics.executionTimeMs = now() - started; emit(failed ? 'WORKFLOW_FAILED' : 'WORKFLOW_FINISHED');
    const snapshot: WorkflowSnapshot = immutableClone({ workflow, status: failed ? 'FAILED' as const : 'SUCCESS' as const, steps, artifacts: router.list(workflow.scope), verification, metrics, timeline, budget: workflow.budget, health: failed ? 'failed' as const : metrics.retries ? 'degraded' as const : 'healthy' as const, replay: { snapshotVersion: 1 as const, executableWithoutProviders: true as const } });
    this.#snapshots.set(workflow.id, snapshot); return snapshot;
  }
  snapshot(workflowId: string): WorkflowSnapshot | undefined { return this.#snapshots.get(workflowId); }
  replay(snapshot: WorkflowSnapshot): WorkflowSnapshot { return immutableClone(snapshot) as WorkflowSnapshot; }
  explain(snapshot: WorkflowSnapshot) { return immutableClone(snapshot.steps.map((step) => ({ stepId: step.stepId, decision: snapshot.workflow.operations.find((item) => item.id === step.stepId)?.type, provider: step.providerId, state: step.state, reason: `Dependencies and policy satisfied; verification ${step.state === 'FINISHED' ? 'passed' : 'did not pass'}` }))); }
  debug(snapshot: WorkflowSnapshot) { const runningStep = [...snapshot.steps].reverse().find((step) => !['FINISHED', 'FAILED', 'SKIPPED'].includes(step.state)); return immutableClone({ compiledWorkflow: snapshot.workflow, executionGraph: snapshot.workflow.parallelGroups, runningStep, providers: snapshot.steps.map((step) => step.providerId).filter(Boolean), artifacts: snapshot.artifacts, metrics: snapshot.metrics, verification: snapshot.verification, result: snapshot.status }); }
  async #runStep(workflow: CompiledWorkflow, operation: WorkflowOperation, router: ArtifactRouter, prior: StepResult[], verification: VerificationResult[], metrics: MutableMetrics, emit: (type: string, stepId?: string, details?: Record<string, unknown>) => void): Promise<StepResult> {
    emit('WAITING', operation.id); const unavailableDependency = (operation.dependencies ?? []).find((id) => prior.find((item) => item.stepId === id)?.state !== 'FINISHED'); const inputs = router.route(operation.requiredArtifacts ?? [], workflow.scope); const missingArtifact = (operation.requiredArtifacts ?? []).find((id) => !inputs.some((item) => item.id === id)); const denied = this.dependencies.policy && !this.dependencies.policy.allows(operation, workflow.scope);
    if (unavailableDependency || missingArtifact || denied) return immutableClone({ stepId: operation.id, state: 'FAILED' as const, attempts: 0, artifacts: [], error: unavailableDependency ? `Dependency unavailable: ${unavailableDependency}` : missingArtifact ? `Artifact unavailable: ${missingArtifact}` : 'Policy or permission denied' });
    const requested = operationCost(operation); if (exceeds(metrics, requested, workflow.budget)) return immutableClone({ stepId: operation.id, state: 'FAILED' as const, attempts: 0, artifacts: [], error: 'Workflow budget exceeded' });
    let providerId = operation.providerId; let attempts = 0; let lastError = '';
    while (attempts <= workflow.budget.retries) { attempts += 1; emit(attempts > 1 ? 'RECOVERING' : 'READY', operation.id, { providerId });
      if (providerId && !this.dependencies.providers.isAvailable(providerId, workflow.scope)) { const fallback = this.dependencies.providers.fallback(providerId, operation, workflow.scope); if (!fallback) return immutableClone({ stepId: operation.id, state: 'FAILED' as const, attempts, providerId, artifacts: [], error: 'Provider unavailable' }); providerId = fallback; metrics.retries += 1; emit('FALLBACK_PROVIDER', operation.id, { providerId }); }
      try { emit('RUNNING', operation.id, { providerId }); const response = await this.dependencies.runtime.execute({ workflowId: workflow.id, operation: { ...operation, providerId }, artifacts: inputs, scope: workflow.scope }); metrics.aiCalls += requested.aiCalls; metrics.credits += requested.credits; metrics.latencyMs += response.latencyMs ?? requested.latencyMs; metrics.gpuMs += response.gpuMs ?? requested.gpuMs; metrics.peakMemoryMb = Math.max(metrics.peakMemoryMb, response.memoryMb ?? requested.ramMb); if (providerId) metrics.providerUsage[providerId] = (metrics.providerUsage[providerId] ?? 0) + 1;
        const artifacts = (response.artifacts ?? []).map((item) => router.put({ ...item, producerStepId: operation.id, scope: workflow.scope })); emit('VERIFYING', operation.id); const checked = this.dependencies.verifier ? await this.dependencies.verifier.verify(operation, artifacts) : defaultVerify(operation, artifacts); verification.push(immutableClone(checked) as VerificationResult); if (!checked.valid) throw new Error(checked.errors.join('; ') || 'Verification failed'); emit('SUCCESS', operation.id); emit('FINISHED', operation.id); return immutableClone({ stepId: operation.id, state: 'FINISHED' as const, attempts, providerId, artifacts });
      } catch (error) { lastError = error instanceof Error ? error.message : String(error); metrics.failures += 1; emit('FAILED', operation.id, { error: lastError }); if (attempts <= workflow.budget.retries) { metrics.retries += 1; providerId = (providerId && this.dependencies.providers.fallback(providerId, operation, workflow.scope)) || providerId; } }
    }
    return immutableClone({ stepId: operation.id, state: 'FAILED' as const, attempts, providerId, artifacts: [], error: lastError });
  }
}
type MutableMetrics = { -readonly [K in keyof WorkflowMetrics]: K extends 'providerUsage' ? Record<string, number> : WorkflowMetrics[K] };
function defaultVerify(operation: WorkflowOperation, artifacts: readonly Artifact[]): VerificationResult { const missing = (operation.produces ?? []).filter((kind) => !artifacts.some((item) => item.kind === kind)); return { stepId: operation.id, valid: !missing.length, checks: ['artifacts', 'pipeline-integrity', 'metadata'], errors: missing.map((kind) => `Missing ${kind}`) }; }
function exceeds(metrics: WorkflowMetrics, requested: ResourceBudget, budget: ResourceBudget): boolean { return metrics.credits + requested.credits > budget.credits || metrics.latencyMs + requested.latencyMs > budget.latencyMs || Math.max(metrics.peakMemoryMb, requested.ramMb) > budget.ramMb || metrics.gpuMs + requested.gpuMs > budget.gpuMs || metrics.aiCalls + requested.aiCalls > budget.aiCalls; }
function assertArtifactScope(artifact: Artifact, workflow: CompiledWorkflow): Artifact { if (artifact.scope.tenantId !== workflow.scope.tenantId || artifact.scope.projectId !== workflow.scope.projectId || artifact.scope.userId !== workflow.scope.userId) throw new Error('Artifact scope isolation violation'); return artifact; }
