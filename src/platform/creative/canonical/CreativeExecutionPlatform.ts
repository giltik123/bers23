import { CreativeWorkflowEngine, WorkflowCompiler, type AdmittedOnDeviceStepResult, type Artifact, type WorkflowSnapshot } from '../workflow-engine';
import { ProductionOperationAuthority } from '../authority';
import { CreativeCostAuthority } from '../cost/contracts';
import type { CreativeOperationInstance } from '../operations/contracts';
import { MAX_SUPER_RESOLUTION_OUTPUT_PIXELS, SUPER_RESOLUTION_SCALE } from '../super-resolution/SuperResolutionContract';
import type { CreativeArtifact, CreativeDecision, CreativeExecutionPlan, CreativeOperation, CreativePipeline, CreativePlan, CreativeRequest, ProductionOutcome, VerificationResult } from './contracts';
import type { LocalExecutionInputBinding, LocalExecutionTicket, LocalExecutionTicketV2 } from './localExecution';
import type { CreativeExecutionPlatformRuntimeDependencies } from './providerSelection';
import { validateCreativePlan, validateExecutionTargets } from './planning/planValidation';

type RecordState = {
  request: CreativeRequest;
  decision?: CreativeDecision;
  plan?: CreativePlan;
  execution?: CreativeExecutionPlan;
  pipeline?: CreativePipeline;
  workflow?: ReturnType<WorkflowCompiler['compile']>;
  operation?: CreativeOperationInstance;
  capabilityIds?: Readonly<Record<string, string>>;
  localTickets?: readonly LocalExecutionTicket[];
  localTicketsV2?: readonly LocalExecutionTicketV2[];
  admittedOnDevice?: Readonly<Record<string, AdmittedOnDeviceStepResult>>;
  snapshot?: WorkflowSnapshot;
  outcome?: ProductionOutcome;
  paused: boolean;
  cancelled: boolean;
};

/**
 * The sole recommended production entry point for Creative execution.
 * Planning and compilation are pure boundaries; CreativeWorkflowEngine is the
 * only graph execution authority for server-executable routes. ON_DEVICE work
 * is suspended behind a Core-issued ticket and may resume only from a server-admitted result.
 */
