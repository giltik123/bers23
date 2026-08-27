import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  CanonicalDecisionService,
  CanonicalPlanningService,
  CreativeExecutionPlatform,
  type CreativeExecutionPlan,
  type CreativePlan,
  type CreativeRequest,
} from '../../../src/platform/creative/canonical/index.ts';
import {
  LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES,
  LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT,
} from '../../../src/platform/creative/canonical/localComposite.ts';
import type { CreativeArtifact, ProductionOutcome } from '../../../src/platform/creative/canonical/contracts.ts';
import type { LocalExecutionTicket, LocalExecutionTicketIssuerPort, LocalExecutionTicketV2, LocalExecutionTicketV2IssuerPort } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { Artifact, Scope, WorkflowOperation, WorkflowVerifierPort } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import type { CanonicalArtifactHydrator } from '../artifacts/canonicalArtifactHydrator.ts';
import { DurableArtifactLineageResolver } from '../artifacts/durableArtifactLineageResolver.ts';
import type { PostgresMaskArtifactStore } from '../artifacts/postgresMaskArtifactStore.ts';
import type { SignedArtifactAuthority } from '../artifacts/signedArtifactAuthority.ts';
import { BackgroundIsolationResultAuthority, SegmentationResultAuthority } from '../localExecution/LocalExecutionResultAuthority.ts';
import type { PostgresLocalExecutionLedger } from '../localExecution/PostgresLocalExecutionLedger.ts';
import type { PostgresLocalExecutionUploadStore } from '../localExecution/PostgresLocalExecutionUploadStore.ts';
import {
  LocalSegmentationContractError,
  normalizeLocalSegmentationSelection,
  validateLocalSegmentationGeometry,
  type LocalSegmentationAnalysis,
  type LocalSegmentationPoint,
} from '../localExecution/localSegmentationInputContract.ts';
import { productionExecutionCapabilities } from '../providers/productionExecutionCapabilities.ts';
import { productionExecutionRoute } from '../providers/productionExecutionRoute.ts';
import { productionProviderSelection } from '../providers/productionProviderSelection.ts';
import { productionTargetSelection } from '../providers/productionTargetSelection.ts';
import { productionWorkflowVerifier } from '../providers/productionWorkflowVerifier.ts';
import {
  LocalCompositeContinuationService,
  LOCAL_COMPOSITE_CONTINUATION_STEPS,
  type LocalCompositeContinuationDependencies,
  type LocalCompositeLocalResult,
  type LocalCompositeResolvedArtifact,
  type LocalCompositeStartCommand,
} from './LocalCompositeContinuationService.ts';
import { normalizeScope } from './WorkflowContinuationStore.ts';
import { PostgresWorkflowContinuationStore } from './PostgresWorkflowContinuationStore.ts';

type TicketAuthority = LocalExecutionTicketIssuerPort & LocalExecutionTicketV2IssuerPort;
type AdmittedCompositeCommand = Readonly<{
  clientRequestId: string;
  inputArtifactId: string;
  analysis: LocalSegmentationAnalysis;
  points: readonly LocalSegmentationPoint[];
}>;

export type ProductionLocalCompositeContinuationInput = Readonly<{
  pool: Pool;
  now: () => number;
  tickets: TicketAuthority;
  admission: PostgresLocalExecutionLedger;
  uploads: PostgresLocalExecutionUploadStore;
  artifacts: ArtifactAuthority;
  hydrator: CanonicalArtifactHydrator;
  signed: SignedArtifactAuthority;
  masks: PostgresMaskArtifactStore;
  verifier?: WorkflowVerifierPort;
}>;

/**
 * Wires the first durable LOCAL_ONLY composite to existing Core authorities.
 * The public production service is wrapped by canonical compile admission before
 * the first durable ticket can be issued. Durable continuation remains the only
 * restart/replay authority after that admission succeeds.
 */
