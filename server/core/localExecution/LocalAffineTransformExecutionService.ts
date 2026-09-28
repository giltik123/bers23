import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type LocalExecutionResultV2,
  type LocalExecutionTicketV2,
  type ProductionOutcome,
} from '../../../src/platform/creative/canonical/index.ts';
import {
  AFFINE_TRANSFORM_CAPABILITY,
  AFFINE_TRANSFORM_OPERATION,
  AFFINE_TRANSFORM_STEP_ID,
  AFFINE_TRANSFORM_TOOL_ID,
  AFFINE_TRANSFORM_TOOL_VERSION,
  affineTransformRgba8,
  normalizeAffineInverseMatrixQ16,
  type AffineInverseMatrixQ16,
} from '../../../src/platform/creative/deterministic/AffineTransform.ts';
import { AFFINE_TRANSFORM_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import type { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';

const TOOL = AFFINE_TRANSFORM_TOOL_DEFINITION;
const IDEMPOTENCY_SUFFIX = `:${AFFINE_TRANSFORM_STEP_ID}:local-v2`;

export type LocalAffineTransformPrepareCommand = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  clientRequestId: string;
  inverse: AffineInverseMatrixQ16;
}>;

export type LocalAffineTransformSubmission = Readonly<{
  executionId: string;
  status: ProductionOutcome['status'];
  artifactId?: string;
  outcome: ProductionOutcome;
}>;

export type LocalAffineTransformResourceLimits = Readonly<{
  maxDimension: number;
  maxPixels: number;
  maxUploadBytes: number;
}>;

export type LocalAffineTransformServiceDependencies = Readonly<{
  platform: CreativeExecutionPlatformRuntimeDependencies;
  ownsArtifacts: (scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: AuthenticatedScope & { projectId: string }, sourceId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  admission: LocalExecutionLedgerV2;
  uploads: PostgresLocalExecutionUploadStore;
  limits: LocalAffineTransformResourceLimits;
  persistFinal: (
    scope: AuthenticatedScope & { projectId: string },
    executionId: string,
    operationId: string,
    image: PixelImage,
    lineage: Readonly<{ sourceArtifactId: string; producerOperation: 'AFFINE_TRANSFORM' }>,
  ) => Promise<Readonly<{ storageId: string; width: number; height: number }>>;
  loadPersistedFinal: (executionId: string, scope: AuthenticatedScope & { projectId: string }) => Promise<Readonly<{ storageId: string; width: number; height: number }> | undefined>;
  issueFinalId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
  now?: () => number;
}>;

/**
 * Exact Core authority for deterministic affine-transform v1.
 * Browser PNG bytes are quarantined candidates. Core rehydrates the canonical
 * source, independently repeats the exact Q16.16 affine resampling and persists
 * a FINAL only after byte equality and canonical workflow verification.
 */
export class LocalAffineTransformExecutionService {
  readonly #platform: CreativeExecutionPlatform;
  readonly #now: () => number;
  readonly #limits: LocalAffineTransformResourceLimits;

  constructor(private readonly dependencies: LocalAffineTransformServiceDependencies) {
    this.#platform = new CreativeExecutionPlatform(dependencies.platform);
    this.#now = dependencies.now ?? Date.now;
    this.#limits = normalizeResourceLimits(dependencies.limits);
  }

  async prepare(command: LocalAffineTransformPrepareCommand, auth: AuthenticatedScope): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>> {
    const normalized = normalizePrepare(command);
    const scope = Object.freeze({ ...auth, projectId: normalized.projectId });
    const executionId = affineTransformExecutionId(scope, normalized.clientRequestId);
    const idempotencyKey = ticketIdempotencyKey(normalized.clientRequestId);

    const durable = await this.dependencies.admission.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (durable) {
      await this.validateDurablePrepareTicket(durable, normalized, scope, executionId);
      return Object.freeze({ executionId, ticket: durable });
    }

    if (!await this.dependencies.ownsArtifacts(scope, [normalized.sourceArtifactId])) throw serviceError(403, 'artifact_scope_denied', 'Affine-transform source IMAGE is outside the authenticated project scope');
    const artifacts = await this.hydrateExactSource(scope, normalized.sourceArtifactId);
    if (!this.#platform.hasExecution(executionId)) this.createPlatformExecution(executionId, scope, artifacts, normalized);
    const plan = await this.#platform.plan(executionId);
    assertReadyPlan(plan.status, plan.operations);
    const tickets = await this.#platform.prepareLocalExecutionV2(executionId);
    if (tickets.length !== 1) throw serviceError(500, 'local_ticket_contract_error', 'Expected exactly one deterministic affine-transform ticket');
    const ticket = tickets[0];
    assertAffineTransformTicket(ticket);
    assertTicketWithinCoreLimits(ticket, this.#limits);
    assertTicketGeometryAgainstArtifacts(ticket, artifacts);
    if (ticket.idempotencyKey !== idempotencyKey) throw serviceError(500, 'local_ticket_idempotency_contract', 'Canonical affine-transform ticket idempotency binding is invalid');
    assertExactCommandBinding(ticket, normalized);
    return Object.freeze({ executionId, ticket });
  }

  async uploadImage(input: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>, auth: AuthenticatedScope) {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local affine-transform ticket has expired');
    assertTicketWithinCoreLimits(ticket, this.#limits);
    if (input.bytes.byteLength > this.#limits.maxUploadBytes) throw serviceError(413, 'local_image_upload_too_large', 'Local affine-transform image upload exceeds the Core image upload limit');
    const output = requireOutputContract(ticket);
    const decoded = await decodePngRgba(input.bytes, Number(output.width), Number(output.height));
    const upload = await this.dependencies.uploads.persist({
      ticketId: ticket.ticketId,
      scope: ticket.scope,
      kind: 'image',
      role: 'COMPOSITE',
      mimeType: 'image/png',
      width: decoded.width,
      height: decoded.height,
      bytes: input.bytes,
      expiresAt: ticket.expiresAt,
      now: this.#now(),
    });
    return Object.freeze({ uploadId: upload.uploadId, kind: 'image', role: 'COMPOSITE' as const, sha256: upload.sha256, sizeBytes: upload.sizeBytes, mimeType: upload.mimeType, width: upload.width, height: upload.height });
  }

  async submit(input: Readonly<{ ticketId: string; projectId: string; result: unknown }>, auth: AuthenticatedScope): Promise<LocalAffineTransformSubmission> {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    const claim = await this.dependencies.admission.claimV2({ ticketId: ticket.ticketId, result: input.result, callerScope: ticket.scope, now: this.#now() });
    if (!claim.allowed) {
      if (claim.reasonCode === 'REPLAYED_TICKET') return this.replayFinalized(ticket);
      const status = claim.reasonCode === 'IN_PROGRESS' ? 409 : claim.reasonCode === 'EXPIRED_TICKET' ? 410 : 400;
      throw serviceError(status, `local_result_${claim.reasonCode.toLowerCase()}`, `Local affine-transform result admission denied: ${claim.reasonCode}`);
    }

    try {
      assertTicketWithinCoreLimits(ticket, this.#limits);
      const artifacts = await this.revalidateCanonicalSource(ticket);
      assertTicketGeometryAgainstArtifacts(ticket, artifacts);
      await this.ensurePlatformExecution(ticket, artifacts);
      const result = claim.result as LocalExecutionResultV2;
      assertResultExecutor(ticket, result);
      if (result.outputs.length !== 1) throw serviceError(400, 'local_result_output_count', 'Affine transform requires exactly one output');
      const evidence = result.outputs[0];
      const upload = await this.dependencies.uploads.load(evidence.uploadId, ticket.ticketId, ticket.scope, this.#now());
      if (!upload) throw serviceError(400, 'local_upload_unavailable', 'Quarantined affine-transform output is unavailable or expired');
      if (upload.sha256 !== evidence.sha256 || upload.sizeBytes !== evidence.sizeBytes || upload.kind !== evidence.kind || upload.role !== evidence.role || upload.mimeType !== evidence.mimeType || upload.width !== evidence.width || upload.height !== evidence.height) throw serviceError(400, 'local_upload_evidence_mismatch', 'Submitted affine-transform evidence does not match quarantined bytes');
      if (upload.kind !== 'image' || upload.role !== 'COMPOSITE' || upload.mimeType !== 'image/png') throw serviceError(400, 'local_upload_contract_mismatch', 'Quarantined affine-transform output is not a PNG COMPOSITE candidate');

      const source = requireSource(artifacts, ticket);
      const parameters = parametersFromTicket(ticket);
      const geometry = Object.freeze({ width: source.value.width, height: source.value.height });
      const output = requireOutputContract(ticket);
      if (Number(output.width) !== geometry.width || Number(output.height) !== geometry.height) throw serviceError(409, 'local_output_geometry_mismatch', 'Affine-transform ticket output geometry must exactly match its canonical source');
      const candidate = await decodePngRgba(upload.bytes, geometry.width, geometry.height);
      const expected = affineTransformRgba8(source.value.data, source.value.width, source.value.height, parameters.inverse);
      assertExactPixels(expected, candidate.data);

      const exact = TOOL.parameters.exact;
      const admittedArtifact: CreativeArtifact = Object.freeze({
        id: `core-verified-affine-transform:${ticket.ticketId}`,
        kind: 'image',
        value: Object.freeze({ width: geometry.width, height: geometry.height, data: expected, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' }),
        producerOperationId: ticket.stepId,
        scope: ticket.scope,
        state: 'FINAL',
        role: 'COMPOSITE',
        image: Object.freeze({ width: geometry.width, height: geometry.height, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb', alpha: true }),
        metadata: Object.freeze({
          artifactRole: 'COMPOSITE',
          localExecutionAdmission: 'ADMITTED',
          admissionClass: 'DETERMINISTIC_BYTE_EXACT',
          verificationScope: 'BYTE_EXACT_CORE_RECOMPUTE',
          ticketId: ticket.ticketId,
          executorKind: 'DETERMINISTIC_TOOL',
          toolId: AFFINE_TRANSFORM_TOOL_ID,
          toolVersion: AFFINE_TRANSFORM_TOOL_VERSION,
          runtime: result.runtime,
          accelerator: result.accelerator,
          candidateSha256: upload.sha256,
          verifiedPixelSha256: createHash('sha256').update(expected).digest('hex'),
          sourceWidth: source.value.width,
          sourceHeight: source.value.height,
          affineInverseMatrixQ16: parameters.inverse,
          coordinateSpace: exact.coordinateSpace,
          matrix: exact.matrix,
          fixedPointBits: exact.fixedPointBits,
          interpolation: exact.interpolation,
          rounding: exact.rounding,
          borderPolicy: exact.borderPolicy,
          alphaPolicy: exact.alphaPolicy,
          outputGeometry: exact.outputGeometry,
          maxOutputPixels: exact.maxOutputPixels,
          integrityMetrics: Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }),
          parentArtifactIds: Object.freeze([source.artifact.id]),
        }),
      });

      const existingOutcome = this.#platform.result(ticket.requestId);
      const outcome = existingOutcome ?? await this.#platform.completeLocalExecution(ticket.requestId, {
        ticketId: ticket.ticketId,
        stepId: ticket.stepId,
        artifact: admittedArtifact,
        latencyMs: result.metrics.latencyMs,
        memoryMb: result.metrics.memoryBytes === undefined ? undefined : result.metrics.memoryBytes / (1024 * 1024),
      });
      if (outcome.status !== 'SUCCESS') throw serviceError(422, 'local_execution_verification_failed', 'Canonical affine-transform execution did not pass workflow verification');

      const stored = await this.dependencies.persistFinal(
        ticket.scope,
        ticket.requestId,
        ticket.stepId,
        { width: geometry.width, height: geometry.height, data: expected },
        { sourceArtifactId: source.artifact.id, producerOperation: 'AFFINE_TRANSFORM' },
      );
      const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
      await this.dependencies.admission.commit(ticket.ticketId, 'SUCCESS');
      await this.dependencies.uploads.consume(upload.uploadId, ticket.ticketId, ticket.scope, this.#now());
      return Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', artifactId, outcome });
    } catch (error) {
      await this.dependencies.admission.release(ticket.ticketId).catch(() => undefined);
      throw error;
    }
  }

  private async replayFinalized(ticket: LocalExecutionTicketV2): Promise<LocalAffineTransformSubmission> {
    const finalization = await this.dependencies.admission.getFinalization(ticket.ticketId);
    if (!finalization || finalization.status === 'UNKNOWN') throw serviceError(409, 'local_finalization_unknown', 'Affine-transform execution was consumed without a recoverable terminal status');
    if (finalization.status === 'FAILED') return failedReplay(ticket.requestId);
    const stored = await this.dependencies.loadPersistedFinal(ticket.requestId, ticket.scope);
    if (!stored) throw serviceError(409, 'local_finalization_artifact_unavailable', 'Committed affine-transform FINAL is unavailable');
    const output = requireOutputContract(ticket);
    if (stored.width !== output.width || stored.height !== output.height) throw serviceError(409, 'local_finalization_artifact_mismatch', 'Committed affine-transform FINAL geometry does not match the durable ticket');
    const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
    return successReplay(ticket.requestId, artifactId);
  }

  private async requireTicket(ticketId: string, auth: AuthenticatedScope, projectId: string): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local affine-transform ticket not found');
    assertSameScope(ticket.scope, { ...auth, projectId });
    assertAffineTransformTicket(ticket);
    return ticket;
  }

  private async validateDurablePrepareTicket(ticket: LocalExecutionTicketV2, command: LocalAffineTransformPrepareCommand, scope: AuthenticatedScope & { projectId: string }, executionId: string): Promise<void> {
    assertSameScope(ticket.scope, scope);
    assertAffineTransformTicket(ticket);
    assertTicketWithinCoreLimits(ticket, this.#limits);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local affine-transform ticket has expired');
    if (ticket.requestId !== executionId || ticket.workflowId !== executionId || ticket.idempotencyKey !== ticketIdempotencyKey(command.clientRequestId)) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to another affine-transform execution');
    assertExactCommandBinding(ticket, command);
    if (!await this.dependencies.ownsArtifacts(scope, [command.sourceArtifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical affine-transform source is no longer authorized or available');
    const artifacts = await this.hydrateExactSource(scope, command.sourceArtifactId);
    assertTicketGeometryAgainstArtifacts(ticket, artifacts);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical affine-transform input revalidation failed: ${decision.reasonCode}`);
  }

  private async revalidateCanonicalSource(ticket: LocalExecutionTicketV2): Promise<readonly CreativeArtifact[]> {
    assertAffineTransformTicket(ticket);
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') throw serviceError(409, 'local_input_contract_mismatch', 'Affine transform requires exactly one canonical IMAGE input');
    const sourceBinding = ticket.inputs[0];
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical affine-transform source is no longer authorized or available');
    parametersFromTicket(ticket);
    const artifacts = await this.hydrateExactSource(ticket.scope, sourceBinding.artifactId);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical affine-transform input revalidation failed: ${decision.reasonCode}`);
    return artifacts;
  }

  private async hydrateExactSource(scope: AuthenticatedScope & { projectId: string }, sourceArtifactId: string): Promise<readonly CreativeArtifact[]> {
    try {
      const artifacts = await this.dependencies.hydrateArtifacts(scope, sourceArtifactId, []);
      const source = artifacts.find(artifact => artifact.id === sourceArtifactId && artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'COMPOSITE'));
      if (!source) throw new Error('Canonical affine-transform source was not hydrated');
      const pixels = requireSourcePixels(source);
      if (!artifactHash(source)) throw new Error('Canonical affine-transform source integrity hash is missing');
      assertWithinCoreLimits({ width: pixels.width, height: pixels.height }, this.#limits);
      return artifacts;
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      throw serviceError(409, 'local_input_lineage_unavailable', error instanceof Error ? error.message : 'Canonical affine-transform source is unavailable');
    }
  }

  private async ensurePlatformExecution(ticket: LocalExecutionTicketV2, artifacts: readonly CreativeArtifact[]): Promise<void> {
    if (this.#platform.hasExecution(ticket.requestId)) return;
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') throw serviceError(409, 'local_execution_recovery_input', 'Durable affine-transform ticket lacks its IMAGE binding');
    const clientRequestId = clientRequestIdFromTicket(ticket);
    const parameters = parametersFromTicket(ticket);
    this.createPlatformExecution(ticket.requestId, ticket.scope, artifacts, { projectId: ticket.scope.projectId, sourceArtifactId: ticket.inputs[0].artifactId, clientRequestId, inverse: parameters.inverse });
    const plan = await this.#platform.plan(ticket.requestId);
    assertReadyPlan(plan.status, plan.operations);
    const recovered = await this.#platform.prepareLocalExecutionV2(ticket.requestId);
    if (recovered.length !== 1 || !sameDurableTicket(recovered[0], ticket)) throw serviceError(409, 'local_execution_recovery_mismatch', 'Reconstructed canonical affine-transform execution does not match the durable ticket');
  }

  private createPlatformExecution(executionId: string, scope: AuthenticatedScope & { projectId: string }, artifacts: readonly CreativeArtifact[], command: LocalAffineTransformPrepareCommand): void {
    this.#platform.createExecution({
      id: executionId,
      intent: 'apply exact affine transform to canonical image',
      scope,
      inputArtifacts: artifacts,
      budget: { credits: 0, aiCalls: 0, retries: 0 },
      metadata: {
        operationIntent: AFFINE_TRANSFORM_OPERATION,
        sourceArtifactId: command.sourceArtifactId,
        affineInverseMatrixQ16: command.inverse,
        idempotencyKey: command.clientRequestId,
        planningConstraints: { executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 },
      },
    });
  }
}

function normalizePrepare(command: LocalAffineTransformPrepareCommand): LocalAffineTransformPrepareCommand {
  const projectId = command?.projectId?.trim(); const sourceArtifactId = command?.sourceArtifactId?.trim(); const clientRequestId = command?.clientRequestId?.trim();
  if (!projectId || !sourceArtifactId || !clientRequestId) throw serviceError(400, 'invalid_affine_transform_request', 'projectId, sourceArtifactId and clientRequestId are required');
  try { return Object.freeze({ projectId, sourceArtifactId, clientRequestId, inverse: normalizeAffineInverseMatrixQ16(command.inverse) }); }
  catch (error) { throw serviceError(400, 'invalid_affine_transform_request', error instanceof Error ? error.message : 'Affine inverse matrix is invalid'); }
}

function normalizeResourceLimits(value: LocalAffineTransformResourceLimits): LocalAffineTransformResourceLimits {
  if (!Number.isSafeInteger(value?.maxDimension) || value.maxDimension < 1 || !Number.isSafeInteger(value?.maxPixels) || value.maxPixels < 1 || !Number.isSafeInteger(value?.maxUploadBytes) || value.maxUploadBytes < 1) throw new Error('Affine-transform Core resource limits are invalid');
  return Object.freeze({ maxDimension: value.maxDimension, maxPixels: value.maxPixels, maxUploadBytes: value.maxUploadBytes });
}

function assertWithinCoreLimits(geometry: Readonly<{ width: number; height: number }>, limits: LocalAffineTransformResourceLimits): void {
  const pixels = geometry.width * geometry.height;
  if (!Number.isSafeInteger(pixels) || geometry.width > limits.maxDimension || geometry.height > limits.maxDimension || pixels > limits.maxPixels) throw serviceError(422, 'affine_transform_resource_limit_exceeded', 'Affine-transform output exceeds the current Core image resource limits');
}

function assertTicketWithinCoreLimits(ticket: LocalExecutionTicketV2, limits: LocalAffineTransformResourceLimits): void {
  const output = requireOutputContract(ticket);
  assertWithinCoreLimits({ width: Number(output.width), height: Number(output.height) }, limits);
}

function assertReadyPlan(status: string | undefined, operations: readonly Readonly<{ type: string; id: string }>[]): void {
  if (status !== 'READY' || operations.length !== 1 || operations[0].type !== AFFINE_TRANSFORM_OPERATION || operations[0].id !== AFFINE_TRANSFORM_STEP_ID) throw serviceError(422, 'affine_transform_plan_blocked', `Canonical affine-transform plan is ${status ?? 'invalid'}`);
}

function assertAffineTransformTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.operation.capability !== AFFINE_TRANSFORM_CAPABILITY || ticket.operation.type !== AFFINE_TRANSFORM_OPERATION || ticket.operation.id !== AFFINE_TRANSFORM_STEP_ID || ticket.stepId !== AFFINE_TRANSFORM_STEP_ID || ticket.policy !== 'LOCAL_ONLY') throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not an accepted deterministic affine-transform contract');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw serviceError(409, 'local_ticket_cost_mismatch', 'Affine-transform ticket must remain zero-cloud');
  if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Affine transform must bind exactly one deterministic executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== AFFINE_TRANSFORM_TOOL_ID || executor.version !== AFFINE_TRANSFORM_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Affine-transform executor binding is invalid');
  const parameters = parametersFromTicket(ticket);
  const exact = TOOL.parameters.exact;
  if (parameters.deterministicTool !== exact.deterministicTool || parameters.coordinateSpace !== exact.coordinateSpace || parameters.matrix !== exact.matrix || parameters.fixedPointBits !== exact.fixedPointBits || parameters.interpolation !== exact.interpolation || parameters.rounding !== exact.rounding || parameters.borderPolicy !== exact.borderPolicy || parameters.alphaPolicy !== exact.alphaPolicy || parameters.outputGeometry !== exact.outputGeometry || parameters.maxOutputPixels !== exact.maxOutputPixels) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Affine-transform ticket semantic parameters are invalid');
  requireOutputContract(ticket);
}

function assertExactCommandBinding(ticket: LocalExecutionTicketV2, command: LocalAffineTransformPrepareCommand): void {
  if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || ticket.inputs[0].artifactId !== command.sourceArtifactId || !ticket.inputs[0].sha256) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to a different affine-transform source');
  const parameters = parametersFromTicket(ticket);
  if (parameters.sourceArtifactId !== command.sourceArtifactId || !sameMatrix(parameters.inverse, command.inverse)) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to a different affine inverse matrix');
}

type AffineTicketParameters = Readonly<{
  sourceArtifactId: string;
  inverse: AffineInverseMatrixQ16;
  deterministicTool: unknown;
  coordinateSpace: unknown;
  matrix: unknown;
  fixedPointBits: unknown;
  interpolation: unknown;
  rounding: unknown;
  borderPolicy: unknown;
  alphaPolicy: unknown;
  outputGeometry: unknown;
  maxOutputPixels: unknown;
}>;

function parametersFromTicket(ticket: LocalExecutionTicketV2): AffineTicketParameters {
  const parameters = ticket.operation.parameters as Readonly<Record<string, unknown>> | undefined;
  const sourceArtifactId = typeof parameters?.sourceArtifactId === 'string' ? parameters.sourceArtifactId : '';
  if (!sourceArtifactId) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Affine-transform ticket source identity is invalid');
  let inverse: AffineInverseMatrixQ16;
  try {
    inverse = normalizeAffineInverseMatrixQ16({
      m00Q16: Number(parameters?.m00Q16), m01Q16: Number(parameters?.m01Q16), txQ16: Number(parameters?.txQ16),
      m10Q16: Number(parameters?.m10Q16), m11Q16: Number(parameters?.m11Q16), tyQ16: Number(parameters?.tyQ16),
    });
  } catch { throw serviceError(409, 'local_ticket_parameter_mismatch', 'Affine-transform ticket inverse matrix is invalid'); }
  return Object.freeze({
    sourceArtifactId, inverse,
    deterministicTool: parameters?.deterministicTool,
    coordinateSpace: parameters?.coordinateSpace,
    matrix: parameters?.matrix,
    fixedPointBits: parameters?.fixedPointBits,
    interpolation: parameters?.interpolation,
    rounding: parameters?.rounding,
    borderPolicy: parameters?.borderPolicy,
    alphaPolicy: parameters?.alphaPolicy,
    outputGeometry: parameters?.outputGeometry,
    maxOutputPixels: parameters?.maxOutputPixels,
  });
}

function assertTicketGeometryAgainstArtifacts(ticket: LocalExecutionTicketV2, artifacts: readonly CreativeArtifact[]): void {
  const source = requireSource(artifacts, ticket);
  parametersFromTicket(ticket);
  const output = requireOutputContract(ticket);
  if (Number(output.width) !== source.value.width || Number(output.height) !== source.value.height) throw serviceError(409, 'local_output_geometry_mismatch', 'Affine-transform ticket geometry must exactly match its canonical source');
}

function requireOutputContract(ticket: LocalExecutionTicketV2) {
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.count !== 1 || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png' || !Number.isSafeInteger(output.width) || !Number.isSafeInteger(output.height) || Number(output.width) < 1 || Number(output.height) < 1) throw serviceError(409, 'local_output_contract_error', 'Affine-transform ticket is not a single PNG COMPOSITE output contract');
  return output;
}

function assertResultExecutor(ticket: LocalExecutionTicketV2, result: LocalExecutionResultV2): void {
  const allowed = ticket.allowedExecutors[0];
  if (!allowed || allowed.kind !== 'DETERMINISTIC_TOOL' || result.executor.kind !== 'DETERMINISTIC_TOOL' || result.executor.toolId !== allowed.toolId || result.executor.version !== allowed.version) throw serviceError(400, 'local_executor_mismatch', 'Result is not the deterministic affine-transform executor authorized by this Core ticket');
  if (result.runtime !== 'BROWSER_JS' || result.accelerator !== 'cpu') throw serviceError(400, 'local_runtime_mismatch', 'Affine-transform v1 requires exact BROWSER_JS/cpu runtime identity');
}

function requireSource(artifacts: readonly CreativeArtifact[], ticket: LocalExecutionTicketV2): Readonly<{ artifact: CreativeArtifact; value: { width: number; height: number; data: Uint8ClampedArray } }> {
  const binding = ticket.inputs[0]; const artifact = artifacts.find(value => value.id === binding.artifactId && value.kind === 'image');
  if (!artifact) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical affine-transform source is unavailable');
  return Object.freeze({ artifact, value: requireSourcePixels(artifact) });
}

function requireSourcePixels(artifact: CreativeArtifact): { width: number; height: number; data: Uint8ClampedArray } {
  const value = artifact.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
  if (!Number.isSafeInteger(value?.width) || !Number.isSafeInteger(value?.height) || Number(value?.width) < 1 || Number(value?.height) < 1 || !(value?.data instanceof Uint8ClampedArray) || value.data.length !== Number(value.width) * Number(value.height) * 4) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical affine-transform source RGBA pixels are unavailable');
  if (artifact.image?.orientation !== 1 || artifact.image?.colorSpace !== 'srgb') throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical affine-transform source must use orientation-1 sRGB geometry');
  return { width: Number(value.width), height: Number(value.height), data: value.data };
}

async function decodePngRgba(bytes: Uint8Array, expectedWidth: number, expectedHeight: number): Promise<Readonly<{ width: number; height: number; data: Uint8ClampedArray }>> {
  if (!bytes.byteLength) throw serviceError(400, 'local_image_empty', 'Local affine-transform image upload is empty');
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'png') throw serviceError(415, 'local_image_format_mismatch', 'Affine-transform output must be PNG');
    const width = metadata.width; const height = metadata.height;
    if (!width || !height || width !== expectedWidth || height !== expectedHeight) throw serviceError(400, 'local_image_dimensions_mismatch', 'Uploaded affine-transform image dimensions do not match the Core ticket');
    const result = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (result.info.width !== width || result.info.height !== height || result.info.channels !== 4) throw serviceError(400, 'local_image_decode_failed', 'Affine-transform PNG must decode to RGBA8');
    return Object.freeze({ width, height, data: new Uint8ClampedArray(result.data) });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) throw error;
    throw serviceError(400, 'local_image_decode_failed', 'Affine-transform PNG could not be decoded');
  }
}

function assertExactPixels(expected: Uint8ClampedArray, actual: Uint8ClampedArray): void {
  if (expected.length !== actual.length) throw serviceError(422, 'local_affine_transform_pixel_mismatch', 'Affine-transform candidate pixel length differs from Core recomputation');
  for (let index = 0; index < expected.length; index += 1) if (expected[index] !== actual[index]) throw serviceError(422, 'local_affine_transform_pixel_mismatch', `Affine-transform candidate differs from Core recomputation at byte ${index}`);
}

function failedReplay(executionId: string): LocalAffineTransformSubmission {
  const outcome: ProductionOutcome = Object.freeze({ executionId, status: 'FAILED', verification: Object.freeze({ valid: false, checks: Object.freeze(['LOCAL_EXECUTION_TERMINAL_REPLAY']), errors: Object.freeze(['LOCAL_EXECUTION_PREVIOUSLY_FAILED']) }), artifacts: Object.freeze([]) });
  return Object.freeze({ executionId, status: 'FAILED', outcome });
}
function successReplay(executionId: string, artifactId: string): LocalAffineTransformSubmission {
  const outcome: ProductionOutcome = Object.freeze({ executionId, status: 'SUCCESS', verification: Object.freeze({ valid: true, checks: Object.freeze(['LOCAL_EXECUTION_TERMINAL_REPLAY']), errors: Object.freeze([]) }), artifacts: Object.freeze([]) });
  return Object.freeze({ executionId, status: 'SUCCESS', artifactId, outcome });
}
function ticketIdempotencyKey(clientRequestId: string): string { return `${clientRequestId}${IDEMPOTENCY_SUFFIX}`; }
function clientRequestIdFromTicket(ticket: LocalExecutionTicketV2): string {
  if (!ticket.idempotencyKey.endsWith(IDEMPOTENCY_SUFFIX)) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable affine-transform ticket idempotency key is malformed');
  const value = ticket.idempotencyKey.slice(0, -IDEMPOTENCY_SUFFIX.length);
  if (!value) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable affine-transform ticket lacks client request identity');
  return value;
}
function affineTransformExecutionId(scope: AuthenticatedScope & { projectId: string }, clientRequestId: string): string {
  return `local-affine-transform-${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function sameMatrix(a: AffineInverseMatrixQ16, b: AffineInverseMatrixQ16): boolean {
  return a.m00Q16 === b.m00Q16 && a.m01Q16 === b.m01Q16 && a.txQ16 === b.txQ16 && a.m10Q16 === b.m10Q16 && a.m11Q16 === b.m11Q16 && a.tyQ16 === b.tyQ16;
}
function sameDurableTicket(a: LocalExecutionTicketV2, b: LocalExecutionTicketV2): boolean {
  return a.ticketId === b.ticketId && a.version === b.version && a.nonce === b.nonce && a.idempotencyKey === b.idempotencyKey && a.requestId === b.requestId && a.workflowId === b.workflowId && a.stepId === b.stepId && canonicalJson(a.scope) === canonicalJson(b.scope) && canonicalJson(a.inputs) === canonicalJson(b.inputs) && canonicalJson(a.expectedOutputs) === canonicalJson(b.expectedOutputs) && canonicalJson(a.allowedExecutors) === canonicalJson(b.allowedExecutors) && canonicalJson(a.operation) === canonicalJson(b.operation);
}
function artifactHash(artifact: CreativeArtifact): string | undefined { const value = artifact.metadata?.sha256; return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value : undefined; }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)])); }
function assertSameScope(a: AuthenticatedScope & { projectId: string }, b: AuthenticatedScope & { projectId: string }): void { if (a.tenantId !== b.tenantId || a.userId !== b.userId || a.projectId !== b.projectId) throw serviceError(403, 'local_execution_scope_denied', 'Local affine-transform execution scope denied'); }
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