export class CreativeExecutionPlatform {
  readonly #records = new Map<string, RecordState>();
  readonly #workflow: CreativeWorkflowEngine;
  readonly #authority: ProductionOperationAuthority;
  constructor(private readonly dependencies: CreativeExecutionPlatformRuntimeDependencies) {
    if (!dependencies.routeSelector) throw new Error('Creative execution route selection is required');
    if (!dependencies.providerSelector) throw new Error('Creative execution provider selection is required');
    if (!dependencies.capabilityAdmission) throw new Error('Creative execution capability admission is required');
    this.#workflow = new CreativeWorkflowEngine(dependencies);
    this.#authority = dependencies.authority ?? new ProductionOperationAuthority({
      billing: dependencies.billing ?? rejectingBilling,
      execute: async instance => {
        const record = this.require(instance.identity.requestId);
        const onDevice = record.workflow?.operations.filter(operation => operation.executionRoute === 'ON_DEVICE') ?? [];
        if (onDevice.some(operation => !record.admittedOnDevice?.[operation.id])) throw new Error('ON_DEVICE execution cannot enter the workflow runtime without server-admitted results');
        const seed = (record.request.inputArtifacts ?? []).map(toWorkflowArtifact);
        record.snapshot = await this.#workflow.execute(record.workflow!, seed, record.admittedOnDevice ?? {});
        return { workflowStatus: record.snapshot.status };
      },
      now: () => new Date((dependencies.now ?? Date.now)()).toISOString(),
      id: dependencies.id,
    });
  }

  createExecution(request: CreativeRequest): string {
    if (this.#records.has(request.id)) throw new Error(`Execution "${request.id}" already exists`);
    this.#records.set(request.id, { request, paused: false, cancelled: false });
    return request.id;
  }

  hasExecution(id: string): boolean { return this.#records.has(id); }

  async plan(id: string): Promise<CreativePlan> {
    const record = this.require(id);
    record.decision ??= await this.dependencies.decision.decide(record.request);
    record.plan = await this.dependencies.planning.plan(record.request, record.decision);
    return record.plan;
  }

  async compile(id: string): Promise<CreativeExecutionPlan> {
    const record = this.require(id);
    const plan = record.plan ?? await this.plan(id);
    validateCreativePlan(plan, (record.request.inputArtifacts ?? []).map(artifact => artifact.id));
    const routes = Object.fromEntries(plan.operations.map(operation => [operation.id, this.dependencies.routeSelector.select(operation, record.request)]));
    const targets = Object.fromEntries(plan.operations.map(operation => [operation.id, this.dependencies.targetSelector.select(operation, record.request)]));
    validateExecutionTargets(plan, targets);
    const boundOperations: CreativeOperation[] = [];
    const capabilityIds: Record<string, string> = {};

    for (const operation of plan.operations) {
      const route = routes[operation.id];
      const target = targets[operation.id];
      if (target === 'BLOCKED') throw new Error(`Execution capability blocked operation ${operation.id}: TARGET_BLOCKED`);
      let boundOperation: CreativeOperation;
      if (route === 'PROVIDER') {
        const selection = this.dependencies.providerSelector.select({ request: record.request, operation, target });
        if (!selection.allowed) throw new Error(`Provider selection blocked operation ${operation.id}: ${selection.reasonCode}`);
        boundOperation = Object.freeze({ ...operation, executionRoute: route, providerId: selection.providerId });
      } else {
        const { providerId: _untrustedProvider, ...providerFree } = operation;
        boundOperation = Object.freeze({ ...providerFree, executionRoute: route, cost: Object.freeze({ ...providerFree.cost, credits: 0, aiCalls: 0 }) });
      }
      const capability = this.dependencies.capabilityAdmission.admit({ request: record.request, operation: boundOperation, route, target });
      if (!capability.allowed) throw new Error(`Execution capability blocked operation ${operation.id}: ${capability.reasonCode}`);
      if (route === 'ON_DEVICE' && !capability.capabilityId) throw new Error(`ON_DEVICE operation ${operation.id} has no canonical capability binding`);
      if (capability.capabilityId) capabilityIds[operation.id] = capability.capabilityId;
      if (!this.dependencies.securityGate.authorize(record.request, boundOperation, target)) throw new Error(`Security or target policy blocked operation ${operation.id}`);
      boundOperations.push(boundOperation);
    }

    const operations = Object.freeze(boundOperations);
    record.capabilityIds = Object.freeze({ ...capabilityIds });
    record.execution = { requestId: record.request.id, operations, targets };
    record.pipeline = { operationIds: operations.map(operation => operation.id) };
    record.workflow = new WorkflowCompiler().compile({ id, prompt: record.request.intent, scope: record.request.scope, sources: { executionGraph: { operations }, pipelineGraph: { operations } }, budget: record.request.budget, compiledAt: (this.dependencies.now ?? Date.now)() });
    const selected = Object.values(targets);
    const target = selected.some(x => x === 'CLOUD') && selected.some(x => x === 'LOCAL') ? 'HYBRID' : selected.some(x => x === 'CLOUD' || x === 'HYBRID') ? selected.find(x => x === 'HYBRID') ?? 'CLOUD' : 'LOCAL';
    const credits = target === 'LOCAL' ? 0 : Number(record.request.metadata?.estimatedCredits ?? record.request.budget?.credits ?? 0);
    const operationId = `creative.execution.${id}`;
    const allowFallback = target !== 'LOCAL';
    record.operation = this.#authority.instantiateOperation({
      identity: { operationId, operationVersion: '1', operationFamily: 'creative-workflow', ...record.request.scope, requestId: id },
      definition: { operationId, version: '1', family: 'creative-workflow', capabilities: [], inputArtifacts: [], outputArtifacts: [], parametersSchema: {}, executionPolicy: {}, verificationPolicy: {}, resourceProfile: {}, costModel: {}, riskProfile: {}, billable: credits > 0 },
      parameters: { intent: record.request.intent },
      intent: { target, requiredCapabilities: [], executionMode: 'PRODUCTION', fallbackPolicy: {}, verificationPolicy: {} },
      idempotencyKey: String(record.request.metadata?.idempotencyKey ?? id),
    });
    this.#authority.preflight(record.operation, { target, billable: credits > 0, credits, retries: record.request.budget?.retries ?? 0, policy: { maxCredits: record.request.budget?.credits ?? 0, maxProviderCost: Number(record.request.metadata?.maxProviderCost ?? Number.MAX_SAFE_INTEGER), allowFallback, allowRetry: true, allowEscalation: false, budgetMode: 'HARD' } });
    const authorization = this.#authority.authorize(record.operation, {
      checks: { operationValid: true, capabilityAvailable: true, runtimeAllowed: true, modelTrusted: true, privacyAllowed: true, budgetAllowed: true, scopeValid: true },
      policyVersion: 'production-6.42C3',
      expiresAt: new Date((this.dependencies.now ?? Date.now)() + 300_000).toISOString(),
      costPolicy: { maxCredits: record.request.budget?.credits ?? 0, maxProviderCost: Number.MAX_SAFE_INTEGER, allowFallback, allowRetry: true, allowEscalation: false, budgetMode: 'HARD' },
    });
    if (!authorization.allowed) throw new Error(authorization.reason);
    await this.#authority.reserve(record.operation);
    return record.execution;
  }

  /** Stable v1 model-only preparation retained for existing segmentation. */
  async prepareLocalExecution(id: string): Promise<readonly LocalExecutionTicket[]> {
    const record = this.require(id);
    if (record.cancelled) throw new Error('Execution is cancelled');
    if (!record.execution || !record.workflow || !record.operation) await this.compile(id);
    if (record.localTickets) return record.localTickets;
    const onDevice = record.execution!.operations.filter(operation => operation.executionRoute === 'ON_DEVICE');
    if (!onDevice.length) return Object.freeze([]);
    const issuer = this.dependencies.localExecution;
    if (!issuer) throw new Error('ON_DEVICE execution requires Core local ticket authority');
    const tickets = await Promise.all(onDevice.map(async operation => {
      if (record.execution!.targets[operation.id] !== 'LOCAL') throw new Error(`ON_DEVICE operation ${operation.id} must have LOCAL target`);
      const capability = record.capabilityIds?.[operation.id];
      if (!capability) throw new Error(`ON_DEVICE operation ${operation.id} has no capability binding`);
      const inputs = localInputs(record.request, operation);
      if (!inputs.length) throw new Error(`ON_DEVICE operation ${operation.id} has no canonical input artifact`);
      return await issuer.issue({
        requestId: record.request.id,
        workflowId: record.workflow!.id,
        stepId: operation.id,
        operation: { id: operation.id, version: '1', type: operation.type, capability, parameters: operation.input },
        scope: record.request.scope,
        inputs,
        expectedOutputs: expectedLocalOutputs(record.request, operation),
        policy: record.plan?.planningConstraints?.executionPolicy === 'LOCAL_ONLY' ? 'LOCAL_ONLY' : 'LOCAL_SELECTED',
        idempotencyKey: `${String(record.request.metadata?.idempotencyKey ?? id)}:${operation.id}:local-v1`,
      });
    }));
    record.localTickets = Object.freeze(tickets);
    record.paused = true;
    return record.localTickets;
  }

  /** Explicit v2 preparation for executor-union tickets; never silently upgrades a v1 caller. */
  async prepareLocalExecutionV2(id: string): Promise<readonly LocalExecutionTicketV2[]> {
    const record = this.require(id);
    if (record.cancelled) throw new Error('Execution is cancelled');
    if (!record.execution || !record.workflow || !record.operation) await this.compile(id);
    if (record.localTicketsV2) return record.localTicketsV2;
    const onDevice = record.execution!.operations.filter(operation => operation.executionRoute === 'ON_DEVICE');
    if (!onDevice.length) return Object.freeze([]);
    const issuer = this.dependencies.localExecutionV2;
    if (!issuer) throw new Error('ON_DEVICE v2 execution requires Core v2 local ticket authority');
    const tickets = await Promise.all(onDevice.map(async operation => {
      if (record.execution!.targets[operation.id] !== 'LOCAL') throw new Error(`ON_DEVICE operation ${operation.id} must have LOCAL target`);
      const capability = record.capabilityIds?.[operation.id];
      if (!capability) throw new Error(`ON_DEVICE operation ${operation.id} has no capability binding`);
      const inputs = localInputs(record.request, operation);
      if (!inputs.length) throw new Error(`ON_DEVICE operation ${operation.id} has no canonical input artifact`);
      return await issuer.issue({
        ticketVersion: '2',
        requestId: record.request.id,
        workflowId: record.workflow!.id,
        stepId: operation.id,
        operation: { id: operation.id, version: '1', type: operation.type, capability, parameters: operation.input },
        scope: record.request.scope,
        inputs,
        expectedOutputs: expectedLocalOutputs(record.request, operation),
        policy: record.plan?.planningConstraints?.executionPolicy === 'LOCAL_ONLY' ? 'LOCAL_ONLY' : 'LOCAL_SELECTED',
        idempotencyKey: `${String(record.request.metadata?.idempotencyKey ?? id)}:${operation.id}:local-v2`,
      });
    }));
    record.localTicketsV2 = Object.freeze(tickets);
    record.paused = true;
    return record.localTicketsV2;
  }

  pendingLocalExecution(id: string): readonly LocalExecutionTicket[] { return this.require(id).localTickets ?? Object.freeze([]); }
  pendingLocalExecutionV2(id: string): readonly LocalExecutionTicketV2[] { return this.require(id).localTicketsV2 ?? Object.freeze([]); }

  async completeLocalExecution(id: string, input: Readonly<{ ticketId: string; stepId: string; artifact: CreativeArtifact; latencyMs: number; memoryMb?: number; gpuMs?: number }>): Promise<ProductionOutcome> {
    const record = this.require(id);
    if (record.cancelled) throw new Error('Execution is cancelled');
    if (!record.paused) throw new Error('Execution is not awaiting a local result');
    const ticket = record.localTickets?.find(candidate => candidate.ticketId === input.ticketId && candidate.stepId === input.stepId)
      ?? record.localTicketsV2?.find(candidate => candidate.ticketId === input.ticketId && candidate.stepId === input.stepId);
    if (!ticket) throw new Error('Local execution ticket is not bound to this execution');
    const operation = record.workflow?.operations.find(candidate => candidate.id === input.stepId);
    if (!operation || operation.executionRoute !== 'ON_DEVICE' || record.execution?.targets[operation.id] !== 'LOCAL') throw new Error('Local execution step binding is invalid');
    if (!sameScope(input.artifact.scope, record.request.scope)) throw new Error('Local result artifact scope mismatch');
    const expected = ticket.expectedOutputs;
    if (expected.length !== 1 || input.artifact.kind !== expected[0].kind || input.artifact.role !== expected[0].role) throw new Error('Local result artifact contract mismatch');
    const parents = input.artifact.metadata?.parentArtifactIds;
    if (!Array.isArray(parents) || !ticket.inputs.every(binding => parents.includes(binding.artifactId))) throw new Error('Local result artifact lineage mismatch');
    record.admittedOnDevice = Object.freeze({
      ...(record.admittedOnDevice ?? {}),
      [operation.id]: Object.freeze({
        artifacts: Object.freeze([{ id: input.artifact.id, kind: input.artifact.kind, value: input.artifact.value, metadata: input.artifact.metadata }]),
        latencyMs: input.latencyMs,
        memoryMb: input.memoryMb,
        gpuMs: input.gpuMs,
      }),
    });
    record.paused = false;
    return this.execute(id);
  }

  async execute(id: string): Promise<ProductionOutcome> {
    const record = this.require(id);
    if (record.cancelled) throw new Error('Execution is cancelled');
    if (record.paused) throw new Error('Execution is paused');
    if (!record.workflow || !record.operation) await this.compile(id);
    const missingLocal = record.execution?.operations.find(operation => operation.executionRoute === 'ON_DEVICE' && !record.admittedOnDevice?.[operation.id]);
    if (missingLocal) throw new Error(`ON_DEVICE step ${missingLocal.id} has no server-admitted result`);
    try {
      await this.#authority.execute(record.operation!);
      const verification = this.verification(record.snapshot!);
      const outcome: ProductionOutcome = { executionId: id, status: record.snapshot!.status === 'SUCCESS' && verification.valid ? 'SUCCESS' : 'FAILED', workflow: record.snapshot!, verification, artifacts: record.snapshot!.artifacts.map(fromWorkflowArtifact) };
      record.outcome = outcome;
      this.#authority.recordOutcome(record.operation!, { status: outcome.status });
      if (outcome.status === 'FAILED') {
        await this.#authority.release(record.operation!, 'workflow or verification failed');
        await this.dependencies.telemetry?.record(outcome);
        return outcome;
      }
      const target = record.operation!.executionIntent.target;
      const actual = target === 'LOCAL' ? new CreativeCostAuthority().local({ latency: record.snapshot!.metrics.executionTimeMs }) : { actualProviderCost: { amount: Number(record.request.metadata?.actualProviderCost ?? 0), currency: 'USD' }, actualCreditsBasis: Number(record.request.metadata?.billableCredits ?? record.request.budget?.credits ?? 0), actualLatency: record.snapshot!.metrics.executionTimeMs, actualRetries: 0, actualFallbacks: 0, actualDeviceCost: 0, actualEnergyEstimate: 0 };
      this.#authority.recordActualCost(record.operation!, actual);
      this.#authority.buildBillingEvent(record.operation!, actual.actualCreditsBasis);
      await this.#authority.commit(record.operation!);
      await this.dependencies.telemetry?.record(outcome);
      return outcome;
    } catch (error) {
      if (isUnknown(error)) {
        await this.#authority.markUnknown(record.operation!, 'provider result unknown');
        const outcome: ProductionOutcome = { executionId: id, status: 'UNKNOWN', verification: { valid: false, checks: [], errors: ['Provider outcome pending reconciliation'] }, artifacts: [] };
        record.outcome = outcome;
        await this.dependencies.telemetry?.record(outcome);
        return outcome;
      }
      await this.#authority.release(record.operation!, 'execution failed');
      throw error;
    }
  }

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