export function createProductionLocalCompositeContinuation(input: ProductionLocalCompositeContinuationInput): LocalCompositeContinuationService {
  const verifier = input.verifier ?? productionWorkflowVerifier;
  const ownsArtifacts = (scope: Scope, ids: readonly string[]) => input.artifacts.owns(scope, ids);
  const hydrateArtifacts = (scope: Scope, sourceId: string, maskIds: readonly string[]) => input.hydrator.hydrate(scope, sourceId, maskIds);
  const resolver = new DurableArtifactLineageResolver({ signed: input.signed, images: input.artifacts.images, masks: input.masks });
  const continuations = new PostgresWorkflowContinuationStore(input.pool, input.now);

  const segmentAuthority = new SegmentationResultAuthority({
    admission: input.admission,
    uploads: input.uploads,
    ownsArtifacts,
    hydrateArtifacts,
    persistMask: (ticketId, scope, width, height, alpha, sourceArtifactId) => input.masks.persistLocalExecution(
      ticketId,
      scope,
      width,
      height,
      alpha,
      sourceArtifactId ? resolveStoredImageStorageId(input.signed, sourceArtifactId, scope) : undefined,
    ),
    loadPersistedMask: (ticketId, scope) => input.masks.loadLocalExecution(ticketId, scope),
    issueMaskId: (storageId, scope) => input.signed.issueStoredMask(storageId, scope),
    now: input.now,
  }, {
    capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment,
    stepId: LOCAL_COMPOSITE_CONTINUATION_STEPS.segment,
  });

  const backgroundAuthority = new BackgroundIsolationResultAuthority({
    admission: input.admission,
    uploads: input.uploads,
    ownsArtifacts,
    hydrateArtifacts,
    persistFinal: (scope, executionId, operationId, image, lineage) => {
      if (!lineage) throw compositionError('local_composite_final_lineage_missing', 'Composite Background Isolation requires exact IMAGE + MASK lineage');
      const sourceImageStorageId = resolveStoredImageStorageId(input.signed, lineage.sourceArtifactId, scope);
      const maskStorageId = resolveStoredMaskStorageId(input.signed, lineage.maskArtifactId, scope);
      if (!sourceImageStorageId || !maskStorageId) throw compositionError('local_composite_final_lineage_unavailable', 'Composite Background Isolation parents are not durable canonical artifacts');
      return input.artifacts.images.persistFinal(scope, executionId, operationId, image, {
        sourceImageStorageId,
        maskStorageId,
        producerOperation: 'BACKGROUND_ISOLATION',
      });
    },
    loadPersistedFinal: (executionId, scope) => input.artifacts.images.loadFinalByExecution(executionId, scope),
    issueFinalId: (storageId, scope) => input.signed.issueStoredFinal(storageId, scope),
    now: input.now,
  }, {
    capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation,
    stepId: LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation,
  });

  const dependencies: LocalCompositeContinuationDependencies = Object.freeze({
    continuations,
    tickets: input.admission,
    v1Tickets: input.tickets,
    v2Tickets: input.tickets,
    artifacts: resolver,
    segmentResults: Object.freeze({
      submit: async ({ ticket, result }) => normalizeCompositeSubmission(await segmentAuthority.submit({
        ticket,
        result,
        verify: ({ ticket: admittedTicket, artifact }) => verifyLocalArtifact(verifier, admittedTicket, artifact),
      })),
    }),
    backgroundIsolationResults: Object.freeze({
      submit: async ({ ticket, result }) => normalizeCompositeSubmission(await backgroundAuthority.submit({
        ticket,
        result,
        verify: ({ ticket: admittedTicket, artifact }) => verifyLocalArtifact(verifier, admittedTicket, artifact),
      })),
    }),
    finalizedResults: Object.freeze({
      recover: (ticket) => recoverFinalizedCompositeResult(input, ticket),
    }),
    internalVerifier: Object.freeze({
      verify: async ({ scope, stepId, artifactId }) => {
        const durable = await resolver.resolve(scope, artifactId);
        if (durable.kind !== 'image' || durable.role !== 'COMPOSITE') throw compositionError('local_composite_verify_artifact_contract', 'INTERNAL verify requires a durable canonical COMPOSITE');
        const hydrated = await input.hydrator.hydrate(scope, artifactId, []);
        const image = hydrated.find(candidate => candidate.id === artifactId && candidate.kind === 'image');
        if (!image) throw compositionError('local_composite_verify_artifact_unavailable', 'Durable COMPOSITE pixels are unavailable for INTERNAL verification');
        const operation: WorkflowOperation = Object.freeze({
          id: stepId,
          type: 'verify',
          executionRoute: 'INTERNAL',
          requiredArtifacts: Object.freeze([artifactId]),
          outputBindings: Object.freeze([Object.freeze({ logicalId: 'verified-image', artifactId, kind: 'image', slot: 0 })]),
        });
        const verification = await verifier.verify(operation, Object.freeze([asWorkflowArtifact(image, LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation)]));
        if (!verification.valid) throw compositionError('local_composite_internal_verification_failed', `INTERNAL verify failed: ${verification.errors.join(',')}`);
      },
    }),
    now: input.now,
  });

  return new CanonicallyAdmittedLocalCompositeContinuationService(
    dependencies,
    (command, scope) => admitCanonicalCompositeStart(input, resolver, command, scope),
  );
}

/** Production-only wrapper: no first ticket exists unless the canonical platform compiles the exact narrow graph. */
class CanonicallyAdmittedLocalCompositeContinuationService extends LocalCompositeContinuationService {
  constructor(
    dependencies: LocalCompositeContinuationDependencies,
    private readonly admitStart: (command: LocalCompositeStartCommand, scope: Scope) => Promise<void>,
  ) {
    super(dependencies);
  }

  override async start(command: LocalCompositeStartCommand, scope: Scope) {
    await this.admitStart(command, scope);
    return super.start(command, scope);
  }
}

async function admitCanonicalCompositeStart(
  input: ProductionLocalCompositeContinuationInput,
  resolver: DurableArtifactLineageResolver,
  commandInput: LocalCompositeStartCommand,
  scopeInput: Scope,
): Promise<void> {
  const scope = normalizeScope(scopeInput);
  const command = normalizeAdmissionCommand(commandInput);
  const root = await resolver.resolve(scope, command.inputArtifactId);
  assertAdmissionRoot(root);
  validateAdmissionGeometry(command.analysis, command.points, root.width, root.height);

  const hydrated = await input.hydrator.hydrate(scope, root.artifactId, []);
  const source = hydrated.find(candidate => candidate.id === root.artifactId && candidate.kind === 'image' && candidate.role === 'ORIGINAL');
  if (!source?.image || source.image.width !== root.width || source.image.height !== root.height) {
    throw admissionError(409, 'local_composite_canonical_source_mismatch', 'Canonical planner admission could not rehydrate the exact durable ORIGINAL');
  }
  const hydratedSha = artifactSha256(source);
  if (!hydratedSha || hydratedSha !== root.sha256.toLowerCase()) {
    throw admissionError(409, 'local_composite_canonical_source_integrity', 'Canonical planner admission source SHA-256 does not match durable Artifact authority');
  }

  const executionId = admissionExecutionId(scope, command.clientRequestId);
  const request: CreativeRequest = Object.freeze({
    id: executionId,
    intent: 'local segment and background isolation composite',
    scope,
    inputArtifacts: Object.freeze([source]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
    metadata: Object.freeze({
      operationIntent: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT,
      selectionRequestId: `${command.clientRequestId}:segment`,
      analysis: command.analysis,
      points: command.points,
      idempotencyKey: command.clientRequestId,
      planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 }),
    }),
  });

  let runtimeCalls = 0;
  const platform = new CreativeExecutionPlatform({
    runtime: Object.freeze({
      execute: async () => {
        runtimeCalls += 1;
        throw admissionError(500, 'local_composite_admission_runtime_forbidden', 'Canonical composite admission must never execute a runtime');
      },
    }),
    providers: Object.freeze({ isAvailable: () => false, fallback: () => undefined }),
    decision: new CanonicalDecisionService(),
    planning: new CanonicalPlanningService({ localCompositeContinuationEnabled: true }),
    routeSelector: productionExecutionRoute,
    targetSelector: productionTargetSelection,
    providerSelector: productionProviderSelection,
    capabilityAdmission: productionExecutionCapabilities,
    securityGate: Object.freeze({
      authorize: (candidateRequest: CreativeRequest, operation: Readonly<{ providerId?: string }>, target: string) =>
        candidateRequest.metadata?.operationIntent === LOCAL_BACKGROUND_ISOLATION_COMPOSITE_INTENT
        && target === 'LOCAL'
        && Number(candidateRequest.budget?.credits ?? -1) === 0
        && !operation.providerId,
    }),
    recovery: Object.freeze({ decide: () => 'MARK_UNKNOWN' as const }),
    verifier: productionWorkflowVerifier,
    now: input.now,
  });

  platform.createExecution(request);
  const plan = await platform.plan(executionId);
  assertCanonicalCompositePlan(plan, root.artifactId, command);
  const execution = await platform.compile(executionId);
  assertCanonicalCompositeExecution(request, execution);
  if (runtimeCalls !== 0) throw admissionError(500, 'local_composite_admission_runtime_called', 'Canonical composite admission crossed an execution runtime boundary');
}