function localInputs(request: CreativeRequest, operation: CreativeOperation): readonly LocalExecutionInputBinding[] {
  const required = new Set(operation.requiredArtifacts ?? []);
  const artifacts = (request.inputArtifacts ?? []).filter(artifact => required.size === 0 || required.has(artifact.id));
  return Object.freeze(artifacts.map(artifact => Object.freeze({ artifactId: artifact.id, kind: artifact.kind, role: artifact.role, sha256: artifactSha256(artifact) })));
}

function artifactSha256(artifact: CreativeArtifact): string | undefined {
  const metadata = artifact.metadata as Readonly<Record<string, unknown>> | undefined;
  const value = artifact.value && typeof artifact.value === 'object' ? artifact.value as Readonly<Record<string, unknown>> : undefined;
  const candidate = metadata?.sha256 ?? metadata?.hash ?? value?.sha256 ?? value?.hash;
  return typeof candidate === 'string' && /^[a-f0-9]{64}$/i.test(candidate) ? candidate : undefined;
}

function expectedLocalOutputs(request: CreativeRequest, operation: CreativeOperation) {
  const required = new Set(operation.requiredArtifacts ?? []);
  const source = (request.inputArtifacts ?? []).find(artifact => artifact.kind === 'image' && (required.size === 0 || required.has(artifact.id)));
  const value = source?.value && typeof source.value === 'object' ? source.value as Readonly<Record<string, unknown>> : undefined;
  const width = source?.image?.width ?? (typeof value?.width === 'number' ? value.width : undefined);
  const height = source?.image?.height ?? (typeof value?.height === 'number' ? value.height : undefined);
  if (!Number.isInteger(width) || !Number.isInteger(height) || Number(width) < 1 || Number(height) < 1) throw new Error(`ON_DEVICE ${operation.type} requires canonical source dimensions`);
  if (operation.type === 'segment') return Object.freeze([{ kind: 'mask', role: 'MASK' as const, count: 1, mimeTypes: Object.freeze(['application/octet-stream']), width: Number(width), height: Number(height) }]);
  if (operation.type === 'BACKGROUND_ISOLATION') return Object.freeze([{ kind: 'image', role: 'COMPOSITE' as const, count: 1, mimeTypes: Object.freeze(['image/png']), width: Number(width), height: Number(height) }]);
  if (operation.type === 'SUPER_RESOLUTION') {
    const outputWidth = Number(width) * SUPER_RESOLUTION_SCALE;
    const outputHeight = Number(height) * SUPER_RESOLUTION_SCALE;
    const outputPixels = outputWidth * outputHeight;
    if (!Number.isSafeInteger(outputWidth) || !Number.isSafeInteger(outputHeight) || !Number.isSafeInteger(outputPixels) || outputPixels > MAX_SUPER_RESOLUTION_OUTPUT_PIXELS) throw new Error('ON_DEVICE SUPER_RESOLUTION exceeds the safe full-frame output limit');
    return Object.freeze([{ kind: 'image', role: 'COMPOSITE' as const, count: 1, mimeTypes: Object.freeze(['image/png']), width: outputWidth, height: outputHeight }]);
  }
  throw new Error(`No ON_DEVICE output contract for ${operation.type}`);
}