function assertCanonicalCompositePlan(plan: CreativePlan, rootArtifactId: string, command: AdmittedCompositeCommand): void {
  if (plan.status !== 'READY') throw admissionError(422, 'local_composite_canonical_plan_blocked', `Canonical local composite plan is ${plan.status ?? 'invalid'}`);
  if (plan.planningConstraints?.executionPolicy !== 'LOCAL_ONLY' || plan.planningConstraints.confirmationPolicy !== 'BLOCK' || plan.planningConstraints.maxCredits !== 0) {
    throw admissionError(409, 'local_composite_canonical_plan_policy', 'Canonical local composite plan lost its LOCAL_ONLY zero-credit policy');
  }
  if (plan.provenance?.plannerConfig?.localCompositeContinuationEnabled !== true || plan.provenance.plannerConfig.compositeExecutionEnabled !== false) {
    throw admissionError(409, 'local_composite_canonical_planner_scope', 'Canonical local composite planner enablement is not narrowly scoped');
  }
  const [segment, isolate, verify] = plan.operations;
  if (plan.operations.length !== 3
      || segment?.id !== LOCAL_COMPOSITE_CONTINUATION_STEPS.segment || segment.type !== 'segment'
      || isolate?.id !== LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation || isolate.type !== 'BACKGROUND_ISOLATION'
      || verify?.id !== LOCAL_COMPOSITE_CONTINUATION_STEPS.verify || verify.type !== 'verify') {
    throw admissionError(409, 'local_composite_canonical_plan_shape', 'Canonical planner did not compile the exact accepted three-step local composite');
  }
  const maskArtifact = segment.outputArtifacts?.[0];
  const compositeArtifact = isolate.outputArtifacts?.[0];
  if (!maskArtifact || !compositeArtifact
      || segment.dependencies?.length !== 0
      || segment.outputArtifacts?.length !== 1
      || segment.requiredArtifacts?.length !== 1 || segment.requiredArtifacts[0] !== rootArtifactId
      || isolate.dependencies?.length !== 1 || isolate.dependencies[0] !== segment.id
      || isolate.outputArtifacts?.length !== 1
      || isolate.requiredArtifacts?.length !== 2 || !isolate.requiredArtifacts.includes(rootArtifactId) || !isolate.requiredArtifacts.includes(maskArtifact)
      || verify.dependencies?.length !== 1 || verify.dependencies[0] !== isolate.id
      || verify.outputArtifacts?.length !== 1
      || verify.requiredArtifacts?.length !== 1 || verify.requiredArtifacts[0] !== compositeArtifact) {
    throw admissionError(409, 'local_composite_canonical_plan_lineage', 'Canonical local composite dependency and Artifact graph is not exact');
  }

  const segmentInput = segment.input as Readonly<Record<string, unknown>> | undefined;
  const isolationInput = isolate.input as Readonly<Record<string, unknown>> | undefined;
  const verifyInput = verify.input as Readonly<Record<string, unknown>> | undefined;
  if (!segmentInput
      || segmentInput.selectionRequestId !== `${command.clientRequestId}:segment`
      || !sameCanonicalValue(segmentInput.analysis, command.analysis)
      || !sameCanonicalValue(segmentInput.points, command.points)
      || !isolationInput
      || isolationInput.sourceArtifactId !== rootArtifactId
      || isolationInput.maskArtifactId !== maskArtifact
      || isolationInput.deterministicTool !== 'background-isolation@1'
      || !verifyInput
      || verifyInput.sourceArtifactId !== compositeArtifact
      || verifyInput.semanticOperation !== 'verify') {
    throw admissionError(409, 'local_composite_canonical_plan_parameters', 'Canonical local composite parameters no longer match the admitted durable command');
  }
}

function assertCanonicalCompositeExecution(request: CreativeRequest, execution: CreativeExecutionPlan): void {
  const expected = Object.freeze([
    Object.freeze({ id: LOCAL_COMPOSITE_CONTINUATION_STEPS.segment, type: 'segment', route: 'ON_DEVICE' as const, capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment }),
    Object.freeze({ id: LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation, type: 'BACKGROUND_ISOLATION', route: 'ON_DEVICE' as const, capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation }),
    Object.freeze({ id: LOCAL_COMPOSITE_CONTINUATION_STEPS.verify, type: 'verify', route: 'INTERNAL' as const, capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.verify }),
  ]);
  if (execution.operations.length !== expected.length) throw admissionError(409, 'local_composite_canonical_compile_shape', 'Canonical compile changed the accepted local composite operation count');
  for (const contract of expected) {
    const operation = execution.operations.find(candidate => candidate.id === contract.id);
    const target = execution.targets[contract.id];
    if (!operation || operation.type !== contract.type || operation.executionRoute !== contract.route || target !== 'LOCAL' || operation.providerId) {
      throw admissionError(409, 'local_composite_canonical_compile_route', `Canonical compile changed route/target contract for ${contract.id}`);
    }
    const capability = productionExecutionCapabilities.admit({ request, operation, route: contract.route, target });
    if (!capability.allowed || capability.capabilityId !== contract.capability) {
      throw admissionError(409, 'local_composite_canonical_compile_capability', `Production capability registry did not admit the exact composite capability for ${contract.id}`);
    }
  }
}

function normalizeAdmissionCommand(command: LocalCompositeStartCommand): AdmittedCompositeCommand {
  const clientRequestId = requireAdmissionToken(command?.clientRequestId, 'clientRequestId');
  const inputArtifactId = requireAdmissionToken(command?.inputArtifactId, 'inputArtifactId');
  try {
    const selection = normalizeLocalSegmentationSelection(command?.analysis, command?.points);
    return Object.freeze({ clientRequestId, inputArtifactId, analysis: selection.analysis, points: selection.points });
  } catch (error) {
    if (error instanceof LocalSegmentationContractError) {
      const code = error.reason === 'POINTS_INVALID' ? 'invalid_local_composite_points' : 'invalid_local_composite_analysis';
      throw admissionError(400, code, error.message);
    }
    throw error;
  }
}

function validateAdmissionGeometry(analysis: LocalSegmentationAnalysis, points: readonly LocalSegmentationPoint[], width: number, height: number): void {
  try {
    validateLocalSegmentationGeometry(analysis, points, width, height);
  } catch (error) {
    if (error instanceof LocalSegmentationContractError) {
      const code = error.reason === 'SOURCE_MISMATCH'
        ? 'local_composite_source_mismatch'
        : error.reason === 'POINT_OUT_OF_BOUNDS'
          ? 'local_composite_point_out_of_bounds'
          : 'invalid_local_composite_analysis';
      throw admissionError(400, code, error.message);
    }
    throw error;
  }
}

function assertAdmissionRoot(root: LocalCompositeResolvedArtifact): void {
  if (root.kind !== 'image' || root.role !== 'ORIGINAL' || !/^[a-f0-9]{64}$/i.test(root.sha256) || !Number.isInteger(root.width) || !Number.isInteger(root.height) || root.width < 1 || root.height < 1) {
    throw admissionError(422, 'local_composite_canonical_root_required', 'Canonical admission requires one durable ORIGINAL IMAGE with exact integrity and geometry');
  }
}

function artifactSha256(artifact: CreativeArtifact): string | undefined {
  const metadata = artifact.metadata as Readonly<Record<string, unknown>> | undefined;
  const value = artifact.value && typeof artifact.value === 'object' ? artifact.value as Readonly<Record<string, unknown>> : undefined;
  const candidate = metadata?.sha256 ?? metadata?.hash ?? value?.sha256 ?? value?.hash;
  return typeof candidate === 'string' && /^[a-f0-9]{64}$/i.test(candidate) ? candidate.toLowerCase() : undefined;
}