function sameScope(a: CreativeArtifact['scope'], b: CreativeRequest['scope']): boolean { return a.tenantId === b.tenantId && a.projectId === b.projectId && a.userId === b.userId; }
function toWorkflowArtifact(value: CreativeArtifact): Artifact { return { id: value.id, kind: value.kind, value: value.value, producerStepId: value.producerOperationId, scope: value.scope, metadata: { ...value.metadata, lifecycle: value.state, artifactRole: value.role, image: value.image } }; }
function fromWorkflowArtifact(value: Artifact): CreativeArtifact { const metadata = value.metadata as Readonly<Record<string, unknown>> | undefined; return { id: value.id, kind: value.kind, value: value.value, producerOperationId: value.producerStepId, scope: value.scope, state: (metadata?.lifecycle as CreativeArtifact['state']) ?? 'FINAL', role: metadata?.artifactRole as CreativeArtifact['role'], image: metadata?.image as CreativeArtifact['image'], metadata: value.metadata }; }
const rejectingBilling = Object.freeze({ reserve: async () => { throw new Error('Billable production execution requires BillingTransactionAuthority'); }, commit: async () => { throw new Error('Billing authority is unavailable'); }, release: async () => { throw new Error('Billing authority is unavailable'); } });
function isUnknown(error: unknown): boolean { return Boolean(error && typeof error === 'object' && ('unknownOutcome' in error || (error as { code?: string }).code === 'PROVIDER_RESULT_UNKNOWN')); }