function admissionExecutionId(scope: Scope, clientRequestId: string): string {
  const digest = createHash('sha256')
    .update('bers:local-background-isolation-composite:execution:v1\0')
    .update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`)
    .digest('hex')
    .slice(0, 32);
  return `local-composite-${digest}`;
}

async function recoverFinalizedCompositeResult(
  input: ProductionLocalCompositeContinuationInput,
  ticket: LocalExecutionTicket | LocalExecutionTicketV2,
): Promise<LocalCompositeLocalResult | undefined> {
  const finalization = await input.admission.getFinalization(ticket.ticketId);
  if (!finalization) return undefined;
  if (finalization.status === 'FAILED' || finalization.status === 'UNKNOWN') return Object.freeze({ status: finalization.status });

  if (ticket.version === '1'
      && ticket.stepId === LOCAL_COMPOSITE_CONTINUATION_STEPS.segment
      && ticket.operation.capability === LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment) {
    const stored = await input.masks.loadLocalExecution(ticket.ticketId, ticket.scope);
    if (!stored) throw admissionError(409, 'local_composite_finalized_mask_unavailable', 'Finalized SUCCESS segment ticket has no recoverable canonical MASK');
    return Object.freeze({ status: 'SUCCESS' as const, artifactId: input.signed.issueStoredMask(stored.storageId, ticket.scope) });
  }

  if (ticket.version === '2'
      && ticket.stepId === LOCAL_COMPOSITE_CONTINUATION_STEPS.backgroundIsolation
      && ticket.operation.capability === LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation) {
    const stored = await input.artifacts.images.loadFinalByExecution(ticket.workflowId, ticket.scope);
    if (!stored) throw admissionError(409, 'local_composite_finalized_composite_unavailable', 'Finalized SUCCESS Background Isolation ticket has no recoverable canonical COMPOSITE');
    return Object.freeze({ status: 'SUCCESS' as const, artifactId: input.signed.issueStoredFinal(stored.storageId, ticket.scope) });
  }

  throw admissionError(409, 'local_composite_finalization_ticket_contract', 'Finalized local ticket does not belong to an accepted C5B local step');
}

async function verifyLocalArtifact(
  verifier: WorkflowVerifierPort,
  ticket: LocalExecutionTicket | LocalExecutionTicketV2,
  artifact: CreativeArtifact,
): Promise<ProductionOutcome> {
  const operation: WorkflowOperation = Object.freeze({
    id: ticket.stepId,
    type: ticket.operation.type,
    executionRoute: 'ON_DEVICE',
    requiredArtifacts: Object.freeze(ticket.inputs.map(binding => binding.artifactId)),
  });
  const verification = await verifier.verify(operation, Object.freeze([asWorkflowArtifact(artifact, ticket.stepId)]));
  const valid = verification.valid;
  return Object.freeze({
    executionId: ticket.workflowId,
    status: valid ? 'SUCCESS' : 'FAILED',
    verification: Object.freeze({ valid, checks: Object.freeze([...verification.checks]), errors: Object.freeze([...verification.errors]) }),
    artifacts: valid ? Object.freeze([artifact]) : Object.freeze([]),
  });
}

function asWorkflowArtifact(artifact: CreativeArtifact, producerStepId: string): Artifact {
  return Object.freeze({
    id: artifact.id,
    kind: artifact.kind,
    value: artifact.value,
    producerStepId,
    scope: artifact.scope,
    metadata: artifact.metadata,
  });
}

function normalizeCompositeSubmission(submission: Readonly<{ status: ProductionOutcome['status']; artifactId?: string }>): LocalCompositeLocalResult {
  if (submission.status === 'SUCCESS') {
    if (!submission.artifactId) throw compositionError('local_composite_result_not_successful', 'Successful local composite step did not produce a canonical Artifact');
    return Object.freeze({ status: 'SUCCESS' as const, artifactId: submission.artifactId });
  }
  if (submission.status === 'FAILED' || submission.status === 'UNKNOWN') return Object.freeze({ status: submission.status });
  throw compositionError('local_composite_result_status_unsupported', `Local composite step returned unsupported terminal status ${submission.status}`);
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)]));
}

function resolveStoredImageStorageId(authority: SignedArtifactAuthority, artifactId: string, scope: Scope): string | undefined {
  try { return authority.resolveStoredOriginalId(artifactId, scope).storageId; } catch { /* stored FINAL below */ }
  try { return authority.resolveStoredFinalId(artifactId, scope).storageId; } catch { return undefined; }
}

function resolveStoredMaskStorageId(authority: SignedArtifactAuthority, artifactId: string, scope: Scope): string | undefined {
  try { return authority.resolveStoredMask(artifactId, scope).storageId; } catch { return undefined; }
}

function requireAdmissionToken(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw admissionError(400, 'invalid_local_composite_request', `${field} is required`);
  return value.trim();
}
function admissionError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
function compositionError(code: string, message: string): Error & { code: string } { return Object.assign(new Error(message), { code }); }
